// Lanzador de Facturador para Windows (Facturador.exe).
//
// Arranca el servidor de Facturador (scripts/supervisor.mjs con el Node.js incluido) sin ventana de consola,
// escuchando solo en 127.0.0.1, y abre la aplicación en una ventana propia de Microsoft Edge (modo aplicación,
// con un perfil aparte). Cuando se cierra esa ventana, el servidor se para.
//
// Estructura de la instalación (carpeta del ejecutable):
//
//	Facturador.exe   este lanzador
//	node\node.exe    Node.js
//	app\             Facturador (el mismo paquete firmado que se publica en las Releases)
//
// Datos del usuario: %LOCALAPPDATA%\Facturador\
//
//	data\            base de datos, adjuntos, plugins, actualizaciones descargadas… (DATA_DIR)
//	navegador\       perfil de Edge de la ventana de Facturador (sesión iniciada)
//	puerto.txt       puerto local en uso (9100 salvo que esté ocupado)
//	registro.log     salida del servidor
//
// Las actualizaciones funcionan igual que en la versión de servidor: la aplicación descarga y verifica la versión
// nueva en data\actualizaciones\ y el supervisor la arranca con periodo de prueba y vuelta atrás automática.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var version = "dev"

const (
	titulo         = "Facturador"
	puertoDefecto  = 9100
	createNoWindow = 0x08000000
)

var (
	dirPrograma string // carpeta de Facturador.exe
	dirUsuario  string // %LOCALAPPDATA%\Facturador
	dirDatos    string
	dirPerfil   string
	archivoLog  string
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fallo("No se encuentra la carpeta del programa: " + err.Error())
	}
	dirPrograma = filepath.Dir(exe)
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		fallo("No se encuentra la carpeta LOCALAPPDATA del usuario")
	}
	dirUsuario = filepath.Join(local, "Facturador")
	dirDatos = filepath.Join(dirUsuario, "data")
	dirPerfil = filepath.Join(dirUsuario, "navegador")
	archivoLog = filepath.Join(dirUsuario, "registro.log")
	if err := os.MkdirAll(dirDatos, 0o755); err != nil {
		fallo("No se puede crear la carpeta de datos " + dirDatos + ": " + err.Error())
	}

	// Una sola instancia por usuario: si ya está abierto, se abre otra ventana y se sale.
	nombre, _ := windows.UTF16PtrFromString(`Local\FacturadorLanzador`)
	mutex, err := windows.CreateMutex(nil, false, nombre)
	if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		puerto := leerPuerto()
		if navegador := buscarNavegador(); navegador != "" {
			_ = abrirVentana(navegador, puerto)
		} else {
			abrirNavegadorPredeterminado(puerto)
		}
		return
	}
	if err != nil {
		fallo("No se puede iniciar Facturador: " + err.Error())
	}
	defer windows.CloseHandle(mutex)

	// Todo lo que arranque este proceso (servidor y sus hijos) muere con él, aunque se cierre de golpe.
	if err := crearTrabajo(); err != nil {
		fallo("No se puede preparar el servidor: " + err.Error())
	}

	puerto := elegirPuerto()
	servidor, err := arrancarServidor(puerto)
	if err != nil {
		fallo("No se puede arrancar el servidor: " + err.Error())
	}
	terminado := make(chan struct{})
	go func() { _ = servidor.Wait(); close(terminado) }()

	if !esperarServidor(puerto, 120*time.Second, terminado) {
		_ = servidor.Process.Kill()
		fallo("Facturador no ha podido arrancar.\n\nPuedes ver el motivo en:\n" + archivoLog)
	}

	if navegador := buscarNavegador(); navegador != "" {
		if err := esperarVentana(navegador, puerto); err != nil {
			abrirNavegadorPredeterminado(puerto)
			aviso("Facturador está abierto en tu navegador.\n\nNo cierres este mensaje mientras lo uses: al pulsar Aceptar, Facturador se cerrará.")
		}
	} else {
		abrirNavegadorPredeterminado(puerto)
		aviso("Facturador está abierto en tu navegador.\n\nNo cierres este mensaje mientras lo uses: al pulsar Aceptar, Facturador se cerrará.")
	}

	esperarActualizacionEnCurso()
	// Al salir se cierra el objeto de trabajo y Windows para el servidor.
}

// ---------- Servidor ----------

func leerPuerto() int {
	b, err := os.ReadFile(filepath.Join(dirUsuario, "puerto.txt"))
	if err == nil {
		if p, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && p > 1024 && p < 65536 {
			return p
		}
	}
	return puertoDefecto
}

// esFacturador indica si en ese puerto responde un Facturador (por ejemplo, uno que quedó abierto).
func esFacturador(puerto int) bool {
	c := http.Client{Timeout: 2 * time.Second}
	r, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/estado", puerto))
	if err != nil {
		return false
	}
	defer r.Body.Close()
	var v map[string]any
	if r.StatusCode != 200 || json.NewDecoder(r.Body).Decode(&v) != nil {
		return false
	}
	_, ok := v["instalado"]
	return ok
}

func puertoLibre(puerto int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", puerto))
	if err != nil {
		return false
	}
	l.Close()
	return true
}

// elegirPuerto usa el puerto guardado; si otro programa lo ocupa, busca uno libre y lo recuerda
// (la sesión iniciada y las cuentas de correo conectadas dependen de que no cambie).
func elegirPuerto() int {
	p := leerPuerto()
	if puertoLibre(p) {
		return p
	}
	if esFacturador(p) {
		// Un servidor anterior que no se paró: se espera a que termine para arrancar uno controlado.
		for i := 0; i < 20 && !puertoLibre(p); i++ {
			time.Sleep(500 * time.Millisecond)
		}
		if puertoLibre(p) {
			return p
		}
	}
	for q := puertoDefecto + 1; q < puertoDefecto+200; q++ {
		if puertoLibre(q) {
			_ = os.WriteFile(filepath.Join(dirUsuario, "puerto.txt"), []byte(strconv.Itoa(q)), 0o644)
			return q
		}
	}
	fallo("No hay ningún puerto libre para Facturador")
	return 0
}

func arrancarServidor(puerto int) (*exec.Cmd, error) {
	node := filepath.Join(dirPrograma, "node", "node.exe")
	app := filepath.Join(dirPrograma, "app")
	if _, err := os.Stat(node); err != nil {
		return nil, fmt.Errorf("falta %s; vuelve a instalar Facturador", node)
	}
	// Registro: se rota al pasar de 5 MB
	if st, err := os.Stat(archivoLog); err == nil && st.Size() > 5<<20 {
		_ = os.Rename(archivoLog, filepath.Join(dirUsuario, "registro.anterior.log"))
	}
	log, err := os.OpenFile(archivoLog, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}
	fmt.Fprintf(log, "\r\n==== %s Lanzador %s, puerto %d ====\r\n", time.Now().Format(time.RFC3339), version, puerto)

	sistema := os.Getenv("SystemRoot")
	if sistema == "" {
		sistema = `C:\Windows`
	}
	env := []string{}
	for _, e := range os.Environ() {
		k := strings.ToUpper(strings.SplitN(e, "=", 2)[0])
		switch k {
		case "PATH", "DATA_DIR", "PORT", "HOST", "PLUGINS_DIR", "NODE_OPTIONS", "FACTURADOR_SUPERVISADO", "FACTURADOR_CODIGO", "TRUST_PROXY":
			continue
		}
		env = append(env, e)
	}
	env = append(env,
		// System32 primero: el tar.exe de Windows es el que entiende rutas como C:\...
		"PATH="+filepath.Join(sistema, "System32")+";"+filepath.Join(dirPrograma, "node")+";"+os.Getenv("PATH"),
		"DATA_DIR="+dirDatos,
		"PORT="+strconv.Itoa(puerto),
		"HOST=127.0.0.1",
	)
	cmd := exec.Command(node, filepath.Join("scripts", "supervisor.mjs"))
	cmd.Dir = app
	cmd.Env = env
	cmd.Stdout = log
	cmd.Stderr = log
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	if err := cmd.Start(); err != nil {
		log.Close()
		return nil, err
	}
	return cmd, nil
}

func esperarServidor(puerto int, max time.Duration, terminado <-chan struct{}) bool {
	fin := time.Now().Add(max)
	for time.Now().Before(fin) {
		select {
		case <-terminado:
			return false
		default:
		}
		if esFacturador(puerto) {
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}

// esperarActualizacionEnCurso evita cortar una actualización a medias si se cierra la ventana justo entonces.
func esperarActualizacionEnCurso() {
	dir := filepath.Join(dirDatos, "actualizaciones")
	fin := time.Now().Add(4 * time.Minute)
	for time.Now().Before(fin) {
		_, e1 := os.Stat(filepath.Join(dir, "pendiente.json"))
		_, e2 := os.Stat(filepath.Join(dir, "en-prueba.json"))
		if e1 != nil && e2 != nil {
			return
		}
		time.Sleep(time.Second)
	}
}

// ---------- Ventana ----------

func buscarNavegador() string {
	var candidatos []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base != "" {
			candidatos = append(candidatos, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")} {
		if base != "" {
			candidatos = append(candidatos, filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, c := range candidatos {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

func argumentosVentana(puerto int) []string {
	return []string{
		"--app=" + fmt.Sprintf("http://127.0.0.1:%d/", puerto),
		"--user-data-dir=" + dirPerfil,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-sync",
		"--disable-background-mode", // al cerrar la ventana, Edge no se queda en segundo plano
		"--disable-features=msEdgeSidebarV2,msHubApps,msUndersideButton,msShoppingTrigger,EdgeCollections",
	}
}

// comandoVentana lanza el navegador fuera del objeto de trabajo del servidor (se gestiona solo). Si Windows no lo
// permite (el lanzador ya estaba dentro de otro trabajo sin esa opción), lo lanza dentro.
func comandoVentana(navegador string, puerto int) (*exec.Cmd, error) {
	cmd := exec.Command(navegador, argumentosVentana(puerto)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_BREAKAWAY_FROM_JOB}
	if err := cmd.Start(); err == nil {
		return cmd, nil
	}
	cmd = exec.Command(navegador, argumentosVentana(puerto)...)
	return cmd, cmd.Start()
}

func abrirVentana(navegador string, puerto int) error {
	_, err := comandoVentana(navegador, puerto)
	return err
}

// esperarVentana abre la ventana de Facturador y vuelve cuando el usuario la cierra.
func esperarVentana(navegador string, puerto int) error {
	inicio := time.Now()
	cmd, err := comandoVentana(navegador, puerto)
	if err != nil {
		return err
	}
	_ = cmd.Wait()
	// Si el perfil ya estaba abierto (o Edge se reinicia para actualizarse), el proceso que lanzamos termina enseguida
	// y la ventana sigue abierta en otro: se espera mientras el perfil esté en uso.
	for perfilEnUso() {
		time.Sleep(2 * time.Second)
	}
	if time.Since(inicio) < 3*time.Second && !esFacturadorVisitado() {
		return errors.New("el navegador no ha abierto la ventana")
	}
	return nil
}

// perfilEnUso: Edge/Chrome mantienen abierto en exclusiva el archivo "lockfile" del perfil mientras se ejecutan.
func perfilEnUso() bool {
	err := os.Remove(filepath.Join(dirPerfil, "lockfile"))
	if err == nil || errors.Is(err, os.ErrNotExist) {
		return false
	}
	return true
}

// esFacturadorVisitado indica si el perfil del navegador llegó a crearse (la ventana se abrió alguna vez).
func esFacturadorVisitado() bool {
	_, err := os.Stat(filepath.Join(dirPerfil, "Local State"))
	return err == nil
}

func abrirNavegadorPredeterminado(puerto int) {
	url, _ := windows.UTF16PtrFromString(fmt.Sprintf("http://127.0.0.1:%d/", puerto))
	verbo, _ := windows.UTF16PtrFromString("open")
	_ = windows.ShellExecute(0, verbo, url, nil, nil, windows.SW_SHOWNORMAL)
}

// ---------- Objeto de trabajo ----------

func crearTrabajo() error {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return err
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return err
	}
	// El propio lanzador entra en el trabajo: así sus hijos (y los hijos de estos) entran desde el primer instante.
	// El identificador no se cierra nunca: al terminar el proceso, Windows lo cierra y mata todo lo de dentro.
	return windows.AssignProcessToJobObject(job, windows.CurrentProcess())
}

// ---------- Mensajes ----------

func mensaje(texto string, flags uint32) {
	t, _ := windows.UTF16PtrFromString(texto)
	c, _ := windows.UTF16PtrFromString(titulo)
	_, _ = windows.MessageBox(0, t, c, flags|windows.MB_SETFOREGROUND)
}

func aviso(texto string) { mensaje(texto, windows.MB_OK|windows.MB_ICONINFORMATION) }

func fallo(texto string) {
	mensaje(texto, windows.MB_OK|windows.MB_ICONERROR)
	os.Exit(1)
}
