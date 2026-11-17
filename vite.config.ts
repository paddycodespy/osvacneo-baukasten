import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import * as replicad from 'replicad';

/**
 * Im Hauptfenster rechnet nur die Planung (reine Mathematik); die CAD-Bibliothek replicad braucht nur der Worker.
 * Beim Bauen bekommt das Hauptfenster deshalb statt replicad einen Platzhalter mit denselben Namen (spart rund ein
 * Drittel der Startdatei). Ruft das Hauptfenster doch eine replicad-Funktion auf, gibt es einen klaren Fehler; die
 * Bedienabläufe (test:ui, laufen auf dem Build) würden das melden. Der Worker hat eigene Plugins und bekommt das echte replicad.
 */
function replicadStub(): Plugin {
  const ID = '\0replicad-stub';
  return {
    name: 'replicad-stub',
    apply: 'build',
    enforce: 'pre',
    resolveId: (id) => (id === 'replicad' ? ID : null),
    load(id) {
      if (id !== ID) return null;
      const names = Object.keys(replicad).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
      return [
        `const no = (n) => { const f = function () { throw new Error('replicad im Hauptfenster: ' + n); }; return new Proxy(f, { get: (_t, k) => (k === 'prototype' ? {} : f), construct: f }); };`,
        ...names.map((n) => `export const ${n} = no(${JSON.stringify(n)});`),
      ].join('\n');
    },
  };
}

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
  plugins: [svelte(), replicadStub()],
  // Worker als eine einzige Datei: Würde ein nachgeladener Teil (z. B. Clipper) Code aus der Worker-Datei
  // importieren, wertet WebKit (Programm unter Linux/macOS) die Worker-Datei ein zweites Mal aus. Die zweite
  // Kopie übernimmt dann self.onmessage ohne geladenes OpenCascade, und die Berechnung scheitert zufällig.
  worker: { format: 'es', rolldownOptions: { output: { codeSplitting: false } } },
  // fester Port für „npm run desktop:dev“ (Tauri erwartet http://localhost:5173)
  server: { port: 5173, strictPort: true },
  optimizeDeps: { exclude: ['replicad-opencascadejs'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
