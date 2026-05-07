import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const env = { ...process.env };
const useShell = process.platform === 'win32';
const cargoBin = join(homedir(), '.cargo', 'bin');
const cargoExecutable = join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
const vitePort = env.AGENTKANBAN_VITE_PORT ?? '5173';

if (existsSync(cargoExecutable)) {
  const currentPath = env[pathKey] ?? '';
  const segments = currentPath.split(delimiter).filter(Boolean);
  if (!segments.includes(cargoBin)) {
    env[pathKey] = `${cargoBin}${delimiter}${currentPath}`;
  }
}

const children = [
  spawn('cargo', ['run', '-p', 'agentkanban-server'], {
    stdio: 'inherit',
    shell: useShell,
    env,
  }),
  spawn('pnpm', ['exec', 'vite', '--port', vitePort, '--strictPort'], {
    stdio: 'inherit',
    shell: useShell,
    env,
  }),
];

let exiting = false;

function stopChildren(code = 0) {
  if (exiting) {
    return;
  }

  exiting = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => {
    stopChildren(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    stopChildren(1);
  });
}

process.on('SIGINT', () => stopChildren(130));
process.on('SIGTERM', () => stopChildren(143));