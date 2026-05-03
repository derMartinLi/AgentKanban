import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = process.env.AGENTKANBAN_SERVER_PORT ?? '5577';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${serverPort}`,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
