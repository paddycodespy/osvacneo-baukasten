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
import { loft, assembleWire, makeFace, cast, getOC, Edge, Vector, makeLine, makeThreePointArc, makeCircle, makeEllipse, basicFaceExtrusion, revolution, makeCompound, makeCylinder, makePolygon, measureVolume, type Shape3D, type Point } from 'replicad';
import { UserError, partLabel } from '../errors';

// ---------------------------------------------------------------- Datenmodell

export type SectionShape = 'circle' | 'ellipse' | 'slot' | 'rect' | 'dshape' | 'trapezoid';

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
}

export type BlockType = 'straight' | 'bend' | 'transition' | 'step';

export interface Block {
  /** nur für die Oberfläche (Liste, aufgeklappter Baustein) */
  id: number;
  type: BlockType;
  /** Gerade, Übergang */
  length: number;
  /** Bogen: Winkel */
  angle: number;
  /** Bogen: Radius der Mittellinie */
  radius: number;
  /** Richtung, in die Bogen, Versatz und Knick zeigen (Grad um die Mittellinie) */
  dir: number;
  /** Übergang: seitlicher Versatz des Endes */
  offset: number;
  /** Übergang: Knick des Endes */
  tilt: number;
  /** Übergang: Verdrehung des Querschnitts */
  twist: number;
  /** Übergang, Absatz: Querschnitt am Ende */
  section: Section;
}

export type OsvacEnd = 'female' | 'male';

export interface DeviceEnd {
  /** aufgesteckt (Muffe/Haube über den Stutzen) oder eingesteckt (Zapfen in die Öffnung) */
  mode: 'over' | 'into';
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
}

export interface FreeSpec {
  a: { type: OsvacEnd; d: number };
  /** Wandstärke der Formstücke und des Geräteanschlusses */
  wall: number;
  blocks: Block[];
  b: { type: 'device' | OsvacEnd; d: number; device: DeviceEnd; transition: number };
  /** welches Ende auf dem Druckbett liegt */
  bed: 'A' | 'B';
}

export const SECTION_LABELS: Record<SectionShape, string> = {
  circle: 'Kreis',
  ellipse: 'Ellipse',
  slot: 'Langloch',
  rect: 'Rechteck',
  dshape: 'D-Form',
  trapezoid: 'Trapez',
};

/** Welche Felder eine Form braucht (Reihenfolge = Reihenfolge in der Oberfläche). */
export const SECTION_FIELDS: Record<SectionShape, (keyof Omit<Section, 'shape'>)[]> = {
  circle: ['d'],
  ellipse: ['w', 'h'],
  slot: ['w', 'h'],
  rect: ['w', 'h', 'r', 'r2'],
  dshape: ['d', 'h', 'r'],
  trapezoid: ['w', 'w2', 'h', 'r'],
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  straight: 'Gerade',
  bend: 'Bogen',
  transition: 'Übergang',
  step: 'Absatz',
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
    ...v,
  };
}

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
};

/** Lage der Schraubenlöcher als Anteil am Umfang (ab +u, wie beim Rohrkonus 90/210/330°) */
const HOLE_AT = [0.25, 7 / 12, 11 / 12];

/**
 * Schlitze für die Schlauchschelle, fest nach Größe des Adapters:
 * 80 % der Tiefe lang (damit die Zungen federn), Breite Umfang/40 (2,5–4 mm, auf 0,5 mm gerundet),
 * mit Schraubenlöchern 3 Stück genau zwischen den Löchern, sonst 3 / 4 / 6 je nach Umfang (unter 100 / bis 200 / darüber).
 */
function slotLayout(P: number, L: number, withHoles: boolean) {
  const len = Math.max(6, Math.min(Math.round(L * 0.8), L - 3));
  const width = Math.min(4, Math.max(2.5, Math.round((P / 40) * 2) / 2));
  const n = withHoles ? 3 : P < 100 ? 3 : P <= 200 ? 4 : 6;
  const at = withHoles ? [1 / 12, 5 / 12, 9 / 12] : Array.from({ length: n }, (_, k) => (k + 0.5) / n);
  return { len, width, at };
}
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
];

export const DEFAULT_FREE: FreeSpec = TEMPLATES[0].make();

/** Gespeicherten Aufbau übernehmen: neue IDs, fehlende Felder mit Standardwerten. */
export function withFreshIds(s: FreeSpec): FreeSpec {
  const types: BlockType[] = ['straight', 'bend', 'transition', 'step'];
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
    default:
      return { ...s, d: s.d + 2 * delta, w: s.w + 2 * delta, h: s.h + 2 * delta, r: rr(s.r), r2: rr(s.r2) };
  }
}

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

export function perimeter(s: Section): number {
  const d = dense(contour(s));
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
  const d = dense(contour(s));
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
  return `${f(s.w)} × ${f(s.h)}`;
}

const sameSection = (a: Section, b: Section) => {
  const ks = ['shape', ...SECTION_FIELDS[a.shape]] as (keyof Section)[];
  return a.shape === b.shape && ks.every((k) => Math.abs((a[k] as number) - (b[k] as number)) < 1e-9 || a[k] === b[k]);
};

/** Nur die Felder, die die Form benutzt (für Schlüssel und Vergleiche). */
const secKey = (s: Section) => [s.shape, ...SECTION_FIELDS[s.shape].map((k) => r6(s[k]))];

// ---------------------------------------------------------------- Prüfungen

export interface Issue {
  level: 'error' | 'warn';
  text: string;
}

function checkSection(s: Section, what: string, out: Issue[]) {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const fields = SECTION_FIELDS[s.shape];
  for (const k of fields) if (!(s[k] >= 0) || !Number.isFinite(s[k])) out.push({ level: 'error', text: `${what}: Bitte alle Maße eingeben.` });
  if (fields.includes('d') && s.d < 6) out.push({ level: 'error', text: `${what}: Der Durchmesser muss mindestens 6 mm betragen.` });
  if (fields.includes('w') && s.w < 6) out.push({ level: 'error', text: `${what}: Die Breite muss mindestens 6 mm betragen.` });
  if (fields.includes('h') && s.h < 4) out.push({ level: 'error', text: `${what}: Die Höhe muss mindestens 4 mm betragen.` });
  if (s.shape === 'slot' && s.w < s.h) out.push({ level: 'warn', text: `${what}: Beim Langloch ist die Breite kleiner als die Höhe, es steht also hochkant. Das ist in Ordnung, falls so gewollt.` });
  if (s.shape === 'dshape') {
    if (s.h >= s.d) out.push({ level: 'error', text: `${what}: Bei der D-Form muss die Höhe kleiner sein als der Durchmesser, sonst gibt es keine flache Seite.` });
    if (s.h <= s.d / 2 + 1) out.push({ level: 'error', text: `${what}: Bei der D-Form muss die Höhe größer als ${f(s.d / 2 + 1)} mm sein (gut die Hälfte des Durchmessers).` });
  }
  if (s.shape === 'trapezoid' && s.w2 < 4) out.push({ level: 'error', text: `${what}: Die obere Breite des Trapezes muss mindestens 4 mm betragen.` });
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
}

export interface FreePlan {
  bodies: FreeBody[];
  issues: Issue[];
  /** Rahmen am Ende der Formstücke (Anfang von Ende B) mit Querschnitt */
  chainEnd: { frame: Frame; section: Section; rot: number };
  /** Rahmen der Außenfläche von Ende B (Laufrichtung zeigt aus dem Adapter heraus) */
  end: Frame;
  /** Punkte entlang der Mittellinie (für Lage und Ausrichtung auf dem Druckbett) */
  path: V3[];
}

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
export function planFree(spec: FreeSpec): FreePlan {
  const issues: Issue[] = [];
  const bodies: FreeBody[] = [];
  const w = spec.wall;
  if (!(w >= 1.6)) issues.push({ level: 'error', text: 'Die Wandstärke muss mindestens 1,6 mm sein.' });
  if (w > 8) issues.push({ level: 'warn', text: 'Über 8 mm Wandstärke wird der Adapter sehr schwer.' });

  const zStart = -OSVAC_HEIGHT[spec.a.type] - OSVAC_TRANSITION;
  let f: Frame = { o: [0, 0, zStart], t: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] };
  let s: Section = sec('circle', { d: spec.a.d });
  let rotS = 0;
  const path: V3[] = [[0, 0, 0], f.o];
  const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');

  spec.blocks.forEach((b, idx) => {
    const name = `Formstück ${idx + 1} · ${BLOCK_LABELS[b.type]}`;
    const what = `${BLOCK_LABELS[b.type]} (Baustein ${idx + 1})`;
    const start = f, s0 = s, rot0 = rotS;
    const inner0 = s0, outer0 = grow(s0, w);
    const base = { kind: 'free', f: frameKey(start), s: secKey(s0), rot: r6(rot0), w };
    if (b.type === 'straight') {
      if (!(b.length > 0.5)) {
        issues.push({ level: 'error', text: `${what}: Die Länge muss größer als 0,5 mm sein.` });
        return;
      }
      bodies.push({ name, cost: 0.3, dep: { ...base, t: 'straight', L: b.length }, make: () => extrudeRing(start, inner0, outer0, rot0, b.length) });
      f = advance(f, b.length);
      path.push(f.o);
    } else if (b.type === 'bend') {
      const D = inPlane(f, b.dir);
      const need = extent(outer0, rot0, b.dir) + 0.5;
      if (!(b.angle > 0 && b.angle <= 180)) {
        issues.push({ level: 'error', text: `${what}: Der Winkel muss zwischen 1° und 180° liegen.` });
        return;
      }
      if (!(b.radius > need)) {
        issues.push({ level: 'error', text: `${what}: Der Radius ist zu klein. Er muss größer als ${f1(need)} mm sein, sonst überschneidet sich der Bogen innen.` });
        return;
      }
      if (b.radius < need + w * 2) issues.push({ level: 'warn', text: `${what}: Sehr enger Bogen. Er bremst die Luft und braucht beim Druck meist Stützen. Ein größerer Radius hilft.` });
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
    } else {
      const s1 = b.section;
      checkSection(s1, what, issues);
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
        if (!(L >= 2)) {
          issues.push({ level: 'error', text: `${what}: Die Länge muss mindestens 2 mm betragen.` });
          return;
        }
        if (Math.abs(tilt) > 90) {
          issues.push({ level: 'error', text: `${what}: Der Knick darf höchstens 90° sein. Für mehr einen Bogen verwenden.` });
          return;
        }
        if (Math.abs(offset) > L) issues.push({ level: 'warn', text: `${what}: Der Versatz ist größer als die Länge. Das wird sehr steil und druckt sich schlecht; den Übergang länger machen.` });
        let m = 0;
        for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(po1[i][0] - po0[i][0], po1[i][1] - po0[i][1]));
        if (m > L * 1.2) issues.push({ level: 'warn', text: `${what}: Die Schräge ist sehr steil. Den Übergang länger machen, dann geht der Druck ohne Stützen.` });
      }
      // Mittellinie: kubische Kurve von der Startfläche zur versetzten, geknickten Endfläche
      const D = inPlane(start, b.dir);
      const curved = Math.abs(offset) > 1e-6 || Math.abs(tilt) > 1e-6;
      const axis = unit(cross(start.t, D));
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

  const bedEnd = spec.bed === 'A' ? spec.a.type : spec.b.type;
  if (bedEnd === 'female')
    issues.push({ level: 'warn', text: 'Die Kupplung liegt mit der Öffnung nach unten. So bräuchte sie innen Stützen. Besser das andere Ende nach unten legen.' });
  const chainEnd = { frame: f, section: s, rot: rotS };
  let end: Frame = f;
  if (spec.b.type === 'device') end = planDevice(spec, chainEnd, bodies, issues, path);
  else {
    // Ende B osVAC neo: Querschnitt auf den Kreis des Anschlusses bringen, danach Übergangskonus und Anschluss
    const target = sec('circle', { d: spec.b.d });
    let fe = f;
    if (!sameSection(s, target) || Math.abs(rotS % 360) > 1e-9 && s.shape !== 'circle') {
      const L = spec.b.transition;
      if (!(L >= 2)) issues.push({ level: 'error', text: 'Ende B: Die Übergangslänge muss mindestens 2 mm betragen.' });
      else {
        bodies.push(autoTransition('Übergang zu Ende B', fe, s, rotS, target, 0, L, w, { b: spec.b.d }));
        fe = advance(fe, L);
        path.push(fe.o);
      }
    }
    end = advance(fe, OSVAC_TRANSITION + OSVAC_HEIGHT[spec.b.type]);
    path.push(end.o);
    chainEnd.frame = fe;
    chainEnd.section = target;
    chainEnd.rot = 0;
  }
  return { bodies, issues, chainEnd, end, path };
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
  const a = dv.allowance;
  const isCircle = dv.section.shape === 'circle';
  checkSection(dv.section, 'Gerät', issues);
  if (!(dv.length >= 5)) issues.push({ level: 'error', text: 'Gerät: Die Tiefe muss mindestens 5 mm sein.' });
  else if (dv.length < 10) issues.push({ level: 'warn', text: `Gerät: Unter 10 mm Tiefe hält der Adapter kaum ${dv.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}.` });
  if (!(a >= 0 && a <= 3)) issues.push({ level: 'error', text: 'Gerät: Die Luft (Zugabe) muss zwischen 0 und 3 mm liegen.' });
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
  if ((F.inn.shape === 'circle' ? F.inn.d : Math.min(F.inn.w, F.inn.h)) < 4)
    issues.push({ level: 'error', text: 'Gerät: Innen bleiben weniger als 4 mm frei. Maße, Luft oder Wandstärke prüfen.' });
  if (issues.some((x) => x.level === 'error')) return ce.frame;

  let f = ce.frame;
  const rot1 = dv.rot;
  const L0 = spec.b.transition;
  if (!sameSection(ce.section, F.inn) || Math.abs(ce.rot - rot1) > 1e-9) {
    if (!(L0 >= 2)) {
      issues.push({ level: 'error', text: 'Gerät: Die Übergangslänge muss mindestens 2 mm betragen.' });
      return f;
    }
    let m = 0;
    const N = 120;
    const p0 = samplePoints(grow(ce.section, w), N, ce.rot), p1 = samplePoints(F.out, N, rot1);
    for (let i = 0; i < N; i++) m = Math.max(m, Math.hypot(p1[i][0] - p0[i][0], p1[i][1] - p0[i][1]));
    if (m > L0 * 1.2) issues.push({ level: 'warn', text: `Gerät: Die Schräge zum Gerät ist sehr steil (${Math.round(m)} mm auf ${Math.round(L0)} mm Länge). In den Feineinstellungen die Übergangslänge erhöhen, dann geht der Druck ohne Stützen.` });
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
    issues.push({ level: 'warn', text: 'Gerät: Für die Schraubenlöcher braucht es mindestens 12 mm Tiefe. Ohne Löcher gebaut.' });
    holes = false;
  }
  const slots = over && dv.slots;
  let notch = over && dv.notch;
  if (notch) {
    if (!(dv.notchW >= 3)) issues.push({ level: 'error', text: 'Gerät: Die Aussparung muss mindestens 3 mm breit sein.' });
    else if (dv.notchW > P / 2) issues.push({ level: 'error', text: 'Gerät: Die Aussparung ist breiter als der halbe Umfang. Bitte schmaler machen.' });
    if (!(dv.notchH >= 2)) issues.push({ level: 'error', text: 'Gerät: Die Aussparung muss mindestens 2 mm tief sein.' });
    else if (dv.notchH > L - 3) issues.push({ level: 'error', text: `Gerät: Die Aussparung darf höchstens ${Math.round(L - 3)} mm tief sein, sonst hält der Adapter nicht mehr.` });
    if (issues.some((x) => x.level === 'error' && x.text.includes('Aussparung'))) notch = false;
  }
  const xHole = L - 8;
  const nRad = rad(dv.notchDir + rot1);
  const ray: P2 = [Math.cos(nRad), Math.sin(nRad)], perp: P2 = [-ray[1], ray[0]];
  const reach = Math.max(...samplePoints(grow(front, a + w + 2), 90, rot1).map(([x, y]) => Math.hypot(x, y))) + 10;
  /** liegt ein Punkt der Kontur im Bereich der Aussparung? (dort entfallen Löcher, Schlitze und Rippen) */
  const inNotch = (q: P2, margin: number) => notch && Math.abs(q[0] * perp[0] + q[1] * perp[1]) < dv.notchW / 2 + margin && q[0] * ray[0] + q[1] * ray[1] > 0;
  const mid0 = grow(front, a + w / 2);
  const holeAt = HOLE_AT.filter((g) => !inNotch(contourAt(mid0, rot1, [g])[0].p, 6));
  const SL = slotLayout(P, L, holes);
  const slotLen = SL.len, slotW = SL.width;
  const slotAt = SL.at.filter((g) => !inNotch(contourAt(mid0, rot1, [g])[0].p, slotW / 2 + 2));
  if (holes && !holeAt.length) holes = false;

  /** Schnitte, die Muffe/Zapfen und Fase gemeinsam haben */
  const cutTools = (): Shape3D[] => {
    const t: Shape3D[] = [];
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
        t.push(basicFaceExtrusion(makeFace(wire), new Vector(mul(dir3(n), 2 * h) as Point)) as unknown as Shape3D);
      }
    }
    if (notch) {
      const x0 = L - dv.notchH, W = dv.notchW / 2;
      const q = (r: number, s1: number): P2 => [ray[0] * r + perp[0] * s1, ray[1] * r + perp[1] * s1];
      const face = makePolygon([at3(x0, q(0, -W)), at3(x0, q(reach, -W)), at3(x0, q(reach, W)), at3(x0, q(0, W))]);
      t.push(basicFaceExtrusion(face, new Vector(mul(fb.t, dv.notchH + 1) as Point)) as unknown as Shape3D);
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
        throw new UserError('Die Schraubenlöcher am Gerät ließen sich mit diesen Maßen nicht berechnen. Bitte ein Maß etwas ändern oder die Löcher abwählen.');
    }
    if (slots || notch) {
      // einzeln schneiden und prüfen, dass jedes Werkzeug wirklich etwas wegnimmt (alle reichen bis über das offene Ende)
      const start = measureVolume(body);
      for (const tool of cutTools()) {
        const before = measureVolume(body);
        body = body.cut(tool);
        const after = measureVolume(body);
        if (!(after < before - 1e-3) || !(after > start * 0.3))
          throw new UserError('Schlitze oder Aussparung am Gerät ließen sich mit diesen Maßen nicht berechnen. Bitte ein Maß etwas ändern.');
      }
    }
    return body;
  };

  // Klemmrippen: dreieckig, 1,6 mm breit, 0,4 mm in der Wand verankert, ragen RIB_CRUSH über die Gerätefläche
  let ribs: (() => Shape3D) | null = null;
  if (dv.ribs) {
    const x0 = 1, x1 = L - c - 2;
    if (x1 - x0 < 4) issues.push({ level: 'warn', text: 'Gerät: Für Klemmrippen ist die Tiefe zu kurz. Ohne Rippen gebaut.' });
    else {
      const n = Math.max(6, Math.min(24, Math.round(P / 10)));
      const arc = (f1: number, f2: number) => Math.min(Math.abs(f1 - f2), 1 - Math.abs(f1 - f2)) * P;
      const fr = Array.from({ length: n }, (_, k) => (k + 0.5) / n).filter(
        (f) => !(holes && holeAt.some((g) => arc(f, g) < 5)) && !(slots && slotAt.some((g) => arc(f, g) < slotW / 2 + 2)),
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
          const A = ribPts(x0), B = ribPts(x1);
          const tri = (x: number, q: P2[]) => assembleWire([makeLine(at3(x, q[0]), at3(x, q[1])), makeLine(at3(x, q[1]), at3(x, q[2])), makeLine(at3(x, q[2]), at3(x, q[0]))]);
          const solids = A.flatMap((q, i) => (keep[i] ? [loft([tri(x0, q), tri(x1, B[i])], { ruled: true }) as unknown as Shape3D] : []));
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

/**
 * Lage auf dem Druckbett: gewähltes Ende nach unten (Endfläche flach auf dem Bett),
 * in x/y mittig über dem Ursprung.
 */
export function bedPlacement(spec: FreeSpec, plan: FreePlan): Placement {
  let R: M3 = IDENTITY;
  if (spec.bed === 'A') R = rotM([1, 0, 0], Math.PI);
  else {
    const t = plan.end.t;
    const target: V3 = [0, 0, -1];
    const c = dot(t, target);
    if (c < -1 + 1e-9) R = rotM([1, 0, 0], Math.PI);
    else if (c < 1 - 1e-9) R = rotM(unit(cross(t, target)), Math.acos(c));
  }
  const pts = plan.path.map((p) => mulMV(R, p));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const tr: V3 = [Math.abs(cx) < 1e-6 ? 0 : -cx, Math.abs(cy) < 1e-6 ? 0 : -cy, 0];
  return { R, tr };
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
  const B = isDev ? dev : end(spec.b.type as OsvacEnd, spec.b.d);
  const blocks = spec.blocks.map((b) => (b.type === 'bend' ? `Bogen ${f(b.angle)}°` : BLOCK_LABELS[b.type])).join(', ');
  const devText = `Gerät ${spec.b.device.mode === 'over' ? 'aufgesteckt' : 'eingesteckt'}`;
  const sub = ['Freiform', blocks, isDev ? devText : ''].filter(Boolean).join(' · ');
  const fileB = isDev ? `Geraet ${dev.replace(/ × /g, 'x').replace('Ø ', 'D')}` : B;
  const fileMid = spec.blocks.filter((b) => b.type === 'bend').map((b) => `Bogen${f(b.angle)}`).join(' ');
  return {
    code: `${A} → ${B}`,
    sub,
    long: `${A} → ${isDev ? `${devText} ${dev}` : B}`,
    file: [A, 'Freiform', fileMid, fileB].filter(Boolean).join(' '),
    blocks,
  };
}
