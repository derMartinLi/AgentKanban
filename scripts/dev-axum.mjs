import { spawn } from 'node:child_process';

const useShell = process.platform === 'win32';
const children = [
  spawn('cargo', ['run', '-p', 'agentkanban-server'], {
    stdio: 'inherit',
    shell: useShell,
  }),
  spawn('pnpm', ['exec', 'vite'], {
    stdio: 'inherit',
    shell: useShell,
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