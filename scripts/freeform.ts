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
import { TEMPLATES, newBlock, sec, planFree, partPlacements, inPart2, testHooks, flangeGeom, flangeMinRim, flangeDefaults, branchGeom, DEFAULT_DEVICE, type FreeSpec, type SectionShape, type Block, type EndSpec, type Placement, type V3 } from '../src/lib/osvac/freeform';
import { partNotes } from '../src/lib/errors';
import { weld, meshTolerance } from '../src/lib/worker/threemf';
import { belowBedEnd, overhangArea, COUNTED_GATE } from '../src/lib/overhang';
import { kindById } from '../src/lib/osvac/catalog';
import { gateLayout, gateLower, gateUpper, gateSlider, gateClip, sliderInGate, DEFAULT_GATE, type GateSpec } from '../src/lib/osvac/gate';
import { DEFAULT_PIPE, type PipeSpec } from '../src/lib/osvac/machine';
import { DEFAULT_NOZZLE, NOZZLE_KINDS, nozzleToFree, nozzleIssues, nozzleLayout, type NozzleSpec } from '../src/lib/osvac/nozzle';
import { DEFAULT_TIP, bleedMinLen } from '../src/lib/osvac/freeform';

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
/** Kanten im Netz, die nicht genau zwei Dreiecke haben (Slicer melden sie als „non-manifold“); Netz genau wie beim 3MF-Export */
const badEdges = (sh: Shape3D, name = '') => {
  const m = sh.mesh({ tolerance: meshTolerance(name), angularTolerance: 0.1 });
  const w = weld({ name: '', vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles) });
  const t = w.triangles as ArrayLike<number>;
  const cnt = new Map<string, number>();
  for (let i = 0; i < t.length; i += 3)
    for (let e = 0; e < 3; e++) {
      const a = t[i + e], b = t[i + ((e + 1) % 3)];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
  return [...cnt.values()].filter((c) => c !== 2).length;
};
const writeStl = process.argv.includes('--stl');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
/**
 * --teil=1/2 bzw. --teil=2/2: nur die Hälfte der Fälle (für zwei parallele Läufe auf GitHub). Die Fälle der Kette
 * werden abwechselnd verteilt, die Prüfungen ohne Berechnung laufen im ersten, Stutzen und Schieber einzeln im zweiten Teil.
 */
const teil = /^--teil=(\d)\/(\d)$/.exec(process.argv.find((a) => a.startsWith('--teil=')) ?? '');
const [teilK, teilN] = teil ? [Number(teil[1]), Number(teil[2])] : [1, 1];
const mine = (i: number) => i % teilN === teilK - 1;
const sectionIn = (k: number) => teilN === 1 || teilK === k;

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
    newBlock('transition', { length: 55, offset: 10, tilt: -20, dir: 45, section: sec('circle', { d: 30 }) }),
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
  const t = TEMPLATES[3].make();
  t.b.transition = 18;
  t.b.device = { ...t.b.device, mode: 'flange', section: sec('circle', { d: 50 }), flangeLayout: 'tri', triCircle: 110, rot: 15, seal: true, sealW: 6 };
  cases.push(['flansch-dreieck', t]);
  const tr = TEMPLATES[3].make();
  tr.b.transition = 18;
  tr.b.device = { ...tr.b.device, mode: 'flange', section: sec('rect', { w: 50, h: 30, r: 5, r2: 5 }), flangeLayout: 'tri', triCircle: 100, holeD: 5.5 };
  cases.push(['flansch-dreieck-rechteck', tr]);
}

// Abzweig (Y/T): Winkel 30–90°, Richtungen, kleinerer Abzweig, Ende C als Kupplung, Stecker, Gerät in allen Befestigungen,
// Bausteine vor und nach dem Abzweig, A oder B auf dem Bett
{
  const mk = (id: string, v: Partial<Block>, c: Partial<EndSpec>, opts: { bed?: 'A' | 'B'; before?: Block[]; after?: Block[]; b?: Partial<EndSpec> } = {}) => {
    const s = TEMPLATES.find((t) => t.id === 'y')!.make();
    const d = v.branchD ?? 32;
    const g = branchGeom(32, d, s.wall, v.angle ?? 45);
    s.blocks = [...(opts.before ?? []), newBlock('branch', { length: Math.ceil(g.minLen), branchD: d, ...v }), ...(opts.after ?? [])];
    s.c = { ...s.c!, ...c, device: { ...s.c!.device, ...(c.device ?? {}) } };
    if (opts.b) s.b = { ...s.b, ...opts.b };
    if (opts.bed) s.bed = opts.bed;
    cases.push([`abzweig-${id}`, s]);
  };
  mk('y45', { angle: 45 }, {});
  mk('t90-stecker', { angle: 90, dir: 90 }, { type: 'male', d: 32 });
  mk('30-klein', { angle: 30, branchD: 20, branchLen: 25 }, { type: 'female', d: 25, transition: 12 });
  mk('60-geraet-auf', { angle: 60, dir: 180, branchD: 25 }, { type: 'device', device: { ...DEFAULT_DEVICE, mode: 'over', section: sec('circle', { d: 30 }), dDepth: 30 } });
  mk('geraet-ein-rechteck', { angle: 45, branchD: 28 }, { type: 'device', transition: 20, device: { ...DEFAULT_DEVICE, mode: 'into', section: sec('rect', { w: 40, h: 26, r: 4, r2: 4 }), allowance: 0.4 } });
  mk('flansch-c', { angle: 90 }, { type: 'device', transition: 20, device: { ...DEFAULT_DEVICE, mode: 'flange', section: sec('circle', { d: 40 }) } });
  mk('kette', { angle: 45, dir: 270 }, {}, { before: [newBlock('straight', { length: 15 })], after: [newBlock('bend', { angle: 30, radius: 50 }), newBlock('straight', { length: 10 })] });
  mk('b-unten', { angle: 90 }, {}, { bed: 'B', b: { type: 'device', device: { ...DEFAULT_DEVICE } } });
  // gebogener Abzweig (erst 45°, dann im Bogen weiter)
  for (const [id, v, c] of [
    ['gebogen-90', { angle: 90, sweep: true }, {}],
    ['gebogen-60-geraet', { angle: 60, sweep: true, branchD: 25, dir: 90 }, { type: 'device', device: { ...DEFAULT_DEVICE, section: sec('circle', { d: 30 }), dDepth: 30 } }],
    ['gebogen-75-stecker', { angle: 75, sweep: true, branchD: 32, branchLen: 5 }, { type: 'male', d: 32 }],
  ] as [string, Partial<Block>, Partial<EndSpec>][]) {
    const s = TEMPLATES.find((t) => t.id === 'y')!.make();
    s.blocks = [newBlock('branch', { length: Math.ceil(branchGeom(32, v.branchD ?? 32, s.wall, 45).minLen), ...v })];
    s.c = { ...s.c!, ...c, device: { ...s.c!.device, ...(c.device ?? {}) } };
    cases.push([`abzweig-${id}`, s]);
  }
}

// Schieber in der Kette (Adapter in zwei Teilen): Kupplung an B, nach einem Bogen (schräg), mit Übergang davor vor
// einem Gerät, gedreht, mit Flansch, mit Abzweig davor
{
  const g = TEMPLATES.find((t) => t.id === 'gate')!;
  const a = g.make();
  a.b = { ...a.b, type: 'female' };
  cases.push(['schieber-kupplung-B', a]);
  const l = TEMPLATES[3].make();
  l.blocks = [newBlock('bend', { angle: 90, radius: 40 }), newBlock('gate', { length: 46, dir: 90 }), newBlock('straight', { length: 10 })];
  cases.push(['schieber-liegend', l]);
  const t = TEMPLATES[3].make();
  t.a.d = 25;
  t.blocks = [newBlock('transition', { length: 30, section: sec('circle', { d: 50 }) }), newBlock('gate', { length: 54, dir: 45 })];
  t.b.device = { ...t.b.device, section: sec('circle', { d: 50 }), dDepth: 51 };
  cases.push(['schieber-50-geraet', t]);
  const fl = g.make();
  fl.blocks = [newBlock('gate', { length: 46 }), newBlock('straight', { length: 10 })];
  fl.b = { ...fl.b, type: 'device', device: { ...DEFAULT_DEVICE, mode: 'flange', section: sec('circle', { d: 40 }) } };
  cases.push(['schieber-flansch', fl]);
  const y = TEMPLATES.find((x) => x.id === 'y')!.make();
  y.blocks = [...y.blocks, newBlock('straight', { length: 10 }), newBlock('gate', { length: 46 })];
  y.b = { ...y.b, type: 'male' };
  cases.push(['schieber-nach-abzweig', y]);
}

// Saugdüse: alle Düsenarten aus dem Formular (abwechselnd mit allen Extras, Kupplung, Biegung), dazu Düsenspitze in der Freiform
{
  const nz = (v: Partial<NozzleSpec>): FreeSpec => {
    const n = { ...structuredClone(DEFAULT_NOZZLE), ...v };
    n.length = Math.max(n.length, nozzleLayout(n).minLength);
    return nozzleToFree(n);
  };
  for (const k of NOZZLE_KINDS) {
    cases.push([`duese-${k.id}`, nz({ kind: k.id, ...k.values })]);
    cases.push([`duese-${k.id}-extras`, nz({ kind: k.id, ...k.values, ring: true, brush: true, tip: 30 })]);
  }
  cases.push(['duese-kupplung-gebogen', nz({ kind: 'bent', ...NOZZLE_KINDS[2].values, a: { type: 'female', d: 40 }, bend: 45, tip: 60, ring: true, wall: 1.6 })]);
  cases.push(['duese-rund-gebogen', nz({ kind: 'round', d: 32, length: 180, bend: 30, tip: 30, brush: true })]);
  const f = TEMPLATES[2].make();
  f.blocks.push(newBlock('straight', { length: 60 }));
  f.b = { ...f.b, type: 'nozzle', tip: { ...DEFAULT_TIP, angle: 40, dir: 270, ring: true } };
  f.bed = 'A';
  cases.push(['duese-freiform-versatz', f]);
}

// Nebenluft-Regler: als Verbindung (Stecker unten, Kupplung oben, gleich und verschieden groß), in der Freiform
{
  const bl = (m: number, f: number, gap = 0.3, extra: Block[] = []): FreeSpec => ({
    a: { type: 'male', d: m },
    wall: 3,
    blocks: [newBlock('bleed', { length: bleedMinLen(m, 3, gap) }), ...extra],
    b: { type: 'female', d: f, device: { ...DEFAULT_DEVICE }, transition: 10 },
    bed: 'A',
    bleedGap: gap,
  });
  cases.push(['nebenluft-32', bl(32, 32)]);
  cases.push(['nebenluft-25-40', bl(25, 40)]);
  cases.push(['nebenluft-50-spiel-0,5', bl(50, 50, 0.5)]);
  cases.push(['nebenluft-15', bl(15, 15, 0.2)]);
  cases.push(['nebenluft-freiform-bogen', bl(32, 32, 0.3, [newBlock('bend', { angle: 45, radius: 40 })])]);
}

let fail = 0;
const meshNotes: string[] = [];
const p = deriveParams({});
for (const [ci, [id, spec]] of cases.entries()) {
  if (only && id !== only) continue;
  if (!only && !mine(ci)) continue;
  const t0 = Date.now();
  try {
    const plan = planFree(spec);
    const errs = plan.issues.filter((x) => x.level === 'error');
    if (errs.length) throw new Error(errs.map((x) => x.text).join(' / '));
    // Rahmen rechtshändig (u × v = t): sonst wäre die Skizze der Aussparung gegenüber dem Modell gespiegelt
    for (const f of [plan.chainEnd.frame, plan.end, ...(plan.cChainEnd ? [plan.cChainEnd.frame, plan.cEnd!] : [])]) {
      const [u, v, t] = [f.u, f.v, f.t];
      const det = (u[1] * v[2] - u[2] * v[1]) * t[0] + (u[2] * v[0] - u[0] * v[2]) * t[1] + (u[0] * v[1] - u[1] * v[0]) * t[2];
      if (Math.abs(det - 1) > 1e-6) throw new Error(`Rahmen gespiegelt (det ${det.toFixed(3)})`);
    }
    const parts = partsFree(p, { text: false, knurl: false, supports: true, free: spec });
    partNotes.length = 0;
    let vol = 0;
    const bad: string[] = [];
    const built: Shape3D[] = [];
    const low: { name: string; helper: boolean; positions: number[]; normals: number[]; indices: number[] }[] = [];
    for (const q of parts) {
      const sh = q.make();
      const v = measureVolume(sh);
      vol += v;
      if (!valid(sh) || !(v > 0)) bad.push(q.name);
      // eigene Formstücke: Netz geschlossen (die Teile von osVAC neo sind nachgebaut und geprüft, das spart Zeit).
      // Lofts (Übergang, Absatz, Fase) zerlegt OpenCascade bei starker Krümmung gelegentlich in winzige Splitter, die eine
      // Kante mit vier Dreiecken ergeben; Slicer reparieren das selbst. Dort nur Hinweis, sonst Fehler.
      if (/^(Formstück|Übergang zu|Übergang zum|Geräteanschluss|Anschlagring|Schieberplatte|Düsenrand)/.test(q.name)) {
        const n = badEdges(sh, q.name);
        if (n && /Übergang|Absatz|Fase|konisch/.test(q.name)) meshNotes.push(`${id}: ${q.name} ${n}`);
        else if (n) bad.push(`${q.name}: ${n} Kanten im Netz nicht geschlossen`);
      }
      built.push(sh);
      low.push({ name: q.name, helper: !!q.helper, positions: [0, 0, sh.boundingBox.bounds[0][2]], normals: [], indices: [] });
    }
    // Schieberplatten: liegen flach auf dem Bett (wie das Ende unten) und berühren den Adapter nicht
    {
      const fixed = parts.map((q, i) => ({ q, b: built[i].boundingBox.bounds })).filter((x) => !x.q.helper);
      const zBed = Math.min(...fixed.filter((x) => !x.q.object).map((x) => x.b[0][2]));
      for (const x of fixed.filter((y) => y.q.name.startsWith('Schieberplatte'))) {
        if (Math.abs(x.b[0][2] - zBed) > 0.01) bad.push(`${x.q.name} liegt nicht auf dem Bett`);
        for (const y of fixed)
          if (y !== x && x.b[0][0] < y.b[1][0] && y.b[0][0] < x.b[1][0] && x.b[0][1] < y.b[1][1] && y.b[0][1] < x.b[1][1]) bad.push(`${x.q.name} überlappt ${y.q.name}`);
      }
      if (spec.blocks.filter((b) => b.type === 'gate').length !== fixed.filter((x) => x.q.name.startsWith('Schieberplatte')).length) bad.push('Schieberplatte fehlt');
    }
    // Abzweig: Einmündung innen ausgerundet (sonst steht ein Hinweis in partNotes)
    if (id.startsWith('abzweig') && partNotes.some((t) => t.includes('ausrunden'))) bad.push('Einmündung nicht ausgerundet');
    // das Ende auf dem Druckbett ist der tiefste Punkt (außer bei Fällen, die genau das prüfen)
    const isB = inPart2(plan);
    const below = belowBedEnd(low, spec.bed, plan.split ? isB : undefined);
    // geteilt (Schieber): beide Teile stehen auf dem Bett, nebeneinander; Boden und Trennfläche im 0,2-mm-Raster
    if (plan.split) {
      const box = (sel: (n: string) => boolean) => {
        const bs = parts.map((q, i) => ({ q, b: built[i].boundingBox.bounds })).filter((x) => !x.q.helper && !x.q.name.startsWith('Schieberplatte') && sel(x.q.name));
        return { x0: Math.min(...bs.map((x) => x.b[0][0])), x1: Math.max(...bs.map((x) => x.b[1][0])), y0: Math.min(...bs.map((x) => x.b[0][1])), y1: Math.max(...bs.map((x) => x.b[1][1])), z0: Math.min(...bs.map((x) => x.b[0][2])) };
      };
      const A = box((n) => !isB(n)), B = box(isB);
      if (Math.abs(A.z0) > 0.01 || Math.abs(B.z0) > 0.01) bad.push(`Teile nicht auf dem Bett (A ${A.z0.toFixed(2)}, B ${B.z0.toFixed(2)})`);
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) bad.push('A-Teil und B-Teil überlappen');
      const { p1, p2 } = partPlacements(spec, plan);
      const zOf = (pl: Placement, v: V3) => pl.R[2][0] * v[0] + pl.R[2][1] * v[1] + pl.R[2][2] * v[2] + pl.tr[2];
      const tilted = plan.issues.some((x) => x.text.includes('nicht waagerecht'));
      for (const [n, v] of [['Boden', zOf(p1, plan.split.floor)], ['Trennfläche', zOf(p2!, plan.split.lid)]] as const)
        if (!tilted && Math.abs(v / 0.2 - Math.round(v / 0.2)) > 1e-6) bad.push(`${n} ${v.toFixed(3)} nicht im 0,2-mm-Raster`);
      if (!tilted && !parts.some((q) => q.object === 'Teil B')) bad.push('B-Teil kein eigenes Objekt');
    }
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
if ((!only && sectionIn(1)) || only === 'flansch-pruefungen') {
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
        for (const lay of ['rect', 'round', 'tri'] as const) {
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
if ((!only && sectionIn(1)) || only === 'vorschlaege') {
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
  {
    const y = (v: Partial<Block>, c?: Partial<EndSpec>) => {
      const s = TEMPLATES.find((t) => t.id === 'y')!.make();
      Object.assign(s.blocks[0], v);
      if (c) s.c = { ...s.c!, ...c, device: { ...s.c!.device, ...(c.device ?? {}) } };
      return s;
    };
    broken.push(['Abzweig Winkel', y({ angle: 120 })]);
    broken.push(['Abzweig steil (Strömung)', y({ angle: 90 })]);
    broken.push(['Abzweig zu weit', y({ branchD: 40 })]);
    broken.push(['Abzweig Rohr zu kurz', y({ length: 30 })]);
    broken.push(['Abzweig zu kurz', y({ branchLen: 1 })]);
    const fo = TEMPLATES[0].make();
    fo.blocks = [newBlock('transition', { length: 35, section: sec('slot', { w: 60, h: 25 }), twist: 30 }), newBlock('transition', { length: 30, offset: 10, tilt: -20, dir: 45, section: sec('circle', { d: 30 }) })];
    broken.push(['Übergang zu stark gebogen', fo]);
    const g = TEMPLATES.find((t) => t.id === 'gate')!.make();
    g.blocks[0].length = 15;
    broken.push(['Schieber zu kurz', g]);
    broken.push(['Ende C Tiefe', y({}, { type: 'device', device: { ...DEFAULT_DEVICE, length: 3 } })]);
    broken.push(['Ende C Flansch Rand', y({}, { type: 'device', device: { ...DEFAULT_DEVICE, mode: 'flange', section: sec('circle', { d: 40 }), flangeRim: 8 } })]);
  }
  broken.push(['Flansch Rand', flange({ flangeRim: 8 })]);
  broken.push(['Flansch Dicke', flange({ flangeT: 2 })]);
  broken.push(['Lochkreis zu klein', flange({ flangeLayout: 'round', plateD: 110, holeCircle: 64, holeN: 4 })]);
  broken.push(['Löcher am Plattenrand rund', flange({ flangeLayout: 'round', plateD: 100, holeCircle: 98, holeN: 4 })]);
  broken.push(['Löcher zu dicht rund', flange({ section: sec('circle', { d: 20 }), flangeLayout: 'round', plateD: 80, holeCircle: 46, holeN: 16 })]);
  broken.push(['Platte zu klein rechteckig', flange({ flangeLayout: 'rect', plateW: 60, plateH: 60, holeX: 40, holeY: 40 })]);
  broken.push(['Lochabstand zu klein', flange({ flangeLayout: 'rect', plateW: 140, plateH: 140, holeX: 40, holeY: 40 })]);
  broken.push(['Löcher am Plattenrand rechteckig', flange({ flangeLayout: 'rect', plateW: 110, plateH: 110, holeX: 106, holeY: 106 })]);
  broken.push(['Dreieck zu klein', flange({ flangeLayout: 'tri', triCircle: 60 })]);
  broken.push(['Löcher zu dicht rechteckig', flange({ section: sec('circle', { d: 20 }), flangeLayout: 'rect', plateW: 80, plateH: 80, holeX: 40, holeY: 40, holeNX: 6, holeNY: 6 })]);
    const nl = TEMPLATES[3].make();
    nl.blocks.push(newBlock('bleed', { length: 10 }));
    broken.push(['Nebenluft zu kurz', nl]);
    const nb = TEMPLATES[3].make();
    nb.b = { ...nb.b, type: 'nozzle', tip: { ...DEFAULT_TIP, brush: true } };
    broken.push(['Düse: B unten, Gerade zu kurz', nb]);
    const nt = TEMPLATES[0].make();
    nt.b = { ...nt.b, type: 'nozzle', tip: { ...DEFAULT_TIP, angle: 75, ring: true } };
    nt.bed = 'A';
    broken.push(['Düse: zu schräg, nach Bogen', nt]);
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
  {
    const s = TEMPLATES.find((t) => t.id === 'y')!.make();
    s.blocks = [newBlock('transition', { section: sec('rect', { w: 40, h: 30 }) }), s.blocks[0]];
    if (!planFree(s).issues.some((x) => x.level === 'error' && x.text.includes('rund sein'))) wrong.push('eckiges Rohr vor dem Abzweig nicht abgefangen');
    const t = TEMPLATES.find((x) => x.id === 'y')!.make();
    t.blocks = [t.blocks[0], newBlock('branch', { length: 70 })];
    if (!planFree(t).issues.some((x) => x.level === 'error' && x.text.includes('nur ein Abzweig'))) wrong.push('zweiter Abzweig nicht abgefangen');
    const q = TEMPLATES.find((x) => x.id === 'gate')!.make();
    q.blocks = [newBlock('transition', { section: sec('rect', { w: 40, h: 30 }) }), q.blocks[0]];
    if (!planFree(q).issues.some((x) => x.level === 'error' && x.text.includes('Schieber muss das Rohr rund'))) wrong.push('eckiges Rohr vor dem Schieber nicht abgefangen');
    const two = TEMPLATES.find((x) => x.id === 'gate')!.make();
    two.blocks = [newBlock('gate', { length: 46 }), newBlock('straight', { length: 10 }), newBlock('gate', { length: 46, dir: 90 })];
    if (!planFree(two).issues.some((x) => x.level === 'error' && x.text.includes('nur ein Schieber'))) wrong.push('zweiter Schieber nicht abgefangen');
    const tilt = TEMPLATES[3].make();
    tilt.blocks = [newBlock('bend', { angle: 90, radius: 40 }), newBlock('gate', { length: 46 })];
    if (!planFree(tilt).issues.some((x) => x.text.includes('nicht waagerecht'))) wrong.push('schräger Schieber ohne Hinweis');
    const c = TEMPLATES.find((x) => x.id === 'y')!.make();
    c.c = { ...c.c!, type: 'device', device: { ...DEFAULT_DEVICE, length: 3 } };
    if (!planFree(c).issues.some((x) => x.text.startsWith('Ende C:'))) wrong.push('Meldung von Ende C nicht als „Ende C“ benannt');
  }
  {
    // Düse: mit Schieber oder Abzweig nicht möglich; Formular: Vorschläge beheben ihre Meldung
    const g = TEMPLATES.find((x) => x.id === 'gate')!.make();
    g.b = { ...g.b, type: 'nozzle', tip: { ...DEFAULT_TIP } };
    if (!planFree(g).issues.some((x) => x.level === 'error' && x.text.includes('Schieber'))) wrong.push('Düse mit Schieber nicht abgefangen');
    const short = { ...structuredClone(DEFAULT_NOZZLE), length: 40, brush: true, ring: true, h: 40, w: 20 };
    const iss = nozzleIssues(short);
    if (!iss.some((x) => x.level === 'error')) wrong.push('Düse zu kurz nicht abgefangen');
    for (const x of iss)
      for (const fx of x.fixes ?? []) {
        n++;
        const c = structuredClone(short);
        fx.set(c);
        if (nozzleIssues(c).some((y) => y.text === x.text)) wrong.push(`Düse: „${fx.label}“ behebt „${x.text}“ nicht`);
      }
    for (const k of NOZZLE_KINDS) {
      const c = { ...structuredClone(DEFAULT_NOZZLE), kind: k.id, ...k.values };
      const errs = [...nozzleIssues(c), ...planFree(nozzleToFree(c)).issues].filter((x) => x.level === 'error');
      if (errs.length) wrong.push(`Düsenart ${k.title}: ${errs.map((x) => x.text).join(' / ')}`);
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
  if (only ? id !== only : !sectionIn(2)) continue;
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

// Schieber einzeln: alle Befestigungen und Größen. Platte passt in beiden Stellungen (zu, auf) ohne Berührung in den
// Schlitz, rastet dazwischen (Noppe drückt aufs Gehäuse); Teile liegen auf dem Bett und überlappen sich nicht.
{
  const variants: [string, Partial<GateSpec>][] = [
    ['schieber-50-wandplatte', {}],
    ['schieber-15-wandplatte', { d: 15 }],
    ['schieber-32-schluessel', { d: 32, mount: 'keyhole', wallDist: 45 }],
    ['schieber-32-schluessel-quer', { d: 32, mount: 'keyhole', orient: 'turned', wallDist: 30 }],
    ['schieber-50-wand-max', { mount: 'plate', orient: 'turned', wallDist: 200 }],
    ['schieber-25-wandhalter', { d: 25, mount: 'clip', wallDist: 30 }],
    ['schieber-60-ohne', { d: 60, mount: 'none', depth: 10 }],
    ['schieber-40-spiel', { d: 40, pipeGap: 0.8, plateGap: 0.5, wallDist: 80 }],
    ['schieber-32-tief', { d: 32, depth: 37.5, plateGap: 0.2 }],
  ];
  for (const [id, v] of variants) {
    if (only ? id !== only : !sectionIn(2)) continue;
    const t0 = Date.now();
    const s = { ...DEFAULT_GATE, ...v };
    const bad: string[] = [];
    try {
      const lay = gateLayout(s);
      const lo = gateLower(s), up = gateUpper(s), pl = gateSlider(lay.g);
      for (const x of [lo, up, pl]) if (!valid(x) || !(measureVolume(x) > 0)) bad.push('ungültig');
      for (const [n, x, nm] of [['Unterteil', lo, 'Schieber-Unterteil'], ['Oberteil', up, 'Schieber-Oberteil'], ['Platte', pl, 'Schieberplatte']] as const) if (badEdges(x, nm)) bad.push(`${n}: ${badEdges(x, nm)} Kanten im Netz nicht geschlossen`);
      // Schrauben: Muttern und Köpfe einer Seite dürfen sich nicht berühren (sonst nur eine je Seite)
      if (lay.screwN === 4 && 2 * lay.g.sx < (2 * 5.8) / Math.sqrt(3) + 0.8 - 1e-9) bad.push(`Muttern zu nah (Abstand ${(2 * lay.g.sx).toFixed(1)})`);
      if (lay.screwLen < lay.g.ch + 2 * 2.4 + 2.4) bad.push(`Schrauben zu kurz (${lay.screwLen})`);
      // Gehäuseteile berühren sich nur an der Trennfläche (kein Volumen gemeinsam)
      const both = measureVolume(lo.clone().intersect(up.clone()) as Shape3D);
      if (both > 0.01) bad.push(`Unter- und Oberteil überlappen ${both.toFixed(2)}`);
      const at = (dx: number) => sliderInGate(lay, false).map((c, i) => (i ? c : c + dx)) as [number, number, number];
      const touch = (dx: number, sh: Shape3D) => measureVolume(sh.clone().intersect(pl.clone().translate(at(dx))) as Shape3D);
      // Dichtlippen drücken (Standardspiel) auf die Platte, zu und auf; sonst nichts
      const lipOnly = (dx: number) => {
        const v = touch(dx, lo) + touch(dx, up);
        const press = 0.4 - (lay.g.ch - lay.g.T) / 2;
        const ring = 2 * Math.PI * (lay.Rm + 1.6) * 1.2 * Math.max(0, press - 0.01) * 2;
        return v <= ring * 1.3 + 0.01;
      };
      if (!lipOnly(0)) bad.push(`berührt zu ${(touch(0, lo) + touch(0, up)).toFixed(2)}`);
      if (!lipOnly(lay.g.P)) bad.push(`berührt auf ${(touch(lay.g.P, lo) + touch(lay.g.P, up)).toFixed(2)}`);
      if ((lay.g.ch - lay.g.T) / 2 < 0.39 && !(touch(0, lo) > 0.01 && touch(0, up) > 0.01)) bad.push('Dichtlippen liegen nicht an');
      // Dichthöhen im Schichtraster 0,2 mm (Boden, Kanal, Lippe; Oberteil wird umgedreht gedruckt)
      for (const [n, v] of [['Boden', lay.zF], ['Kanal', lay.g.ch], ['Oberteil', lay.H - lay.zT]] as const) if (Math.abs(v / 0.2 - Math.round(v / 0.2)) > 1e-6) bad.push(`${n} ${v} nicht im 0,2-mm-Raster`);
      // Anschläge: Griff bei „zu“, Nase der Zunge bei „auf“
      if (!(touch(-1.2, up) > 0.5)) bad.push('kein Anschlag bei zu');
      if (!(touch(lay.g.P + 1.2, lo) + touch(lay.g.P + 1.2, up) > 0.5)) bad.push('kein Anschlag bei auf');
      // Rohr passt in die Muffe, Anschlag hält es
      if (!(lay.Rs > s.d / 2 && lay.Rm < s.d / 2)) bad.push('Muffe/Anschlag');
      if (lay.A > lay.minA + 50 + 1e-9) bad.push(`Wandabstand ${lay.A} über dem Höchstwert`);
      if (s.mount === 'clip') {
        const c = gateClip(s);
        if (!valid(c) || !(measureVolume(c) > 0)) bad.push('Wandhalter ungültig');
        c.delete();
      }
      const parts = kindById('GATE').parts!(p, { gate: s });
      // Überhang wie in der App (Stützen nötig ab 40 mm²)
      {
        const bodies = parts.map((q) => {
          const sh = q.make();
          const m = sh.mesh({ tolerance: meshTolerance(q.name), angularTolerance: 0.1 });
          sh.delete();
          return { name: q.name, helper: !!q.helper, positions: m.vertices, normals: m.normals, indices: m.triangles };
        });
        const ov = overhangArea(bodies, COUNTED_GATE, 25);
        if (ov > 40) bad.push(`Überhang ${ov.toFixed(0)} mm² (Stützen nötig)`);
      }
      const bbs = parts.map((q) => { const sh = q.make(); const b = sh.boundingBox.bounds; sh.delete(); return { n: q.name, b }; });
      for (const x of bbs) if (Math.abs(x.b[0][2]) > 0.01) bad.push(`${x.n} nicht auf dem Bett`);
      for (const [i, x] of bbs.entries())
        for (const y of bbs.slice(i + 1)) if (x.b[0][0] < y.b[1][0] && y.b[0][0] < x.b[1][0] && x.b[0][1] < y.b[1][1] && y.b[0][1] < x.b[1][1]) bad.push(`${x.n} überlappt ${y.n}`);
      // Wand: Rückseite der Wandplatte genau im eingestellten Abstand hinter der Rohrmitte
      if (s.mount === 'plate' || s.mount === 'keyhole') {
        const y0 = bbs[0].b[0][1];
        if (Math.abs(-y0 - lay.A) > 0.01) bad.push(`Wandabstand ${(-y0).toFixed(1)} statt ${lay.A}`);
      }
      lo.delete();
      up.delete();
      pl.delete();
    } catch (e) {
      bad.push((e as Error).message);
    }
    if (bad.length) fail++;
    console.log(`${bad.length ? 'FEHLER' : 'ok    '} ${id.padEnd(26)} ${String(Date.now() - t0).padStart(6)} ms${bad.length ? '  ' + bad.join(', ') : ''}`);
  }
}

// Weg des Hinweises: fehlerhafte Klemmrippen fallen weg, ab einem Viertel gibt es einen Hinweis (kein Fehler)
if ((!only && sectionIn(2)) || only === 'rippen-hinweis') {
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
if (meshNotes.length) console.log(`Hinweis: offene Netzkanten in Lofts (Slicer repariert sie): ${meshNotes.join(', ')}`);
console.log(fail ? `${fail} Fälle fehlerhaft` : 'Alle Fälle in Ordnung');
process.exit(fail ? 1 : 0);
