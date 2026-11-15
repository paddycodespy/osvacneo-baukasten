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
    if (all.length > base.length) {
      const u1 = Manifold.union(all);
      garbage.push(u1);
      helperVolume = Math.max(0, u1.volume() - volume);
      helperArea = Math.max(0, u1.surfaceArea() - area);
    }
    return { volume, area, helperVolume, helperArea };
  } finally {
    for (const g of garbage) g.delete?.();
  }
}
