// Genera el par de claves Ed25519 para firmar las actualizaciones.
// - La clave PÚBLICA se guarda en server/clave-actualizaciones.pem y va dentro de la aplicación.
// - La clave PRIVADA se guarda en ~/.facturador/clave-firma-actualizaciones.pem (solo para el autor).
//   Guárdala en un sitio seguro y añádela como secreto FACTURADOR_CLAVE_FIRMA en GitHub para publicar.
//   Si se pierde, habrá que generar otra y las instalaciones existentes no aceptarán las nuevas versiones
//   hasta que se actualicen a mano.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const privada = path.join(os.homedir(), '.facturador', 'clave-firma-actualizaciones.pem');
const publica = path.resolve('server', 'clave-actualizaciones.pem');
if (fs.existsSync(privada) && !process.argv.includes('--forzar')) {
  console.error(`Ya existe ${privada}. Usa --forzar para sustituirla (las instalaciones actuales dejarían de aceptar actualizaciones).`);
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(privada), { recursive: true, mode: 0o700 });
fs.writeFileSync(privada, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(publica, publicKey.export({ type: 'spki', format: 'pem' }));
console.log(`Clave privada: ${privada} (¡guárdala bien y no la subas a GitHub!)`);
console.log(`Clave pública: ${publica} (va dentro de la aplicación)`);
