/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_DEPLOYMENT_MODE': JSON.stringify(process.env.DEPLOYMENT_MODE || 'saas'),
  },
  server: {
    proxy: {
      '/v1/admin': 'http://localhost:3100',
      '/v1/chat': 'http://localhost:3100',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
