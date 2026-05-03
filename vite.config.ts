import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5577',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5577',
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
