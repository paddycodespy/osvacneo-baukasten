import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

// Prüfsumme über den Geometrie-Code und die Schrift: Schlüssel für die im Browser gespeicherten Körper
function geomVersion() {
  const h = createHash('sha256');
  for (const dir of ['src/lib/osvac']) for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(`${dir}/${f}`));
  h.update(readFileSync('public/fonts/LiberationSans-Regular.ttf'));
  h.update(readFileSync('package-lock.json')); // replicad/OpenCascade-Version
  return h.digest('hex').slice(0, 16);
}

// base './' → der Build läuft aus jedem Unterordner (lokaler Webserver, Windows-Programm)
export default defineConfig({
  base: './',
  define: { __GEOM_VERSION__: JSON.stringify(geomVersion()), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [svelte()],
  worker: { format: 'es' },
  // fester Port für „npm run desktop:dev“ (Tauri erwartet http://localhost:5173)
  server: { port: 5173, strictPort: true },
  optimizeDeps: { exclude: ['replicad-opencascadejs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
