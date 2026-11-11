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
import { TEMPLATES, newBlock, sec, planFree, testHooks, flangeGeom, flangeMinRim, flangeDefaults, type FreeSpec, type SectionShape } from '../src/lib/osvac/freeform';
import { partNotes } from '../src/lib/errors';
import { belowBedEnd } from '../src/lib/overhang';
import { kindById } from '../src/lib/osvac/catalog';
import { DEFAULT_PIPE, type PipeSpec } from '../src/lib/osvac/machine';

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
// Teil ragt unter das Ende auf dem Druckbett (U-Bogen nach unten): muss erkannt werden
{
  const s = TEMPLATES[3].make();
  s.blocks = [newBlock('bend', { angle: 180, radius: 40, dir: 0 }), newBlock('straight', { length: 5 })];
  s.b.device.length = 10;
  cases.push(['unter-bett-u-bogen', s]);
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
// Schlitze ohne Schraubenlöcher: Anzahl nach Umfang (Ø 34 → 4, Rechteck 120 × 60 → 6)
for (const [id, shape] of [['schlitze-kreis', 'circle'], ['schlitze-rechteck', 'rect']] as const) {
  const s = TEMPLATES[3].make();
  s.b.device = { ...s.b.device, mode: 'over', section: sec(shape, { w: 120, h: 60, d: 34, r: 6 }), dDepth: 34, length: 30, slots: true, ribs: true };
  cases.push([id, s]);
}
{
  const s = TEMPLATES[2].make();
  s.blocks.push(newBlock('bend', { angle: 180, radius: 40, dir: 270 }));
  s.b.type = 'male';
  cases.push(['u-bogen-stecker-unten', s]);
}

// Flansch am Gerät: alle Formen mit automatischem Lochbild (abwechselnd mit Dichtung und gedreht), Lochbild nach Maß rechteckig und rund
for (const [i, shape] of shapes.entries()) {
  const s = TEMPLATES[3].make();
  const seal = i % 2 === 1;
  s.b.transition = 18;
  const sealW = [6, 9, 10][i % 3];
  s.b.device = { ...s.b.device, mode: 'flange', section: sec(shape, { w: 56, h: 34, d: 44, r: 5, r2: 3, w2: 36 }), rot: i === 3 ? 20 : 0, seal, sealW, flangeRim: seal ? flangeMinRim(3, true, sealW) : 15 };
  cases.push([`flansch-${shape}${seal ? `-dichtung${sealW}` : ''}`, s]);
}
{
  const s = TEMPLATES[1].make();
  s.b.device = { ...s.b.device, mode: 'flange', section: sec('rect', { w: 62, h: 38, r: 6, r2: 3 }), flangeLayout: 'rect', plateW: 150, plateH: 90, holeX: 130, holeY: 70, holeNX: 3, holeNY: 2, holeD: 5, seal: true, sealW: 10 };
  cases.push(['flansch-lochbild-rechteckig', s]);
  const r = TEMPLATES[3].make();
  r.b.transition = 18;
  r.b.device = { ...r.b.device, mode: 'flange', section: sec('circle', { d: 50 }), flangeLayout: 'round', plateD: 100, holeCircle: 82, holeN: 6, flangeT: 6 };
  cases.push(['flansch-lochkreis', r]);
}

let fail = 0;
const p = deriveParams({});
for (const [id, spec] of cases) {
  if (only && id !== only) continue;
  const t0 = Date.now();
  try {
    const plan = planFree(spec);
    const errs = plan.issues.filter((x) => x.level === 'error');
    if (errs.length) throw new Error(errs.map((x) => x.text).join(' / '));
    // Rahmen rechtshändig (u × v = t): sonst wäre die Skizze der Aussparung gegenüber dem Modell gespiegelt
    for (const f of [plan.chainEnd.frame, plan.end]) {
      const [u, v, t] = [f.u, f.v, f.t];
      const det = (u[1] * v[2] - u[2] * v[1]) * t[0] + (u[2] * v[0] - u[0] * v[2]) * t[1] + (u[0] * v[1] - u[1] * v[0]) * t[2];
      if (Math.abs(det - 1) > 1e-6) throw new Error(`Rahmen gespiegelt (det ${det.toFixed(3)})`);
    }
    const parts = partsFree(p, { text: false, knurl: false, supports: true, free: spec });
    let vol = 0;
    const bad: string[] = [];
    const built: Shape3D[] = [];
    const low: { name: string; helper: boolean; positions: number[]; normals: number[]; indices: number[] }[] = [];
    for (const q of parts) {
      const sh = q.make();
      const v = measureVolume(sh);
      vol += v;
      if (!valid(sh) || !(v > 0)) bad.push(q.name);
      built.push(sh);
      low.push({ name: q.name, helper: !!q.helper, positions: [0, 0, sh.boundingBox.bounds[0][2]], normals: [], indices: [] });
    }
    // das Ende auf dem Druckbett ist der tiefste Punkt (außer bei Fällen, die genau das prüfen)
    const below = belowBedEnd(low, spec.bed);
    if (id.startsWith('unter-bett') ? !(below > 5) : below > 0.3) bad.push(`Ende auf dem Bett ${below.toFixed(1)} mm über dem tiefsten Punkt`);
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
// Flansch: unpassende Eingaben werden verständlich abgefangen (ohne Berechnung)
if (!only || only === 'flansch-pruefungen') {
  const base = { ...TEMPLATES[3].make().b.device, mode: 'flange' as const, section: sec('circle', { d: 50 }) };
  const expect: [string, Partial<typeof base>, string][] = [
    ['Rand zu schmal', { flangeRim: 8 }, 'Rand muss'],
    ['Dichtung braucht Rand', { seal: true, flangeRim: 15 }, 'Dichtung'],
    ['Löcher in der Öffnung', { flangeLayout: 'round', plateD: 100, holeCircle: 50, holeN: 4 }, 'nah an der Öffnung'],
    ['Löcher am Rand', { flangeLayout: 'round', plateD: 70, holeCircle: 68, holeN: 4 }, 'Rand der Platte'],
    ['Platte zu klein', { flangeLayout: 'rect', plateW: 40, plateH: 40, holeX: 30, holeY: 30 }, 'zu klein'],
    ['Löcher zu dicht', { flangeLayout: 'rect', plateW: 140, plateH: 140, holeX: 9, holeY: 100 }, 'zu dicht'],
    ['Platte zu dünn', { flangeT: 2 }, 'dick sein'],
  ];
  const wrong = expect.filter(([, v, t]) => !flangeGeom({ ...base, ...v }, 3).errors.some((e) => e.text.includes(t))).map(([n]) => n);
  // Löcher je Seite: 3 × 2 → 6 auf dem Rand, 4 × 3 → 10 (nicht in der Mitte)
  for (const [nx, ny, n] of [[3, 2, 6], [4, 3, 10], [2, 2, 4]] as const) {
    const g = flangeGeom({ ...base, section: sec('rect', { w: 60, h: 40, r: 5, r2: 5 }), flangeLayout: 'rect', plateW: 170, plateH: 120, holeX: 150, holeY: 100, holeNX: nx, holeNY: ny }, 3);
    if (g.errors.length || g.holes.length !== n) wrong.push(`Löcher je Seite ${nx} × ${ny}: ${g.holes.length} statt ${n} ${g.errors.map((e) => e.text).join(' ')}`);
  }
  // breiteres Dichtband braucht mehr Rand
  if (!(flangeMinRim(3, true, 10) > flangeMinRim(3, true, 6))) wrong.push('Rand wächst nicht mit dem Dichtband');
  // Vorschau ohne Schnitte: gleiche Prüfung, aber Körper ohne Löcher (schneller)
  {
    const t = TEMPLATES.find((x) => x.id === 'flange')!.make();
    const full = partsFree(p, { text: false, knurl: false, supports: true, free: t }).find((q) => q.name === 'Geräteanschluss · Flansch')!;
    const quick = partsFree(p, { text: false, knurl: false, supports: true, free: { ...t, b: { ...t.b, device: { ...t.b.device, preview: true } } } }).find((q) => q.name === 'Geräteanschluss · Flansch')!;
    const vf = measureVolume(full.make()), vq = measureVolume(quick.make());
    if (!(vq > vf) || full.key === quick.key) wrong.push('Vorschau-Flansch nicht ohne Löcher bzw. gleicher Schlüssel');
  }
  // Vorbelegung „nach Maß“ passt bei allen Formen und Größen ohne Fehler
  for (const shape of shapes)
    for (const d of [20, 32, 50, 90])
      for (const seal of [false, true])
        for (const lay of ['rect', 'round'] as const) {
          const sealW = [6, 9, 10][d % 3];
          const dv = { ...base, section: sec(shape, { d, w: d * 1.6, h: d, r: 5, r2: 3, w2: d }), seal, sealW, flangeRim: flangeMinRim(3, seal, sealW) };
          const e = flangeGeom({ ...dv, ...flangeDefaults(dv, 3), flangeLayout: lay }, 3).errors;
          if (e.length) wrong.push(`Vorbelegung ${shape} ${d} ${seal ? 'mit Dichtung ' : ''}${lay}: ${e[0].text}`);
        }
  const okRim = flangeGeom({ ...base, seal: true, flangeRim: flangeMinRim(3, true) }, 3).errors;
  if (okRim.length) wrong.push('kleinster Rand mit Dichtung: ' + okRim.map((e) => e.text).join(' '));
  const bedA = planFree({ ...TEMPLATES[3].make(), bed: 'A', b: { ...TEMPLATES[3].make().b, device: base } }).issues.some((x) => x.level === 'error' && x.text.includes('Ende B'));
  if (!bedA) wrong.push('Flansch mit A unten nicht abgefangen');
  if (wrong.length) fail++;
  console.log(`${wrong.length ? 'FEHLER' : 'ok    '} flansch-pruefungen         ${wrong.length ? wrong.join(', ') : `${expect.length + 7} Prüfungen`}`);
}

// Vorschläge („… auf … setzen“): jede Meldung mit Vorschlag verschwindet, wenn man ihn übernimmt
if (!only || only === 'vorschlaege') {
  const wrong: string[] = [];
  let n = 0;
  const flange = (v: Partial<FreeSpec['b']['device']>) => {
    const s = TEMPLATES.find((t) => t.id === 'flange')!.make();
    s.b.device = { ...s.b.device, ...v };
    return s;
  };
  const broken: [string, FreeSpec][] = [];
  {
    const s = TEMPLATES[0].make();
    s.blocks[0].radius = 10;
    broken.push(['Bogen-Radius zu klein', s]);
    const e = TEMPLATES[0].make();
    e.blocks[0].radius = 25;
    broken.push(['enger Bogen', e]);
    const t = TEMPLATES[2].make();
    t.blocks[1].length = 8;
    broken.push(['Übergang steil/Versatz', t]);
    const k = TEMPLATES[2].make();
    k.blocks[1].tilt = 120;
    broken.push(['Knick zu groß', k]);
    const d = TEMPLATES[3].make();
    d.b.device = { ...d.b.device, section: sec('dshape', { d: 40, h: 18, r: 3 }), length: 8, holes: true, ribs: true, notch: true, notchW: 200, notchH: 1 };
    broken.push(['D-Form, Tiefe, Extras', d]);
    const g = TEMPLATES[3].make();
    g.b.device = { ...g.b.device, section: sec('circle', { d: 70 }), dDepth: 70 };
    g.b.transition = 4;
    broken.push(['Schräge zum Gerät', g]);
    const w = TEMPLATES[3].make();
    w.wall = 9;
    broken.push(['Wand zu dick', w]);
  }
  broken.push(['Flansch Rand', flange({ flangeRim: 8 })]);
  broken.push(['Flansch Dicke', flange({ flangeT: 2 })]);
  broken.push(['Lochkreis zu klein', flange({ flangeLayout: 'round', plateD: 110, holeCircle: 64, holeN: 4 })]);
  broken.push(['Löcher am Plattenrand rund', flange({ flangeLayout: 'round', plateD: 100, holeCircle: 98, holeN: 4 })]);
  broken.push(['Löcher zu dicht rund', flange({ section: sec('circle', { d: 20 }), flangeLayout: 'round', plateD: 80, holeCircle: 46, holeN: 16 })]);
  broken.push(['Platte zu klein rechteckig', flange({ flangeLayout: 'rect', plateW: 60, plateH: 60, holeX: 40, holeY: 40 })]);
  broken.push(['Lochabstand zu klein', flange({ flangeLayout: 'rect', plateW: 140, plateH: 140, holeX: 40, holeY: 40 })]);
  broken.push(['Löcher am Plattenrand rechteckig', flange({ flangeLayout: 'rect', plateW: 110, plateH: 110, holeX: 106, holeY: 106 })]);
  broken.push(['Löcher zu dicht rechteckig', flange({ section: sec('circle', { d: 20 }), flangeLayout: 'rect', plateW: 80, plateH: 80, holeX: 40, holeY: 40, holeNX: 6, holeNY: 6 })]);
  for (const [name, s] of broken) {
    const issues = planFree(s).issues.filter((x) => x.fixes?.length);
    if (!issues.length) wrong.push(`${name}: keine Meldung mit Vorschlag`);
    for (const x of issues)
      for (const fx of x.fixes!) {
        n++;
        const c = structuredClone(s);
        fx.set(c);
        if (planFree(c).issues.some((y) => y.text === x.text)) wrong.push(`${name}: „${fx.label}“ behebt „${x.text}“ nicht`);
      }
  }
  if (wrong.length) fail++;
  console.log(`${wrong.length ? 'FEHLER' : 'ok    '} vorschlaege                ${wrong.length ? wrong.join(' | ') : `${n} Vorschläge in ${broken.length} Fällen`}`);
}

// Stutzen-Typen mit Klemmrippen und Schlitzen (aufgesteckt/eingesteckt, gerade/konisch, mit/ohne Löcher und Text)
for (const [id, kind, pipe, text] of [
  ['stutzen-F-auf-konisch', 'MACHINE_F', { d1Inner: 32.2, d2Inner: 33.2, mode: 'over', screwHoles: true, slots: true, ribs: true }, true],
  ['stutzen-F-auf-gerade', 'MACHINE_F', { d1Inner: 40.2, d2Inner: 40.2, mode: 'over', screwHoles: false, slots: true, ribs: true }, false],
  ['stutzen-M-ein-konisch', 'MACHINE_M', { d1Inner: 26.8, d2Inner: 25.8, mode: 'into', screwHoles: true, ribs: true }, true],
  ['stutzen-M-auf-50', 'MACHINE_M', { d1Inner: 50.2, d2Inner: 51.2, mode: 'over', screwHoles: true, slots: true, ribs: false }, true],
] as const) {
  if (only && id !== only) continue;
  const t0 = Date.now();
  try {
    const k = kindById(kind);
    const opts = { text, knurl: false, supports: true, pipe: { ...DEFAULT_PIPE, allowance: 0.2, ...pipe } as PipeSpec };
    const parts = k.parts!(p, opts);
    let vol = 0;
    const bad: string[] = [];
    for (const q of parts) {
      const sh = q.make();
      const v = measureVolume(sh);
      vol += v;
      if (!valid(sh) || !(v > 0)) bad.push(q.name);
      sh.delete?.();
    }
    if (pipe.ribs && !parts.some((q) => q.name === 'Klemmrippen')) bad.push('Klemmrippen fehlen');
    if (bad.length) fail++;
    console.log(`${bad.length ? 'FEHLER' : 'ok    '} ${id.padEnd(26)} ${String(parts.length).padStart(2)} Körper  ${(vol / 1000).toFixed(1).padStart(6)} cm³  ${String(Date.now() - t0).padStart(6)} ms${bad.length ? '  ungültig: ' + bad.join(', ') : ''}`);
  } catch (e) {
    fail++;
    console.log(`FEHLER ${id.padEnd(26)} ${(e as Error).message}`);
  }
}

// Weg des Hinweises: fehlerhafte Klemmrippen fallen weg, ab einem Viertel gibt es einen Hinweis (kein Fehler)
if (!only || only === 'rippen-hinweis') {
  const s = TEMPLATES[3].make();
  s.b.device.ribs = true;
  const ribs = partsFree(p, { text: false, knurl: false, supports: true, free: s }).find((q) => q.name === 'Geräteanschluss · Klemmrippen');
  const count = (sh: Shape3D) => {
    const ex = new oc.TopExp_Explorer(sh.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let n = 0;
    for (; ex.More(); ex.Next()) n++;
    ex.delete();
    return n;
  };
  try {
    if (!ribs) throw new Error('Körper „Klemmrippen“ fehlt');
    partNotes.length = 0;
    const all = count(ribs.make());
    if (partNotes.length) throw new Error('Hinweis ohne Fehler: ' + partNotes.join(' '));
    testHooks.ribFail = (i) => i % 2 === 0;
    partNotes.length = 0;
    const half = count(ribs.make());
    if (!(half > 0 && half < all)) throw new Error(`erwartet weniger Rippen als ${all}, gebaut ${half}`);
    if (!partNotes.some((t) => t.includes('Klemmrippen') && t.includes('weggelassen'))) throw new Error('kein Hinweis zu weggelassenen Rippen');
    testHooks.ribFail = () => true;
    let threw = false;
    try {
      ribs.make();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('alle Rippen fehlerhaft: kein Fehler gemeldet');
    console.log(`ok     rippen-hinweis             ${all} → ${half} Rippen, Hinweis kommt an`);
  } catch (e) {
    fail++;
    console.log(`FEHLER rippen-hinweis             ${(e as Error).message}`);
  } finally {
    testHooks.ribFail = null;
  }
}
console.log(fail ? `${fail} Fälle fehlerhaft` : 'Alle Fälle in Ordnung');
process.exit(fail ? 1 : 0);
