/**
 * Freiform-Adapter: eine Kette aus Bausteinen entlang einer Mittellinie.
 *
 *   Anschluss A (osVAC neo) → Formstücke (Gerade, Bogen, Übergang, Absatz) → Ende B (Gerät oder osVAC neo)
 *
 * Jeder Baustein beginnt an der Endfläche des vorigen (Rahmen: Ursprung o, Laufrichtung t, Querschnittsachsen u, v).
 * Querschnitte werden immer als lichte Weite (innen) angegeben; die Wand kommt außen dazu.
 * Gerade und Bogen sind exakte Extrusionen bzw. Rotationen, Übergänge sind Lofts durch abgetastete Querschnitte.
 *
 * Dieses Modul plant die Kette rein rechnerisch (Prüfungen laufen auch in der Oberfläche, ohne OpenCascade);
 * erst make() der einzelnen Körper ruft replicad auf.
 */
import { loft, assembleWire, makeFace, cast, getOC, Edge, Vector, makeLine, makeThreePointArc, makeCircle, makeEllipse, makeBSplineApproximation, basicFaceExtrusion, revolution, makeCompound, makeCylinder, makePolygon, makeBox, measureVolume, type Shape3D, type Point } from 'replicad';
import { UserError, partLabel, partNotes } from '../errors';
import { offset as offsetContour, bbox as bboxOf, runs as contourRuns, denseAll, contourKey, selfIntersects, mirrorX, narrowLoss, CONTOUR_MIN, CONTOUR_MAX } from './contour';
import { bleedDims, bleedBody, bleedRing, BLEED } from './bleed';
import { tubeGateDims, tubeGateLower, tubeGateUpper, tubeGateScrew, gateScrewCount, gateSlider, snapPlateGap, GATE_GAP, GATE_LAYER } from './gate';

// ---------------------------------------------------------------- Datenmodell

/** 'tri' nur intern für die dreieckige Flanschplatte (d = Lochkreis durch die Eckmitten, r = Eckradius) */
export type SectionShape = 'circle' | 'ellipse' | 'slot' | 'rect' | 'dshape' | 'trapezoid' | 'tri' | 'contour';

/** Querschnitt. Je nach Form werden nur einige Felder benutzt (siehe SECTION_FIELDS). */
export interface Section {
  shape: SectionShape;
  /** Durchmesser (Kreis, D-Form) */
  d: number;
  /** Breite (Ellipse, Langloch, Rechteck; beim Trapez unten) */
  w: number;
  /** Höhe (Ellipse, Langloch, Rechteck, Trapez; bei der D-Form von der Abflachung bis zur Rundung) */
  h: number;
  /** Eckradius (Rechteck oben, Trapez, D-Form an der Abflachung) */
  r: number;
  /** Eckradius unten (Rechteck) */
  r2: number;
  /** Breite oben (Trapez) */
  w2: number;
  /** Eigene Kontur: Punkte in mm (gegen den Uhrzeigersinn, Mitte im Ursprung, siehe contour.ts); w/h = Breite/Höhe */
  pts?: P2[];
  /** Eigene Kontur: Herkunft (Dateiname, „gezeichnet“, „Foto“) */
  src?: string;
  /** Eigene Kontur, gezeichnet: Ecken (x, y, Eckradius) zum Weiterbearbeiten */
  draw?: [number, number, number][];
  /** Eigene Kontur: Anzahl der beim Aufbereiten gerundeten spitzen Ecken */
  rounded?: number;
}

export type BlockType = 'straight' | 'bend' | 'transition' | 'step' | 'branch' | 'gate' | 'bleed';

export interface Block {
  /** nur für die Oberfläche (Liste, aufgeklappter Baustein) */
  id: number;
  type: BlockType;
  /** Gerade, Übergang, Abzweig, Schieber */
  length: number;
  /** Bogen: Winkel */
  angle: number;
  /** Bogen: Radius der Mittellinie */
  radius: number;
  /** Richtung, in die Bogen, Versatz und Knick zeigen (Grad um die Mittellinie); Schieber: Richtung, in der die Platte gleitet */
  dir: number;
  /** Übergang: seitlicher Versatz des Endes */
  offset: number;
  /** Übergang: Knick des Endes */
  tilt: number;
  /** Übergang: Verdrehung des Querschnitts */
  twist: number;
  /** Übergang, Absatz: Querschnitt am Ende */
  section: Section;
  /** Abzweig: Innen-Ø des Abzweigs und wie weit er über das Rohr hinausragt (bis Ende C); Winkel = angle, Richtung = dir, Länge des Rohrs = length */
  branchD: number;
  branchLen: number;
  /** Abzweig ab 50°: gebogen (erst 45° schräg aus dem Rohr, dann im Bogen auf den Winkel), besser für die Strömung */
  sweep: boolean;
}

export type OsvacEnd = 'female' | 'male';

export type FlangeLayout = 'auto' | 'rect' | 'round' | 'tri';

export interface DeviceEnd {
  /** aufgesteckt (Muffe/Haube über den Stutzen), eingesteckt (Zapfen in die Öffnung) oder angeschraubt (Flansch) */
  mode: 'over' | 'into' | 'flange';
  /** gemessenes Maß am Gerät: Außenmaß des Stutzens bzw. Innenmaß der Öffnung (vorne) */
  section: Section;
  /** nur Kreis: Ø in der Tiefe */
  dDepth: number;
  /** Steckweg */
  length: number;
  /** Luft zwischen Adapter und Gerät */
  allowance: number;
  /** Drehung des Querschnitts um die Mittellinie */
  rot: number;
  /** Einführfase am offenen Ende */
  chamfer: boolean;
  /** nur eingesteckt: Anschlagring außen */
  collar: boolean;
  /** Extras: Klemmrippen auf der Anlagefläche (Presssitz) */
  ribs: boolean;
  /** Extras, nur aufgesteckt: 3 Längsschlitze vom offenen Ende her, damit eine Schlauchschelle klemmen kann */
  slots: boolean;
  /** Extras: 3 Schraubenlöcher (aufgesteckt Ø 4 mit Senkung, eingesteckt Ø 3,2 zum Vorbohren) */
  holes: boolean;
  /** Extras, nur aufgesteckt: Aussparung am offenen Rand (Breite, Tiefe, Lage in Grad) */
  notch: boolean;
  notchW: number;
  notchH: number;
  notchDir: number;
  /** Flansch: Rand rund um die Öffnung (nur Lochbild automatisch) und Plattendicke */
  flangeRim: number;
  flangeT: number;
  /** Lochbild: automatisch (Platte folgt der Öffnung), rechteckige Platte mit Lochabstand oder runde Platte mit Lochkreis */
  flangeLayout: FlangeLayout;
  plateW: number;
  plateH: number;
  holeX: number;
  holeY: number;
  /** rechteckiges Lochbild: Löcher je Seite (2–6, gleichmäßig auf dem Lochabstand) */
  holeNX: number;
  holeNY: number;
  plateD: number;
  holeCircle: number;
  holeN: number;
  /** dreieckige Platte: Lochkreis-Ø durch die drei Löcher (eins je Ecke) */
  triCircle: number;
  /** Loch-Ø beim Lochbild nach Maß (automatisch immer 4,5 für M4) */
  holeD: number;
  /** Extra: Nut für Moosgummi-Dichtband auf der Anlagefläche, Breite passend zum Band (6, 9 oder 10 mm) */
  seal: boolean;
  sealW: number;
  /** nur für die schnelle Vorschau: Flansch ohne Löcher und Nut (die Schnitte kommen in der vollen Berechnung) */
  preview?: boolean;
}

/**
 * Düsenspitze (nur Ende B): offenes Ende direkt hinter dem letzten Baustein, gerade oder schräg angeschnitten.
 * Extras: verstärkter Rand (Schutzring), Nut für eine Bürstenleiste im Rand. (Nebenluft: Verbindung „Nebenluft-Regler“.)
 */
export interface NozzleTip {
  /** Schräge gegen die Querschnittsebene (0 = gerade abgeschnitten, höchstens 60°) */
  angle: number;
  /** Richtung, in die die Schräge abfällt (Grad um die Mittellinie, bezogen auf den Querschnitt: 0 = über die Breite, 90 = über die Höhe) */
  dir: number;
  ring: boolean;
  brush: boolean;
}
export const DEFAULT_TIP: NozzleTip = { angle: 45, dir: 0, ring: false, brush: false };
/**
 * Maße der Düsenspitze: Schutzring 1,2 mm dick und 5 mm hoch (in Stufen von höchstens 0,6 mm, damit die Unterkante
 * ohne Stützen druckt); Bürstennut 2 mm breit und 4 mm tief mitten im Rand (Rand dafür mindestens 4,4 mm, Ring 6 mm
 * hoch).
 */
export const NOZZLE = { ringE: 1.2, ringH: 5, brushW: 2, brushDepth: 4, brushLip: 1.2, brushH: 6, maxAngle: 60 };

/** Ende B oder Ende C: Anschluss von osVAC neo, Gerät oder (nur B) Düsenspitze, mit Übergangslänge vom letzten Baustein */
export interface EndSpec {
  type: 'device' | OsvacEnd | 'nozzle';
  d: number;
  device: DeviceEnd;
  transition: number;
  /** nur Düse */
  tip?: NozzleTip;
}

export interface FreeSpec {
  a: { type: OsvacEnd; d: number };
  /** Wandstärke der Formstücke und des Geräteanschlusses */
  wall: number;
  blocks: Block[];
  b: EndSpec;
  /** Ende C am Abzweig (nur mit Baustein „Abzweig“) */
  c?: EndSpec;
  /** welches Ende auf dem Druckbett liegt */
  bed: 'A' | 'B';
  /** Schieber: Spiel der Platte im Schlitz (je Seite), Standard 0,3 */
  gateGap?: number;
  /** Nebenluft: Spiel am Drehring, Standard 0,3 */
  bleedGap?: number;
}

export const SECTION_LABELS: Record<SectionShape, string> = {
  circle: 'Kreis',
  ellipse: 'Ellipse',
  slot: 'Langloch',
  rect: 'Rechteck',
  dshape: 'D-Form',
  trapezoid: 'Trapez',
  tri: 'Dreieck',
  contour: 'Eigene',
};

/** Welche Felder eine Form braucht (Reihenfolge = Reihenfolge in der Oberfläche). */
/** Zahlenfelder eines Querschnitts */
export type SecNum = 'd' | 'w' | 'h' | 'r' | 'r2' | 'w2';
export const SECTION_FIELDS: Record<SectionShape, SecNum[]> = {
  circle: ['d'],
  ellipse: ['w', 'h'],
  slot: ['w', 'h'],
  rect: ['w', 'h', 'r', 'r2'],
  dshape: ['d', 'h', 'r'],
  trapezoid: ['w', 'w2', 'h', 'r'],
  tri: ['d', 'r'],
  contour: [],
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  straight: 'Gerade',
  bend: 'Bogen',
  transition: 'Übergang',
  step: 'Absatz',
  branch: 'Abzweig',
  gate: 'Schieber',
  bleed: 'Nebenluft',
};

export const sec = (shape: SectionShape, v: Partial<Omit<Section, 'shape'>> = {}): Section => ({ shape, d: 32, w: 50, h: 30, r: 4, r2: 4, w2: 36, ...v });

let blockIds = 1;
export function newBlock(type: BlockType, v: Partial<Omit<Block, 'id' | 'type'>> = {}, current?: Section): Block {
  return {
    id: blockIds++,
    type,
    length: type === 'transition' ? 30 : 20,
    angle: 90,
    radius: 40,
    dir: 0,
    offset: 0,
    tilt: 0,
    twist: 0,
    section: current ? { ...current } : sec('circle'),
    branchD: current?.shape === 'circle' ? current.d : 32,
    branchLen: 15,
    sweep: false,
    ...(type === 'branch' ? { angle: 45 } : {}),
    ...(type === 'gate' ? { length: 40 } : {}),
    ...(type === 'bleed' ? { length: 32 } : {}),
    ...v,
  };
}

/**
 * Lage des Abzweigs auf dem Rohr (in der Ebene von Rohr und Abzweig, Laufrichtung t, ab dem Schnittpunkt der Achsen):
 * tMin/tMax = Bereich, den der Abzweig auf dem Rohr belegt; minLen = kürzeste Rohrlänge (2 mm Rand an beiden Enden);
 * out = ab dieser Länge entlang des Abzweigs liegt er ganz außerhalb des Rohrs.
 */
export function branchGeom(d: number, bd: number, wall: number, angleDeg: number) {
  const a = rad(Math.min(90, Math.max(1, angleDeg)));
  const Ro = d / 2 + wall, rbo = bd / 2 + wall;
  const tMin = Math.min(-rbo * Math.sin(a), Ro / Math.tan(a) - rbo / Math.sin(a));
  const tMax = Ro / Math.tan(a) + rbo / Math.sin(a);
  return { tMin, tMax, minLen: tMax - tMin + 4, out: (Ro + rbo * Math.abs(Math.cos(a))) / Math.sin(a) };
}

/** Gebogener Abzweig: so schräg verlässt er das Rohr, bevor der Bogen auf den eingestellten Winkel führt */
export const SWEEP_ENTRY = 45;
/** Gebogen nur ab diesem Winkel (darunter ist der Abzweig ohnehin flach) */
export const SWEEP_FROM = 50;

/** Ende C, wenn noch keins angelegt ist: Kupplung in der Größe des Abzweigs */
export const defaultC = (d = 32): EndSpec => ({ type: 'female', d, device: { ...DEFAULT_DEVICE, section: { ...DEFAULT_DEVICE.section } }, transition: 10 });

export const DEFAULT_DEVICE: DeviceEnd = {
  mode: 'over',
  section: sec('circle', { d: 32 }),
  dDepth: 32,
  length: 25,
  allowance: 0.2,
  rot: 0,
  chamfer: true,
  collar: false,
  ribs: false,
  slots: false,
  holes: false,
  notch: false,
  notchW: 20,
  notchH: 10,
  notchDir: 0,
  flangeRim: 15,
  flangeT: 5,
  flangeLayout: 'auto',
  plateW: 120,
  plateH: 90,
  holeX: 100,
  holeY: 70,
  holeNX: 2,
  holeNY: 2,
  plateD: 100,
  holeCircle: 82,
  holeN: 4,
  triCircle: 90,
  holeD: 4.5,
  seal: false,
  sealW: 6,
};

/** Lage der Schraubenlöcher als Anteil am Umfang (ab +u, wie beim Rohrkonus 90/210/330°) */
const HOLE_AT = [0.25, 7 / 12, 11 / 12];

/** Formen, an denen eine Schlauchschelle rundum drückt (bei eckigen Formen nur an den Ecken): nur dort gibt es Schlitze */
export const SLOT_SHAPES: ReadonlySet<string> = new Set(['circle', 'ellipse', 'dshape']);

/** Gerade Abschnitte der Kontur: Mitte (Anteil am Umfang, ab +u wie samplePoints) und Länge */
function flatRuns(s: Section, rotDeg: number) {
  const M = 720;
  const pts = samplePoints(s, M, rotDeg);
  const P = perimeter(s);
  const dir = pts.map((p, i) => {
    const q = pts[(i + 1) % M];
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  });
  const flat = dir.map((d, i) => {
    let t = d - dir[(i + M - 1) % M];
    t = Math.atan2(Math.sin(t), Math.cos(t));
    return Math.abs(t) < 1e-3;
  });
  if (flat.every(Boolean) || !flat.some(Boolean)) return [];
  const start = flat.findIndex((f, i) => f && !flat[(i + M - 1) % M]);
  const runs: { mid: number; len: number }[] = [];
  for (let k = 0, i = start; k < M; ) {
    if (!flat[i]) {
      i = (i + 1) % M;
      k++;
      continue;
    }
    let n = 0;
    while (flat[(i + n) % M] && n < M) n++;
    // n Kanten ab Punkt i: Mitte bei i + n/2
    runs.push({ mid: (((i + n / 2) / M) % 1 + 1) % 1, len: (n * P) / M });
    i = (i + n) % M;
    k += n;
  }
  return runs;
}

/**
 * Lage der Schraubenlöcher: runde Formen 3 Stück gleichmäßig (wie beim Rohrkonus),
 * Formen mit geraden Seiten je eins mittig auf jeder Seite ab 14 mm, sonst 3 gleichmäßig ab der Mitte der geraden Seite.
 */
function holeLayout(s: Section, rotDeg: number) {
  if (s.shape === 'circle' || s.shape === 'ellipse') return HOLE_AT;
  const runs = flatRuns(s, rotDeg).filter((r) => r.len >= 14);
  if (runs.length >= 2) return runs.map((r) => r.mid);
  const f0 = runs[0]?.mid ?? 0.25;
  return [f0, f0 + 1 / 3, f0 + 2 / 3].map((f) => f % 1);
}

/**
 * Schlitze für die Schlauchschelle, fest nach Größe des Adapters:
 * 80 % der Tiefe lang (damit die Zungen federn), Breite Umfang/40 (2,5–4 mm, auf 0,5 mm gerundet),
 * mit Schraubenlöchern 3 Stück genau zwischen den Löchern, sonst 3 / 4 / 6 je nach Umfang (unter 100 / bis 200 / darüber).
 */
function slotLayout(P: number, L: number, holeAt: number[] | null) {
  const len = Math.max(6, Math.min(Math.round(L * 0.8), L - 3));
  const width = Math.min(4, Math.max(2.5, Math.round((P / 40) * 2) / 2));
  let at: number[];
  if (holeAt && holeAt.length) {
    // je ein Schlitz in der Mitte zwischen zwei Löchern
    const h = [...holeAt].sort((x, y) => x - y);
    at = h.map((f, i) => {
      const g = i + 1 < h.length ? h[i + 1] : h[0] + 1;
      return ((f + g) / 2) % 1;
    });
  } else {
    const n = P < 100 ? 3 : P <= 200 ? 4 : 6;
    at = Array.from({ length: n }, (_, k) => (k + 0.5) / n);
  }
  return { len, width, at };
}
/** Nur für die Prüfläufe: einzelne Klemmrippen künstlich scheitern lassen (Weg des Hinweises testen) */
export const testHooks: { ribFail: ((i: number) => boolean) | null; noFoldCheck?: boolean } = { ribFail: null };

/** Klemmrippen: so weit ragen sie über die Gerätefläche hinaus (werden beim Aufstecken zusammengedrückt) */
const RIB_CRUSH = 0.3;

/** Vorlagen als Startpunkt (nach den Vorbildern auf Thingiverse). */
export const TEMPLATES: { id: string; title: string; hint: string; make: () => FreeSpec }[] = [
  {
    id: 'elbow',
    title: 'Winkel 90°',
    hint: 'Kupplung, Bogen, Stecker',
    make: () => ({
      a: { type: 'female', d: 32 },
      wall: 3,
      blocks: [newBlock('bend', { angle: 90, radius: 32 })],
      b: { type: 'male', d: 32, device: { ...DEFAULT_DEVICE, section: sec('circle', { d: 32 }) }, transition: 10 },
      bed: 'B',
    }),
  },
  {
    id: 'hood',
    title: 'Rechteckige Haube',
    hint: 'Für eckige Auslässe',
    make: () => ({
      a: { type: 'male', d: 25 },
      wall: 2.5,
      blocks: [newBlock('straight', { length: 15 }), newBlock('bend', { angle: 30, radius: 40, dir: 0 })],
      b: {
        type: 'device',
        d: 32,
        device: { ...DEFAULT_DEVICE, mode: 'over', section: sec('rect', { w: 62, h: 38, r: 6, r2: 3 }), length: 25, allowance: 0.4 },
        transition: 20,
      },
      bed: 'B',
    }),
  },
  {
    id: 'offset',
    title: 'Versatz mit Knick',
    hint: 'Geschwungen, mit Anschlag',
    make: () => ({
      a: { type: 'male', d: 32 },
      wall: 2.5,
      blocks: [
        newBlock('straight', { length: 30 }),
        newBlock('transition', { length: 40, offset: 12, tilt: 35, dir: 0, section: sec('circle', { d: 26 }) }),
      ],
      b: {
        type: 'device',
        d: 32,
        device: { ...DEFAULT_DEVICE, mode: 'into', section: sec('circle', { d: 35 }), dDepth: 35, length: 18, collar: true },
        transition: 6,
      },
      bed: 'A',
    }),
  },
  {
    id: 'straight',
    title: 'Gerade auf Stutzen',
    hint: 'Einfacher Anfang',
    make: () => ({
      a: { type: 'female', d: 32 },
      wall: 3,
      blocks: [newBlock('straight', { length: 10 })],
      b: { type: 'device', d: 32, device: { ...DEFAULT_DEVICE, section: sec('circle', { d: 32 }), dDepth: 33 }, transition: 10 },
      bed: 'B',
    }),
  },
  {
    id: 'flange',
    title: 'Flansch am Gehäuse',
    hint: 'Zum Anschrauben',
    make: () => ({
      a: { type: 'female', d: 32 },
      wall: 3,
      blocks: [newBlock('straight', { length: 10 })],
      b: { type: 'device', d: 32, device: { ...DEFAULT_DEVICE, mode: 'flange', section: sec('circle', { d: 63 }) }, transition: 25 },
      bed: 'B',
    }),
  },
  {
    id: 'y',
    title: 'Y-Abzweig 45°',
    hint: 'Zwei Abgänge an einem Anschluss',
    make: () => ({
      a: { type: 'male', d: 32 },
      wall: 3,
      blocks: [newBlock('branch', { length: 64, angle: 45, branchD: 32, branchLen: 15 })],
      b: { type: 'female', d: 32, device: { ...DEFAULT_DEVICE }, transition: 10 },
      c: defaultC(32),
      bed: 'A',
    }),
  },
  {
    id: 'gate',
    title: 'Absperrschieber',
    hint: 'Schieber zwischen zwei Steckern, in zwei Teilen gedruckt',
    make: () => ({
      a: { type: 'male', d: 32 },
      wall: 3,
      blocks: [newBlock('gate', { length: 46 })],
      b: { type: 'male', d: 32, device: { ...DEFAULT_DEVICE }, transition: 10 },
      bed: 'B',
    }),
  },
];

export const DEFAULT_FREE: FreeSpec = TEMPLATES[0].make();

/** Gespeicherten Aufbau übernehmen: neue IDs, fehlende Felder mit Standardwerten. */
export function withFreshIds(s: FreeSpec): FreeSpec {
  const types: BlockType[] = ['straight', 'bend', 'transition', 'step', 'branch', 'gate', 'bleed'];
  return {
    ...s,
    blocks: s.blocks
      .filter((b) => b && types.includes(b.type))
      .map((b) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = b;
        return newBlock(b.type, { ...rest, section: { ...sec('circle'), ...b.section } });
      }),
    b: { ...s.b, device: { ...s.b.device, section: { ...sec('circle'), ...s.b.device.section } } },
    ...(s.c ? { c: { ...defaultC(), ...s.c, device: { ...DEFAULT_DEVICE, ...s.c.device, section: { ...sec('circle'), ...s.c.device?.section } } } } : {}),
  };
}

/** Ohne IDs vergleichen (z. B. ob ein Aufbau noch der Vorlage entspricht) */
export const specKey = (s: FreeSpec) => JSON.stringify({ ...s, blocks: s.blocks.map(({ id: _id, ...b }) => b) });

// ---------------------------------------------------------------- Vektoren

export type V3 = [number, number, number];
export type P2 = [number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const rad = (d: number) => (d * Math.PI) / 180;

/** Drehung von v um die Einheitsachse k um th (Bogenmaß, rechtshändig). */
function rot(v: V3, k: V3, th: number): V3 {
  const c = Math.cos(th), s = Math.sin(th);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

/** Rahmen einer Querschnittsfläche: Ursprung, Laufrichtung, Querschnittsachsen (u × v = t). */
export interface Frame {
  o: V3;
  t: V3;
  u: V3;
  v: V3;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const frameKey = (f: Frame) => [f.o, f.t, f.u].map((a) => a.map(r6));

function rotFrame(f: Frame, c: V3, k: V3, th: number): Frame {
  return { o: add(c, rot(sub(f.o, c), k, th)), t: rot(f.t, k, th), u: rot(f.u, k, th), v: rot(f.v, k, th) };
}
const advance = (f: Frame, d: number): Frame => ({ ...f, o: add(f.o, mul(f.t, d)) });
/** Richtung in der Querschnittsebene (0° = u, 90° = v) */
const inPlane = (f: Frame, deg: number): V3 => add(mul(f.u, Math.cos(rad(deg))), mul(f.v, Math.sin(rad(deg))));

// ---------------------------------------------------------------- Querschnitte

type Prim =
  | { k: 'L'; a: P2; b: P2 }
  | { k: 'A'; c: P2; r: number; a0: number; a1: number } // gegen den Uhrzeigersinn von a0 bis a1 (Bogenmaß)
  | { k: 'E'; a: number; b: number };

const MIN_R = 0.5;

/** Querschnitt um delta nach außen versetzt (negativ: nach innen). Kleinste Eckradien MIN_R. */
export function grow(s: Section, delta: number): Section {
  const rr = (r: number) => Math.max(MIN_R, r + delta);
  switch (s.shape) {
    case 'trapezoid': {
      const k = (s.w2 - s.w) / (2 * s.h);
      const q = Math.sqrt(1 + k * k);
      return { ...s, w: s.w + 2 * delta * (q - k), w2: s.w2 + 2 * delta * (q + k), h: s.h + 2 * delta, r: rr(s.r) };
    }
    case 'tri':
      // gleiche Eckmitten, größerer Eckradius
      return { ...s, r: rr(s.r) };
    case 'contour': {
      const pts = offsetContour(s.pts ?? [], delta);
      const b = bboxOf(pts);
      return { ...s, pts, w: b.w, h: b.h, d: Math.max(b.w, b.h) };
    }
    default:
      return { ...s, d: s.d + 2 * delta, w: s.w + 2 * delta, h: s.h + 2 * delta, r: rr(s.r), r2: rr(s.r2) };
  }
}

/**
 * Eigene Kontur in der Querschnittsebene: Die Punkte gelten mit Blick auf den Stutzen (von außen, so wie man ihn
 * fotografiert oder zeichnet). Die Ebene (u, v) wird dagegen in Richtung der Kette gesehen, also von der anderen
 * Seite: deshalb links und rechts getauscht.
 */
const geomPts = (s: Section): P2[] => mirrorX(s.pts ?? []);

/** Polygon (gegen den Uhrzeigersinn) mit gerundeten Ecken als Konturstücke. Zu große Radien werden verkleinert. */
function roundedPoly(V: P2[], radii: number[]): Prim[] {
  const n = V.length;
  const dir = (a: P2, b: P2): P2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const turn = V.map((p, i) => {
    const e1 = dir(V[(i - 1 + n) % n], p), e2 = dir(p, V[(i + 1) % n]);
    return Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]);
  });
  // Tangentenlängen dürfen eine Kante zusammen nicht überschreiten
  const r = radii.map((x) => Math.max(MIN_R, x));
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const L = Math.hypot(V[j][0] - V[i][0], V[j][1] - V[i][1]);
      const need = r[i] * Math.tan(turn[i] / 2) + r[j] * Math.tan(turn[j] / 2);
      if (need > L) {
        const f = L / need;
        r[i] *= f;
        r[j] *= f;
      }
    }
  const corners = V.map((p, i) => {
    const e1 = dir(V[(i - 1 + n) % n], p), e2 = dir(p, V[(i + 1) % n]);
    const dt = r[i] * Math.tan(turn[i] / 2);
    const t1: P2 = [p[0] - e1[0] * dt, p[1] - e1[1] * dt];
    const t2: P2 = [p[0] + e2[0] * dt, p[1] + e2[1] * dt];
    const c: P2 = [t1[0] - e1[1] * r[i], t1[1] + e1[0] * r[i]];
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    return { t1, t2, c, r: r[i], a0, a1: a0 + turn[i] };
  });
  const out: Prim[] = [];
  for (let i = 0; i < n; i++) {
    const k = corners[i], nx = corners[(i + 1) % n];
    out.push({ k: 'A', c: k.c, r: k.r, a0: k.a0, a1: k.a1 });
    if (Math.hypot(nx.t1[0] - k.t2[0], nx.t1[1] - k.t2[1]) > 1e-6) out.push({ k: 'L', a: k.t2, b: nx.t1 });
  }
  return out;
}

function contour(s: Section): Prim[] {
  switch (s.shape) {
    case 'contour': {
      const p = geomPts(s);
      return p.map((a, i) => ({ k: 'L', a, b: p[(i + 1) % p.length] }) as Prim);
    }
    case 'circle':
      return [{ k: 'A', c: [0, 0], r: s.d / 2, a0: 0, a1: 2 * Math.PI }];
    case 'ellipse':
      return [{ k: 'E', a: s.w / 2, b: s.h / 2 }];
    case 'slot': {
      const r = Math.min(s.w, s.h) / 2;
      return roundedPoly([[s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2], [-s.w / 2, -s.h / 2]], [r, r, r, r]);
    }
    case 'rect': {
      const m = Math.min(s.w, s.h) / 2;
      const a = Math.min(s.r, m), b = Math.min(s.r2, m);
      return roundedPoly([[s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2], [-s.w / 2, -s.h / 2]], [b, a, a, b]);
    }
    case 'trapezoid':
      return roundedPoly([[s.w / 2, -s.h / 2], [s.w2 / 2, s.h / 2], [-s.w2 / 2, s.h / 2], [-s.w / 2, -s.h / 2]], [s.r, s.r, s.r, s.r]);
    case 'tri': {
      // gleichseitiges Dreieck, Ecke oben (+v); Eckbögen um die Punkte auf dem Kreis d/2 (Ecke liegt 2·r weiter außen)
      const Rv = s.d / 2 + 2 * s.r;
      const V = [90, 210, 330].map((a) => [Rv * Math.cos(rad(a)), Rv * Math.sin(rad(a))] as P2);
      return roundedPoly(V, [s.r, s.r, s.r]);
    }
    case 'dshape': {
      // Kreis R um die Mitte, unten abgeflacht; Mitte der Höhe h liegt im Ursprung, damit die Form zentriert ist
      const R = s.d / 2;
      const yc0 = s.h / 2 - R; // Kreismittelpunkt (Rundung oben bei +h/2, Abflachung unten bei −h/2)
      const yf = -s.h / 2; // Abflachung
      const f = Math.min(Math.max(MIN_R, s.r), (R - Math.abs(yf - yc0)) * 0.9, R / 2);
      // Ausrundung: tangential an die Gerade und innen am Kreis
      const cy = yf + f;
      const cx = Math.sqrt(Math.max(0, (R - f) ** 2 - (cy - yc0) ** 2));
      const beta = Math.atan2(cy - yc0, cx);
      return [
        { k: 'L', a: [-cx, yf], b: [cx, yf] },
        { k: 'A', c: [cx, cy], r: f, a0: -Math.PI / 2, a1: beta },
        { k: 'A', c: [0, yc0], r: R, a0: beta, a1: Math.PI - beta },
        { k: 'A', c: [-cx, cy], r: f, a0: Math.PI - beta, a1: 1.5 * Math.PI },
      ];
    }
  }
}

/** Dichte Punktfolge der Kontur (gegen den Uhrzeigersinn). */
function dense(prims: Prim[]): P2[] {
  const pts: P2[] = [];
  for (const p of prims) {
    if (p.k === 'L') {
      const n = 40;
      for (let i = 0; i < n; i++) pts.push([p.a[0] + ((p.b[0] - p.a[0]) * i) / n, p.a[1] + ((p.b[1] - p.a[1]) * i) / n]);
    } else if (p.k === 'A') {
      const n = Math.max(4, Math.ceil(((p.a1 - p.a0) * 180) / Math.PI / 1.5));
      for (let i = 0; i < n; i++) {
        const a = p.a0 + ((p.a1 - p.a0) * i) / n;
        pts.push([p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]);
      }
    } else {
      const n = 720;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        pts.push([p.a * Math.cos(a), p.b * Math.sin(a)]);
      }
    }
  }
  return pts;
}

const rot2 = (p: P2, deg: number): P2 => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

/** Dichte Punktfolge des Querschnitts */
const densePts = (s: Section): P2[] => (s.shape === 'contour' ? denseAll(geomPts(s), 0.25) : dense(contour(s)));

export function perimeter(s: Section): number {
  const d = densePts(s);
  let L = 0;
  for (let i = 0; i < d.length; i++) {
    const a = d[i], b = d[(i + 1) % d.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

/**
 * N Punkte in gleichen Abständen entlang der Kontur, beginnend auf der +u-Achse (rechts der Mitte),
 * gegen den Uhrzeigersinn. Gleiche Startlage und Richtung bei allen Formen → Lofts verwinden sich nicht.
 */
export function samplePoints(s: Section, N: number, rotDeg = 0): P2[] {
  const d = densePts(s);
  // Start: Punkt rechts der Mitte, der der +u-Achse am nächsten liegt
  let i0 = 0, best = Infinity;
  for (let i = 0; i < d.length; i++) {
    const [x, y] = d[i];
    if (x > 0 && Math.abs(y) < best) {
      best = Math.abs(y);
      i0 = i;
    }
  }
  const ring = [...d.slice(i0), ...d.slice(0, i0)];
  const cum = [0];
  for (let i = 1; i <= ring.length; i++) {
    const a = ring[i - 1], b = ring[i % ring.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[ring.length];
  const out: P2[] = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const target = (total * k) / N;
    while (cum[j + 1] < target) j++;
    const a = ring[j], b = ring[(j + 1) % ring.length];
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push(rot2([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], rotDeg));
  }
  return out;
}

const startOf = (p: Prim): P2 => (p.k === 'L' ? p.a : p.k === 'A' ? [p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0)] : [p.a, 0]);

/** Exakter geschlossener Draht der Kontur (Linien, Kreisbögen, Ellipse) in der Querschnittsebene des Rahmens. */
function exactWire(f: Frame, s: Section, rotDeg: number) {
  const P3 = (q: P2): V3 => {
    const [x, y] = rot2(q, rotDeg);
    return add(add(f.o, mul(f.u, x)), mul(f.v, y));
  };
  const P = (q: P2) => P3(q) as Point;
  if (s.shape === 'circle') return assembleWire([makeCircle(s.d / 2, f.o as Point, f.t as Point)]);
  if (s.shape === 'ellipse') {
    const xd = sub(P3([1, 0]), f.o), yd = sub(P3([0, 1]), f.o);
    return assembleWire([s.w >= s.h ? makeEllipse(s.w / 2, s.h / 2, f.o as Point, f.t as Point, xd as Point) : makeEllipse(s.h / 2, s.w / 2, f.o as Point, f.t as Point, yd as Point)]);
  }
  if (s.shape === 'contour') {
    // gerade Stücke als Linien, Rundungen als glatte Kurven; Stoßpunkte exakt gemeinsam
    const edges = contourRuns(geomPts(s)).map((r) =>
      r.k === 'L' ? makeLine(P(r.pts[0]), P(r.pts[1])) : makeBSplineApproximation(r.pts.map(P), { tolerance: 0.002, degMax: 3, degMin: 1, smoothing: null }),
    );
    return assembleWire(edges);
  }
  const prims = contour(s);
  // Stoßpunkte einmal berechnen, damit benachbarte Kanten exakt dieselben Endpunkte haben
  const J = prims.map(startOf);
  const edges = prims.map((p, i) => {
    const a = J[i], b = J[(i + 1) % J.length];
    if (p.k === 'L') return makeLine(P(a), P(b));
    const am = p.k === 'A' ? (p.a0 + p.a1) / 2 : 0;
    const m: P2 = p.k === 'A' ? [p.c[0] + p.r * Math.cos(am), p.c[1] + p.r * Math.sin(am)] : [0, 0];
    return makeThreePointArc(P(a), P(m), P(b));
  });
  return assembleWire(edges);
}

/** Ringfläche zwischen äußerem und innerem Querschnitt. */
function ringFace(f: Frame, inner: Section, outer: Section, rotDeg: number) {
  // Loch gegenläufig, sonst entsteht eine gefüllte Fläche
  const hole = exactWire(f, inner, rotDeg);
  return makeFace(exactWire(f, outer, rotDeg), [cast(hole.wrapped.Reversed()) as typeof hole]);
}

const extrudeRing = (f: Frame, inner: Section, outer: Section, rotDeg: number, L: number) =>
  basicFaceExtrusion(ringFace(f, inner, outer, rotDeg), new Vector(mul(f.t, L) as Point)) as unknown as Shape3D;

/** Größte Ausdehnung der Kontur in Richtung deg (von der Mitte aus). */
function extent(s: Section, rotDeg: number, deg: number): number {
  const dx = Math.cos(rad(deg)), dy = Math.sin(rad(deg));
  return Math.max(...samplePoints(s, 180, rotDeg).map(([x, y]) => x * dx + y * dy));
}

/** Kennmaß für Texte: „62 × 38“, „Ø 32“ */
export function sectionText(s: Section): string {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  if (s.shape === 'circle') return `Ø ${f(s.d)}`;
  if (s.shape === 'dshape') return `D ${f(s.d)}/${f(s.h)}`;
  if (s.shape === 'trapezoid') return `${f(s.w)}/${f(s.w2)} × ${f(s.h)}`;
  if (s.shape === 'tri') return `Dreieck ${f(s.d)}`;
  if (s.shape === 'contour') return `Kontur ${f(s.w)} × ${f(s.h)}`;
  return `${f(s.w)} × ${f(s.h)}`;
}

const sameSection = (a: Section, b: Section) => {
  if (a.shape === 'contour' || b.shape === 'contour') return a.shape === b.shape && contourKey(a.pts ?? []) === contourKey(b.pts ?? []);
  const ks = ['shape', ...SECTION_FIELDS[a.shape]] as (keyof Section)[];
  return a.shape === b.shape && ks.every((k) => Math.abs((a[k] as number) - (b[k] as number)) < 1e-9 || a[k] === b[k]);
};

/** Nur die Felder, die die Form benutzt (für Schlüssel und Vergleiche). */
const secKey = (s: Section) => (s.shape === 'contour' ? [s.shape, contourKey(s.pts ?? [])] : [s.shape, ...SECTION_FIELDS[s.shape].map((k) => r6(s[k]))]);

// ---------------------------------------------------------------- Prüfungen

/**
 * Vorschlag zu einer Meldung: welches Feld auf welchen Wert (Knopf „… auf … setzen“).
 * fields: Beschriftungen (aria-label) der Zahlenfelder, die markiert werden; set ändert den Aufbau.
 */
export interface Fix {
  label: string;
  fields: string[];
  set: (s: FreeSpec) => void;
}

export interface Issue {
  level: 'error' | 'warn';
  text: string;
  fixes?: Fix[];
  /** fehlende Eingabe statt Fehler (z. B. noch keine Kontur): sperrt wie ein Fehler, wird aber nicht rot gezeigt */
  todo?: boolean;
}

const fmtV = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
/** Vorschlag für ein Feld: name wie in der Oberfläche, field = aria-label des Zahlenfelds */
function fixTo(name: string, field: string, value: number, set: (s: FreeSpec, v: number) => void, unit = 'mm'): Fix {
  return { label: `${name} auf ${fmtV(value)}${unit === '°' || !unit ? unit : ' ' + unit} setzen`, fields: [field], set: (s) => set(s, value) };
}
/** auf 0,5 mm aufrunden (Vorschläge sollen glatte Werte sein und die Grenze sicher einhalten) */
const upHalf = (v: number) => Math.ceil(v * 2 - 1e-9) / 2;
const downHalf = (v: number) => Math.floor(v * 2 + 1e-9) / 2;
const blockById = (id: number) => (s: FreeSpec) => s.blocks.find((x) => x.id === id)!;

/** Wo ein Querschnitt im Aufbau steht: Beschriftung des Editors und Zugriff im Aufbau (für die Vorschläge) */
interface SecAt {
  label: string;
  get: (s: FreeSpec) => Section;
  /** Kreis mit „Ø vorne“/„Ø in der Tiefe“ (Gerät aufgesteckt/eingesteckt) */
  front?: boolean;
}
const SEC_NAMES: Partial<Record<SecNum, string>> = { d: 'Durchmesser', w: 'Breite', h: 'Höhe', w2: 'Breite oben' };

function checkSection(s: Section, what: string, out: Issue[], at?: SecAt) {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const fields = SECTION_FIELDS[s.shape];
  const name = (k: SecNum) => (k === 'd' && at?.front ? 'Ø vorne' : k === 'w' && s.shape === 'trapezoid' ? 'Breite unten' : SEC_NAMES[k]!);
  const fx = (k: SecNum, v: number): Fix[] | undefined =>
    at ? [fixTo(name(k), `${at.label}: ${name(k)}`, v, (sp, x) => void (at.get(sp)[k] = x))] : undefined;
  if (s.shape === 'contour') {
    const p = s.pts ?? [];
    if (p.length < 3) return void out.push({ level: 'error', todo: true, text: `${what}: Noch keine Kontur. Lade oben eine Datei, zeichne am Foto nach oder zeichne selbst. Danach erscheint der Adapter in der Vorschau.` });
    const b = bboxOf(p);
    if (Math.min(b.w, b.h) < CONTOUR_MIN) out.push({ level: 'error', text: `${what}: Die Kontur muss mindestens ${CONTOUR_MIN} mm breit und hoch sein (jetzt ${f(b.w)} × ${f(b.h)} mm).` });
    if (Math.max(b.w, b.h) > CONTOUR_MAX) out.push({ level: 'error', text: `${what}: Die Kontur darf höchstens ${CONTOUR_MAX} mm groß sein (jetzt ${f(b.w)} × ${f(b.h)} mm).` });
    if (selfIntersects(p)) out.push({ level: 'error', text: `${what}: Die Kontur überschneidet sich selbst. Bitte die Punkte prüfen.` });
    return;
  }
  for (const k of fields) if (!(s[k] >= 0) || !Number.isFinite(s[k])) out.push({ level: 'error', text: `${what}: Bitte alle Maße eingeben.` });
  if (fields.includes('d') && s.d < 6) out.push({ level: 'error', text: `${what}: Der Durchmesser muss mindestens 6 mm betragen.`, fixes: fx('d', 6) });
  if (fields.includes('w') && s.w < 6) out.push({ level: 'error', text: `${what}: Die Breite muss mindestens 6 mm betragen.`, fixes: fx('w', 6) });
  if (fields.includes('h') && s.h < 4) out.push({ level: 'error', text: `${what}: Die Höhe muss mindestens 4 mm betragen.`, fixes: fx('h', 4) });
  if (s.shape === 'slot' && s.w < s.h) out.push({ level: 'warn', text: `${what}: Beim Langloch ist die Breite kleiner als die Höhe, es steht also hochkant. Das ist in Ordnung, falls so gewollt.` });
  if (s.shape === 'dshape') {
    if (s.h >= s.d) out.push({ level: 'error', text: `${what}: Bei der D-Form muss die Höhe kleiner sein als der Durchmesser (${f(s.d)} mm), sonst gibt es keine flache Seite.`, fixes: fx('h', downHalf(s.d - 1)) });
    if (s.h <= s.d / 2 + 1) out.push({ level: 'error', text: `${what}: Bei der D-Form muss die Höhe größer als ${f(s.d / 2 + 1)} mm sein (gut die Hälfte des Durchmessers).`, fixes: fx('h', upHalf(s.d / 2 + 1.5)) });
  }
  if (s.shape === 'trapezoid' && s.w2 < 4) out.push({ level: 'error', text: `${what}: Die obere Breite des Trapezes muss mindestens 4 mm betragen.`, fixes: fx('w2', 4) });
  if (s.shape === 'rect' && (s.r > Math.min(s.w, s.h) / 2 || s.r2 > Math.min(s.w, s.h) / 2))
    out.push({ level: 'warn', text: `${what}: Die Eckrundung ist größer als die halbe Seite. Sie wird auf ${f(Math.min(s.w, s.h) / 2)} mm verkleinert.` });
}

// ---------------------------------------------------------------- Planung

/** Ein Körper der Kette (noch nicht gebaut). */
export interface FreeBody {
  name: string;
  cost: number;
  dep: unknown;
  make: () => Shape3D;
  /** Schieber teilt den Adapter: Körper des Teils mit Ende B (sonst Teil mit Anschluss A) */
  part2?: boolean;
}

/** Eigenes Teil, das flach neben dem Adapter gedruckt wird (Platte des Schiebers); x0 … x1 und ±hw im eigenen System */
export interface LooseBody extends FreeBody {
  x0: number;
  x1: number;
  hw: number;
}

export interface FreePlan {
  bodies: FreeBody[];
  /** Teile neben dem Adapter (Schieberplatten) */
  loose: LooseBody[];
  issues: Issue[];
  /** Rahmen am Ende der Formstücke (Anfang von Ende B) mit Querschnitt */
  chainEnd: { frame: Frame; section: Section; rot: number };
  /** Rahmen der Außenfläche von Ende B (Laufrichtung zeigt aus dem Adapter heraus) */
  end: Frame;
  /** Punkte entlang der Mittellinie (für Lage und Ausrichtung auf dem Druckbett) */
  path: V3[];
  /** je Baustein: Anfangsrahmen und Ebene der Biegung (Bogen; Übergang mit Versatz/Knick), für den Schnitt in der Vorschau */
  cuts: { start: Frame; n: V3 | null }[];
  /** Anfangsrahmen der Kette (Ende von Anschluss A) */
  startFrame: Frame;
  /** Abzweig: Ende des Abzweigs bzw. Anfang von Ende C (wie chainEnd) und Außenfläche von Ende C */
  cChainEnd?: { frame: Frame; section: Section; rot: number };
  cEnd?: Frame;
  /** Schnittebene für Ende C (Ebene von Rohr und Abzweig) */
  cCut?: V3;
  /**
   * Schieber: der Adapter wird an der Trennfläche geteilt und in zwei Teilen gedruckt (A-Teil steht auf Anschluss A,
   * B-Teil auf Ende B). floor/lid: Boden des Kanals und Trennfläche auf der Achse, t: Laufrichtung (von A nach B).
   * pathPart2: je Punkt von path, ob er zum B-Teil gehört. cPart2: Ende C hängt am B-Teil.
   */
  split?: { block: number; floor: V3; lid: V3; t: V3; pathPart2: boolean[]; cPart2: boolean; screw: number; screwN: number };
}

/** Freiform mit Schieber: wird in zwei Teilen gedruckt */
/** Spiel am Drehring des Nebenluft-Reglers (Passung) */
export const bleedGapOf = (spec: FreeSpec) => Math.min(BLEED.gapMax, Math.max(BLEED.gapMin, spec.bleedGap ?? BLEED.gap));
/** kürzeste Länge des Nebenluft-Reglers für Innen-Ø d */
export const bleedMinLen = (d: number, wall: number, gap: number) => upHalf(bleedDims(d / 2, d / 2 + wall, gap).minLen);
export const hasSplit = (spec: FreeSpec) => spec.blocks.some((b) => b.type === 'gate');

/** Länge des Übergangskonus zwischen Anschluss von osVAC neo und Formstück (TransitionConeLength) */
export const OSVAC_TRANSITION = 8;
export const OSVAC_HEIGHT: Record<OsvacEnd, number> = { female: 33.5, male: 32 };

const N_MIN = 96;
const nFor = (...ss: Section[]) => Math.min(240, Math.max(N_MIN, Math.ceil(Math.max(...ss.map(perimeter)) / 1.0)));

/** Geschlossener Draht durch die Punkte (periodische B-Spline-Interpolation: exakt durch alle Punkte, ohne Überschwinger). */
function wire3(f: Frame, pts: P2[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oc = getOC() as any;
  const arr = new oc.NCollection_Array1_gp_Pnt(1, pts.length);
  pts.forEach(([x, y], i) => {
    const q = add(add(f.o, mul(f.u, x)), mul(f.v, y));
    const pnt = new oc.gp_Pnt(q[0], q[1], q[2]);
    arr.SetValue(i + 1, pnt);
    pnt.delete();
  });
  const h = new oc.NCollection_HArray1_gp_Pnt(arr);
  const ip = new oc.GeomAPI_Interpolate(h, true, 1e-7);
  ip.Perform();
  if (!ip.IsDone()) throw new UserError('Eine Form ließ sich nicht berechnen. Bitte ein Maß etwas ändern.');
  const mk = new oc.BRepBuilderAPI_MakeEdge(ip.Curve());
  const e = new Edge(mk.Edge());
  for (const x of [mk, ip, h, arr]) x.delete();
  return assembleWire([e]);
}

/**
 * Hohler Loft durch mehrere Querschnitte: Außenhaut, Innenhaut und die beiden Ringflächen werden direkt
 * zu einem Körper vernäht (ohne Boolesche Operation – die war bei Freiformflächen langsam und unzuverlässig).
 */
/** Geschlossener Linienzug durch die Punkte (für Körper, die anschließend geschnitten werden: ebene Flächen schneidet OpenCascade zuverlässig) */
function polyWire3(f: Frame, pts: P2[]) {
  const q = pts.map(([x, y]) => add(add(f.o, mul(f.u, x)), mul(f.v, y)) as Point);
  return assembleWire(q.map((p, i) => makeLine(p, q[(i + 1) % q.length])));
}

/** Gültiger Körper laut OpenCascade (BRepCheck), z. B. nach einer Ausrundung */
function validShape(sh: Shape3D): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oc = getOC() as any;
  const c = new oc.BRepCheck_Analyzer((sh as unknown as { wrapped: unknown }).wrapped, true, false);
  const ok = c.IsValid();
  c.delete();
  return ok;
}

function hollowLoft(frames: Frame[], inner: P2[][], outer: P2[][], ruled: boolean, name: string, poly = false): Shape3D {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oc = getOC() as any;
  const fail = () => new UserError(`${partLabel(name)} ließ sich mit diesen Maßen nicht berechnen. Bitte Länge, Versatz oder Knick etwas ändern.`);
  const n = frames.length - 1;
  const w3 = poly ? polyWire3 : wire3;
  const wo = frames.map((f, i) => w3(f, outer[i]));
  const wi = frames.map((f, i) => w3(f, inner[i]));
  const so = loft(wo, { ruled }, true);
  const si = loft(wi, { ruled }, true);
  const caps = [makeFace(wo[0], [wi[0]]), makeFace(wo[n], [wi[n]])];
  const gc: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(x: T) => (gc.push(x), x);
  try {
    const sew = keep(new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false));
    sew.Add(so.wrapped);
    sew.Add(si.wrapped.Reversed()); // Innenhaut zeigt nach innen
    for (const c of caps) sew.Add(c.wrapped);
    sew.Perform(keep(new oc.Message_ProgressRange()));
    if (sew.NbFreeEdges() > 0) throw fail();
    const ex = keep(new oc.TopExp_Explorer(sew.SewedShape(), oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    if (!ex.More()) throw fail();
    const mk = keep(new oc.BRepBuilderAPI_MakeSolid(oc.TopoDS.Shell(ex.Current())));
    const fix = keep(new oc.ShapeFix_Solid(mk.Solid()));
    fix.Perform(keep(new oc.Message_ProgressRange()));
    return cast(fix.Solid()) as Shape3D;
  } finally {
    for (const x of gc) x.delete();
    for (const x of [so, si, ...caps, ...wo, ...wi]) (x as { delete?: () => void }).delete?.();
  }
}


/**
 * Plant die Kette ab dem Anschlussende des Übergangskonus von Anschluss A.
 * Lage: Anschluss A oben in der Achse, Oberkante z = 0, Laufrichtung −Z (wie bei den Stutzen-Adaptern).
 */
type GateAdj = { delta: number; eps: number };

/**
 * Plan der Freiform. Mit Schieber zweimal nachgerechnet: Boden und Trennfläche sollen beim Druck im Schichtraster
 * (0,2 mm) liegen, sonst rundet der Slicer die Dichtlippen weg. Dazu wird das Gehäuse auf dem Rohr um delta
 * verschoben (Boden im A-Teil) und das Rohr hinter dem Deckel um eps verlängert (Trennfläche im B-Teil).
 */
export function planFree(spec: FreeSpec): FreePlan {
  const plan = planFreeRaw(spec);
  if (!plan.issues.some((x) => x.level === 'error')) bleedUpright(spec, plan);
  return plan;
}

/**
 * Nebenluft-Regler: Der Drehring wird mitgedruckt und braucht ein senkrechtes Rohr. Schräg hängt er über und
 * „Stützen“ würden im Spalt den Ring festschweißen. Daher Fehler, mit Vorschlag „anderes Ende nach unten“, wenn das hilft.
 */
function bleedUpright(spec: FreeSpec, plan: FreePlan) {
  const tilted = (sp: FreeSpec, pl: FreePlan) => {
    const { p1, p2 } = partPlacements(sp, pl);
    return sp.blocks.map((b, i) => {
      if (b.type !== 'bleed' || !pl.cuts[i]) return false;
      const P = pl.split && i > pl.split.block ? p2! : p1;
      return Math.abs(mulMV(P.R, pl.cuts[i].start.t)[2]) < Math.cos(rad(3));
    });
  };
  const t = tilted(spec, plan);
  if (!t.some(Boolean)) return;
  let fixes: Fix[] = [];
  if (!plan.split && spec.b.type !== 'nozzle' && !(spec.b.type === 'device' && spec.b.device.mode === 'flange')) {
    const other: FreeSpec = { ...spec, bed: spec.bed === 'A' ? 'B' : 'A' };
    const po = planRaw(other, { delta: 0, eps: 0 });
    if (!po.issues.some((x) => x.level === 'error') && !tilted(other, po).some(Boolean))
      fixes = [{ label: `${other.bed === 'A' ? 'Anschluss A' : 'Ende B'} nach unten legen`, fields: [], set: (sp) => void (sp.bed = other.bed) }];
  }
  t.forEach((x, i) => {
    if (x)
      plan.issues.push({
        level: 'error',
        text: `Nebenluft (Baustein ${i + 1}): Der Nebenluft-Regler steht beim Drucken schräg. Sein Drehring wird mitgedruckt und braucht ein senkrechtes Rohr; schräg hinge er über, und Stützen würden ihn im Spalt festschweißen. Ihn in ein gerades Stück setzen, das beim Drucken senkrecht steht (z. B. direkt an das Ende, das unten liegt)${fixes.length ? ', oder das andere Ende nach unten legen' : ''}.`,
        fixes,
      });
  });
}

function planFreeRaw(spec: FreeSpec): FreePlan {
  const p0 = planRaw(spec, { delta: 0, eps: 0 });
  if (!p0.split || p0.issues.some((x) => x.level === 'error')) return p0;
  const up = (pl: Placement, v: V3) => mulMV(pl.R, v)[2];
  const zOf = (pl: Placement, v: V3) => add(mulMV(pl.R, v), pl.tr)[2];
  const { p1, p2 } = partPlacements(spec, p0);
  const n1 = up(p1, p0.split.t), n2 = up(p2!, p0.split.t);
  if (n1 < 0.999 || n2 > -0.999) {
    p0.issues.push({
      level: 'warn',
      text: `Schieber (Baustein ${p0.split.block + 1}): Die Trennfläche liegt beim Druck nicht waagerecht oben. Beide Teile stehen auf ihren Enden (A und B); liegt dazwischen ein Bogen, steht das Gehäuse schräg, die Dichtlippen werden ungenau und es braucht eventuell Stützen. Den Schieber besser in ein gerades Stück direkt an einem Ende setzen.`,
    });
    return p0;
  }
  const L = GATE_LAYER;
  const z1 = zOf(p1, p0.split.floor);
  const delta = (Math.round(z1 / L) * L - z1) / n1;
  const pa = planRaw(spec, { delta, eps: 0 });
  const q = partPlacements(spec, pa);
  const z2 = zOf(q.p2!, pa.split!.lid);
  const eps = (Math.ceil(z2 / L - 1e-6) * L - z2) / -n2;
  return planRaw(spec, { delta, eps });
}

function planRaw(spec: FreeSpec, adj: GateAdj): FreePlan {
  const issues: Issue[] = [];
  const bodies: FreeBody[] = [];
  const w = spec.wall;
  const wallFix = (v: number) => [fixTo('Wandstärke', 'Wandstärke der Bausteine', v, (sp, x) => void (sp.wall = x))];
  if (!(w >= 1.6)) issues.push({ level: 'error', text: 'Die Wandstärke muss mindestens 1,6 mm sein.', fixes: wallFix(1.6) });
  if (w > 8) issues.push({ level: 'warn', text: 'Über 8 mm Wandstärke wird der Adapter sehr schwer.', fixes: wallFix(8) });

  const zStart = -OSVAC_HEIGHT[spec.a.type] - OSVAC_TRANSITION;
  let f: Frame = { o: [0, 0, zStart], t: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] };
  let s: Section = sec('circle', { d: spec.a.d });
  let rotS = 0;
  const path: V3[] = [[0, 0, 0], f.o];
  const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');

  const cuts: FreePlan['cuts'] = [];
  const loose: LooseBody[] = [];
  const startFrame = f;
  /** Abzweig: Anfang von Ende C */
  type BranchStart = { frame: Frame; section: Section; rot: number; n: V3 };
  let branch = null as BranchStart | null;
  let branchIdx = -1;
  type GateAt = { block: number; body: number; floor: V3; lid: V3; t: V3; path: number; screw: number; screwN: number };
  let gateAt = null as GateAt | null;
  spec.blocks.forEach((b, idx) => {
    const name = `Formstück ${idx + 1} · ${BLOCK_LABELS[b.type]}`;
    const what = `${BLOCK_LABELS[b.type]} (Baustein ${idx + 1})`;
    const blk = blockById(b.id);
    const start = f, s0 = s, rot0 = rotS;
    cuts[idx] = { start, n: null };
    const inner0 = s0, outer0 = grow(s0, w);
    const base = { kind: 'free', f: frameKey(start), s: secKey(s0), rot: r6(rot0), w };
    if (b.type === 'straight') {
      if (!(b.length > 0.5)) {
        issues.push({ level: 'error', text: `${what}: Die Länge muss größer als 0,5 mm sein.`, fixes: [fixTo('Länge', 'Länge der Geraden', 1, (sp, x) => void (blk(sp).length = x))] });
        return;
      }
      bodies.push({ name, cost: 0.3, dep: { ...base, t: 'straight', L: b.length }, make: () => extrudeRing(start, inner0, outer0, rot0, b.length) });
      f = advance(f, b.length);
      path.push(f.o);
    } else if (b.type === 'bend') {
      const D = inPlane(f, b.dir);
      cuts[idx].n = unit(cross(f.t, D));
      const need = extent(outer0, rot0, b.dir) + 0.5;
      if (!(b.angle > 0 && b.angle <= 180)) {
        const a = b.angle > 180 ? 180 : 1;
        issues.push({ level: 'error', text: `${what}: Der Winkel muss zwischen 1° und 180° liegen.`, fixes: [fixTo('Winkel', 'Winkel des Bogens', a, (sp, x) => void (blk(sp).angle = x), '°')] });
        return;
      }
      if (!(b.radius > need)) {
        issues.push({ level: 'error', text: `${what}: Der Radius ist zu klein. Er muss größer als ${f1(need)} mm sein, sonst überschneidet sich der Bogen innen.`, fixes: [fixTo('Radius', 'Radius des Bogens', upHalf(need + 0.5), (sp, x) => void (blk(sp).radius = x))] });
        return;
      }
      if (b.radius < need + w * 2)
        issues.push({ level: 'warn', text: `${what}: Sehr enger Bogen. Er bremst die Luft und braucht beim Druck meist Stützen. Ein Radius ab ${f1(upHalf(need + w * 2))} mm hilft.`, fixes: [fixTo('Radius', 'Radius des Bogens', upHalf(need + w * 2), (sp, x) => void (blk(sp).radius = x))] });
      const axis = unit(cross(f.t, D));
      const c = add(f.o, mul(D, b.radius));
      const th = rad(b.angle);
      bodies.push({
        name,
        cost: 0.5,
        dep: { ...base, t: 'bend', a: b.angle, R: b.radius, dir: b.dir },
        make: () => revolution(ringFace(start, inner0, outer0, rot0), c as Point, axis as Point, b.angle) as Shape3D,
      });
      for (let k = 1; k <= 6; k++) path.push(rotFrame(start, c, axis, (th * k) / 6).o);
      f = rotFrame(f, c, axis, th);
    } else if (b.type === 'branch') {
      if (branch) {
        issues.push({ level: 'error', text: `${what}: Es geht nur ein Abzweig je Adapter. Bitte einen der beiden entfernen.` });
        return;
      }
      if (s0.shape !== 'circle') {
        issues.push({ level: 'error', text: `${what}: Vor dem Abzweig muss das Rohr rund sein. Bitte davor einen Übergang auf „Kreis“ einfügen.` });
        return;
      }
      if (!(b.angle >= 30 && b.angle <= 90)) {
        issues.push({ level: 'error', text: `${what}: Der Winkel muss zwischen 30° und 90° liegen.`, fixes: [fixTo('Winkel', 'Winkel des Abzweigs', b.angle > 90 ? 90 : 30, (sp, x) => void (blk(sp).angle = x), '°')] });
        return;
      }
      const bd = b.branchD;
      const bdFix = (v: number) => [fixTo('Ø des Abzweigs', 'Innendurchmesser des Abzweigs', v, (sp, x) => void (blk(sp).branchD = x))];
      if (!(bd >= 10)) {
        issues.push({ level: 'error', text: `${what}: Der Abzweig muss innen mindestens 10 mm weit sein.`, fixes: bdFix(10) });
        return;
      }
      if (bd > s0.d + 1e-9) {
        issues.push({ level: 'error', text: `${what}: Der Abzweig darf innen höchstens so weit sein wie das Rohr (${f1(s0.d)} mm).`, fixes: bdFix(s0.d) });
        return;
      }
      const sweep = b.sweep && b.angle >= SWEEP_FROM;
      // gebogen: erst unter 45° aus dem Rohr, dann im Bogen weiter; sonst gerade unter dem eingestellten Winkel
      const a0 = sweep ? SWEEP_ENTRY : b.angle;
      const g = branchGeom(s0.d, bd, w, a0);
      const L = b.length;
      if (!(L >= g.minLen - 1e-9)) {
        issues.push({ level: 'error', text: `${what}: Das Rohr muss mindestens ${f1(upHalf(g.minLen))} mm lang sein, damit der Abzweig ganz darauf sitzt.`, fixes: [fixTo('Länge', 'Länge am Abzweig', upHalf(g.minLen), (sp, x) => void (blk(sp).length = x))] });
        return;
      }
      if (!(b.branchLen >= 3)) {
        issues.push({ level: 'error', text: `${what}: Der Abzweig muss mindestens 3 mm über das Rohr hinausragen.`, fixes: [fixTo('Länge des Abzweigs', 'Länge des Abzweigs', 3, (sp, x) => void (blk(sp).branchLen = x))] });
        return;
      }
      // Strömung: steile gerade Abzweige bremsen die Luft (Hinweis mit Vorschlägen)
      if (!sweep && b.angle >= 60)
        issues.push({
          level: 'warn',
          text: `${what}: Bei ${f1(b.angle)}° prallt die Luft aus dem Abzweig quer auf den Hauptstrom und wird stark gebremst. Ein flacherer Winkel oder ein gebogener Abzweig saugt besser.`,
          fixes: [fixTo('Winkel', 'Winkel des Abzweigs', 45, (sp, x) => void (blk(sp).angle = x), '°'), { label: 'Gebogenen Abzweig einschalten', fields: [], set: (sp) => void (blk(sp).sweep = true) }],
        });
      const D = inPlane(f, b.dir);
      const axis = unit(cross(f.t, D));
      cuts[idx].n = axis;
      const th0 = rad(a0);
      const e = rot(start.t, axis, th0);
      // Schnittpunkt der Achsen so, dass der Abzweig mittig auf dem Rohr sitzt
      const xb = (L - (g.tMax - g.tMin)) / 2 - g.tMin;
      const P = add(start.o, mul(start.t, xb));
      // gerades Stück ab der Achse: gebogen nur bis knapp außerhalb des Rohrs, sonst mit der eingestellten Länge
      const Lb = g.out + (sweep ? 2 : b.branchLen);
      const Ro = s0.d / 2 + w, Ri = s0.d / 2, rbo = bd / 2 + w, rbi = bd / 2;
      const note = `${what}: Die Kante, an der der Abzweig ins Rohr mündet, ließ sich bei diesen Maßen nicht ausrunden und bleibt scharf. Der Adapter funktioniert trotzdem; ein etwas anderer Ø oder Winkel hilft.`;
      bodies.push({
        name,
        cost: 1.5,
        dep: { ...base, t: 'branch', L: r6(L), a: r6(a0), dir: r6(b.dir), bd: r6(bd), Lb: r6(Lb), fillet: 1 },
        make: () => {
          // Rohr und Abzweig außen vereinigen, dann beide Bohrungen herausschneiden (jeweils mit Gegenprobe)
          const vMain = Math.PI * (Ro * Ro - Ri * Ri) * L;
          let body = (makeCylinder(Ro, L, start.o as Point, start.t as Point) as unknown as Shape3D).fuse(makeCylinder(rbo, Lb, P as Point, e as Point) as unknown as Shape3D);
          body = body.cut(makeCylinder(Ri, L + 2, add(start.o, mul(start.t, -1)) as Point, start.t as Point) as unknown as Shape3D);
          // Gleich weite Bohrungen berühren sich in einem Punkt; dort scheitert die Ausrundung. Dann wird die Bohrung des
          // Abzweigs zur Mündung hin um 0,3 mm im Radius enger (auf der ganzen Länge verteilt, also ohne Stufe).
          const del = Math.max(0, rbi - (Ri - 0.3));
          const ring = (x: number, r: number) => assembleWire([makeCircle(r, add(P, mul(e, x)) as Point, e as Point)]);
          body = body.cut(del > 0 ? (loft([ring(0, rbi - del), ring(Lb + 1, rbi)], { ruled: true }) as unknown as Shape3D) : (makeCylinder(rbi, Lb + 1, P as Point, e as Point) as unknown as Shape3D));
          const v = measureVolume(body);
          if (!(v > vMain * 0.98 && v < vMain + Math.PI * (rbo * rbo - rbi * rbi) * Lb)) throw new UserError(`${partLabel(name)} ließ sich mit diesen Maßen nicht berechnen. Bitte Winkel oder Länge etwas ändern.`);
          // Innenkante an der Einmündung ausrunden (weniger Ablösung der Strömung); gelingt es nicht, bleibt sie scharf
          const onBoth = (q: V3) => {
            const rMain = len(sub(sub(q, start.o), mul(start.t, dot(sub(q, start.o), start.t))));
            const qb = sub(q, P);
            const sB = dot(qb, e);
            const rB = len(sub(qb, mul(e, sB)));
            return Math.abs(rMain - Ri) < 0.05 && Math.abs(rB - (rbi - del * (1 - sB / (Lb + 1)))) < 0.05;
          };
          for (const R of [2, 1.5, 1].filter((r) => r <= Math.min(w, rbi / 3) + 1e-9)) {
            try {
              const fl = body.fillet((edge) => ([0.2, 0.5, 0.8].every((u) => { const q = edge.pointAt(u); return onBoth([q.x, q.y, q.z]); }) ? R : null));
              const vf = measureVolume(fl);
              if (validShape(fl) && vf < v && vf > v * 0.9) return fl;
            } catch {
              /* nächster, kleinerer Radius */
            }
          }
          partNotes.push(note);
          return body;
        },
      });
      let fc: Frame = { o: add(P, mul(e, Lb)), t: e, u: rot(start.u, axis, th0), v: rot(start.v, axis, th0) };
      const inner = sec('circle', { d: bd }), outer = sec('circle', { d: bd + 2 * w });
      if (sweep) {
        // Bogen in der Ebene von Rohr und Abzweig, weiter vom Rohr weg; Radius 1,5 × Ø (Mittellinie), danach gerades Stück
        const th = rad(b.angle - a0);
        const Rb = Math.max(1.5 * bd, rbo + 2);
        const Dn = rot(D, axis, th0);
        const c = add(fc.o, mul(Dn, Rb));
        const f0 = fc;
        bodies.push({
          name: `${name} · Bogen`,
          cost: 0.5,
          dep: { kind: 'free', t: 'branchBend', f: frameKey(f0), d: r6(bd), w, a: r6(b.angle - a0), R: r6(Rb) },
          make: () => revolution(ringFace(f0, inner, outer, 0), c as Point, axis as Point, b.angle - a0) as Shape3D,
        });
        fc = rotFrame(f0, c, axis, th);
        const f2 = fc;
        bodies.push({
          name: `${name} · Gerade`,
          cost: 0.3,
          dep: { kind: 'free', t: 'branchStraight', f: frameKey(f2), d: r6(bd), w, L: r6(b.branchLen) },
          make: () => extrudeRing(f2, inner, outer, 0, b.branchLen),
        });
        fc = advance(f2, b.branchLen);
        // Bogen darf das Rohr nicht berühren
        for (let k = 0; k <= 8; k++) {
          const q = rotFrame(f0, c, axis, (th * k) / 8).o;
          const r = len(sub(sub(q, start.o), mul(start.t, dot(sub(q, start.o), start.t))));
          // nächster Punkt des schräg stehenden Querschnitts zur Rohrachse
          if (r - rbo * Math.abs(Math.cos(th0 + (th * k) / 8)) < Ro + 0.3) {
            issues.push({ level: 'error', text: `${what}: Der Bogen des Abzweigs stößt ans Rohr. Bitte einen kleineren Ø für den Abzweig wählen oder den gebogenen Abzweig ausschalten.` });
            return;
          }
        }
      }
      branch = { frame: fc, section: inner, rot: 0, n: axis };
      branchIdx = idx;
      f = advance(start, L);
      path.push(f.o);
    } else if (b.type === 'bleed') {
      if (s0.shape !== 'circle') {
        issues.push({ level: 'error', text: `${what}: Vor dem Nebenluft-Regler muss das Rohr rund sein. Bitte davor einen Übergang auf „Kreis“ einfügen.` });
        return;
      }
      const gap = bleedGapOf(spec);
      const D = bleedDims(s0.d / 2, s0.d / 2 + w, gap);
      const L = b.length;
      if (!(L >= D.minLen - 1e-9)) {
        issues.push({ level: 'error', text: `${what}: Der Nebenluft-Regler muss mindestens ${f1(upHalf(D.minLen))} mm lang sein, sonst passen Ring und Bunde nicht aufs Rohr.`, fixes: [fixTo('Länge', 'Länge des Nebenluft-Reglers', upHalf(D.minLen), (sp, x) => void (blk(sp).length = x))] });
        return;
      }
      const pl = localPlacement(start.o, inPlane(start, rot0), start.t);
      const dg = { ...base, t: 'bleed', L: r6(L), gap };
      bodies.push({ name, cost: 0.8, dep: { ...dg, h: 'body' }, make: () => placeShape(bleedBody(D, L), pl) });
      bodies.push({ name: `${name} · Drehring`, cost: 0.8, dep: { ...dg, h: 'ring' }, make: () => placeShape(bleedRing(D), pl) });
      f = advance(start, L);
      path.push(f.o);
    } else if (b.type === 'gate') {
      if (gateAt) {
        issues.push({ level: 'error', text: `${what}: Es geht nur ein Schieber je Adapter (der Adapter wird am Schieber in zwei Teile geteilt). Bitte einen der beiden entfernen.` });
        return;
      }
      if (s0.shape !== 'circle') {
        issues.push({ level: 'error', text: `${what}: Vor dem Schieber muss das Rohr rund sein. Bitte davor einen Übergang auf „Kreis“ einfügen.` });
        return;
      }
      const gap = snapPlateGap(spec.gateGap ?? GATE_GAP);
      const td = tubeGateDims(s0.d / 2, s0.d / 2 + w, gap);
      const L = b.length;
      if (!(L >= td.minLen - 1e-9)) {
        issues.push({ level: 'error', text: `${what}: Der Schieber muss mindestens ${f1(upHalf(td.minLen))} mm lang sein, sonst passt das Gehäuse mit seinen Schrägen nicht aufs Rohr.`, fixes: [fixTo('Länge', 'Länge des Schiebers', upHalf(td.minLen), (sp, x) => void (blk(sp).length = x))] });
        return;
      }
      // Gehäuse im eigenen System bauen (Achse +z, Platte gleitet entlang +x = Richtung) und an den Anfang des Bausteins
      // legen; Boden mittig (plus delta fürs Schichtraster), das Rohr hinter dem Deckel um eps länger
      const Le = L + adj.eps;
      const zF = L / 2 - td.g.ch / 2 + adj.delta;
      const pl = localPlacement(start.o, inPlane(start, b.dir), start.t);
      const dg = { ...base, t: 'gate2', L: r6(Le), zF: r6(zF), dir: r6(b.dir), gap };
      bodies.push({ name: `${name} unten`, cost: 1.5, dep: { ...dg, h: 'lo' }, make: () => placeShape(tubeGateLower(td, zF), pl) });
      const floor = add(start.o, mul(start.t, zF)), lid = add(start.o, mul(start.t, zF + td.g.ch));
      path.push(floor);
      gateAt = { block: idx, body: bodies.length, floor, lid, t: start.t, path: path.length, screw: tubeGateScrew(td), screwN: gateScrewCount(td.g) };
      bodies.push({ name: `${name} oben`, cost: 1.2, dep: { ...dg, h: 'up' }, make: () => placeShape(tubeGateUpper(td, zF, Le), pl) });
      path.push(lid);
      loose.push({ name: `Schieberplatte ${idx + 1}`, cost: 0.3, dep: { kind: 'free', t: 'gate2Plate', d: r6(s0.d), w, gap }, make: () => gateSlider(td.g), x0: td.g.x0, x1: td.g.x1, hw: td.g.hw });
      f = advance(start, Le);
      path.push(f.o);
        } else {
      const s1 = b.section;
      checkSection(s1, what, issues, { label: b.type === 'step' ? 'Form nach dem Absatz' : 'Form am Ende', get: (sp) => blk(sp).section });
      if (issues.some((x) => x.level === 'error' && x.text.startsWith(what))) return;
      const twist = b.type === 'transition' ? b.twist : 0;
      const rot1 = rot0 + twist;
      const N = nFor(outer0, grow(s1, w));
      const pi0 = samplePoints(inner0, N, rot0), po0 = samplePoints(outer0, N, rot0);
      const pi1 = samplePoints(s1, N, rot0), po1 = samplePoints(grow(s1, w), N, rot0);
      let L: number, offset = 0, tilt = 0;
      if (b.type === 'step') {
        // 45°: Länge = größte Verschiebung eines Konturpunkts
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(pi1[i][0] - pi0[i][0], pi1[i][1] - pi0[i][1]), Math.hypot(po1[i][0] - po0[i][0], po1[i][1] - po0[i][1]));
        if (m < 0.05) {
          issues.push({ level: 'warn', text: `${what}: Die Form ändert sich nicht, der Absatz hat keine Wirkung.` });
          return;
        }
        L = Math.max(1, m);
      } else {
        L = b.length;
        offset = b.offset;
        tilt = b.tilt;
        const lenFix = (v: number) => [fixTo('Länge', 'Länge des Übergangs', v, (sp, x) => void (blk(sp).length = x))];
        if (!(L >= 2)) {
          issues.push({ level: 'error', text: `${what}: Die Länge muss mindestens 2 mm betragen.`, fixes: lenFix(2) });
          return;
        }
        if (Math.abs(tilt) > 90) {
          issues.push({ level: 'error', text: `${what}: Der Knick darf höchstens 90° sein. Für mehr einen Bogen verwenden.`, fixes: [fixTo('Knick', 'Knick des Endes', Math.sign(tilt) * 90, (sp, x) => void (blk(sp).tilt = x), '°')] });
          return;
        }
        if (Math.abs(offset) > L)
          issues.push({ level: 'warn', text: `${what}: Der Versatz ist größer als die Länge. Das wird sehr steil und druckt sich schlecht; den Übergang auf mindestens ${f1(upHalf(Math.abs(offset)))} mm verlängern.`, fixes: lenFix(upHalf(Math.abs(offset))) });
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(po1[i][0] - po0[i][0], po1[i][1] - po0[i][1]));
        if (m > L * 1.2) issues.push({ level: 'warn', text: `${what}: Die Schräge ist sehr steil. Den Übergang auf mindestens ${f1(upHalf(m / 1.2))} mm verlängern, dann geht der Druck ohne Stützen.`, fixes: lenFix(upHalf(m / 1.2)) });
      }
      // Mittellinie: kubische Kurve von der Startfläche zur versetzten, geknickten Endfläche
      const D = inPlane(start, b.dir);
      const curved = Math.abs(offset) > 1e-6 || Math.abs(tilt) > 1e-6;
      const axis = unit(cross(start.t, D));
      if (curved) cuts[idx].n = axis;
      const t1 = curved ? rot(start.t, axis, rad(tilt)) : start.t;
      const P0 = start.o, P3 = add(add(start.o, mul(start.t, L)), mul(D, offset));
      const P1 = add(P0, mul(start.t, L / 3)), P2 = sub(P3, mul(t1, L / 3));
      const bez = (tt: number): V3 => {
        const m = 1 - tt;
        return add(add(mul(P0, m * m * m), mul(P1, 3 * m * m * tt)), add(mul(P2, 3 * m * tt * tt), mul(P3, tt * tt * tt)));
      };
      const dbez = (tt: number): V3 => {
        const m = 1 - tt;
        return add(add(mul(sub(P1, P0), 3 * m * m), mul(sub(P2, P1), 6 * m * tt)), mul(sub(P3, P2), 3 * tt * tt));
      };
      if (curved) {
        // Innen am Bogen der Mittellinie darf die Wand sich nicht überschneiden: der Krümmungsradius muss überall
        // größer sein als die Ausdehnung der Außenkontur zur Krümmungsmitte hin (sonst faltet sich die Fläche)
        const folds = (Lx: number) => {
          const Q3 = add(add(start.o, mul(start.t, Lx)), mul(D, offset));
          const Q1 = add(P0, mul(start.t, Lx / 3)), Q2 = sub(Q3, mul(t1, Lx / 3));
          const at = (tt: number) => {
            const m = 1 - tt;
            const o = add(add(mul(P0, m * m * m), mul(Q1, 3 * m * m * tt)), add(mul(Q2, 3 * m * tt * tt), mul(Q3, tt * tt * tt)));
            const T = unit(add(add(mul(sub(Q1, P0), 3 * m * m), mul(sub(Q2, Q1), 6 * m * tt)), mul(sub(Q3, Q2), 3 * tt * tt)));
            const phi = Math.atan2(dot(cross(start.t, T), axis), dot(start.t, T));
            const sm = tt * tt * (3 - 2 * tt);
            return { o, T, u: rot(start.u, axis, phi), v: rot(start.v, axis, phi), m: sm };
          };
          // je zwei benachbarte Schnitte (wie im Loft): jeder Punkt der Außenkontur muss vom einen zum nächsten Schnitt
          // vorwärts laufen. Läuft er rückwärts, ist die Bahn innen kürzer als null: die Wand faltet sich dort
          const S = Array.from({ length: 9 }, (_, k) => at(k / 8));
          const pt = (X: ReturnType<typeof at>, i: number): V3 => {
            const q = rot2([po0[i][0] + (po1[i][0] - po0[i][0]) * X.m, po0[i][1] + (po1[i][1] - po0[i][1]) * X.m], twist * X.m);
            return add(X.o, add(mul(X.u, q[0]), mul(X.v, q[1])));
          };
          for (let k = 0; k < 8; k++) {
            const a = S[k], c = S[k + 1], T = unit(add(a.T, c.T));
            const step = len(sub(c.o, a.o));
            for (let i = 0; i < N; i += 2) if (dot(sub(pt(c, i), pt(a, i)), T) < 0.05 * step) return true;
          }
          return false;
        };
        if (!testHooks.noFoldCheck && folds(L)) {
          let need = Math.ceil(L);
          while (need < 600 && folds(need)) need += 1;
          issues.push({
            level: 'error',
            text: `${what}: Der Übergang ist zu stark gebogen, innen würde sich die Wand überschneiden. Den Übergang länger machen${need < 600 ? ` (mindestens ${f1(need)} mm)` : ''} oder Versatz bzw. Knick verringern.`,
            fixes: need < 600 ? [fixTo('Länge', 'Länge des Übergangs', need, (sp, x) => void (blk(sp).length = x))] : undefined,
          });
          return;
        }
      }
      const K = curved ? 9 : Math.abs(twist) > 1e-6 ? 2 + Math.ceil(Math.abs(twist) / 20) : 2;
      const frames: Frame[] = [], inner: P2[][] = [], outer: P2[][] = [];
      const lerp = (a: P2[], c: P2[], m: number, rr: number) => a.map((p, i) => rot2([p[0] + (c[i][0] - p[0]) * m, p[1] + (c[i][1] - p[1]) * m], rr));
      for (let k = 0; k < K; k++) {
        const tt = k / (K - 1);
        const m = K > 2 ? tt * tt * (3 - 2 * tt) : tt;
        let fr: Frame;
        if (curved) {
          const T = unit(dbez(tt));
          const phi = Math.atan2(dot(cross(start.t, T), axis), dot(start.t, T));
          fr = { o: bez(tt), t: T, u: rot(start.u, axis, phi), v: rot(start.v, axis, phi) };
        } else fr = advance(start, L * tt);
        frames.push(fr);
        inner.push(lerp(pi0, pi1, m, twist * m));
        outer.push(lerp(po0, po1, m, twist * m));
        if (k > 0) path.push(fr.o);
      }
      bodies.push({
        name,
        cost: K > 2 ? 2 : 1,
        dep: { ...base, t: b.type, s1: secKey(s1), L: r6(L), off: offset, tilt, dir: b.dir, twist },
        make: () => hollowLoft(frames, inner, outer, K === 2, name),
      });
      f = frames[frames.length - 1];
      s = s1;
      rotS = rot1;
    }
  });

  const ga = gateAt as GateAt | null;
  // Kupplung auf ihrer Öffnung (Ende auf dem Bett): Hinweis „Stützen nötig“ steht unter „Was liegt unten?“ und in den Druckhinweisen
  const { chainEnd, end } = planEnd(spec, { frame: f, section: s, rot: rotS }, bodies, issues, path);
  const plan: FreePlan = { bodies, issues, chainEnd, end, path, cuts, startFrame, loose };
  const pathC0 = path.length;
  const br = branch as BranchStart | null;
  if (br) {
    // Ende C wie Ende B planen (gleicher Code mit spec.c an der Stelle von spec.b), Meldungen und Körper umbenennen
    const C = spec.c ?? defaultC(br.section.d);
    const iss: Issue[] = [], bod: FreeBody[] = [];
    const rc = planEnd({ ...spec, b: C, bed: 'B' }, br, bod, iss, path);
    const toC = (t: string) => t.replace(/^(Gerät|Ende B):/, 'Ende C:').replace(/Ende B/g, 'Ende C');
    for (const x of iss)
      issues.push({
        ...x,
        text: toC(x.text),
        fixes: x.fixes?.map((fx) => ({ label: toC(fx.label), fields: fx.fields.map(toC), set: (sp) => fx.set({ ...sp, b: (sp.c ??= defaultC(br.section.d)), bed: 'B' }) })),
      });
    for (const x of bod) bodies.push({ ...x, name: cName(x.name), part2: !!ga && branchIdx > ga.block });
    plan.cChainEnd = rc.chainEnd;
    plan.cEnd = rc.end;
    plan.cCut = br.n;
  }
  if (ga) {
    const cPart2 = !!br && branchIdx > ga.block;
    // Körper ab dem Deckel gehören zum B-Teil (Ende C wurde oben schon zugeordnet)
    bodies.forEach((x, i) => {
      if (i >= ga.body && x.part2 === undefined) x.part2 = true;
    });
    const pathPart2 = path.map((_, i) => (i >= pathC0 ? cPart2 : i >= ga.path));
    plan.split = { block: ga.block, floor: ga.floor, lid: ga.lid, t: ga.t, pathPart2, cPart2, screw: ga.screw, screwN: ga.screwN };
  }
  return plan;
}

/** Körper von Ende C: wie bei Ende B, aber eindeutig benannt */
const cName = (n: string) =>
  n === 'Übergang zu Ende B' ? 'Übergang zu Ende C' : n.startsWith('Geräteanschluss') ? n.replace(/^Geräteanschluss/, 'Geräteanschluss C') : `${n} C`;

/** Ende B (bzw. C mit spec.b = Ende C): Gerät oder Anschluss von osVAC neo hinter dem letzten Baustein */
function planEnd(spec: FreeSpec, ce: { frame: Frame; section: Section; rot: number }, bodies: FreeBody[], issues: Issue[], path: V3[]) {
  const w = spec.wall;
  const chainEnd = { ...ce };
  let end: Frame = ce.frame;
  if (spec.b.type === 'device') end = planDevice(spec, chainEnd, bodies, issues, path);
  else if (spec.b.type === 'nozzle') planNozzle(spec, chainEnd, bodies, issues);
  else {
    // osVAC neo: Querschnitt auf den Kreis des Anschlusses bringen, danach Übergangskonus und Anschluss
    const target = sec('circle', { d: spec.b.d });
    const s = ce.section, rotS = ce.rot;
    let fe = ce.frame;
    if (!sameSection(s, target) || Math.abs(rotS % 360) > 1e-9 && s.shape !== 'circle') {
      const L = spec.b.transition;
      if (!(L >= 2)) issues.push({ level: 'error', text: 'Ende B: Die Übergangslänge muss mindestens 2 mm betragen.', fixes: [fixTo('Übergangslänge', 'Übergangslänge zu Ende B', 2, (sp, x) => void (sp.b.transition = x))] });
      else {
        bodies.push(autoTransition('Übergang zu Ende B', fe, s, rotS, target, 0, L, w, { b: spec.b.d }));
        fe = advance(fe, L);
        path.push(fe.o);
      }
    }
    end = advance(fe, OSVAC_TRANSITION + OSVAC_HEIGHT[spec.b.type as OsvacEnd]);
    path.push(end.o);
    chainEnd.frame = fe;
    chainEnd.section = target;
    chainEnd.rot = 0;
  }
  return { chainEnd, end };
}

/**
 * Maße der Düsenspitze aus dem letzten Querschnitt (rein rechnerisch, auch für das Düsen-Formular):
 * rim = Randdicke (Wand + Ring), slant = wie weit die Schräge längs der Mittellinie reicht, ringH = Höhe des Rings,
 * need = so lang muss das letzte gerade Stück mindestens sein (Ring und Fenster sitzen darauf; 0 = egal).
 */
export function tipGeom(s: Section, rotDeg: number, w: number, tip: NozzleTip) {
  const N = NOZZLE;
  const thick = tip.ring || tip.brush;
  const rim = thick ? Math.max(w + N.ringE, tip.brush ? 2 * N.brushLip + N.brushW : 0) : w;
  const outer = grow(s, rim);
  const th = rad(Math.min(Math.max(tip.angle, 0), N.maxAngle));
  const dirDeg = rotDeg + tip.dir;
  const ePlus = extent(outer, rotDeg, dirDeg), eMinus = extent(outer, rotDeg, dirDeg + 180);
  const slant = (ePlus + eMinus) * Math.tan(th);
  const ringH = thick ? (tip.brush ? N.brushH : N.ringH) : 0;
  const need = thick ? slant + ringH + 1 : 0;
  return { rim, outer, th, dirDeg, ePlus, slant, ringH, need, thick };
}

/**
 * Düsenspitze: Kette endet offen. Die Formstücke werden an der (schrägen) Spitzenebene abgeschnitten, dazu kommen
 * Schutzring/Rand für die Bürstennut (eigener Körper „Düsenrand“).
 */
function planNozzle(spec: FreeSpec, ce: { frame: Frame; section: Section; rot: number }, bodies: FreeBody[], issues: Issue[]) {
  const tip: NozzleTip = { ...DEFAULT_TIP, ...spec.b.tip };
  const N = NOZZLE;
  const w = spec.wall;
  const tipFix = (v: number) => [fixTo('Schräge', 'Schräge der Spitze', v, (sp, x) => void (sp.b.tip = { ...DEFAULT_TIP, ...sp.b.tip, angle: x }), '°')];
  if (!(tip.angle >= 0)) return void issues.push({ level: 'error', text: 'Düse: Die Schräge der Spitze darf nicht negativ sein.', fixes: tipFix(0) });
  if (tip.angle > N.maxAngle) return void issues.push({ level: 'error', text: `Düse: Die Schräge der Spitze darf höchstens ${N.maxAngle}° betragen, sonst wird die Spitze sehr lang und spitz.`, fixes: tipFix(N.maxAngle) });
  if (spec.bed !== 'A') issues.push({ level: 'error', text: 'Düse: Beim Drucken steht Anschluss A auf dem Bett, die Spitze zeigt nach oben.', fixes: [{ label: 'Anschluss A nach unten legen', fields: [], set: (sp) => void (sp.bed = 'A') }] });
  if (hasSplit(spec)) return void issues.push({ level: 'error', text: 'Düse: Mit Schieber geht keine Düsenspitze. Den Schieber entfernen oder an Ende B einen Anschluss wählen.' });
  if (spec.blocks.some((b) => b.type === 'branch')) return void issues.push({ level: 'error', text: 'Düse: Mit Abzweig geht keine Düsenspitze. Den Abzweig entfernen oder an Ende B einen Anschluss wählen.' });
  const s = ce.section, rot = ce.rot, f = ce.frame;
  const g = tipGeom(s, rot, w, tip);
  const last = spec.blocks[spec.blocks.length - 1];
  if (g.need > 0 && !(last?.type === 'straight' && last.length >= g.need - 1e-6)) {
    const L = Math.ceil(g.need);
    const what = tip.brush ? 'Rand mit Bürstennut' : 'Schutzring';
    const fix: Fix =
      last?.type === 'straight'
        ? fixTo('Länge', 'Länge der Geraden', L, (sp, x) => void (blockById(last.id)(sp).length = x))
        : { label: `Gerade mit ${L} mm anhängen`, fields: [], set: (sp) => void sp.blocks.push(newBlock('straight', { length: L })) };
    issues.push({ level: 'error', text: `Düse: ${what} braucht am Ende ein gerades Stück von mindestens ${fmtV(L)} mm Länge.`, fixes: [fix] });
    return;
  }
  if (issues.some((x) => x.level === 'error')) return;

  const across = inPlane(f, g.dirDeg);
  const n = add(mul(f.t, Math.cos(g.th)), mul(across, -Math.sin(g.th)));
  const P0 = add(f.o, mul(across, g.ePlus));
  const xd = unit(Math.abs(dot(n, f.u)) < 0.9 ? sub(f.u, mul(n, dot(n, f.u))) : sub(f.v, mul(n, dot(n, f.v))));
  const BIG = 1000;
  /** Platte in der Spitzenebene: z (entlang n) von z0 bis z1 */
  const slab = (z0: number, z1: number) => placeShape(makeBox([-BIG, -BIG, z0], [BIG, BIG, z1]) as Shape3D, localPlacement(P0, xd, n));
  const back = g.slant + g.ringH + 1;
  const prism = (r0: number, r1: number) => extrudeRing(advance(f, -back), grow(s, r0), grow(s, r1), rot, back + 1);
  const gi = (g.rim - N.brushW) / 2;
  const groove = () => prism(gi, gi + N.brushW).intersect(slab(-N.brushDepth * Math.cos(g.th), 1)) as Shape3D;
  const zone = g.slant + g.ringH + 5;
  const tipKey = { ...tip, angle: r6(tip.angle), dir: r6(tip.dir), w };
  for (const b of bodies) {
    const m0 = b.make;
    b.dep = { ...(b.dep as object), tip: tipKey };
    b.cost += 0.3;
    b.make = () => {
      let sh = m0();
      const [lo, hi] = sh.boundingBox.bounds;
      const corners: V3[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
      if (Math.max(...corners.map((c) => dot(sub(c, f.o), f.t))) < -zone) return sh;
      if (Math.max(...corners.map((c) => dot(sub(c, P0), n))) > 1e-6) sh = sh.cut(slab(0, BIG)) as Shape3D;
      if (tip.brush) sh = sh.cut(groove()) as Shape3D;
      return sh;
    };
  }
  if (g.thick) {
    // Rand in Stufen (je höchstens 0,6 mm, 45° zur Mittellinie), innen 0,3 mm in der Wand, damit der Slicer die
    // Körper verbindet. Unterkanten quer zur Mittellinie (nicht schräg wie die Spitze, sonst hinge der Rand auf der
    // tiefen Seite steil über und finge frei in der Luft an). Bei schräger Spitze folgt der Rand ihr in Streifen
    // (je höchstens 1,5 mm Höhenunterschied), so ist er überall etwa gleich hoch.
    const eR = g.rim - w;
    const K = Math.max(1, Math.ceil(eR / 0.6 - 1e-9)), step = eR / K;
    const span = g.ePlus + extent(g.outer, rot, g.dirDeg + 180);
    const nb = g.th > 1e-6 ? Math.max(1, Math.ceil(g.slant / 1.5)) : 1;
    const xd2 = unit(cross(f.t, across));
    bodies.push({
      name: 'Düsenrand',
      cost: 0.6 + 0.05 * nb * K,
      dep: { kind: 'free', t: 'nozzleRim2', f: frameKey(f), s: secKey(s), rot: r6(rot), tip: tipKey },
      make: () => {
        const pieces: Shape3D[] = [];
        for (let j = 0; j < nb; j++) {
          // Streifen quer zur Schräge: across von x1 (hoch) bis x0 (tiefer); tiefste Stelle der Spitze im Streifen
          const x1 = g.ePlus - (span * j) / nb, x0 = g.ePlus - (span * (j + 1)) / nb;
          const dMax = (g.ePlus - x0) * Math.tan(g.th);
          // Streifen überlappen sich leicht, damit die Vereinigung sauber wird (keine gemeinsamen Flächen)
          const xa = j === 0 ? x1 + 50 : x1 + 0.05, xb = j === nb - 1 ? x0 - 50 : x0 - 0.05;
          for (let k = 1; k <= K; k++) {
            const B = dMax + g.ringH - (k - 1) * step;
            const ring = extrudeRing(advance(f, -B), grow(s, w - 0.3), grow(s, w + step * k), rot, B + 1);
            const band = placeShape(makeBox([xb, -BIG, -B], [xa, BIG, 1]) as Shape3D, localPlacement(f.o, across, unit(cross(across, xd2))));
            pieces.push(nb === 1 ? ring : (ring.intersect(band) as Shape3D));
          }
        }
        let sh = pieces[0];
        for (const q of pieces.slice(1)) sh = sh.fuse(q) as Shape3D;
        sh = sh.simplify() as Shape3D;
        sh = sh.intersect(slab(-BIG, 0)) as Shape3D;
        if (tip.brush) sh = sh.cut(groove()) as Shape3D;
        return sh;
      },
    });
  }
}

/** Gerader Loft zwischen zwei Querschnitten (für automatische Übergänge). */
function autoTransition(name: string, f: Frame, s0: Section, rot0: number, s1: Section, rot1: number, L: number, w: number, extra: object): FreeBody {
  const N = nFor(grow(s0, w), grow(s1, w));
  const inner = [samplePoints(s0, N, rot0), samplePoints(s1, N, rot1)];
  const outer = [samplePoints(grow(s0, w), N, rot0), samplePoints(grow(s1, w), N, rot1)];
  const frames = [f, advance(f, L)];
  return {
    name,
    cost: 1,
    dep: { kind: 'free', t: 'auto', f: frameKey(f), s0: secKey(s0), r0: r6(rot0), s1: secKey(s1), r1: r6(rot1), L, w, ...extra },
    make: () => hollowLoft(frames, inner, outer, true, name),
  };
}

/** Geräteanschluss: Übergang, (Anschlagring), Muffe/Zapfen, Einführfase. Gibt den Rahmen der offenen Endfläche zurück. */
function planDevice(spec: FreeSpec, ce: { frame: Frame; section: Section; rot: number }, bodies: FreeBody[], issues: Issue[], path: V3[]): Frame {
  const dv = spec.b.device;
  const w = spec.wall;
  if (dv.mode === 'flange') return planFlange(spec, ce, bodies, issues, path);
  const a = dv.allowance;
  const isCircle = dv.section.shape === 'circle';
  checkSection(dv.section, 'Gerät', issues, { label: dv.mode === 'over' ? 'Form des Stutzens' : 'Form der Öffnung', get: (sp) => sp.b.device.section, front: true });
  const depthFix = (v: number) => [fixTo('Tiefe', 'Steckweg', v, (sp, x) => void (sp.b.device.length = x))];
  if (!(dv.length >= 5)) issues.push({ level: 'error', text: 'Gerät: Die Tiefe muss mindestens 5 mm sein.', fixes: depthFix(5) });
  else if (dv.length < 10) issues.push({ level: 'warn', text: `Gerät: Unter 10 mm Tiefe hält der Adapter kaum ${dv.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}. Ab 10 mm hält er besser.`, fixes: depthFix(10) });
  if (!(a >= 0 && a <= 3)) issues.push({ level: 'error', text: 'Gerät: Die Luft (Zugabe) muss zwischen 0 und 3 mm liegen.', fixes: [fixTo('Luft (Zugabe)', 'Zugabe für den Sitz', a > 3 ? 3 : 0, (sp, x) => void (sp.b.device.allowance = x))] });
  if (isCircle && Math.abs(dv.dDepth - dv.section.d) > 8) issues.push({ level: 'warn', text: 'Gerät: Ø vorne und Ø in der Tiefe unterscheiden sich um mehr als 8 mm. Bitte die Messung prüfen.' });
  if (isCircle && dv.mode === 'over' && dv.dDepth < dv.section.d - 0.05)
    issues.push({ level: 'warn', text: 'Gerät: Hinten ist der Stutzen dünner als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht drauf. Bitte nachmessen.' });
  if (isCircle && dv.mode === 'into' && dv.dDepth > dv.section.d + 0.05)
    issues.push({ level: 'warn', text: 'Gerät: Innen ist die Öffnung weiter als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht hinein. Bitte nachmessen.' });
  if (issues.some((x) => x.level === 'error')) return ce.frame;

  // Querschnitte des Anschlusses vorne (zur Kette hin) und am offenen Ende
  const front = dv.section;
  const back = isCircle ? { ...front, d: dv.dDepth } : front;
  const ring = (dev: Section) => {
    if (dv.mode === 'over') {
      const inn = grow(dev, a);
      return { inn, out: grow(inn, w) };
    }
    const out = grow(dev, -a);
    return { inn: grow(out, -w), out };
  };
  const F = ring(front), B = ring(back);
  // eigene Kontur eingesteckt: Wand und Luft gehen nach innen, schmale Stellen (Nase, Schlitz) verschwinden dabei
  if (front.shape === 'contour' && dv.mode === 'into' && (front.pts?.length ?? 0) > 2) {
    const nl = narrowLoss(front.pts!, a + w);
    if (nl.pieces !== 1 || nl.loss > 0.02)
      issues.push({
        level: 'warn',
        text: `Gerät: Die Kontur hat Stellen, die schmaler sind als Wand und Luft zusammen (${fmtV(a + w)} mm)${nl.pieces > 1 ? '; innen zerfällt sie in mehrere Teile' : ''}. Dort füllt die Wand die Öffnung ganz aus, innen bleibt nur der breite Teil frei. Wenn möglich den Adapter über den Stutzen stecken oder die Wand dünner machen.`,
      });
  }
  if ((F.inn.shape === 'circle' ? F.inn.d : Math.min(F.inn.w, F.inn.h)) < 4)
    issues.push({ level: 'error', text: 'Gerät: Innen bleiben weniger als 4 mm frei. Maße, Luft oder Wandstärke prüfen.' });
  if (issues.some((x) => x.level === 'error')) return ce.frame;

  let f = ce.frame;
  const rot1 = dv.rot;
  const L0 = spec.b.transition;
  if (!sameSection(ce.section, F.inn) || Math.abs(ce.rot - rot1) > 1e-9) {
    const trFix = (v: number) => [fixTo('Übergangslänge', 'Übergangslänge zum Geräteanschluss', v, (sp, x) => void (sp.b.transition = x))];
    if (!(L0 >= 2)) {
      issues.push({ level: 'error', text: 'Gerät: Die Übergangslänge muss mindestens 2 mm betragen.', fixes: trFix(2) });
      return f;
    }
    let m = 0;
    const N = 120;
    const p0 = samplePoints(grow(ce.section, w), N, ce.rot), p1 = samplePoints(F.out, N, rot1);
    for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(p1[i][0] - p0[i][0], p1[i][1] - p0[i][1]));
    if (m > L0 * 1.2) issues.push({ level: 'warn', text: `Gerät: Die Schräge zum Gerät ist sehr steil (${Math.round(m)} mm auf ${Math.round(L0)} mm Länge). In den Feineinstellungen die Übergangslänge auf mindestens ${fmtV(upHalf(m / 1.2))} mm erhöhen, dann geht der Druck ohne Stützen.`, fixes: trFix(upHalf(m / 1.2)) });
    bodies.push(autoTransition('Übergang zum Gerät', f, ce.section, ce.rot, F.inn, rot1, L0, w, {}));
    f = advance(f, L0);
    path.push(f.o);
  }

  const base = { kind: 'free', t: 'device', f: frameKey(f), F: secKey(F.inn), Fo: secKey(F.out), B: secKey(B.inn), Bo: secKey(B.out), rot: r6(rot1) };
  if (dv.mode === 'into' && dv.collar) {
    const tc = 3, bw = 3;
    const fc = f;
    const out = grow(F.out, bw);
    bodies.push({ name: 'Anschlagring', cost: 0.3, dep: { ...base, part: 'collar', tc, bw }, make: () => extrudeRing(fc, F.inn, out, rot1, tc) });
    f = advance(f, tc);
  }
  const L = dv.length;
  const c = dv.chamfer ? Math.min(1, w * 0.4) : 0;
  const fb = f;
  const tapered = isCircle && Math.abs(dv.dDepth - front.d) > 1e-6;
  const Lm = L - c;
  // Querschnitt an der Stelle x (0 … L) – bei Konus linear
  const at = (x: number) => {
    const k = x / L;
    const mix = (p: Section, q: Section): Section => ({ ...p, d: p.d + (q.d - p.d) * k });
    return { inn: mix(F.inn, B.inn), out: mix(F.out, B.out) };
  };
  const label = dv.mode === 'over' ? 'Muffe' : 'Zapfen';
  const X = deviceExtras(spec, fb, front, back, w, a, rot1, L, c, issues);
  bodies.push({
    name: `Geräteanschluss · ${label}`,
    cost: (tapered ? 1 : 0.3) + (X.any ? 0.7 : 0),
    dep: { ...base, part: 'body', L: Lm, mode: dv.mode, x: X.key },
    make: () => {
      let body: Shape3D;
      if (!tapered) body = extrudeRing(fb, F.inn, F.out, rot1, Lm);
      else {
        const e = at(Lm);
        const N = nFor(F.out, e.out);
        body = hollowLoft([fb, advance(fb, Lm)], [samplePoints(F.inn, N), samplePoints(e.inn, N)], [samplePoints(F.out, N), samplePoints(e.out, N)], true, `Geräteanschluss · ${label}`);
      }
      return X.apply(body, true);
    },
  });
  if (c > 0) {
    const e0 = at(Lm), e1 = at(L);
    const inn1 = dv.mode === 'over' ? grow(e1.inn, c) : e1.inn;
    const out1 = dv.mode === 'into' ? grow(e1.out, -c) : e1.out;
    const N = nFor(e0.out, out1);
    const fc = advance(fb, Lm);
    bodies.push({
      name: 'Geräteanschluss · Einführfase',
      cost: 0.5,
      dep: { ...base, part: 'chamfer', L, c, mode: dv.mode, x: X.cutKey },
      // mit Schlitzen/Aussparung als Vieleck (die Fase ist nur wenige Millimeter lang, die Kanten sieht man nicht): Schnitte in Freiformflächen scheitern sonst bei eckigen Formen
      make: () => X.apply(hollowLoft([fc, advance(fc, c)], [samplePoints(e0.inn, N, rot1), samplePoints(inn1, N, rot1)], [samplePoints(e0.out, N, rot1), samplePoints(out1, N, rot1)], true, 'Geräteanschluss · Einführfase', X.cuts), false),
    });
  }
  if (X.ribs) bodies.push({ name: 'Geräteanschluss · Klemmrippen', cost: 0.5, dep: { ...base, part: 'ribs', L, mode: dv.mode, x: X.key }, make: X.ribs });
  f = advance(fb, L);
  path.push(f.o);
  return f;
}

// ---------------------------------------------------------------- Flansch

/** Nut für Dichtband: 2 mm Steg an der Öffnung, 1,5 mm tief; Breite wie das Band */
export const SEAL = { lip: 2, depth: 1.5, widths: [6, 9, 10] };
const sealWidth = (dv: Pick<DeviceEnd, 'sealW'>) => (SEAL.widths.includes(dv.sealW) ? dv.sealW : 6);
/** dreieckige Platte: Eckradius um das Loch (Senkung + Rand) */
const triEar = (holeD: number) => sinkR(holeD) + 4;

/** Loch für M4-Senkkopfschrauben */
export const AUTO_HOLE_D = 4.5;
/** Größter Abstand zweier Löcher beim automatischen Lochbild */
const HOLE_PITCH = 70;
/** Senkung 90° für Senkkopfschrauben (Kopf etwa 2 × Gewinde-Ø) */
const sinkR = (holeD: number) => Math.max(holeD / 2 + 1, holeD * 0.95);

function inPoly(q: P2, poly: P2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function polyDist(q: P2, poly: P2[]) {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2));
    m = Math.min(m, Math.hypot(q[0] - ax - k * dx, q[1] - ay - k * dy));
  }
  return m;
}

/**
 * Automatisches Lochbild auf der Kontur c: ein Loch in jeder Ecke (zwischen zwei geraden Seiten),
 * an langen Rundungen an deren Enden, dazwischen gleichmäßig aufgefüllt, höchstens HOLE_PITCH Abstand.
 * Runde Formen ohne gerade Seiten: gleichmäßig, mindestens 4.
 */
function autoHoles(c: Section, rotDeg: number, minGap: number): P2[] {
  const P = perimeter(c);
  const runs = flatRuns(c, rotDeg).filter((r) => r.len >= 10);
  let at: number[];
  if (!runs.length) {
    const n = Math.max(4, Math.ceil(P / HOLE_PITCH));
    at = Array.from({ length: n }, (_, k) => (k + 0.5) / n);
  } else {
    const anchors: number[] = [];
    runs.forEach((r, i) => {
      const nx = runs[(i + 1) % runs.length];
      const end = r.mid + r.len / (2 * P);
      let start = nx.mid - nx.len / (2 * P);
      while (start < end) start += 1;
      const gap = (start - end) * P;
      if (gap < 40) anchors.push(((end + start) / 2) % 1);
      else anchors.push(end % 1, start % 1);
    });
    anchors.sort((x, y) => x - y);
    at = [];
    anchors.forEach((f0, i) => {
      let f1 = i + 1 < anchors.length ? anchors[i + 1] : anchors[0] + 1;
      if (f1 <= f0) f1 += 1;
      const d = (f1 - f0) * P;
      const k = Math.max(1, Math.ceil(d / HOLE_PITCH - 1e-9));
      for (let j = 0; j < k; j++) at.push((f0 + ((f1 - f0) * j) / k) % 1);
    });
  }
  const pts = contourAt(c, rotDeg, at).map((x) => x.p);
  // zu dicht beieinander (kleine Öffnungen): überzählige weglassen
  const out: P2[] = [];
  for (const q of pts) if (out.every((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) >= minGap)) out.push(q);
  return out;
}

/** Kleinster Rand beim automatischen Lochbild (Platz für Senkung, Wand und ggf. Dichtung) */
export function flangeMinRim(wall: number, seal: boolean, sealW = 6) {
  const hr = AUTO_HOLE_D / 2, sr = sinkR(AUTO_HOLE_D);
  const toOpen = Math.max(wall + sr + 0.5, (seal ? SEAL.lip + sealWidth({ sealW }) : 0) + hr + 1.5);
  return Math.ceil(toOpen + sr + 1);
}

export interface FlangeError {
  /** Art des Fehlers (für die Vorschläge) */
  kind: 'thick' | 'holeD' | 'rim' | 'plateMin' | 'pitch' | 'count' | 'circle' | 'small' | 'none' | 'open' | 'edge' | 'dense';
  text: string;
  fixes?: Fix[];
}

export interface FlangeGeom {
  plate: Section;
  /** Lochmitten in u/v (schon gedreht wie der Querschnitt) */
  holes: P2[];
  holeD: number;
  errors: FlangeError[];
}

/** kleinster Wert ab from (bis max), für den ok gilt (ok steigt monoton); auf 0,5 aufgerundet, null = keiner */
function searchUp(ok: (v: number) => boolean, from: number, max: number): number | null {
  if (ok(from)) return from;
  let lo = from, hi = Math.max(from, 1);
  while (!ok(hi)) {
    lo = hi;
    hi *= 1.5;
    if (hi >= max) {
      if (!ok(max)) return null;
      hi = max;
      break;
    }
  }
  for (let k = 0; k < 16; k++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  const v = upHalf(hi);
  return ok(v) ? v : hi;
}
/** größter Faktor ≤ 1, für den ok gilt (ok fällt monoton mit dem Faktor), null = keiner ab min */
function searchDown(ok: (k: number) => boolean, min: number): number | null {
  if (!ok(min)) return null;
  let lo = min, hi = 1;
  for (let k = 0; k < 16; k++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m;
    else hi = m;
  }
  return lo;
}

/** Platte und Löcher des Flanschs (rein rechnerisch, auch für die Oberfläche); withFixes: Vorschläge zu den Fehlern */
export function flangeGeom(dv: DeviceEnd, wall: number, withFixes = true): FlangeGeom {
  const o = dv.section;
  const rot = dv.rot;
  const errors: FlangeError[] = [];
  const err = (kind: FlangeError['kind'], text: string) => errors.push({ kind, text });
  const auto = dv.flangeLayout === 'auto';
  const holeD = auto ? AUTO_HOLE_D : dv.holeD;
  const hr = holeD / 2, sr = sinkR(holeD);
  const sw = sealWidth(dv);
  const toOpen = Math.max(wall + sr + 0.5, (dv.seal ? SEAL.lip + sw : 0) + hr + 1.5);
  const toEdge = sr + 1;
  let plate: Section;
  let holes: P2[] = [];
  const rotP = (q: P2): P2 => {
    const c = Math.cos(rad(rot)), s = Math.sin(rad(rot));
    return [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
  };
  const minT = Math.ceil(sr - hr + 1.5);
  if (!(dv.flangeT >= 3 && dv.flangeT <= 15)) err('thick', 'Die Platte muss 3 bis 15 mm dick sein.');
  else if (dv.flangeT < minT) err('thick', `Für Senkkopfschrauben muss die Platte mindestens ${minT} mm dick sein.`);
  if (!auto && !(holeD >= 2 && holeD <= 10)) err('holeD', 'Der Loch-Ø muss zwischen 2 und 10 mm liegen.');
  const minRim = flangeMinRim(wall, dv.seal, sw);
  if (auto) {
    if (!(dv.flangeRim >= minRim)) err('rim', `Der Rand muss hier mindestens ${minRim} mm breit sein, damit Schrauben${dv.seal ? ' und Dichtung' : ''} Platz haben.`);
    if (dv.flangeRim > 80) err('rim', 'Der Rand darf höchstens 80 mm breit sein.');
    plate = grow(o, Math.max(dv.flangeRim, 1));
    if (!errors.length) {
      // bei Ellipsen ist die vergrößerte Kontur nicht überall gleich weit weg: Lochkontur so weit nach außen, bis der Abstand reicht
      const openPoly = samplePoints(o, 360, rot);
      let h = Math.max(dv.flangeRim / 2, toOpen);
      for (let k = 0; k < 4; k++) {
        holes = autoHoles(grow(o, h), rot, 2 * sr + 3);
        const m = Math.min(...holes.map((q) => polyDist(q, openPoly)));
        if (m >= toOpen - 0.01) break;
        h += toOpen - m + 0.05;
      }
    }
  } else if (dv.flangeLayout === 'rect') {
    plate = sec('rect', { w: dv.plateW, h: dv.plateH, r: 6, r2: 6 });
    if (!(dv.plateW >= 20 && dv.plateH >= 20)) err('plateMin', 'Die Platte muss mindestens 20 × 20 mm groß sein.');
    if (!(dv.holeX >= 0 && dv.holeY >= 0) || (dv.holeX < 2 * sr && dv.holeY < 2 * sr)) err('pitch', 'Bitte einen Lochabstand eingeben.');
    const nx = Math.round(dv.holeNX), ny = Math.round(dv.holeNY);
    if (!(nx >= 2 && nx <= 6 && ny >= 2 && ny <= 6)) err('count', 'Bitte je Seite 2 bis 6 Löcher wählen.');
    // Löcher gleichmäßig auf dem Rand des Lochbilds (Ecken und dazwischen), nicht in der Mitte
    const line = (L: number, n: number) => (L >= 2 * sr ? Array.from({ length: n }, (_, k) => -L / 2 + (L * k) / (n - 1)) : [0]);
    const xs = line(dv.holeX, nx), ys = line(dv.holeY, ny);
    const border = (x: number, y: number) => x === xs[0] || x === xs[xs.length - 1] || y === ys[0] || y === ys[ys.length - 1];
    holes = xs.flatMap((x) => ys.filter((y) => border(x, y)).map((y) => rotP([x, y])));
  } else if (dv.flangeLayout === 'tri') {
    // abgerundetes Dreieck mit einem Loch je Ecke (Ecke oben, mit der Drehung gedreht)
    plate = sec('tri', { d: Math.max(dv.triCircle, 1), r: triEar(holeD) });
    if (!(dv.triCircle > 0)) err('circle', 'Bitte einen Lochkreis eingeben.');
    else holes = [90, 210, 330].map((a) => rotP([(dv.triCircle / 2) * Math.cos(rad(a)), (dv.triCircle / 2) * Math.sin(rad(a))]));
  } else {
    plate = sec('circle', { d: dv.plateD });
    const n = Math.round(dv.holeN);
    if (!(dv.plateD >= 20)) err('plateMin', 'Die Platte muss mindestens 20 mm groß sein.');
    if (!(n >= 2 && n <= 16)) err('count', 'Bitte 2 bis 16 Löcher wählen.');
    else if (!(dv.holeCircle > 0)) err('circle', 'Bitte einen Lochkreis eingeben.');
    else holes = Array.from({ length: n }, (_, k) => rotP([(dv.holeCircle / 2) * Math.cos(((k + 0.5) * 2 * Math.PI) / n), (dv.holeCircle / 2) * Math.sin(((k + 0.5) * 2 * Math.PI) / n)]));
  }
  if (!errors.length) {
    // Platte muss die Wand (und die Dichtung) rundum tragen
    const platePoly = samplePoints(plate, 360, rot);
    const need = grow(o, dv.seal ? SEAL.lip + sw + 1.5 : wall + 1);
    if (!samplePoints(need, 180, rot).every((q) => inPoly(q, platePoly))) err('small', `Die Platte ist zu klein für diese Öffnung${dv.seal ? ' und die Dichtung' : ''}.`);
    const openPoly = samplePoints(o, 360, rot);
    if (!errors.length) {
      if (!holes.length) err('none', 'Für diese Öffnung passen keine Schraubenlöcher. Bitte den Rand breiter machen.');
      else if (holes.some((q) => inPoly(q, openPoly) || polyDist(q, openPoly) < toOpen - 0.01))
        err('open', `Die Löcher liegen zu nah an der Öffnung${dv.seal ? ' oder an der Dichtung' : ''}.`);
      else if (holes.some((q) => !inPoly(q, platePoly) || polyDist(q, platePoly) < toEdge - 0.01)) err('edge', 'Die Löcher liegen zu nah am Rand der Platte.');
      else if (holes.some((q, i) => holes.some((r, j) => j > i && Math.hypot(q[0] - r[0], q[1] - r[1]) < 2 * sr + 1))) err('dense', 'Die Löcher liegen zu dicht beieinander.');
    }
  }
  if (withFixes) for (const e of errors) e.fixes = flangeFixes(e.kind, dv, wall, { minT, minRim });
  return { plate, holes: errors.length ? [] : holes, holeD, errors };
}

/** Vorschläge zu einem Flansch-Fehler: Werte so weit ändern, bis genau dieser Fehler weg ist */
function flangeFixes(kind: FlangeError['kind'], dv: DeviceEnd, wall: number, m: { minT: number; minRim: number }): Fix[] {
  const D = (sp: FreeSpec) => sp.b.device;
  const clear = (v: Partial<DeviceEnd>) => !flangeGeom({ ...dv, ...v }, wall, false).errors.some((e) => e.kind === kind);
  const refill: Fix = { label: 'Platte und Löcher neu vorschlagen', fields: [], set: (sp) => void Object.assign(D(sp), flangeDefaults(D(sp), sp.wall)) };
  const pair = (name: string, fields: [string, string], keys: [keyof DeviceEnd, keyof DeviceEnd], a: number, b: number): Fix => ({
    label: `${name} auf ${fmtV(a)} × ${fmtV(b)} mm setzen`,
    fields,
    set: (sp) => void Object.assign(D(sp), { [keys[0]]: a, [keys[1]]: b }),
  });
  const rect = dv.flangeLayout === 'rect', round = dv.flangeLayout === 'round', tri = dv.flangeLayout === 'tri';
  const out: (Fix | null)[] = [];
  switch (kind) {
    case 'thick':
      out.push(fixTo('Dicke', 'Dicke des Flanschs', dv.flangeT > 15 ? 15 : Math.max(3, m.minT), (sp, x) => void (D(sp).flangeT = x)));
      break;
    case 'holeD':
      out.push(fixTo('Loch-Ø', 'Loch-Durchmesser', dv.holeD > 10 ? 10 : 2, (sp, x) => void (D(sp).holeD = x)));
      break;
    case 'rim':
      out.push(fixTo('Rand', 'Rand des Flanschs', dv.flangeRim > 80 ? 80 : m.minRim, (sp, x) => void (D(sp).flangeRim = x)));
      break;
    case 'plateMin':
      if (rect) out.push(pair('Platte', ['Breite der Platte', 'Höhe der Platte'], ['plateW', 'plateH'], Math.max(20, dv.plateW), Math.max(20, dv.plateH)));
      else out.push(fixTo('Platten-Ø', 'Durchmesser der Platte', 20, (sp, x) => void (D(sp).plateD = x)));
      break;
    case 'pitch':
    case 'circle':
      out.push({ ...refill, fields: kind === 'pitch' ? ['Lochabstand waagerecht', 'Lochabstand senkrecht'] : ['Lochkreis-Durchmesser'] });
      break;
    case 'count':
      if (rect) {
        const c = (n: number) => Math.min(6, Math.max(2, Math.round(n)));
        out.push(pair('Löcher je Seite', ['Löcher waagerecht', 'Löcher senkrecht'], ['holeNX', 'holeNY'], c(dv.holeNX), c(dv.holeNY)));
      } else out.push(fixTo('Anzahl Löcher', 'Anzahl der Löcher', Math.min(16, Math.max(2, Math.round(dv.holeN))), (sp, x) => void (D(sp).holeN = x), ''));
      break;
    case 'none': {
      const r = searchUp((v) => clear({ flangeRim: v }), dv.flangeRim, 80);
      if (r !== null) out.push(fixTo('Rand', 'Rand des Flanschs', Math.ceil(r), (sp, x) => void (D(sp).flangeRim = x)));
      break;
    }
    case 'small':
    case 'edge':
    case 'open':
    case 'dense': {
      if (round) {
        // Platte größer (zu klein, Rand), Lochkreis größer (Öffnung, zu dicht) bzw. kleiner (Rand), weniger Löcher (zu dicht)
        if (kind === 'small' || kind === 'edge') {
          const v = searchUp((x) => clear({ plateD: x }), dv.plateD, 600);
          if (v !== null) out.push(fixTo('Platten-Ø', 'Durchmesser der Platte', Math.ceil(v), (sp, x) => void (D(sp).plateD = x)));
        }
        if (kind === 'open' || kind === 'dense') {
          const v = searchUp((x) => clear({ holeCircle: x }), dv.holeCircle, 590);
          if (v !== null) out.push(fixTo('Lochkreis-Ø', 'Lochkreis-Durchmesser', v, (sp, x) => void (D(sp).holeCircle = x)));
        }
        if (kind === 'edge') {
          const k = searchDown((f) => !flangeGeom({ ...dv, holeCircle: dv.holeCircle * f }, wall, false).errors.length, 0.3);
          if (k !== null) out.push(fixTo('Lochkreis-Ø', 'Lochkreis-Durchmesser', downHalf(dv.holeCircle * k), (sp, x) => void (D(sp).holeCircle = x)));
        }
        if (kind === 'dense') {
          for (let n = Math.round(dv.holeN) - 1; n >= 2; n--)
            if (clear({ holeN: n })) {
              out.push(fixTo('Anzahl Löcher', 'Anzahl der Löcher', n, (sp, x) => void (D(sp).holeN = x), ''));
              break;
            }
        }
      } else if (rect) {
        if (kind === 'small' || kind === 'edge') {
          const k = searchUp((f) => clear({ plateW: dv.plateW * f, plateH: dv.plateH * f }), 1, 6);
          if (k !== null) out.push(pair('Platte', ['Breite der Platte', 'Höhe der Platte'], ['plateW', 'plateH'], Math.ceil(dv.plateW * k), Math.ceil(dv.plateH * k)));
        }
        if (kind === 'open') {
          const k = searchUp((f) => clear({ holeX: dv.holeX * f, holeY: dv.holeY * f }), 1, 6);
          if (k !== null) out.push(pair('Lochabstand', ['Lochabstand waagerecht', 'Lochabstand senkrecht'], ['holeX', 'holeY'], upHalf(dv.holeX * k), upHalf(dv.holeY * k)));
        }
        if (kind === 'edge') {
          const k = searchDown((f) => !flangeGeom({ ...dv, holeX: dv.holeX * f, holeY: dv.holeY * f }, wall, false).errors.length, 0.3);
          if (k !== null) out.push(pair('Lochabstand', ['Lochabstand waagerecht', 'Lochabstand senkrecht'], ['holeX', 'holeY'], downHalf(dv.holeX * k), downHalf(dv.holeY * k)));
        }
        if (kind === 'dense') {
          let nx = Math.round(dv.holeNX), ny = Math.round(dv.holeNY);
          while ((nx > 2 || ny > 2) && !clear({ holeNX: nx, holeNY: ny })) {
            if (nx >= ny && nx > 2) nx--;
            else ny--;
          }
          if (clear({ holeNX: nx, holeNY: ny })) out.push(pair('Löcher je Seite', ['Löcher waagerecht', 'Löcher senkrecht'], ['holeNX', 'holeNY'], nx, ny));
        }
      } else if (tri) {
        // Dreieck: Ecken und Löcher liegen auf dem Lochkreis, größer schafft Platz zur Öffnung und eine größere Platte
        const v = searchUp((x) => clear({ triCircle: x }), dv.triCircle, 590);
        if (v !== null) out.push(fixTo('Lochkreis-Ø', 'Lochkreis-Durchmesser', v, (sp, x) => void (D(sp).triCircle = x)));
      } else if (kind === 'open' || kind === 'edge' || kind === 'dense') {
        const r = searchUp((v) => clear({ flangeRim: v }), dv.flangeRim, 80);
        if (r !== null) out.push(fixTo('Rand', 'Rand des Flanschs', Math.ceil(r), (sp, x) => void (D(sp).flangeRim = x)));
      }
      // neu vorschlagen nur, wenn es sonst keinen Vorschlag gibt (der Link dazu steht ohnehin unter den Feldern)
      if (!auto(dv) && !out.length) out.push(refill);
      break;
    }
  }
  return out.filter((x): x is Fix => !!x);
}
const auto = (dv: DeviceEnd) => dv.flangeLayout === 'auto';

/** Ab dieser Plattengröße (mm) empfehlen wir einen Brim: große flache Platten ziehen sich an den Ecken gern hoch */
export const BRIM_FROM = 100;
/** Größte Ausdehnung der Flanschplatte (Breite oder Höhe) */
export function flangeExtent(dv: DeviceEnd, wall: number): number {
  const pts = samplePoints(flangeGeom(dv, wall, false).plate, 180, dv.rot);
  const span = (k: 0 | 1) => Math.max(...pts.map((q) => q[k])) - Math.min(...pts.map((q) => q[k]));
  return Math.max(span(0), span(1));
}

/** Werte für das Lochbild nach Maß, ausgehend vom automatischen Flansch (beim Umschalten vorbelegt) */
export function flangeDefaults(dv: DeviceEnd, wall: number): Partial<DeviceEnd> {
  const rim = Math.max(dv.flangeRim, flangeMinRim(wall, dv.seal, dv.sealW));
  const G = flangeGeom({ ...dv, flangeLayout: 'auto', flangeRim: rim, rot: 0 }, wall, false);
  const pts = samplePoints(grow(dv.section, rim), 180, 0);
  const up = (v: number, k = 1) => Math.ceil(v / k - 1e-9) * k;
  const edge = sinkR(AUTO_HOLE_D) + 1.5;
  const hx = up(2 * Math.max(0, ...G.holes.map((q) => Math.abs(q[0]))), 0.5);
  const hy = up(2 * Math.max(0, ...G.holes.map((q) => Math.abs(q[1]))), 0.5);
  // Lochkreis: alle Löcher gleich weit außen, also mindestens so weit, dass auch zwischen den automatischen Löchern Platz zur Öffnung bleibt
  const toOpen = Math.max(wall + sinkR(AUTO_HOLE_D) + 0.5, (dv.seal ? SEAL.lip + sealWidth(dv) : 0) + AUTO_HOLE_D / 2 + 1.5);
  const reach = Math.max(...samplePoints(dv.section, 180, 0).map((q) => Math.hypot(q[0], q[1])));
  const hc = up(2 * Math.max(reach + toOpen, ...G.holes.map((q) => Math.hypot(q[0], q[1]))), 0.5);
  const pw = up(Math.max(2 * Math.max(...pts.map((q) => Math.abs(q[0]))), hx + 2 * edge));
  const ph = up(Math.max(2 * Math.max(...pts.map((q) => Math.abs(q[1]))), hy + 2 * edge));
  const pd = up(Math.max(2 * Math.max(...pts.map((q) => Math.hypot(q[0], q[1]))), hc + 2 * edge));
  // Löcher je Seite wie beim automatischen Lochbild: höchstens HOLE_PITCH Abstand
  const per = (L: number) => Math.min(6, Math.max(2, Math.ceil(L / HOLE_PITCH - 1e-9) + 1));
  const round = { plateD: pd, holeCircle: hc, holeN: Math.min(16, Math.max(4, G.holes.length)), holeD: AUTO_HOLE_D };
  // Löcher in der Seitenmitte liegen bei runden Formen näher an der Öffnung als die Ecken: dann das Lochbild so weit
  // nach außen, dass es die Öffnung mit Abstand umschließt, notfalls nur die 4 Ecken
  const op = samplePoints(dv.section, 180, 0);
  const bx = 2 * (Math.max(...op.map((q) => Math.abs(q[0]))) + toOpen), by = 2 * (Math.max(...op.map((q) => Math.abs(q[1]))) + toOpen);
  const tries: Partial<DeviceEnd>[] = [
    { holeX: hx, holeY: hy, holeNX: per(hx), holeNY: per(hy), plateW: pw, plateH: ph },
    { holeX: up(Math.max(hx, bx), 0.5), holeY: up(Math.max(hy, by), 0.5), holeNX: per(Math.max(hx, bx)), holeNY: per(Math.max(hy, by)), plateW: up(Math.max(pw, Math.max(hx, bx) + 2 * edge)), plateH: up(Math.max(ph, Math.max(hy, by) + 2 * edge)) },
  ];
  // Dreieck: kleinster Lochkreis (auf 0,5 mm), mit dem Platte und Löcher zur Öffnung passen
  const triFrom = up(2 * (reach + toOpen), 0.5);
  const triOk = searchUp((x) => !flangeGeom({ ...dv, flangeLayout: 'tri', triCircle: x, holeD: AUTO_HOLE_D, rot: 0 }, wall, false).errors.length, triFrom, 600);
  const tri = { triCircle: triOk === null ? triFrom : up(triOk, 0.5) };
  for (const t of tries) if (!flangeGeom({ ...dv, ...round, ...t, flangeLayout: 'rect', rot: 0 }, wall, false).errors.length) return { ...round, ...tri, ...t };
  return { ...round, ...tri, holeX: hx, holeY: hy, holeNX: 2, holeNY: 2, plateW: pw, plateH: ph };
}

function planFlange(spec: FreeSpec, ce: { frame: Frame; section: Section; rot: number }, bodies: FreeBody[], issues: Issue[], path: V3[]): Frame {
  const dv = spec.b.device;
  const w = spec.wall;
  const o = dv.section;
  checkSection(o, 'Gerät', issues, { label: 'Form der Öffnung', get: (sp) => sp.b.device.section });
  if ((o.shape === 'circle' ? o.d : Math.min(o.w, o.h)) < 4) issues.push({ level: 'error', text: 'Gerät: Die Öffnung muss mindestens 4 mm groß sein.' });
  if (spec.bed === 'A' && !hasSplit(spec)) issues.push({ level: 'error', text: 'Gerät: Mit Flansch liegt Ende B beim Drucken unten. Bitte unten „Ende B“ wählen.' });
  if (issues.some((x) => x.level === 'error')) return ce.frame;
  const G = flangeGeom(dv, w);
  for (const e of G.errors) issues.push({ level: 'error', text: `Gerät: ${e.text}`, fixes: e.fixes });
  if (G.errors.length) return ce.frame;

  let f = ce.frame;
  const rot1 = dv.rot;
  const out = grow(o, w);
  if (!sameSection(ce.section, o) || Math.abs(ce.rot - rot1) > 1e-9) {
    const L0 = spec.b.transition;
    const trFix = (v: number) => [fixTo('Übergangslänge', 'Übergangslänge zum Flansch', v, (sp, x) => void (sp.b.transition = x))];
    if (!(L0 >= 2)) {
      issues.push({ level: 'error', text: 'Gerät: Die Übergangslänge muss mindestens 2 mm betragen.', fixes: trFix(2) });
      return f;
    }
    let m = 0;
    const N = 120;
    const p0 = samplePoints(grow(ce.section, w), N, ce.rot), p1 = samplePoints(out, N, rot1);
    for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(p1[i][0] - p0[i][0], p1[i][1] - p0[i][1]));
    if (m > L0 * 1.2) issues.push({ level: 'warn', text: `Gerät: Die Schräge zum Flansch ist sehr steil (${Math.round(m)} mm auf ${Math.round(L0)} mm Länge). In den Feineinstellungen die Übergangslänge auf mindestens ${fmtV(upHalf(m / 1.2))} mm erhöhen, dann geht der Druck ohne Stützen.`, fixes: trFix(upHalf(m / 1.2)) });
    bodies.push(autoTransition('Übergang zum Gerät', f, ce.section, ce.rot, o, rot1, L0, w, {}));
    f = advance(f, L0);
    path.push(f.o);
  }
  const fb = f;
  const T = dv.flangeT;
  const hr = G.holeD / 2, sr = sinkR(G.holeD);
  const at3 = (x: number, q: P2): Point => add(add(add(fb.o, mul(fb.t, x)), mul(fb.u, q[0])), mul(fb.v, q[1])) as Point;
  const ring = (x: number, q: P2, r: number) => assembleWire([makeCircle(r, at3(x, q), fb.t as Point)]);
  bodies.push({
    name: 'Geräteanschluss · Flansch',
    cost: dv.preview ? 0.3 : 0.6 + 0.05 * G.holes.length,
    dep: { kind: 'free', t: 'device', part: 'flange', f: frameKey(fb), o: secKey(o), p: secKey(G.plate), rot: r6(rot1), T: r6(T), h: dv.preview ? 0 : G.holes.map((q) => q.map(r6)), d: r6(G.holeD), seal: dv.seal && !dv.preview ? sealWidth(dv) : 0 },
    make: () => {
      let body = extrudeRing(fb, o, G.plate, rot1, T);
      if (dv.preview) return body;
      for (const q of G.holes) {
        // Bohrung durch die Platte, Senkung oben (Seite zum Adapter, dort sitzt der Schraubenkopf)
        const bore = makeCylinder(hr, T + 2, at3(-1, q), fb.t as Point) as unknown as Shape3D;
        const depth = sr - hr;
        const sink = loft([ring(-1, q, sr + 1), ring(depth, q, hr)], { ruled: true }) as unknown as Shape3D;
        const before = measureVolume(body);
        let next = body.cut(bore.fuse(sink));
        if (!(measureVolume(next) < before - 1e-3)) next = body.cut(bore).cut(sink);
        if (!(measureVolume(next) < before - 1e-3)) throw new UserError('Gerät: Ein Schraubenloch ließ sich im Flansch nicht schneiden. Bitte den Lochabstand etwas ändern.');
        body = next;
      }
      if (dv.seal) {
        const before = measureVolume(body);
        const tool = extrudeRing(advance(fb, T - SEAL.depth), grow(o, SEAL.lip), grow(o, SEAL.lip + sealWidth(dv)), rot1, SEAL.depth + 1);
        const next = body.cut(tool);
        if (!(measureVolume(next) < before - 1e-3)) throw new UserError('Gerät: Die Nut für die Dichtung ließ sich an dieser Form nicht schneiden. Bitte die Dichtung abwählen.');
        body = next;
      }
      return body;
    },
  });
  f = advance(fb, T);
  path.push(f.o);
  return f;
}

/** Punkte der Kontur mit Normale (nach außen) und Tangente, gleichmäßig über den Umfang. */
function contourAt(s: Section, rotDeg: number, fracs: number[]) {
  const M = 720;
  const pts = samplePoints(s, M, rotDeg);
  const cx = pts.reduce((q, p) => q + p[0], 0) / M, cy = pts.reduce((q, p) => q + p[1], 0) / M;
  return fracs.map((fr) => {
    const i = ((Math.round(fr * M) % M) + M) % M;
    const p = pts[i], a = pts[(i + M - 2) % M], b = pts[(i + 2) % M];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: P2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    let n: P2 = [t[1], -t[0]];
    if (n[0] * (p[0] - cx) + n[1] * (p[1] - cy) < 0) n = [-n[0], -n[1]];
    return { p, n, t };
  });
}

/**
 * Extras am Geräteanschluss: Klemmrippen (eigener Körper), Schlitze, Aussparung und Schraubenlöcher (Schnitte).
 * x läuft von der Kette (0) bis zum offenen Ende (L).
 */
function deviceExtras(spec: FreeSpec, fb: Frame, front: Section, back: Section, w: number, a: number, rot1: number, L: number, c: number, issues: Issue[]) {
  const dv = spec.b.device;
  const over = dv.mode === 'over';
  const devAt = (x: number): Section => (front.shape === 'circle' ? { ...front, d: front.d + ((back.d - front.d) * x) / L } : front);
  const P = perimeter(front);
  const at3 = (x: number, q: P2): Point => add(add(add(fb.o, mul(fb.t, x)), mul(fb.u, q[0])), mul(fb.v, q[1])) as Point;
  const dir3 = (q: P2): V3 => add(mul(fb.u, q[0]), mul(fb.v, q[1]));

  let holes = dv.holes;
  if (holes && L < 12) {
    issues.push({ level: 'warn', text: 'Gerät: Für die Schraubenlöcher braucht es mindestens 12 mm Tiefe. Ohne Löcher gebaut.', fixes: [fixTo('Tiefe', 'Steckweg', 12, (sp, x) => void (sp.b.device.length = x))] });
    holes = false;
  }
  const slots = over && dv.slots && SLOT_SHAPES.has(front.shape);
  let notch = over && dv.notch;
  if (notch) {
    const wFix = (v: number) => [fixTo('Breite der Aussparung', 'Breite der Aussparung', v, (sp, x) => void (sp.b.device.notchW = x))];
    const hFix = (v: number) => [fixTo('Tiefe der Aussparung', 'Tiefe der Aussparung', v, (sp, x) => void (sp.b.device.notchH = x))];
    if (!(dv.notchW >= 3)) issues.push({ level: 'error', text: 'Gerät: Die Aussparung muss mindestens 3 mm breit sein.', fixes: wFix(3) });
    else if (dv.notchW > P / 2) issues.push({ level: 'error', text: `Gerät: Die Aussparung ist breiter als der halbe Umfang. Sie darf höchstens ${Math.floor(P / 2)} mm breit sein.`, fixes: wFix(Math.floor(P / 2)) });
    if (!(dv.notchH >= 2)) issues.push({ level: 'error', text: 'Gerät: Die Aussparung muss mindestens 2 mm tief sein.', fixes: hFix(2) });
    else if (dv.notchH > L - 3) issues.push({ level: 'error', text: `Gerät: Die Aussparung darf höchstens ${Math.floor(L - 3)} mm tief sein, sonst hält der Adapter nicht mehr.`, fixes: hFix(Math.floor(L - 3)) });
    if (issues.some((x) => x.level === 'error' && x.text.includes('Aussparung'))) notch = false;
  }
  const xHole = L - 8;
  const nRad = rad(dv.notchDir + rot1);
  const ray: P2 = [Math.cos(nRad), Math.sin(nRad)], perp: P2 = [-ray[1], ray[0]];
  const reach = Math.max(...samplePoints(grow(front, a + w + 2), 90, rot1).map(([x, y]) => Math.hypot(x, y))) + 10;
  /** liegt ein Punkt der Kontur im Bereich der Aussparung? (dort entfallen Löcher, Schlitze und Rippen) */
  const inNotch = (q: P2, margin: number) => notch && Math.abs(q[0] * perp[0] + q[1] * perp[1]) < dv.notchW / 2 + margin && q[0] * ray[0] + q[1] * ray[1] > 0;
  const mid0 = grow(front, a + w / 2);
  const holeAt = holeLayout(front, rot1).filter((g) => !inNotch(contourAt(mid0, rot1, [g])[0].p, 6));
  const SL = slotLayout(P, L, holes ? holeAt : null);
  const slotLen = SL.len, slotW = SL.width;
  const slotAt = SL.at.filter((g) => !inNotch(contourAt(mid0, rot1, [g])[0].p, slotW / 2 + 2));
  if (holes && !holeAt.length) holes = false;

  /** Schnitte, die Muffe/Zapfen und Fase gemeinsam haben */
  const cutTools = (): { tool: Shape3D; kind: 'slot' | 'notch' }[] => {
    const t: { tool: Shape3D; kind: 'slot' | 'notch' }[] = [];
    if (slots) {
      const mid = grow(devAt(L - slotLen), a + w / 2);
      for (const { p, n, t: tg } of contourAt(mid, rot1, slotAt)) {
        const q = (s1: number, s2: number): P2 => [p[0] + tg[0] * s1 + n[0] * s2, p[1] + tg[1] * s1 + n[1] * s2];
        const h = w + 4;
        const sw = slotW / 2;
        // Schlitz als ein Körper: U-Form in der Ebene (Längsrichtung, Umfang), runder Grund gegen Einreißen, quer durch die Wand gezogen
        const x0 = L - slotLen + sw, x1 = L + 1;
        const P3 = (x: number, s1: number) => at3(x, q(s1, -h));
        const wire = assembleWire([
          makeLine(P3(x1, -sw), P3(x0, -sw)),
          makeThreePointArc(P3(x0, -sw), P3(x0 - sw, 0), P3(x0, sw)),
          makeLine(P3(x0, sw), P3(x1, sw)),
          makeLine(P3(x1, sw), P3(x1, -sw)),
        ]);
        t.push({ tool: basicFaceExtrusion(makeFace(wire), new Vector(mul(dir3(n), 2 * h) as Point)) as unknown as Shape3D, kind: 'slot' });
      }
    }
    if (notch) {
      const x0 = L - dv.notchH, W = dv.notchW / 2;
      const q = (r: number, s1: number): P2 => [ray[0] * r + perp[0] * s1, ray[1] * r + perp[1] * s1];
      const face = makePolygon([at3(x0, q(0, -W)), at3(x0, q(reach, -W)), at3(x0, q(reach, W)), at3(x0, q(0, W))]);
      t.push({ tool: basicFaceExtrusion(face, new Vector(mul(fb.t, dv.notchH + 1) as Point)) as unknown as Shape3D, kind: 'notch' });
    }
    return t;
  };
  /** Schraubenlöcher: aufgesteckt Ø 4 mit Senkung außen (wie beim Rohrkonus), eingesteckt Ø 3,2 zum Eindrehen */
  const holeTools = (): Shape3D[] => {
    const outer = over ? grow(devAt(xHole), a + w) : grow(devAt(xHole), -a);
    return contourAt(outer, rot1, holeAt).map(({ p, n }) => {
      const o = (d: number) => at3(xHole, [p[0] + n[0] * d, p[1] + n[1] * d]);
      const N = dir3(n) as Point;
      const bore = makeCylinder(over ? 2 : 1.6, w + 6, o(-(w + 3)), N) as unknown as Shape3D;
      if (!over) return bore;
      const ring = (d: number, r: number) => assembleWire([makeCircle(r, o(d), N)]);
      const k = 1.25;
      const sink = loft([ring(-2.0, 2), ring(-2 + 2 * k, 2 + 1.94 * k), ring(-2 + 2 * k + 1.5, 2 + 1.94 * k)], { ruled: true }) as unknown as Shape3D;
      return bore.fuse(sink);
    });
  };

  const apply = (body: Shape3D, withHoles: boolean): Shape3D => {
    if (withHoles && holes) {
      const tools = holeTools();
      const before = measureVolume(body);
      const toolVol = tools.reduce((q, x) => q + measureVolume(x), 0);
      body = body.cut(makeCompound(tools) as unknown as Shape3D);
      const removed = before - measureVolume(body);
      if (!(removed > 0 && removed < toolVol * 1.02))
        throw new UserError('Gerät: Die Schraubenlöcher passen so nicht an diese Form. Bitte die Tiefe etwas ändern oder die Löcher abwählen.');
    }
    if (slots || notch) {
      // einzeln schneiden und prüfen, dass jedes Werkzeug wirklich etwas wegnimmt (alle reichen bis über das offene Ende)
      const start = measureVolume(body);
      let before = start;
      for (const { tool, kind } of cutTools()) {
        body = body.cut(tool);
        const after = measureVolume(body);
        if (!(after < before - 1e-3) || !(after > start * 0.3))
          throw new UserError(
            kind === 'notch'
              ? 'Gerät: Die Aussparung passt so nicht an diese Form. Bitte schmaler machen oder die Lage ändern.'
              : 'Gerät: Ein Schlitz ließ sich an dieser Form nicht schneiden. Bitte die Tiefe etwas ändern oder die Schlitze abwählen.',
          );
        before = after;
      }
    }
    return body;
  };

  // Klemmrippen: dreieckig, 1,6 mm breit, 0,4 mm in der Wand verankert, ragen RIB_CRUSH über die Gerätefläche
  let ribs: (() => Shape3D) | null = null;
  if (dv.ribs) {
    const x0 = 1, x1 = L - c - 2;
    if (x1 - x0 < 4) issues.push({ level: 'warn', text: `Gerät: Für Klemmrippen ist die Tiefe zu kurz, es braucht mindestens ${Math.ceil(7 + c)} mm. Ohne Rippen gebaut.`, fixes: [fixTo('Tiefe', 'Steckweg', Math.ceil(7 + c), (sp, x) => void (sp.b.device.length = x))] });
    else {
      const n = Math.max(6, Math.min(24, Math.round(P / 10)));
      const arc = (f1: number, f2: number) => Math.min(Math.abs(f1 - f2), 1 - Math.abs(f1 - f2)) * P;
      // in engen Ecken (Richtung ändert sich über ±1 mm um mehr als 25°) säße die Rippe schief: dort keine
      const corner = (f: number) => {
        const d = 1 / P;
        const [a1, b1] = contourAt(front, rot1, [f - d, f + d]);
        return Math.acos(Math.max(-1, Math.min(1, a1.t[0] * b1.t[0] + a1.t[1] * b1.t[1]))) > rad(25);
      };
      const fr = Array.from({ length: n }, (_, k) => (k + 0.5) / n).filter(
        (f) => !(holes && holeAt.some((g) => arc(f, g) < 5)) && !(slots && slotAt.some((g) => arc(f, g) < slotW / 2 + 2)) && !corner(f),
      );
      const ribPts = (x: number) => {
        const base = grow(devAt(x), over ? a + 0.4 : -(a + 0.4));
        return contourAt(base, rot1, fr).map(({ p, n: nn, t }) => {
          const h = (a + 0.4 + RIB_CRUSH) * (over ? -1 : 1);
          return [
            [p[0] + t[0] * 0.8, p[1] + t[1] * 0.8],
            [p[0] + nn[0] * h, p[1] + nn[1] * h],
            [p[0] - t[0] * 0.8, p[1] - t[1] * 0.8],
          ] as P2[];
        });
      };
      // Rippen im Bereich der Aussparung weglassen
      const keep = ribPts(x0).map((tri) => !inNotch(tri[1], 1.5));
      if (keep.some(Boolean))
        ribs = () => {
          const tapered = front.shape === 'circle' && Math.abs(back.d - front.d) > 1e-6;
          const A = ribPts(x0), B = ribPts(x1), M = ribPts((x0 + x1) / 2);
          const tri = (x: number, q: P2[]) => assembleWire([makeLine(at3(x, q[0]), at3(x, q[1])), makeLine(at3(x, q[1]), at3(x, q[2])), makeLine(at3(x, q[2]), at3(x, q[0]))]);
          // gerade Rippe: Dreieck entlang der Achse gezogen (sehr robust); konisch: Loft, notfalls gerade in mittlerer Lage
          const straight = (q: P2[]) => basicFaceExtrusion(makeFace(tri(x0, q)), new Vector(mul(fb.t, x1 - x0) as Point)) as unknown as Shape3D;
          const expect = 0.5 * 1.6 * (a + 0.4 + RIB_CRUSH) * (x1 - x0);
          const ok = (r: Shape3D) => {
            const v = measureVolume(r);
            return v > expect * 0.7 && v < expect * 1.3;
          };
          const solids: Shape3D[] = [];
          let lost = 0;
          A.forEach((q, i) => {
            if (!keep[i]) return;
            if (testHooks.ribFail?.(i)) return void lost++;
            const tries = tapered ? [() => loft([tri(x0, q), tri(x1, B[i])], { ruled: true }) as unknown as Shape3D, () => straight(M[i])] : [() => straight(q)];
            for (const t of tries) {
              try {
                const r = t();
                if (ok(r)) return void solids.push(r);
                r.delete?.();
              } catch {
                /* nächster Versuch */
              }
            }
            lost++;
          });
          // eine fehlerhafte Rippe fällt still weg (beim Klemmen kommt es auf eine nicht an); fehlen viele, ein Hinweis
          const total = solids.length + lost;
          if (!solids.length) throw new UserError('Gerät: Die Klemmrippen ließen sich bei dieser Form nicht berechnen. Bitte die Rippen abwählen.');
          if (lost > total / 4) partNotes.push(`Gerät: ${lost} von ${total} Klemmrippen ließen sich bei dieser Form nicht sauber berechnen und wurden weggelassen. Der Adapter klemmt dadurch etwas schwächer.`);
          return makeCompound(solids) as unknown as Shape3D;
        };
    }
  }
  const cutKey = [slots ? [slotLen, slotW, ...slotAt] : 0, notch ? [dv.notchW, dv.notchH, dv.notchDir].map(r6) : 0];
  return { apply, ribs, cuts: slots || notch, any: holes || slots || notch, cutKey, key: [holes ? holeAt : 0, ...cutKey, dv.ribs ? 1 : 0] };
}

// ---------------------------------------------------------------- Lage im Raum

export type M3 = [V3, V3, V3]; // Zeilen

const colsToM = (x: V3, y: V3, z: V3): M3 => [
  [x[0], y[0], z[0]],
  [x[1], y[1], z[1]],
  [x[2], y[2], z[2]],
];
const mulMV = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const mulMM = (a: M3, b: M3): M3 => {
  const bt: M3 = colsToM(b[0], b[1], b[2]); // Spalten von b als Zeilen
  return a.map((row) => [dot(row, bt[0]), dot(row, bt[1]), dot(row, bt[2])]) as M3;
};
export const IDENTITY: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Starre Lage: erst Drehung R, dann Verschiebung tr. */
export interface Placement {
  R: M3;
  tr: V3;
}

/** Drehmatrix um eine Einheitsachse. */
function rotM(k: V3, th: number): M3 {
  return colsToM(rot([1, 0, 0], k, th), rot([0, 1, 0], k, th), rot([0, 0, 1], k, th));
}

/** Drehachse und -winkel (Grad) einer Drehmatrix, null für die Einheitsmatrix. */
function axisAngle(R: M3): { axis: V3; deg: number } | null {
  const tr = R[0][0] + R[1][1] + R[2][2];
  const ang = Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2)));
  if (ang < 1e-9) return null;
  let axis: V3;
  if (Math.PI - ang < 1e-6) {
    // 180°: Achse aus (R + I) / 2
    const d: V3 = [(R[0][0] + 1) / 2, (R[1][1] + 1) / 2, (R[2][2] + 1) / 2];
    const i = d.indexOf(Math.max(...d));
    const a: V3 = [0, 0, 0];
    a[i] = Math.sqrt(Math.max(0, d[i]));
    for (let j = 0; j < 3; j++) if (j !== i) a[j] = (R[i][j] + R[j][i]) / 4 / a[i];
    axis = unit(a);
  } else axis = unit([R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]);
  return { axis, deg: (ang * 180) / Math.PI };
}

/** Körper aus seinem lokalen System (Achsen = Spalten von R) an den Ort o legen. */
export function placeShape(shape: Shape3D, p: Placement): Shape3D {
  const aa = axisAngle(p.R);
  let s = shape;
  if (aa) s = s.rotate(aa.deg, [0, 0, 0], aa.axis as Point) as Shape3D;
  if (len(p.tr) > 1e-12) s = s.translate(p.tr as Point) as Shape3D;
  return s;
}

export const isIdentity = (p: Placement) => !axisAngle(p.R) && len(p.tr) < 1e-9;
export const placementKey = (p: Placement) => [p.R.map((r) => r.map(r6)), p.tr.map(r6)];

/** Verkettung: erst a, dann b. */
export function compose(a: Placement, b: Placement): Placement {
  return { R: mulMM(b.R, a.R), tr: add(mulMV(b.R, a.tr), b.tr) };
}

/** Lage eines Teils mit lokaler Achse +z = zDir, +x = xDir, Ursprung o. */
export function localPlacement(o: V3, xDir: V3, zDir: V3): Placement {
  const y = cross(zDir, xDir);
  return { R: colsToM(xDir, y, zDir), tr: o };
}

/** Drehung, die ein Ende nach unten legt: A (Achse −z im Plan) oder B (Laufrichtung der Endfläche nach −z) */
function bedRotation(bed: 'A' | 'B', plan: FreePlan): M3 {
  if (bed === 'A') return rotM([1, 0, 0], Math.PI);
  const t = plan.end.t;
  const target: V3 = [0, 0, -1];
  const c = dot(t, target);
  if (c < -1 + 1e-9) return rotM([1, 0, 0], Math.PI);
  if (c < 1 - 1e-9) return rotM(unit(cross(t, target)), Math.acos(c));
  return IDENTITY;
}

/** in x/y mittig über den Ursprung legen */
function centerOn(R: M3, pts: V3[], z: number): Placement {
  const q = pts.map((p) => mulMV(R, p));
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { R, tr: [Math.abs(cx) < 1e-6 ? 0 : -cx, Math.abs(cy) < 1e-6 ? 0 : -cy, z] };
}

/**
 * Lage auf dem Druckbett: gewähltes Ende nach unten (Endfläche flach auf dem Bett),
 * in x/y mittig über dem Ursprung. (Ohne Schieber; mit Schieber siehe partPlacements.)
 */
export function bedPlacement(spec: FreeSpec, plan: FreePlan): Placement {
  return centerOn(bedRotation(spec.bed, plan), plan.path, 0);
}

/** Körper eines geteilten Adapters: gehört der Name zum B-Teil? (A-Teil, Schieberplatten und ungeteilt: nein) */
export function inPart2(plan: FreePlan): (name: string) => boolean {
  const sp = plan.split;
  if (!sp) return () => false;
  return (n: string) => {
    if (n.startsWith('Schieberplatte')) return false;
    const m = /^Formstück (\d+)/.exec(n);
    if (m) {
      const i = Number(m[1]) - 1;
      return i > sp.block || (i === sp.block && n.endsWith(' oben'));
    }
    if (/^(Geräteanschluss C|Übergang zu Ende C)/.test(n) || / C( \d+)?$/.test(n)) return sp.cPart2;
    return /^(Geräteanschluss|Übergang zum Gerät|Übergang zu Ende B|Anschlagring)/.test(n) || / B( \d+)?$/.test(n);
  };
}

/** Außenradius eines Endes auf dem Bett bzw. frei (Kupplung mit Rändelung, Stecker mit Rand der Druckhilfe, Gerät/Flansch) */
function endRadius(E: EndSpec, onBed: boolean, w: number) {
  if (E.type === 'nozzle') return 4; // Spitze: Querschnitt steckt schon im Radius der Kette, dazu Ring/Rand
  if (E.type === 'female') return E.d / 2 + 12;
  if (E.type === 'male') return E.d / 2 + (onBed ? 27 : 6);
  const dv = E.device;
  const sh = dv.mode === 'flange' ? flangeGeom(dv, w, false).plate : grow(dv.section, w + dv.allowance + 1);
  return Math.max(...samplePoints(sh, 72, dv.rot).map((q) => Math.hypot(q[0], q[1]))) + 1;
}

/** größte Ausdehnung der Bausteine quer zur Mittellinie */
function chainRadius(spec: FreeSpec): number {
  const w = spec.wall;
  let rc = spec.a.d / 2 + w + 1;
  let cur = spec.a.d;
  for (const b of spec.blocks) {
    if (b.type === 'transition' || b.type === 'step') {
      rc = Math.max(rc, Math.max(b.section.d, b.section.w, b.section.h, b.section.w2) / 2 + w + 1);
      cur = b.section.shape === 'circle' ? b.section.d : Math.max(b.section.w, b.section.h);
    }
    if (b.type === 'bleed') rc = Math.max(rc, cur / 2 + w + bleedGapOf(spec) + BLEED.T + 2);
    if (b.type === 'gate') rc = Math.max(rc, tubeGateDims(cur / 2, cur / 2 + w, snapPlateGap(spec.gateGap ?? GATE_GAP)).g.Rc + 1);
    if (b.type === 'branch') rc = Math.max(rc, b.branchD / 2 + w + 1);
  }
  return rc;
}

type Box2 = { x0: number; x1: number; y0: number; y1: number };
/** Grundfläche (grob, eher zu groß) eines Teils: Punkte der Mittellinie mit Radius, Enden mit eigenem Radius */
function partBox(pl: Placement, pts: [V3, number][]): Box2 {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const [p, r] of pts) {
    const q = add(mulMV(pl.R, p), pl.tr);
    box.x0 = Math.min(box.x0, q[0] - r); box.x1 = Math.max(box.x1, q[0] + r);
    box.y0 = Math.min(box.y0, q[1] - r); box.y1 = Math.max(box.y1, q[1] + r);
  }
  return box;
}

/** Punkte (mit Radius) je Teil: 1 = mit Anschluss A (bzw. alles, wenn ungeteilt), 2 = mit Ende B */
function partPoints(spec: FreeSpec, plan: FreePlan, part: 1 | 2): [V3, number][] {
  const sp = plan.split, w = spec.wall;
  const rc = chainRadius(spec);
  const mine = (i: number) => !sp || sp.pathPart2[i] === (part === 2);
  const out: [V3, number][] = plan.path.filter((_, i) => mine(i)).map((p) => [p, rc]);
  const bedA = sp ? true : spec.bed === 'A', bedB = sp ? true : spec.bed === 'B';
  if (!sp || part === 1) for (const p of [[0, 0, 0] as V3, plan.startFrame.o]) out.push([p, endRadius({ ...spec.b, type: spec.a.type, d: spec.a.d }, bedA, w)]);
  if (!sp || part === 2) for (const p of [plan.chainEnd.frame.o, plan.end.o]) out.push([p, endRadius(spec.b, bedB, w)]);
  if (plan.cChainEnd && plan.cEnd && spec.c && (!sp || sp.cPart2 === (part === 2))) for (const p of [plan.cChainEnd.frame.o, plan.cEnd.o]) out.push([p, endRadius(spec.c, false, w)]);
  return out;
}

/**
 * Lage der Teile auf dem Druckbett. Ohne Schieber: ein Teil, gewähltes Ende unten (p2 = null). Mit Schieber: A-Teil
 * steht auf Anschluss A, B-Teil auf Ende B (Endfläche bei z = 0), rechts daneben mit 10 mm Abstand.
 */
export function partPlacements(spec: FreeSpec, plan: FreePlan): { p1: Placement; p2: Placement | null } {
  const sp = plan.split;
  if (!sp) return { p1: bedPlacement(spec, plan), p2: null };
  const pts1 = plan.path.filter((_, i) => !sp.pathPart2[i]);
  const pts2 = plan.path.filter((_, i) => sp.pathPart2[i]);
  const p1 = centerOn(bedRotation('A', plan), pts1, 0);
  const R2 = bedRotation('B', plan);
  const p2 = centerOn(R2, pts2, -mulMV(R2, plan.end.o)[2]);
  const b1 = partBox(p1, partPoints(spec, plan, 1)), b2 = partBox(p2, partPoints(spec, plan, 2));
  // B-Teil rechts daneben oder dahinter (+y, die Schieberplatten liegen davor): was die kleinere größte Kante ergibt
  const w1 = b1.x1 - b1.x0, d1 = b1.y1 - b1.y0, w2 = b2.x1 - b2.x0, d2 = b2.y1 - b2.y0;
  const side = Math.max(w1 + 10 + w2, Math.max(d1, d2)), back = Math.max(Math.max(w1, w2), d1 + 10 + d2);
  p2.tr =
    side <= back
      ? [p2.tr[0] + b1.x1 - b2.x0 + 10, p2.tr[1] + (b1.y0 + b1.y1) / 2 - (b2.y0 + b2.y1) / 2, p2.tr[2]]
      : [p2.tr[0] + (b1.x0 + b1.x1) / 2 - (b2.x0 + b2.x1) / 2, p2.tr[1] + b1.y1 - b2.y0 + 10, p2.tr[2]];
  return { p1, p2 };
}

/**
 * Schnittebene je Körper für die Vorschau (in den Koordinaten nach dem Legen aufs Druckbett): eine Ebene durch die
 * Mittellinie des jeweiligen Bausteins. Ein Bogen wird in seiner Biegeebene geschnitten, gerade Stücke in der Ebene
 * des nächsten Bogens, damit der Schnitt der Kette folgt. Liefert eine Funktion Name → Ebene (Punkt, Normale).
 */
export function sectionPlanes(spec: FreeSpec, plan: FreePlan): (name: string) => { p: V3; n: V3 } | null {
  const { p1, p2 } = partPlacements(spec, plan);
  const n0: V3 = [0, 1, 0];
  const perp = (n: V3, t: V3): V3 | null => {
    const q = sub(n, mul(t, dot(n, t)));
    const l = Math.hypot(...q);
    return l > 1e-6 ? mul(q, 1 / l) : null;
  };
  // Normale je Baustein: eigene Biegeebene, sonst die des nächsten Bausteins mit Biegung, sonst senkrecht zur Laufrichtung
  const k = plan.cuts.length;
  const ref = (i: number): V3 | null => {
    for (let d = 0; d < k; d++)
      for (const j of [i - d, i + d]) if (j >= 0 && j < k && plan.cuts[j]?.n) return plan.cuts[j].n;
    return null;
  };
  const planeAt = (pl: Placement, f: Frame, n: V3 | null) => {
    const m = (n && perp(n, f.t)) ?? perp(n0, f.t) ?? f.u;
    return { p: add(mulMV(pl.R, f.o), pl.tr), n: mulMV(pl.R, m) };
  };
  const P2 = p2 ?? p1;
  const sb = plan.split?.block ?? Infinity;
  const blocks = plan.cuts.map((c, i) => (c ? planeAt(i > sb ? P2 : p1, c.start, c.n ?? ref(i)) : null));
  const gateUp = plan.split && plan.cuts[sb] ? planeAt(P2, plan.cuts[sb].start, plan.cuts[sb].n ?? ref(sb)) : null;
  const a = planeAt(p1, plan.startFrame, ref(0));
  const b = planeAt(P2, plan.chainEnd.frame, ref(k - 1));
  const c = plan.cChainEnd ? planeAt(plan.split?.cPart2 ? P2 : p1, plan.cChainEnd.frame, plan.cCut ?? null) : null;
  const loose = plan.loose.length ? loosePlacements(spec, plan) : [];
  return (name: string) => {
    // Schieberplatten liegen flach daneben: Schnitt längs durch die Mitte der Platte
    const spl = /^Schieberplatte (\d+)/.exec(name);
    if (spl) {
      const i = plan.loose.findIndex((q) => q.name === `Schieberplatte ${spl[1]}`);
      return i >= 0 ? { p: loose[i].tr, n: [0, 1, 0] } : null;
    }
    const m = /^Formstück (\d+)/.exec(name);
    if (m) return Number(m[1]) - 1 === sb && name.endsWith(' oben') ? gateUp : (blocks[Number(m[1]) - 1] ?? null);
    if (c && (/^(Geräteanschluss C|Übergang zu Ende C)/.test(name) || / C( \d+)?$/.test(name))) return c;
    if (/^(Geräteanschluss|Übergang zum Gerät|Übergang zu Ende B|Anschlagring|Düsenrand)/.test(name) || / B( \d+)?$/.test(name)) return b;
    return a;
  };
}

/**
 * Grundfläche des Adapters auf dem Druckbett (grob, eher zu groß), beide Teile zusammen. Davor werden die
 * Schieberplatten abgelegt. z0: Höhe des Betts (Endfläche unten).
 */
export function footprint(spec: FreeSpec, plan: FreePlan): Box2 & { z0: number } {
  const { p1, p2 } = partPlacements(spec, plan);
  const b1 = partBox(p1, partPoints(spec, plan, 1));
  const box = p2 ? (() => {
    const b2 = partBox(p2, partPoints(spec, plan, 2));
    return { x0: Math.min(b1.x0, b2.x0), x1: Math.max(b1.x1, b2.x1), y0: Math.min(b1.y0, b2.y0), y1: Math.max(b1.y1, b2.y1) };
  })() : b1;
  const z0 = plan.split || spec.bed === 'A' ? 0 : add(mulMV(p1.R, plan.end.o), p1.tr)[2];
  return { ...box, z0 };
}

/**
 * Lage der Schieberplatten auf dem Bett: vor dem Adapter (in −y, 6 mm Abstand), mittig zu ihm, untereinander;
 * flach auf der Höhe des Betts. So bleibt die Grundfläche fast quadratisch (die Platte ist lang und schmal).
 */
export function loosePlacements(spec: FreeSpec, plan: FreePlan): Placement[] {
  const fp = footprint(spec, plan);
  const cx = (fp.x0 + fp.x1) / 2;
  let y = fp.y0 - 6;
  return plan.loose.map((q) => {
    const tr: V3 = [cx - (q.x0 + q.x1) / 2, y - q.hw, fp.z0];
    y -= 2 * q.hw + 6;
    return { R: IDENTITY, tr };
  });
}

/** Gewählte Extras am Gerät, die auch wirklich gebaut werden (für Dateiname und Druckbett-Liste) */
export function extrasText(spec: FreeSpec): string[] {
  const dv = spec.b.device;
  if (spec.b.type === 'nozzle') {
    const t = { ...DEFAULT_TIP, ...spec.b.tip };
    return [t.ring && !t.brush && 'Ring', t.brush && 'Buerstennut'].filter((x): x is string => !!x);
  }
  if (spec.b.type !== 'device') return [];
  if (dv.mode === 'flange') return ['Flansch', ...(dv.seal ? ['Dichtung'] : [])];
  const over = dv.mode === 'over';
  return [
    dv.ribs && 'Rippen',
    over && dv.slots && SLOT_SHAPES.has(dv.section.shape) && 'Schlitze',
    dv.holes && dv.length >= 12 && 'Schrauben',
    over && dv.notch && 'Aussparung',
  ].filter((t): t is string => !!t);
}

/** Querschnitt nach dem letzten Baustein (ohne Planung) */
export function lastSection(spec: FreeSpec): Section {
  let s = sec('circle', { d: spec.a.d });
  for (const b of spec.blocks) if (b.type === 'transition' || b.type === 'step') s = b.section;
  return s;
}
/** Extras der Düsenspitze in Worten */
export function extrasLong(spec: FreeSpec): string[] {
  const t = { ...DEFAULT_TIP, ...spec.b.tip };
  return [t.ring && !t.brush && 'Schutzring', t.brush && 'Rand mit Bürstennut'].filter((x): x is string => !!x);
}

/**
 * Kurztexte der Kette: Kennung für die Kopfzeile („M25 → 62 × 38“), Untertitel („Bogen 30°, Gerät aufgesteckt“),
 * Text für den Download-Schritt und Dateiname („M25 Freiform Bogen30 Geraet 62x38“).
 */
export function freeSummary(spec: FreeSpec): { code: string; sub: string; long: string; file: string; blocks: string } {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const end = (t: OsvacEnd, d: number) => `${t === 'female' ? 'F' : 'M'}${f(d)}`;
  const A = end(spec.a.type, spec.a.d);
  const dev = sectionText(spec.b.device.section);
  const isDev = spec.b.type === 'device';
  const isNoz = spec.b.type === 'nozzle';
  const tip = { ...DEFAULT_TIP, ...spec.b.tip };
  const tipSec = sectionText(lastSection(spec));
  const tipText = tip.angle > 0 ? `Spitze schräg ${f(tip.angle)}°` : 'Spitze gerade';
  const B = isDev ? dev : isNoz ? tipSec : end(spec.b.type as OsvacEnd, spec.b.d);
  const blocks = spec.blocks.map((b) => (b.type === 'bend' ? `Bogen ${f(b.angle)}°` : b.type === 'branch' ? `Abzweig ${f(b.angle)}°${b.sweep && b.angle >= SWEEP_FROM ? ' gebogen' : ''}` : BLOCK_LABELS[b.type])).join(', ');
  const devText = `Gerät ${{ over: 'aufgesteckt', into: 'eingesteckt', flange: 'mit Flansch' }[spec.b.device.mode]}`;
  const split = hasSplit(spec);
  const sub = ['Freiform', blocks, isDev ? devText : isNoz ? `Düse, ${tipText}` : '', split ? '2 Druckteile' : ''].filter(Boolean).join(' · ');
  const fileB = isDev ? `Geraet ${dev.replace(/ × /g, 'x').replace('Ø ', 'D')}` : isNoz ? `Duese ${tipSec.replace(/ × /g, 'x').replace('Ø ', 'D')}${tip.angle > 0 ? ` schraeg${f(tip.angle)}` : ''}` : B;
  const fileMid = spec.blocks.filter((b) => b.type === 'bend' || b.type === 'branch' || b.type === 'gate' || b.type === 'bleed').map((b) => (b.type === 'gate' ? 'Schieber' : b.type === 'bleed' ? 'Nebenluft' : `${b.type === 'bend' ? 'Bogen' : 'Abzweig'}${f(b.angle)}`)).join(' ');
  // Ende C am Abzweig
  const hasC = spec.blocks.some((b) => b.type === 'branch') && !!spec.c;
  const C = hasC ? (spec.c!.type === 'device' ? sectionText(spec.c!.device.section) : end(spec.c!.type as OsvacEnd, spec.c!.d)) : '';
  const fileC = hasC ? (spec.c!.type === 'device' ? `Geraet ${C.replace(/ × /g, 'x').replace('Ø ', 'D')}` : C) : '';
  const x = extrasText(spec);
  return {
    code: `${A} → ${B.replace(/^Kontur /, '')}${hasC ? ` + ${C.replace(/^Kontur /, '')}` : ''}`,
    sub,
    long: `${A} → ${isDev ? `${devText} ${dev}` : isNoz ? `Düse ${tipSec}, ${tipText}${x.length ? ` (${extrasLong(spec).join(', ')})` : ''}` : B}${hasC ? `, Abzweig → ${spec.c!.type === 'device' ? `Gerät ${C}` : C}` : ''}${split ? ', 2 Druckteile' : ''}`,
    file: [A, 'Freiform', fileMid, fileB, ...x, hasC ? `und ${fileC}` : '', split ? '2 Teile' : ''].filter(Boolean).join(' '),
    blocks,
  };
}

/**
 * Überhang-Prüfung: Anschlüsse von osVAC neo (Kupplung, Stecker mit Übergang, Rändelung, Textfelder), die beim Druck
 * schräg stehen, zählen mit. Senkrecht (Achse höchstens 15° geneigt) sind sie für den Druck ohne Stützen gebaut,
 * schräg nach einem Bogen oder am Abzweig hängen Nut, Rand und Schrift über.
 */
export function tiltedEnds(spec: FreeSpec, plan: FreePlan): (name: string) => boolean {
  const { p1, p2 } = partPlacements(spec, plan);
  const tilted = (pl: Placement, t: V3) => Math.abs(mulMV(pl.R, t)[2]) < Math.cos(rad(15));
  const isB = (n: string) => / B( \d+)?$/.test(n) && !n.startsWith('Formstück') && !n.startsWith('Übergang zu') && !n.startsWith('Geräteanschluss');
  const isC = (n: string) => / C( \d+)?$/.test(n) && !n.startsWith('Formstück') && !n.startsWith('Übergang zu') && !n.startsWith('Geräteanschluss');
  const chain = /^(Formstück|Übergang zu|Übergang zum Gerät|Geräteanschluss|Anschlagring|Düsenrand|Schieberplatte|Schiebehülse)/;
  const osB = spec.b.type === 'female' || spec.b.type === 'male';
  const osC = !!spec.c && (spec.c.type === 'female' || spec.c.type === 'male');
  const bT = osB && tilted(plan.split ? p2! : p1, plan.end.t);
  const cT = osC && !!plan.cEnd && tilted(plan.split?.cPart2 ? p2! : p1, plan.cEnd.t);
  const aT = tilted(p1, plan.startFrame.t);
  return (n) => (isB(n) ? bT : isC(n) ? cT : !chain.test(n) && !n.startsWith('Druckhilfe') && aT);
}
