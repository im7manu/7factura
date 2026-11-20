; Instalador de Facturador para Windows (un solo ordenador, sin servidor).
; Se genera con: node scripts/crear-instalador-windows.mjs  (necesita makensis)
; Parámetros: /DVERSION=1.2.3 /DORIGEN=<carpeta con Facturador.exe, node\ y app\> /DSALIDA=<instalador.exe> /DRAIZ=<repositorio>
;
; Instalación por usuario, sin permisos de administrador:
;   programa: %LOCALAPPDATA%\Programs\Facturador   (se sustituye entero en cada instalación)
;   datos:    %LOCALAPPDATA%\Facturador             (no se toca al instalar ni al actualizar)

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
ManifestDPIAware true
RequestExecutionLevel user

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "StrFunc.nsh"
${StrStr}
${UnStrStr}

!define APP "7Factura"
!define CLAVE_DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\Facturador"

Name "${APP} ${VERSION}"
OutFile "${SALIDA}"
InstallDir "$LOCALAPPDATA\Programs\Facturador"
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1034 "ProductName" "${APP}"
VIAddVersionKey /LANG=1034 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1034 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1034 "FileDescription" "Instalador de ${APP}"
VIAddVersionKey /LANG=1034 "LegalCopyright" "Licencia MIT"
VIAddVersionKey /LANG=1034 "CompanyName" "7Factura (código abierto)"

!define MUI_ICON "${RAIZ}\windows\facturador.ico"
!define MUI_UNICON "${RAIZ}\windows\facturador.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Instalar ${APP} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Facturación para autónomos en tu propio ordenador.$\r$\n$\r$\nNo necesitas servidor ni conexión permanente a internet: todos tus datos se guardan en este equipo, en la carpeta de tu usuario.$\r$\n$\r$\n7Factura se actualiza solo, con versiones firmadas y vuelta atrás automática si algo falla.$\r$\n$\r$\nPulsa Siguiente para continuar."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${RAIZ}\LICENSE"
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "${APP} está instalado"
!define MUI_FINISHPAGE_TEXT "Tienes un acceso directo en el escritorio y en el menú Inicio.$\r$\n$\r$\nLa primera vez que lo abras, un asistente te pedirá crear tu usuario y los datos de tu empresa."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Facturador.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir ${APP} ahora"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

; Cierra Facturador si está abierto (sus procesos bloquearían los archivos)
!macro CerrarFacturador UN
  nsExec::ExecToStack '"$SYSDIR\tasklist.exe" /FI "IMAGENAME eq Facturador.exe" /NH'
  Pop $0
  Pop $1
  ${${UN}StrStr} $2 $1 "Facturador.exe"
  ${If} $2 != ""
    IfSilent +2
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "7Factura está abierto y se va a cerrar para continuar.$\r$\n$\r$\nTus datos no se pierden." IDOK +2
    Abort
    nsExec::Exec '"$SYSDIR\taskkill.exe" /F /T /IM Facturador.exe'
    Sleep 1500
  ${EndIf}
!macroend

Function .onInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "7Factura necesita Windows 10 o posterior."
    Abort
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "7Factura necesita Windows de 64 bits."
    Abort
  ${EndIf}
  SetShellVarContext current
FunctionEnd

Section "7Factura" SecPrincipal
  SectionIn RO
  !insertmacro CerrarFacturador ""

  ; El programa se sustituye entero (los datos están en otra carpeta)
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"

  SetOutPath "$INSTDIR"
  File "${ORIGEN}\Facturador.exe"
  File "/oname=facturador.ico" "${RAIZ}\windows\facturador.ico"
  SetOutPath "$INSTDIR\node"
  File /r "${ORIGEN}\node\*.*"
  SetOutPath "$INSTDIR\app"
  File /r "${ORIGEN}\app\*.*"
  SetOutPath "$INSTDIR"

  CreateDirectory "$LOCALAPPDATA\Facturador"

  Delete "$DESKTOP\Facturador.lnk"
  Delete "$SMPROGRAMS\Facturador.lnk"
  CreateShortcut "$DESKTOP\7Factura.lnk" "$INSTDIR\Facturador.exe" "" "$INSTDIR\facturador.ico" 0 SW_SHOWNORMAL "" "Facturación"
  CreateShortcut "$SMPROGRAMS\7Factura.lnk" "$INSTDIR\Facturador.exe" "" "$INSTDIR\facturador.ico" 0 SW_SHOWNORMAL "" "Facturación"

  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "Publisher" "7Factura (código abierto)"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "DisplayIcon" "$INSTDIR\facturador.ico"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "URLInfoAbout" "https://github.com/im7manu/facturador"
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr HKCU "${CLAVE_DESINSTALAR}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "NoRepair" 1
  WriteRegDWORD HKCU "${CLAVE_DESINSTALAR}" "EstimatedSize" ${TAMANO_KB}
SectionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Section "Uninstall"
  !insertmacro CerrarFacturador "Un"

  Delete "$DESKTOP\Facturador.lnk"
  Delete "$SMPROGRAMS\Facturador.lnk"
  Delete "$DESKTOP\7Factura.lnk"
  Delete "$SMPROGRAMS\7Factura.lnk"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\Facturador.exe"
  Delete "$INSTDIR\facturador.ico"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${CLAVE_DESINSTALAR}"

  ; Los datos solo se borran si el usuario lo pide expresamente (en modo silencioso, nunca)
  IfSilent fin
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Quieres borrar también tus datos (facturas, clientes, copias de seguridad…)?$\r$\n$\r$\nSi eliges No, se conservan en:$\r$\n$LOCALAPPDATA\Facturador$\r$\ny volverán a aparecer si instalas Facturador de nuevo." IDNO fin
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Se borrarán para siempre todas tus facturas y datos de Facturador de este ordenador.$\r$\n$\r$\n¿Seguro?" IDNO fin
  RMDir /r "$LOCALAPPDATA\Facturador"
  fin:
SectionEnd
