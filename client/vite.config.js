import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Reads BASE_PATH from the repo's single root .env file (the same one the
// server reads via server/src/config/env.js) so a sub-path deployment
// (e.g. Apache reverse-proxying /epreport straight through to this app) is
// configured in exactly one place, not duplicated between server and
// client config. Falls back to "/" (serve from the domain root) when unset.
function readBasePath() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return '/';
  const match = fs.readFileSync(envPath, 'utf8').match(/^BASE_PATH=(.*)$/m);
  const value = match ? match[1].trim() : '';
  if (!value || value === '/') return '/';
  return `${value.replace(/\/+$/, '')}/`;
}

export default defineConfig({
  base: readBasePath(),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
