import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const env = { ...process.env };
const cargoBin = join(homedir(), '.cargo', 'bin');
const cargoExecutable = join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';

if (existsSync(cargoExecutable)) {
  const currentPath = env[pathKey] ?? '';
  const segments = currentPath.split(delimiter).filter(Boolean);
  if (!segments.includes(cargoBin)) {
    env[pathKey] = `${cargoBin}${delimiter}${currentPath}`;
  }
}

const require = createRequire(import.meta.url);
const tauriCliEntry = require.resolve('@tauri-apps/cli/tauri.js');

const child = spawn(process.execPath, [tauriCliEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});