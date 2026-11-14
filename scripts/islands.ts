/**
 * Druckbarkeit der Saugdüsen, des Nebenluft-Reglers und der Freiform-Vorlagen: Netze wie beim Export
 * (zusammengeführte Ecken) in Schichten schneiden (tools/druck/islands.py, braucht python3 mit trimesh und shapely).
 * Geprüft wird, ob die App recht hat: sagt sie „ohne Stützen“ (Überhang ≤ 40 mm²), darf nichts frei in der Luft
 * beginnen; erlaubt ist nur die unterste Schicht des mitgedruckten Drehrings. Offene Netzkanten sind immer ein Fehler.
 */
import opencascade from 'replicad-opencascadejs';
import { setOC, type Shape3D } from 'replicad';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { partsFree } from '../src/lib/osvac/assemblies';
import { TEMPLATES, newBlock, planFree, tiltedEnds, bleedMinLen, DEFAULT_DEVICE, type FreeSpec } from '../src/lib/osvac/freeform';
import { DEFAULT_NOZZLE, NOZZLE_KINDS, nozzleLayout, nozzleToFree, type NozzleSpec } from '../src/lib/osvac/nozzle';
import { bleedTransition } from '../src/lib/osvac/bleed';
import { weld, meshTolerance } from '../src/lib/worker/threemf';
import { overhangArea, COUNTED } from '../src/lib/overhang';

const root = path.resolve(import.meta.dirname, '..');
setOC(await opencascade({ locateFile: (f: string) => path.join(root, 'node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(root, 'public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const p = deriveParams({});

const nz = (v: Partial<NozzleSpec>): FreeSpec => {
  const n = { ...structuredClone(DEFAULT_NOZZLE), ...v };
  n.length = Math.max(n.length, nozzleLayout(n).minLength);
  return nozzleToFree(n);
};
const bl = (m: number, f: number, gap = 0.4): FreeSpec => ({
  a: { type: 'male', d: m },
  wall: 3,
  blocks: [newBlock('bleed', { length: bleedMinLen(m, 3, gap) })],
  b: { type: 'female', d: f, device: { ...DEFAULT_DEVICE }, transition: bleedTransition(m, f) },
  bed: 'A',
  bleedGap: gap,
});
const cases: [string, FreeSpec][] = [
  ...NOZZLE_KINDS.map((k) => [`duese-${k.id}`, nz({ kind: k.id, ...k.values })] as [string, FreeSpec]),
  ...NOZZLE_KINDS.map((k) => [`duese-${k.id}-ring-buerste`, nz({ kind: k.id, ...k.values, ring: true, brush: true, tip: 30 })] as [string, FreeSpec]),
  ['duese-kupplung', nz({ kind: 'crevice', ...NOZZLE_KINDS[1].values, a: { type: 'female', d: 32 } })],
  ['nebenluft-32', bl(32, 32)],
  ['nebenluft-15', bl(15, 15, 0.2)],
  ['nebenluft-25-50', bl(25, 50, 0.6)],
  ...TEMPLATES.filter((t) => !['gate'].includes(t.id)).map((t) => [`vorlage-${t.id}`, t.make()] as [string, FreeSpec]),
];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dir = path.join(root, 'out/islands');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const claim = new Map<string, number>();
for (const [id, spec] of cases) {
  if (only.length && !only.some((o) => id.startsWith(o))) continue;
  const plan = planFree(spec);
  if (plan.issues.some((x) => x.level === 'error')) throw new Error(`${id}: ${plan.issues.map((x) => x.text).join(' / ')}`);
  const parts = partsFree(p, { text: true, knurl: true, supports: true, free: spec });
  const tilted = tiltedEnds(spec, plan);
  const bodies: { name: string; helper: boolean; v: number[]; t: number[] }[] = [];
  const meshes = [];
  for (const q of parts) {
    const sh = q.make() as Shape3D;
    const m = sh.mesh({ tolerance: meshTolerance(q.name), angularTolerance: 0.1 });
    const w = weld({ name: q.name, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles) });
    bodies.push({ name: q.name, helper: q.name.startsWith('Druckhilfe'), v: Array.from(w.vertices), t: Array.from(w.triangles) });
    meshes.push({ name: q.name, helper: q.name.startsWith('Druckhilfe'), positions: m.vertices, normals: m.normals, indices: m.triangles });
  }
  claim.set(id, overhangArea(meshes, (n) => COUNTED.test(n) || tilted(n)));
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, allow: ['Drehring'], bodies }));
}
const py = spawnSync('python3', [path.join(root, 'tools/druck/islands.py'), dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (py.status !== 0) {
  console.error(py.stderr);
  console.error('python3 mit trimesh und shapely nötig: pip install trimesh shapely');
  process.exit(1);
}
let fail = 0;
for (const line of py.stdout.trim().split('\n')) {
  const r = JSON.parse(line) as { id: string; edges: [string, number, boolean][]; islands: [string, number, number][] };
  const ov = claim.get(r.id) ?? 0;
  const bad: string[] = [];
  for (const [n, e, wind] of r.edges) bad.push(`${n}: ${e} offene Kanten${wind ? '' : ', Flächen falsch herum'}`);
  // Insel auf Schicht 1 liegt auf dem Bett
  const isl = r.islands.filter(([, z]) => z > 0.2);
  if (ov <= 40 && isl.length) bad.push(`App sagt „ohne Stützen“ (${ov.toFixed(0)} mm²), aber schwebend: ${isl.slice(0, 3).map(([n, z, a]) => `${n} bei z ${z} (${a} mm²)`).join(', ')}${isl.length > 3 ? ' …' : ''}`);
  if (bad.length) fail++;
  console.log(`${bad.length ? 'FEHLER' : 'ok    '} ${r.id.padEnd(30)} Überhang ${ov.toFixed(0).padStart(5)} mm², ${isl.length} schwebend${bad.length ? ' — ' + bad.join(' | ') : ''}`);
}
console.log(fail ? `${fail} Fälle fehlerhaft` : 'Alle Fälle in Ordnung');
process.exit(fail ? 1 : 0);
