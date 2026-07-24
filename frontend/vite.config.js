import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

let gitCommit = 'dev';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // Fallbacks para ambientes sem git (Vercel CLI deploy, CI, etc.)
  gitCommit =
    (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) ||
    process.env.VITE_GIT_COMMIT ||
    'dev';
}

export default defineConfig({
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    global: 'globalThis',
  },
  plugins: [react()],
  server: {
    port: 5173,
    // Necessário para acessar o dev server via túnel ngrok durante testes
    // locais do OAuth/embed na Nuvemshop (Host header não é localhost).
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
