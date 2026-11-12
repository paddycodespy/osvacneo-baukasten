/**
 * Überhang der Freiform-Formstücke: Fläche, die beim Druck steiler als 45° nach unten zeigt und nicht auf dem
 * Druckbett liegt. Die Anschlüsse von osVAC neo zählen nicht mit: sie sind für den Druck ohne Stützen gebaut.
 *
 * Nicht mitgezählt werden
 * - Stoßflächen zwischen zwei Körpern (die Unterseite eines Formstücks liegt auf der Oberseite des nächsten),
 * - waagerechte Flächen am Geräteanschluss und am Schieber: das sind Brücken über Aussparung, Schlitz oder Loch.
 */
export interface OverhangMesh {
  name: string;
  helper: boolean;
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
}

const COUNTED = /^(Formstück|Übergang zu|Geräteanschluss|Anschlagring)/;
const CELL = 3;

type Tri = { a: number[]; b: number[]; c: number[]; n: number[] };

export function overhangArea(bodies: OverhangMesh[]): number {
  let zMin = Infinity;
  for (const b of bodies) for (let i = 2; i < b.positions.length; i += 3) zMin = Math.min(zMin, b.positions[i]);

  // nach oben zeigende Dreiecke aller Körper, nach Raumzellen sortiert (für die Stoßflächen)
  const up = new Map<string, { body: number; t: Tri }[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  const tri = (b: OverhangMesh, t: number): Tri => {
    const p = b.positions, ix = b.indices;
    const v = (k: number) => [p[ix[t + k] * 3], p[ix[t + k] * 3 + 1], p[ix[t + k] * 3 + 2]];
    const a = v(0), bb = v(1), c = v(2);
    const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    return { a, b: bb, c, n };
  };
  bodies.forEach((b, bi) => {
    const nr = b.normals, ix = b.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const nz = (nr[ix[t] * 3 + 2] + nr[ix[t + 1] * 3 + 2] + nr[ix[t + 2] * 3 + 2]) / 3;
      if (nz < 0.7) continue;
      const T = tri(b, t);
      const xs = [T.a[0], T.b[0], T.c[0]], ys = [T.a[1], T.b[1], T.c[1]], zs = [T.a[2], T.b[2], T.c[2]];
      for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
        for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++)
          for (let k = Math.floor(Math.min(...zs) / CELL); k <= Math.floor(Math.max(...zs) / CELL); k++) {
            const kk = `${i},${j},${k}`;
            const list = up.get(kk) ?? [];
            list.push({ body: bi, t: T });
            up.set(kk, list);
          }
    }
  });
  /** liegt der Punkt auf einer nach oben zeigenden Fläche eines anderen Körpers? */
  const covered = (bi: number, q: number[]) => {
    for (const { body, t } of up.get(key(q[0], q[1], q[2])) ?? []) {
      if (body === bi) continue;
      const nl = Math.hypot(t.n[0], t.n[1], t.n[2]) || 1;
      const d = ((q[0] - t.a[0]) * t.n[0] + (q[1] - t.a[1]) * t.n[1] + (q[2] - t.a[2]) * t.n[2]) / nl;
      if (Math.abs(d) > 0.05) continue;
      // baryzentrisch prüfen (mit etwas Toleranz)
      const v0 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]], v1 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
      const v2 = [q[0] - t.a[0], q[1] - t.a[1], q[2] - t.a[2]];
      const dot = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
      const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
      const den = d00 * d11 - d01 * d01;
      if (!(den > 0)) continue;
      const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
      if (v >= -0.02 && w >= -0.02 && v + w <= 1.02) return true;
    }
    return false;
  };

  let area = 0;
  bodies.forEach((b, bi) => {
    if (b.helper || !COUNTED.test(b.name)) return;
    const bridges = b.name.startsWith('Geräteanschluss') || b.name.endsWith('· Schieber');
    const nr = b.normals, ix = b.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const nz = (nr[ix[t] * 3 + 2] + nr[ix[t + 1] * 3 + 2] + nr[ix[t + 2] * 3 + 2]) / 3;
      if (nz > -0.72 || (bridges && nz < -0.999)) continue;
      const T = tri(b, t);
      if (Math.min(T.a[2], T.b[2], T.c[2]) < zMin + 0.4) continue;
      const cen = [0, 1, 2].map((k) => (T.a[k] + T.b[k] + T.c[k]) / 3);
      if (covered(bi, cen)) continue;
      area += Math.hypot(T.n[0], T.n[1], T.n[2]) / 2;
    }
  });
  return area;
}

/**
 * Wie weit ragt der Adapter unter das Ende, das auf dem Druckbett liegen soll? (0 = alles darüber)
 * Ende B: Geräteanschluss bzw. die Teile von Ende B („… B“); Anschluss A: die übrigen Teile von osVAC neo.
 */
export function belowBedEnd(bodies: OverhangMesh[], bed: 'A' | 'B'): number {
  // Ende C (am Abzweig) liegt nie auf dem Bett und zählt wie die Kette
  const isC = (n: string) => n.startsWith('Geräteanschluss C') || / C( \d+)?$/.test(n) || n === 'Übergang zu Ende C';
  const isB = (n: string) => !isC(n) && (n.startsWith('Geräteanschluss') || / B( \d+)?$/.test(n));
  const isChain = (n: string) => isC(n) || /^(Formstück|Übergang zum Gerät|Übergang zu Ende B|Anschlagring|Schieberplatte)/.test(n);
  const isEnd = (n: string) => (bed === 'B' ? isB(n) : !isB(n) && !isChain(n));
  let zAll = Infinity, zEnd = Infinity;
  for (const b of bodies) {
    if (b.helper) continue;
    let z = Infinity;
    for (let i = 2; i < b.positions.length; i += 3) z = Math.min(z, b.positions[i]);
    zAll = Math.min(zAll, z);
    if (isEnd(b.name)) zEnd = Math.min(zEnd, z);
  }
  return Number.isFinite(zEnd) ? Math.max(0, zEnd - zAll) : 0;
}
