// Arranca a la vez el servidor (puerto 9100) y Vite (puerto 8080).
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const hijos = ['dev:server', 'dev:web'].map((s) => spawn(npm, ['run', s], { stdio: 'inherit' }));
const parar = () => { for (const h of hijos) h.kill(); process.exit(); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
for (const h of hijos) h.on('exit', parar);
