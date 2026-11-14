/**
 * Nebenluft-Regler: Rohrstück mit drei Fenstern und einem Drehring mit drei gleichen Fenstern darüber.
 * Ring um 60° drehen = von ganz auf bis ganz zu. Der Ring wird gleich mitgedruckt:
 * - unterer Bund: Oberseite fällt nach außen ab (45°), der Ring liegt mit Spiel g darauf;
 * - oberer Bund: wächst unten mit 45° vom Rohr nach außen (hängt nie frei), die Ringoberseite steigt parallel dazu
 *   nach außen an. Querschnitt des Rings damit ein Trapez: innen niedrig, außen um 2·T höher.
 * - Raste: eine Noppe innen am Ring (oberhalb der Fenster) greift in Mulden im Rohr bei „auf“ und „zu“; sie ragt
 *   nur halb so weit über das Rohr, wie der Ring Spiel hat, so lässt sie sich mit leichtem Klick überdrehen.
 * - Kerben außen am oberen Bund über den Fenstern im Rohr: Ringfenster unter der Kerbe = auf.
 *
 * Eigenes System: Achse +z, Rohr von z = 0 bis L (Anfang des Bausteins bei z = 0).
 */
import { draw, makePolygon, makeCompound, makeSphere, makeBox, basicFaceExtrusion, Vector, type Shape3D } from 'replicad';

export const BLEED = {
  /** Wanddicke des Rings */
  T: 3,
  /** Höhe der Bunde außen */
  collar: 2,
  /** Abstand vom Anfang/Ende des Bausteins bis zum Bund */
  margin: 1,
  /** drei Fenster je 50° (zu: Ring um 60° gedreht, 10° Überdeckung je Seite) */
  windows: 3,
  winDeg: 50,
  /** Band für die Raste über den Fenstern (Ring innen) */
  detentBand: 3,
  /** Kugel der Noppe; Mulde = Kugel um das Spiel größer */
  bumpR: 1,
  /** Spiel am Ring (Passung): Standard und Bereich */
  gap: 0.4,
  gapMin: 0.2,
  gapMax: 0.6,
};

export function bleedDims(Ri: number, Ro: number, gap: number) {
  const B = BLEED;
  const g = gap, off = g * Math.SQRT2;
  const RR = Ro + g + B.T;
  const dc = RR - Ro;
  const c0 = B.margin;
  /** Oberkante außen am unteren Bund; die Oberseite steigt nach innen: z = k + (RR − r) */
  const k = c0 + dc + B.collar;
  /** Fensterhöhe nach dem Ø: etwa ein Drittel des Durchmessers, 8–20 mm */
  const hw = Math.min(20, Math.max(8, 0.35 * 2 * Ri));
  const a0 = k + B.T + off; // Ring innen unten
  const a1 = a0 + hw + 2 + B.detentBand; // Ring innen oben
  const w0 = a0 + 1, w1 = w0 + hw; // Fenster
  const zDet = w1 + B.detentBand / 2; // Höhe der Raste
  // oberer Bund: unten z = zb0 + (r − Ro), außen senkrecht, oben waagerecht
  const zb0 = a1 - g + off;
  const zb1 = zb0 + dc;
  const zTop = zb1 + B.collar;
  return { Ri, Ro, g, RR, dc, c0, k, hw, a0, a1, w0, w1, zDet, zb0, zb1, zTop, minLen: zTop + B.margin };
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
  const pts: [number, number, number][] = [[0, 0, z0]];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a), z0]);
  }
  return basicFaceExtrusion(makePolygon(pts) as never, new Vector([0, 0, z1 - z0])) as Shape3D;
}

function cutWindows(sh: Shape3D, D: BleedDims): Shape3D {
  const B = BLEED;
  for (let i = 0; i < B.windows; i++) {
    const c = (360 * i) / B.windows;
    sh = sh.cut(wedge(c - B.winDeg / 2, c + B.winDeg / 2, D.w0, D.w1)) as Shape3D;
  }
  return sh;
}

/** Lage der Noppe (auf) bzw. der Mulden: mitten zwischen zwei Fenstern, oberhalb der Fenster */
const DETENT_DEG = 60;
const at = (deg: number, r: number, z: number): [number, number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), z];
/** Mittelpunkt der Noppe: Spitze ragt g/2 über die Rohroberfläche hinein (der Ring kann um g ausweichen) */
const bumpCenterR = (D: BleedDims) => D.Ro - D.g / 2 + BLEED.bumpR;

/** Rohr mit unterem und oberem Bund, den drei Fenstern, Mulden für die Raste und Kerben; L ≥ minLen */
export function bleedBody(D: BleedDims, L: number): Shape3D {
  const { Ri, Ro, RR, dc, c0, k, zb0, zb1, zTop, g } = D;
  let body = rev([
    [Ri, 0],
    [Ro, 0],
    [Ro, c0],
    [RR, c0 + dc],
    [RR, k],
    [Ro, k + dc],
    [Ro, zb0],
    [RR, zb1],
    [RR, zTop],
    [Ro, zTop],
    [Ro, L],
    [Ri, L],
  ]);
  body = cutWindows(body, D);
  // Mulden: Kugel um die Noppe herum (Noppe + Spiel), bei auf (DETENT_DEG) und zu (DETENT_DEG + 60)
  const c = bumpCenterR(D);
  for (const deg of [DETENT_DEG, DETENT_DEG + 60]) body = body.cut(makeSphere(BLEED.bumpR + g).translate(at(deg, c, D.zDet)) as Shape3D) as Shape3D;
  // Kerben außen am oberen Bund über den Rohrfenstern (0,8 tief, 1,6 breit, ganze Bundhöhe)
  for (let i = 0; i < BLEED.windows; i++) {
    const notch = (makeBox([RR - 0.8, -0.8, zb1 - 1], [RR + 1, 0.8, zTop + 0.01]) as Shape3D).rotate((360 * i) / BLEED.windows, [0, 0, 0], [0, 0, 1]) as Shape3D;
    body = body.cut(notch) as Shape3D;
  }
  return body;
}

/**
 * Drehring (Querschnitt Trapez) mit Griffzähnen außen, drei Fenstern und der Noppe innen; gedruckt in
 * Stellung „auf“ (die Noppe sitzt mit Spiel in ihrer Mulde).
 */
export function bleedRing(D: BleedDims): Shape3D {
  const B = BLEED;
  const { Ro, g, RR, a0, a1 } = D;
  const Rin = Ro + g;
  let ring = rev([
    [Rin, a0],
    [RR, a0 - B.T],
    [RR, a1 + B.T],
    [Rin, a1],
  ]);
  // Griffzähne: Dreiecke 1,6 breit, 0,8 hoch, über die Außenhöhe
  const n = Math.max(12, Math.round((2 * Math.PI * RR) / 4));
  const z0 = a0 - B.T + 0.4, z1 = a1 + B.T - 0.4;
  const teeth: Shape3D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / n;
    const c = Math.cos(a), s = Math.sin(a);
    const p = (r: number, t: number): [number, number, number] => [r * c - t * s, r * s + t * c, z0];
    teeth.push(basicFaceExtrusion(makePolygon([p(RR - 0.3, -0.8), p(RR + 0.8, 0), p(RR - 0.3, 0.8)]) as never, new Vector([0, 0, z1 - z0])) as Shape3D);
  }
  ring = ring.fuse(makeCompound(teeth) as Shape3D) as Shape3D;
  ring = cutWindows(ring, D);
  // Noppe: Kugel, die zur Hälfte im Ring steckt
  ring = ring.fuse(makeSphere(B.bumpR).translate(at(DETENT_DEG, bumpCenterR(D), D.zDet)) as Shape3D) as Shape3D;
  return ring;
}

/** Länge des Übergangs vom Rohr (Ø m) zur Kupplung (Ø f): steil höchstens etwa 45° (der Übergang ist in der Mitte steiler) */
export const bleedTransition = (m: number, f: number) => Math.max(10, Math.ceil(1.7 * (Math.abs(f - m) / 2)));
