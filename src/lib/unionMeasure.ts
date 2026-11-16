/**
 * Volumen und Außenfläche des fertigen Teils: alle Körper als Netze vereinigt (manifold-3d). Die Körper eines
 * Adapters berühren und überlappen sich (wie in Fusion); ihre Flächen einfach zusammenzuzählen, zählt die
 * Stoßflächen innen mit und macht die Filamentschätzung zu hoch.
 */
import { weld } from './worker/threemf';

export interface UnionBody {
  helper: boolean;
  positions: Float32Array;
  indices: Uint32Array;
}
export interface UnionMeasures {
  volume: number;
  area: number;
  helperVolume: number;
  helperArea: number;
  /** Material wie gedruckt (siehe printedVolume), ohne bzw. zusätzlich mit Druckhilfe; fehlt, wenn das Schneiden scheitert */
  printed?: number;
  printedHelper?: number;
}

/**
 * Druckeinstellung, für die die Filamentangabe gilt: 0,2 mm Schichten, 3 Wände, 5 Lagen oben, 3 unten, 15 % Füllung.
 * WALL ist die Dicke der 3 Wände, wie sie Bambu Studio verbraucht (0,42 + 2 × 0,45 mm Linien, dazu Überlappung):
 * abgeglichen an drei gesliceten Teilen (Nebenluft F32H36 78,4 g, M36F36 40,0 g, Flansch D63 63,6 g), Abweichung < 1 %.
 */
export const PRINT = { layer: 0.2, wall: 1.36, top: 5, bottom: 3, infill: 0.15 };

/**
 * Materialvolumen wie im Slicer: das Teil in Schichten schneiden; je Schicht zählen die Wände (Rand nach innen
 * versetzt) und die vollen Lagen oben und unten (Fläche, die in den nächsten 5 Schichten darüber bzw. 3 darunter
 * nicht überall Material hat) ganz, der Rest mit der Füllung.
 */
export function printedVolume(m: Wasm): number {
  const { layer: h, wall, top, bottom, infill } = PRINT;
  const bb = m.boundingBox();
  const z0 = bb.min[2];
  const n = Math.ceil((bb.max[2] - z0) / h);
  const garbage: Wasm[] = [];
  const keep = <T,>(x: T) => (garbage.push(x), x);
  try {
    const empty = keep(m.slice(z0 - 1));
    // vereinfacht (0,02 mm), sonst dauert das Versetzen 20-mal so lang
    const S: Wasm[] = [];
    for (let i = 0; i < n; i++) {
      const raw = m.slice(z0 + (i + 0.5) * h);
      S.push(keep(raw.simplify(0.02)));
      raw.delete?.();
    }
    const at = (i: number) => S[i] ?? empty;
    let full = 0, sparse = 0;
    for (let i = 0; i < n; i++) {
      const a = S[i].area();
      if (a <= 0) continue;
      let inner = keep(S[i].offset(-wall, 'Miter'));
      for (let k = 1; k <= top; k++) inner = keep(inner.intersect(at(i + k)));
      for (let k = 1; k <= bottom; k++) inner = keep(inner.intersect(at(i - k)));
      const as = inner.area();
      full += a - as;
      sparse += as;
    }
    return (full + infill * sparse) * h;
  } finally {
    for (const g of garbage) g.delete?.();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wasm = any;

/** Vereinigung messen; wirft, wenn ein Netz nicht geschlossen ist (dann gilt die einfache Summe) */
export function measureUnion(wasm: Wasm, bodies: UnionBody[]): UnionMeasures {
  const { Manifold, Mesh } = wasm;
  const made: { m: Wasm; helper: boolean }[] = [];
  const garbage: Wasm[] = [];
  try {
    for (const b of bodies) {
      const w = weld({ name: '', vertices: b.positions, triangles: b.indices });
      const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(w.vertices), triVerts: new Uint32Array(w.triangles) });
      mesh.merge();
      const m = new Manifold(mesh);
      garbage.push(m);
      made.push({ m, helper: b.helper });
    }
    const base = made.filter((x) => !x.helper).map((x) => x.m);
    const all = made.map((x) => x.m);
    const u0 = base.length > 1 ? Manifold.union(base) : base[0];
    if (u0 !== base[0]) garbage.push(u0);
    const volume = u0.volume(), area = u0.surfaceArea();
    let helperVolume = 0, helperArea = 0;
    let u1: Wasm = null;
    if (all.length > base.length) {
      u1 = Manifold.union(all);
      garbage.push(u1);
      helperVolume = Math.max(0, u1.volume() - volume);
      helperArea = Math.max(0, u1.surfaceArea() - area);
    }
    let printed: number | undefined, printedHelper: number | undefined;
    try {
      printed = printedVolume(u0);
      printedHelper = u1 ? Math.max(0, printedVolume(u1) - printed) : 0;
    } catch {
      // dann gilt die Spanne aus Volumen und Fläche
      printed = printedHelper = undefined;
    }
    return { volume, area, helperVolume, helperArea, printed, printedHelper };
  } finally {
    for (const g of garbage) g.delete?.();
  }
}
