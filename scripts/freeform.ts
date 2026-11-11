/**
 * Prüflauf Freiform (npm run test:freeform): baut alle Vorlagen und eine Reihe von Varianten
 * (alle Querschnitte, auf-/eingesteckt, Fase, Anschlag, Extras am Gerät, osVAC neo an Ende B, beide Druckbett-Lagen)
 * und prüft jeden Körper mit BRepCheck und auf positives Volumen. Optional STL nach out/freeform-<fall>.stl (--stl).
 */
import opencascade from 'replicad-opencascadejs';
import { setOC, getOC, measureVolume, makeCompound, type Shape3D } from 'replicad';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { partsFree } from '../src/lib/osvac/assemblies';
import { TEMPLATES, newBlock, sec, planFree, type FreeSpec, type SectionShape } from '../src/lib/osvac/freeform';

const here = path.dirname(fileURLToPath(import.meta.url));
setOC(await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(here, '../public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const oc = getOC();
const valid = (s: Shape3D) => {
  const c = new oc.BRepCheck_Analyzer((s as unknown as { wrapped: never }).wrapped, false, false);
  const v = c.IsValid();
  c.delete();
  return v;
};
const writeStl = process.argv.includes('--stl');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

const cases: [string, FreeSpec][] = TEMPLATES.map((t) => [t.id, t.make()]);
const shapes: SectionShape[] = ['circle', 'ellipse', 'slot', 'rect', 'dshape', 'trapezoid'];
for (const shape of shapes)
  for (const mode of ['over', 'into'] as const) {
    const s = TEMPLATES[3].make();
    s.b.device = { ...s.b.device, mode, section: sec(shape, { w: 50, h: 30, d: 40, r: 3, r2: 6, w2: 36 }), dDepth: 42, rot: 15, collar: mode === 'into' };
    cases.push([`geraet-${shape}-${mode}`, s]);
  }
{
  const s = TEMPLATES[0].make();
  s.blocks = [
    newBlock('straight', { length: 10 }),
    newBlock('step', { section: sec('circle', { d: 40 }) }),
    newBlock('bend', { angle: 45, radius: 50, dir: 90 }),
    newBlock('transition', { length: 35, section: sec('slot', { w: 60, h: 25 }), twist: 30 }),
    newBlock('bend', { angle: 60, radius: 60, dir: 0 }),
    newBlock('transition', { length: 30, offset: 10, tilt: -20, dir: 45, section: sec('circle', { d: 30 }) }),
  ];
  s.b.type = 'female';
  s.b.d = 25;
  s.bed = 'B';
  cases.push(['kette-alle-bausteine', s]);
  cases.push(['kette-A-unten', { ...structuredClone(s), bed: 'A' }]);
}
// Extras am Geräteanschluss: Klemmrippen, Schlitze, Aussparung, Schraubenlöcher
for (const [id, shape, mode, dDepth] of [
  ['extras-kreis-auf', 'circle', 'over', 33],
  ['extras-kreis-auf-gerade', 'circle', 'over', 32],
  ['extras-rechteck-auf', 'rect', 'over', 0],
  ['extras-dform-auf', 'dshape', 'over', 0],
  ['extras-ellipse-ein', 'ellipse', 'into', 0],
  ['extras-kreis-ein', 'circle', 'into', 34],
] as const) {
  const s = TEMPLATES[3].make();
  const section = sec(shape, { w: 56, h: 34, d: 34, r: 5, r2: 3 });
  if (shape === 'dshape') section.h = 26;
  s.b.device = { ...s.b.device, mode, section, dDepth: dDepth || 34, length: 28, ribs: true, slots: true, holes: true, notch: true, notchW: 14, notchH: 9, notchDir: 60, collar: mode === 'into' };
  cases.push([id, s]);
}
{
  const s = TEMPLATES[2].make();
  s.blocks.push(newBlock('bend', { angle: 180, radius: 40, dir: 270 }));
  s.b.type = 'male';
  cases.push(['u-bogen-stecker-unten', s]);
}

let fail = 0;
const p = deriveParams({});
for (const [id, spec] of cases) {
  if (only && id !== only) continue;
  const t0 = Date.now();
  try {
    const errs = planFree(spec).issues.filter((x) => x.level === 'error');
    if (errs.length) throw new Error(errs.map((x) => x.text).join(' / '));
    const parts = partsFree(p, { text: false, knurl: false, supports: true, free: spec });
    let vol = 0;
    const bad: string[] = [];
    const built: Shape3D[] = [];
    for (const q of parts) {
      const sh = q.make();
      const v = measureVolume(sh);
      vol += v;
      if (!valid(sh) || !(v > 0)) bad.push(q.name);
      built.push(sh);
    }
    const c = makeCompound(built) as Shape3D;
    const bb = c.boundingBox.bounds;
    if (writeStl) {
      fs.mkdirSync(path.join(here, '../out'), { recursive: true });
      fs.writeFileSync(path.join(here, `../out/freeform-${id}.stl`), Buffer.from(await c.blobSTL({ tolerance: 0.05, angularTolerance: 0.2 }).arrayBuffer()));
    }
    if (bad.length) fail++;
    const size = bb[1].map((v, i) => (v - bb[0][i]).toFixed(0)).join('×');
    console.log(`${bad.length ? 'FEHLER' : 'ok    '} ${id.padEnd(26)} ${String(parts.length).padStart(2)} Körper  ${(vol / 1000).toFixed(1).padStart(6)} cm³  ${size.padEnd(12)} ${String(Date.now() - t0).padStart(6)} ms${bad.length ? '  ungültig: ' + bad.join(', ') : ''}`);
    for (const s of built) s.delete?.();
  } catch (e) {
    fail++;
    console.log(`FEHLER ${id.padEnd(26)} ${(e as Error).message}`);
  }
}
console.log(fail ? `${fail} Fälle fehlerhaft` : 'Alle Fälle in Ordnung');
process.exit(fail ? 1 : 0);
