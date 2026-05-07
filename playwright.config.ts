import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const serverPort = process.env.AGENTKANBAN_SERVER_PORT ?? '5587';
const vitePort = process.env.AGENTKANBAN_VITE_PORT ?? '43173';
const storageRoot = resolve('.tmp/http-smoke/storage');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${vitePort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node ./scripts/dev-axum.mjs',
    url: `http://127.0.0.1:${vitePort}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      AGENTKANBAN_SERVER_PORT: serverPort,
      AGENTKANBAN_VITE_PORT: vitePort,
      AGENTKANBAN_STORAGE_ROOT: storageRoot,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});