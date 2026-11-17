/**
 * Druckbarkeit der Saugdüsen, des Nebenluft-Reglers, der Freiform-Vorlagen, Stutzen, Schieber und Lösehilfe: Netze wie beim Export
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
import { prepare as prepareContour, bbox as contourBox, clipperReady } from '../src/lib/osvac/contour';
import { weld, meshTolerance } from '../src/lib/worker/threemf';
import { overhangArea, COUNTED, COUNTED_MACHINE, COUNTED_GATE } from '../src/lib/overhang';
import { kindById } from '../src/lib/osvac/catalog';
import { DEFAULT_PIPE, type PipeSpec } from '../src/lib/osvac/machine';
import { DEFAULT_GATE, type GateSpec } from '../src/lib/osvac/gate';
import { DEFAULT_MAGNET, type MagnetSpec } from '../src/lib/osvac/magnet';

const root = path.resolve(import.meta.dirname, '..');
setOC(await opencascade({ locateFile: (f: string) => path.join(root, 'node_modules/replicad-opencascadejs/dist/', f) }));
await clipperReady; // Clipper (Kontur-Versatz) wird nachgeladen
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
/** Haube mit eigener Kontur (Nase, gewölbte Oberseite), Übergang lang genug für den Druck ohne Stützen */
function konturHaube(): FreeSpec {
  const raw: [number, number][] = [[-27, -17], [27, -17], [27, -6], [29.5, -5], [29.5, 1], [27, 2], [27, 8]];
  const half = 27, sag = 7, R = (half * half + sag * sag) / (2 * sag), cy = 15 - R, a0 = Math.atan2(8 - cy, 27);
  for (let i = 0; i <= 40; i++) raw.push([R * Math.cos(a0 + ((Math.PI - 2 * a0) * i) / 40), cy + R * Math.sin(a0 + ((Math.PI - 2 * a0) * i) / 40)]);
  const pts = prepareContour(raw).pts, b = contourBox(pts);
  const s = TEMPLATES.find((t) => t.id === 'hood')!.make();
  s.b.device = { ...s.b.device, section: { ...s.b.device.section, shape: 'contour', pts, w: b.w, h: b.h, d: Math.max(b.w, b.h) } };
  s.b.transition = 34;
  return s;
}
const cases: [string, FreeSpec][] = [
  ...NOZZLE_KINDS.map((k) => [`duese-${k.id}`, nz({ kind: k.id, ...k.values })] as [string, FreeSpec]),
  ...NOZZLE_KINDS.map((k) => [`duese-${k.id}-ring-buerste`, nz({ kind: k.id, ...k.values, ring: true, brush: true, tip: 30 })] as [string, FreeSpec]),
  ['duese-kupplung', nz({ kind: 'crevice', ...NOZZLE_KINDS[1].values, a: { type: 'female', d: 32 } })],
  ['nebenluft-32', bl(32, 32)],
  ['nebenluft-15', bl(15, 15, 0.2)],
  ['nebenluft-25-50', bl(25, 50, 0.6)],
  ...TEMPLATES.filter((t) => !['gate'].includes(t.id)).map((t) => [`vorlage-${t.id}`, t.make()] as [string, FreeSpec]),
  ['kontur-haube', konturHaube()],
];
/** Stutzen-Adapter und Schieber einzeln (keine Freiform): Teile und die Überhang-Regel der App */
const others: [string, string, object, RegExp, object?][] = [
  ['stutzen-F-auf', 'MACHINE_F', { pipe: { ...DEFAULT_PIPE, d1Inner: 32.2, d2Inner: 33.2, mode: 'over', screwHoles: true, slots: true, ribs: true } as PipeSpec }, COUNTED_MACHINE],
  ['stutzen-M-ein', 'MACHINE_M', { pipe: { ...DEFAULT_PIPE, d1Inner: 26.8, d2Inner: 25.8, mode: 'into', screwHoles: true, ribs: true } as PipeSpec }, COUNTED_MACHINE],
  ['schieber-50-wandplatte', 'GATE', { gate: { ...DEFAULT_GATE, d: 50, mount: 'plate' } as GateSpec }, COUNTED_GATE],
  ['schieber-32-wandhalter', 'GATE', { gate: { ...DEFAULT_GATE, d: 32, mount: 'clip' } as GateSpec }, COUNTED_GATE],
  ['loesehilfe-32', 'HELPER', {}, /^Lösehilfe/],
  // wie beim ersten Öffnen der App (Nebenluft-Ring 0,35, Drehring 0,35)
  ['nebenluft-F32-H36', 'BLEED', { bleed: { top: 'female', gap: 0.35 } }, /^$/, { femaleDiameterInner: 32, hoseDiameterInner: 36, slipRingGapSize: 0.35 }],
  ['nebenluft-M32-H27-W9', 'BLEED', { bleed: { top: 'male', gap: 0.3 } }, /^$/, { maleDiameterInner: 32, hoseDiameterInner: 27, generalMaterialWidth: 9 }],
  ['nebenluft-F50-H50', 'BLEED', { bleed: { top: 'female', gap: 0.6 } }, /^$/, { femaleDiameterInner: 50, hoseDiameterInner: 50 }],
  ['loesehilfe-F25-M50-W9', 'HELPER', {}, /^Lösehilfe/, { femaleDiameterInner: 25, maleDiameterInner: 50, generalMaterialWidth: 9, maleFemaleGapSize: 0.3 }],
  // Magnetkupplung: alles in 45°, Taschen geschlossen. Überhang zählt nicht (die Decken der Taschen sind Brücken über den
  // Magneten), dafür darf nichts schwebend beginnen
  ['magnet-10x3', 'MAGNET', { magnet: { ...DEFAULT_MAGNET } as MagnetSpec }, /^$/],
  ['magnet-12x5-rechts-110', 'MAGNET', { magnet: { ...DEFAULT_MAGNET, magnet: '12x5', hand: 'right', stutzen: 110, hose: 110, pitch: 8, depth: 20 } as MagnetSpec }, /^$/],
  ['magnet-15x3-90', 'MAGNET', { magnet: { ...DEFAULT_MAGNET, magnet: '15x3', stutzen: 90, hose: 90, pitch: 20, depth: 60 } as MagnetSpec }, /^$/],
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
for (const [id, kind, o, counted, input] of others) {
  if (only.length && !only.some((x) => id.startsWith(x))) continue;
  const parts = kindById(kind).parts!(input ? deriveParams(input) : p, { text: true, knurl: true, supports: true, ...o });
  const bodies: { name: string; helper: boolean; v: number[]; t: number[] }[] = [];
  const meshes = [];
  for (const q of parts) {
    const sh = q.make() as Shape3D;
    const m = sh.mesh({ tolerance: meshTolerance(q.name), angularTolerance: 0.1 });
    const w = weld({ name: q.name, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles) });
    const helper = !!q.helper || q.name.startsWith('Druckhilfe');
    bodies.push({ name: q.name, helper, v: Array.from(w.vertices), t: Array.from(w.triangles) });
    meshes.push({ name: q.name, helper, positions: m.vertices, normals: m.normals, indices: m.triangles });
  }
  claim.set(id, overhangArea(meshes, counted, 25));
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, allow: kind === 'BLEED' ? ['Drehring'] : [], bodies }));
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
