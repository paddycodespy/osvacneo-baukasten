import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// base './' → der Build läuft aus jedem Unterordner (GitHub Pages, lokaler Webserver)
export default defineConfig({
  base: './',
  plugins: [svelte()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['replicad-opencascadejs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
