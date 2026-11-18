/**
 * Nebenluft-Ring im Druck (npm run test:bleed): Rohr und Ring wie beim Export als Netz, in 0,2-mm-Schichten
 * geschnitten (tools/druck/ring.py, braucht python3 mit trimesh und shapely).
 * - Frei über dem Spalt (flacher als 45°) darf nur die unterste Schicht des Rings beginnen, mit mindestens 0,6 mm
 *   senkrechtem Abstand zum Rohr darunter (gemessen in 0,05-mm-Schritten ab der Unterkante der Schicht). Erlaubt sind
 *   Brücken über den Fenstern (nichts darunter) und kleine Reste (Noppe der Raste, Netzgenauigkeit) bis 2 mm² je Stück.
 * - Waagerecht nirgends näher am Rohr als das Spiel (5 % Toleranz für das Netz).
 * Aufruf mit --alt=<Ordner> rechnet nur aus und prüft nicht (zum Vergleich mit einem älteren Stand).
 */
import opencascade from 'replicad-opencascadejs';
import { setOC, type Shape3D } from 'replicad';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { partsBleed } from '../src/lib/osvac/assemblies';
import { meshTolerance } from '../src/lib/worker/threemf';

const root = path.resolve(import.meta.dirname, '..');
setOC(await opencascade({ locateFile: (f: string) => path.join(root, 'node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(root, 'public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);

const cases: [string, 'female' | 'male', number, object][] = [
  ['F32-H36-0,35', 'female', 0.35, { femaleDiameterInner: 32, hoseDiameterInner: 36 }],
  ['F32-H36-0,2', 'female', 0.2, { femaleDiameterInner: 32, hoseDiameterInner: 36 }],
  ['F32-H36-0,6', 'female', 0.6, { femaleDiameterInner: 32, hoseDiameterInner: 36 }],
  ['M32-H27-W9-0,3', 'male', 0.3, { maleDiameterInner: 32, hoseDiameterInner: 27, generalMaterialWidth: 9 }],
  ['F50-H50-0,35', 'female', 0.35, { femaleDiameterInner: 50, hoseDiameterInner: 50 }],
];
const dir = path.join(root, 'out/bleed-print');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const [id, top, gap, input] of cases) {
  const parts = partsBleed(deriveParams(input), { text: false, knurl: false, bleed: { top, gap } }).filter((q) => q.name.startsWith('Nebenluft'));
  const bodies = parts.map((q) => {
    const m = (q.make() as Shape3D).mesh({ tolerance: Math.min(0.02, meshTolerance(q.name)), angularTolerance: 0.05 });
    return { name: q.name, ring: q.name.endsWith('Drehring'), v: Array.from(m.vertices), t: Array.from(m.triangles) };
  });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, bodies }));
}
const py = spawnSync('python3', [path.join(root, 'tools/druck/ring.py'), dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (py.status !== 0) {
  console.error(py.stderr);
  console.error('python3 mit trimesh und shapely nötig: pip install trimesh shapely');
  process.exit(1);
}
const report = process.argv.some((a) => a.startsWith('--alt'));
const gapOf = new Map(cases.map(([id, , g]) => [id, g]));
/** [Höhe über dem Ringboden, Fläche, senkrechter Abstand zum Rohr darunter (null: nichts bis 3 mm), verankert] */
type Free = [number, number, number | null, boolean];
let fail = 0;
for (const line of py.stdout.trim().split('\n')) {
  const r = JSON.parse(line) as { id: string; free: Free[]; minGap: number; layers: number; open: string[] };
  const g = gapOf.get(r.id)!;
  const big = r.free.filter(([, a]) => a > 2);
  const sum = r.free.reduce((s, [, a]) => s + a, 0);
  const fmt = (f: Free) => `${f[0].toFixed(1)} mm: ${f[1].toFixed(1)} mm² (${f[2] === null ? 'nichts darunter' : `${f[2].toFixed(2)} mm über dem Rohr`}${f[3] ? '' : ', beginnt frei'})`;
  console.log(`${r.id}: frei ${sum.toFixed(0)} mm² in ${r.free.length} Schichtstücken, kleinster Abstand ${r.minGap.toFixed(2)} mm`);
  for (const f of big) console.log(`   ${fmt(f)}`);
  if (report) continue;
  const bad: string[] = [];
  for (const f of big) {
    // Brücke über einem Fenster (nichts darunter, an beiden Seiten verankert) ist erlaubt
    if (f[2] === null && f[3]) continue;
    if (f[0] > 0.2) bad.push(`frei über dem Spalt bei ${fmt(f)}`);
    else if (f[2] === null || f[2] < 0.6) bad.push(`Anfang des Rings zu nah am Bund: ${fmt(f)}`);
  }
  if (r.open.length) bad.push(`offene Kanten: ${r.open.join(', ')}`);
  if (r.minGap < g * 0.95) bad.push(`Abstand zum Rohr ${r.minGap} < Spiel ${g}`);
  if (bad.length) {
    fail++;
    console.log(`   FEHLER: ${bad.join(' / ')}`);
  }
}
if (fail) process.exit(1);
console.log(report ? 'nur Ausgabe' : 'Nebenluft-Ring druckt ohne flachen Überhang');
