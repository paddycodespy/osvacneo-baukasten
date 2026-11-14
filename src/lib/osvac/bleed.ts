/**
 * Nebenluft-Regler: Rohrstück mit drei Fenstern und einem Drehring mit drei gleichen Fenstern darüber.
 * Ring um 60° drehen = von ganz auf bis ganz zu. Der Ring wird gleich mitgedruckt: Ring und Bunde haben
 * 45°-Flanken mit Spalt g dazwischen (wie der Drehring am Schlauchadapter), daher hängt nichts frei.
 *
 * Eigenes System: Achse +z, Rohr von z = 0 bis L (Anfang des Bausteins bei z = 0).
 */
import { draw, makePolygon, makeCompound, basicFaceExtrusion, Vector, type Shape3D } from 'replicad';

export const BLEED = {
  /** Wanddicke des Rings */
  T: 3,
  /** Höhe der Bunde außen (zwischen den 45°-Flanken) */
  collar: 2,
  /** Abstand vom Anfang/Ende des Bausteins bis zum Bund */
  margin: 1,
  /** drei Fenster je 50° (zu: Ring um 60° gedreht, 10° Überdeckung je Seite) */
  windows: 3,
  winDeg: 50,
  /** Spiel am Ring (Passung): Standard und Bereich */
  gap: 0.3,
  gapMin: 0.2,
  gapMax: 0.6,
};

export function bleedDims(Ri: number, Ro: number, gap: number) {
  const B = BLEED;
  const g = gap, off = g * Math.SQRT2;
  const RR = Ro + g + B.T;
  const dc = RR - Ro;
  const c0 = B.margin;
  /** Oberkante außen am unteren Bund; die obere Flanke steigt nach innen: z = k + (RR − r) */
  const k = c0 + dc + B.collar;
  /** Fensterhöhe nach dem Ø: etwa ein Drittel des Durchmessers, 8–20 mm */
  const hw = Math.min(20, Math.max(8, 0.35 * 2 * Ri));
  const a0 = k + B.T + off; // Ring innen unten
  const Hr = hw + B.T + 2; // Ring innen hoch
  const a1 = a0 + Hr; // Ring innen oben
  const w0 = a0 + 1, w1 = a1 - B.T - 1; // Fenster
  const zb0 = a1 + g + off; // oberer Bund unten am Rohr
  const zb1 = a1 - B.T + off; // … außen
  const zTop = zb0 + B.collar;
  return { Ri, Ro, g, RR, dc, c0, k, hw, a0, a1, w0, w1, zb0, zb1, zTop, minLen: zTop + B.margin };
}
export type BleedDims = ReturnType<typeof bleedDims>;

/** Profil (r, z) um die z-Achse drehen */
function rev(pts: [number, number][]): Shape3D {
  let d = draw(pts[0]);
  for (const q of pts.slice(1)) d = d.lineTo(q);
  return d.close().sketchOnPlane('XZ').revolve() as Shape3D;
}

/** Tortenstück (Winkel a0…a1 in Grad), z0…z1, reicht weit über den Ring hinaus */
function wedge(a0: number, a1: number, z0: number, z1: number): Shape3D {
  const r = 500, n = 8;
  const pts: Vector[] = [new Vector([0, 0, z0])];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push(new Vector([r * Math.cos(a), r * Math.sin(a), z0]));
  }
  const face = makePolygon(pts.map((p) => p.toTuple()) as [number, number, number][]);
  return basicFaceExtrusion(face as never, new Vector([0, 0, z1 - z0])) as Shape3D;
}

function cutWindows(sh: Shape3D, D: BleedDims, rot: number): Shape3D {
  const B = BLEED;
  for (let i = 0; i < B.windows; i++) {
    const c = rot + (360 * i) / B.windows;
    sh = sh.cut(wedge(c - B.winDeg / 2, c + B.winDeg / 2, D.w0, D.w1)) as Shape3D;
  }
  return sh;
}

/** Rohr mit unterem und oberem Bund (45°-Flanken) und den drei Fenstern; L ≥ minLen */
export function bleedBody(D: BleedDims, L: number): Shape3D {
  const { Ri, Ro, RR, dc, c0, k, zb0, zb1, zTop } = D;
  const body = rev([
    [Ri, 0],
    [Ro, 0],
    [Ro, c0],
    [RR, c0 + dc],
    [RR, k],
    [Ro, k + dc],
    [Ro, zb0],
    [RR, zb1],
    [RR, zb1 + BLEED.collar],
    [Ro, zTop],
    [Ro, L],
    [Ri, L],
  ]);
  return cutWindows(body, D, 0);
}

/**
 * Drehring (Querschnitt Parallelogramm: innen a0…a1, außen um T tiefer) mit Griffzähnen außen und den
 * drei Fenstern, gedruckt in Stellung „auf“.
 */
export function bleedRing(D: BleedDims): Shape3D {
  const B = BLEED;
  const { Ro, g, RR, a0, a1 } = D;
  let ring = rev([
    [Ro + g, a0],
    [RR, a0 - B.T],
    [RR, a1 - B.T],
    [Ro + g, a1],
  ]);
  // Griffzähne: Dreiecke 1,6 breit, 0,8 hoch, über die ganze Außenhöhe
  const n = Math.max(12, Math.round((2 * Math.PI * RR) / 4));
  const z0 = a0 - B.T + 0.4, z1 = a1 - B.T - 0.4;
  const teeth: Shape3D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / n;
    const c = Math.cos(a), s = Math.sin(a);
    const p = (r: number, t: number): [number, number, number] => [r * c - t * s, r * s + t * c, z0];
    const face = makePolygon([p(RR - 0.3, -0.8), p(RR + 0.8, 0), p(RR - 0.3, 0.8)]);
    const tooth = basicFaceExtrusion(face as never, new Vector([0, 0, z1 - z0])) as Shape3D;
    teeth.push(tooth);
  }
  ring = ring.fuse(makeCompound(teeth) as Shape3D) as Shape3D;
  return cutWindows(ring, D, 0);
}
