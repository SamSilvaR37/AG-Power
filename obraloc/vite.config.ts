import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // caminho relativo: o build funciona em qualquer subpasta
  base: './',
  // recomendação do PGlite: não pré-empacotar (carrega WASM e dados próprios)
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
  test: { environment: 'node', testTimeout: 60000 },
});
