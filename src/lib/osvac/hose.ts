/**
 * Schlauchseite (osVAC neo "Hose"): Gewindekörper, Knickschutz-Trichter, Drehring (zwei
 * ineinandergreifende Ringe, im Druck beweglich) und Gehäuse für die Male-Variante.
 * Alle Radien hängen nur vom Schlauch-Innendurchmesser ab (rH = H/2), gemessen an H32 und H36.
 * Lokales System je Modul: Oberkante z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, L, A, type P2, type Seg } from './geom';
import { hoseThread, rootRadius } from './thread';
import { gripKnurl, gripKnurlOverlap, gripFields, gripFieldsOverlap } from './grip';
import { fmt } from './female';

export interface HoseOptions {
  text?: boolean;
  knurl?: boolean;
  label?: string;
  /** druckoptimierter Drehring (nur MxxHyy: Schulter unter der 45°-Gehäusekante) */
  print?: boolean;
}

/**
 * Schulter des Schlauchkopfs im Gehäuse (MxxHyy), z im Schlauchteil-System: im Abstand g parallel zur Gehäuse-Unterkante
 * (Original 35°, bei g = 0,3 genau die Fusion-Maße); druckoptimiert 45° im Abstand des Schrägen-Spiels.
 */
function housedFlank(p: OsvacParams, print = false) {
  const rB = p.hoseDiameterInner / 2 + p.generalMaterialWidth - 1.2;
  if (!print) {
    const g = p.slipRingGapSize;
    return (r: number) => HOUSING_FLANK_TOP + T35 * (rB - r) - g * Math.hypot(1, T35);
  }
  const gf = swivelPrintFlankGap(Math.min(p.slipRingGapSize, SWIVEL_PRINT.gapMax));
  return (r: number) => HOUSING_FLANK_TOP + HOUSING_PRINT_RAISE + (rB - r) - gf * Math.SQRT2;
}

const poly = (pts: P2[]): [P2, Seg[]] => [pts[0], pts.slice(1).map((p) => L(p[0], p[1]))];

/**
 * Gewindekörper. variant 'plain' = Hose (Schlauch) / FxxHyy, 'housed' = schmaler Kopf für MxxHyy.
 */
export function hoseBody(p: OsvacParams, variant: 'plain' | 'housed', opt: HoseOptions = {}): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rRootTop = rootRadius(p, -2.276);
  const rRootBot = rootRadius(p, -26.5);
  const cone = 5.257 / 3.681; // dr/dz der 55°-Schulter
  const segs: Seg[] = [L(rH + 1.743, 0)];
  let gripTop: number;
  if (variant === 'plain') {
    const zs = -(rO - rH - 1.743) / cone;
    segs.push(L(rO, zs), L(rO, zs - 0.1));
    gripTop = zs - 0.1;
  } else {
    // schmaler Kopf im Gehäuse: radial 0,4 Luft zur Gehäusebohrung, Schulter parallel zur Unterkante des Gehäuses
    const rN = housedHeadRadius(rH, p.generalMaterialWidth);
    const z1 = -(rN - rH - 1.743) / cone;
    const zFlank = housedFlank(p, opt.print);
    segs.push(L(rN, z1), L(rN, zFlank(rN)));
    const z2 = zFlank(rO);
    segs.push(L(rO, z2), L(rO, z2 - 1));
    gripTop = z2 - 1;
  }
  const gripBot = variant === 'plain' ? -26 : -25.5;
  segs.push(
    L(rO, -26.5),
    A(rO - 0.5, -27, rO - 0.5, -26.5),
    L(rRootBot + 0.5, -27),
    A(rRootBot, -26.5, rRootBot + 0.5, -26.5),
    L(rRootTop, -2.276),
  );
  // Das Gewinde ist ein eigener Körper (siehe hoseThreadBody): Boolesche Operationen mit den
  // Spline-Flächen der Schraubenlinie würden die Berechnung um Minuten verlängern.
  void gripBot;
  void opt;
  return revolveProfile([rH, 0], segs);
}

/** Rändelung des Schlauchteils (eigener Körper). */
export function hoseKnurl(p: OsvacParams, variant: 'plain' | 'housed', print = false): Shape3D {
  const gz = hoseGripZone(p, variant, print);
  return gripKnurl(p.hoseDiameterInner / 2 + p.generalMaterialWidth, gz.top, gz.bot, variant === 'plain' ? 'full' : 'housedHose');
}

export function hoseKnurlOverlap(p: OsvacParams, variant: 'plain' | 'housed', print = false) {
  const gz = hoseGripZone(p, variant, print);
  return gripKnurlOverlap(p.hoseDiameterInner / 2 + p.generalMaterialWidth, gz.top, gz.bot, variant === 'plain' ? 'full' : 'housedHose');
}

/** Griffbereich des Schlauchteils (oben/unten) – gemeinsam für Rändelung und Textfelder. */
function hoseGripZone(p: OsvacParams, variant: 'plain' | 'housed', print = false) {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const cone = 5.257 / 3.681;
  if (variant === 'plain') {
    const zs = -(rO - rH - 1.743) / cone;
    return { top: zs - 0.1, bot: -26 };
  }
  const z2 = housedFlank(p, print)(rO);
  return { top: z2 - 1, bot: -25.5 };
}

/** Textfelder des Schlauchteils (eigener Körper, siehe gripFields). */
export function hoseFields(p: OsvacParams, variant: 'plain' | 'housed', opt: HoseOptions = {}): Shape3D {
  const gz = hoseGripZone(p, variant, opt.print);
  const label = opt.text === false ? null : (opt.label ?? `H${fmt(p.hoseDiameterInner)}`);
  return gripFields(p.hoseDiameterInner / 2 + p.generalMaterialWidth, gz.top, gz.bot, variant === 'plain' ? 'full' : 'housedHose', label);
}

export function hoseFieldsOverlap(p: OsvacParams, variant: 'plain' | 'housed', print = false): number {
  const gz = hoseGripZone(p, variant, print);
  return gripFieldsOverlap(p.hoseDiameterInner / 2 + p.generalMaterialWidth, gz.top, gz.bot, variant === 'plain' ? 'full' : 'housedHose');
}

/**
 * Gewinderippe als eigener Körper; überlappt die Wand um 0.5 mm und wird im Slicer verschmolzen.
 * runout = true, wenn ein Knickschutz folgt: dann läuft die Rippe im Trichter aus.
 */
export function hoseThreadBody(p: OsvacParams, runout: boolean, hand: 'left' | 'right' = 'left'): Shape3D {
  const t = hoseThread(p, 0.5, runout);
  // Rechtsgewinde: Spiegelbild an der XZ-Ebene durch die Achse (Anschnitt, Auslauf und Steigung wie links)
  return hand === 'right' ? (t.mirror('XZ', [0, 0, 0]) as Shape3D) : t;
}

/**
 * Knickschutz-Trichter unter dem Gewindekörper (Hose-System: Oberkante Hose = 0).
 * Gemessen bei 7 und 9 mm Materialstärke: Außenbogen R 64,875 beginnt am Außenradius rO = rH + W,
 * Innenbogen (gleicher Mittelpunkt) beginnt am Gewindegrund; die Endrundung verbindet beide Bögen.
 */
export function hoseSkirt(p: OsvacParams): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rIn = rootRadius(p, -26.5); // = rH + 4.944
  const zc = -26.5;
  const Rout = 64.875;
  const rc = rO + Rout;
  const Rin = rc - rIn;
  const dz = -19.5; // Länge des Trichters bis zum Außen-Ende
  const outEnd: P2 = [rc - Math.sqrt(Rout ** 2 - dz ** 2), zc + dz];
  const k = Rin / Rout;
  const inEnd: P2 = [rc + (outEnd[0] - rc) * k, zc + (outEnd[1] - zc) * k];
  const tc: P2 = [(outEnd[0] + inEnd[0]) / 2, (outEnd[1] + inEnd[1]) / 2];
  const tr = Math.hypot(outEnd[0] - inEnd[0], outEnd[1] - inEnd[1]) / 2;
  // Scheitel der Endrundung: senkrecht zur radialen Verbindung der Enden, in Laufrichtung (nach unten)
  let ux = -(outEnd[1] - zc);
  let uz = outEnd[0] - rc;
  const ul = Math.hypot(ux, uz);
  if (uz > 0) {
    ux = -ux;
    uz = -uz;
  }
  const tipMid: P2 = [tc[0] + (tr * ux) / ul, tc[1] + (tr * uz) / ul];
  return revolveProfile([rIn, zc], [
    L(rO, zc),
    A(outEnd[0], outEnd[1], rc, zc),
    { t: 'M', p: inEnd, m: tipMid },
    A(rIn, zc, rc, zc),
  ]);
}

/**
 * Drehring (zwei ineinandergreifende Ringe, im Druck beweglich). Gemessen bei 7 und 9 mm Materialstärke:
 * Alle Hakenflanken laufen unter 35° (dz/dr = 0,7), die Haken-Versätze wachsen mit a = W/3,
 * der Spalt zwischen den Ringen ist SlipRingGapSize (Standard 0,3 mm wie im Original).
 */
const T35 = 0.7;

/** Unterkante des Gehäuses an der Bohrung im Schlauchteil-System (MxxHyy), gemessen. */
const HOUSING_FLANK_TOP = -8.159;

/** Radius des Schlauchkopfs und des Innenrings im Gehäuse: Bohrung rH + W − 1,2 minus 0,4 (unabhängig von g, gemessen bei g = 0,3 und 0,5). */
function housedHeadRadius(rH: number, W: number): number {
  return rH + W - 1.6;
}

/**
 * Außenring: Haken außen, hängt an Kupplung (FxxHyy) bzw. sitzt im Gehäuse (MxxHyy).
 * Der Spalt g wird wie im Original aufgeteilt: die senkrechten Hakenflächen rücken um g/2 nach außen
 * (Innenring um g/2 nach innen), die waagerechten Absätze wachsen mit g. Gemessen bei g = 0,3 und 0,5.
 */
export function swivelOuterPts(rH: number, W: number, housed: boolean, g: number): P2[] {
  const a = W / 3;
  const h = g / 2;
  const p10: P2 = [rH + a, -1.0];
  const p9: P2 = [rH + 2 * a + h, p10[1] - T35 * (a + h)];
  const p8: P2 = [p9[0], p9[1] - 2.04 * g];
  const p7: P2 = [rH + a + h, p8[1] - T35 * a];
  const p6: P2 = [p7[0], p7[1] - g];
  const x11 = 1.2 - 0.315 * g;
  const p11: P2 = [rH + x11, p10[1] - T35 * (a - x11)];
  const hook: P2[] = [p6, p7, p8, p9, p10, p11, [rH, p11[1]]];
  if (housed) {
    const rB = rH + W - 1.2;
    return [[rH, 0], [rB, 0], [rB, p6[1] - T35 * (rB - p6[0])], ...hook];
  }
  const p5: P2 = [rH + 2 * a, p6[1] - T35 * (a - h)];
  const p4: P2 = [rH + W - 1.2, p5[1] + T35 * (W - 1.2 - 2 * a)];
  return [[rH, 0], [rH + W, 0], [rH + W, p4[1]], p4, p5, ...hook];
}

/**
 * Größtes sinnvolles Spaltmaß des Drehrings. Mit dem Spalt wandert der Außenring nach unten, der untere
 * Arm des Innenrings (zwischen Kontaktflanke und Schlauchkonus) wird dünner: senkrecht gemessen
 * 3,781 − 0,7 · W/3 − 4,26 · g. Bei FxxHyy ist er bei 7 mm Wand ab g ≈ 0,504, bei 9 mm ab g ≈ 0,395 aufgebraucht (bei 0,5 bzw. 0,35 bleiben 0,02 bzw. 0,19 mm),
 * danach würde der Außenring den Schlauchteil berühren (gilt genauso für das Original). Im Gehäuse (MxxHyy)
 * hängt der Innenring nicht am Konus, dort sind bis 0,8 möglich.
 */
export function slipRingGapMax(W: number, housed: boolean): number {
  if (housed) return 0.8;
  const limit = (3.781 - (0.7 * W) / 3) / 4.26;
  return Math.floor(limit * 20 + 1e-9) / 20;
}

/** Abstand des Innenrings unter dem Außenring im Stapel (Fusion-Messung, gilt für alle Größen). */
export const INNER_BELOW_OUTER = 1.367;

/**
 * Innenring: sitzt auf dem Gewindekörper. Die Kontaktseite folgt dem Außenring im Abstand g
 * (SlipRingGapSize, Standard 0,3 wie im Original): jede Fläche des Außenrings wird um g nach außen
 * versetzt (waagerecht/senkrecht um g, die 35°-Flanken senkrecht zur Flanke um g). Der untere Teil
 * (Anschluss an den Gewindekörper) bleibt fest.
 */
export function swivelInnerPts(rH: number, W: number, housed: boolean, g: number): P2[] {
  const outer = swivelOuterPts(rH, W, housed, g);
  // Kontaktkette des Außenrings: vom Außenrand (bzw. der Schräge zur Bohrung) bis zur Innenkante oben
  const chain = outer.slice(2); // ohne die beiden oberen Eckpunkte
  // Polygonorientierung → Außennormale
  let area = 0;
  for (let i = 0; i < outer.length; i++) {
    const [x1, y1] = outer[i];
    const [x2, y2] = outer[(i + 1) % outer.length];
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area > 0 ? 1 : -1;
  type Line = { p: P2; d: P2 };
  const lines: Line[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const [x1, z1] = chain[i];
    const [x2, z2] = chain[i + 1];
    const l = Math.hypot(x2 - x1, z2 - z1);
    const d: P2 = [(x2 - x1) / l, (z2 - z1) / l];
    const n: P2 = [sgn * d[1], -sgn * d[0]];
    lines.push({ p: [x1 + n[0] * g, z1 + n[1] * g], d });
  }
  const meet = (A: Line, B: Line): P2 => {
    const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
    return [A.p[0] + t * A.d[0], A.p[1] + t * A.d[1]];
  };
  const atR = (L: Line, r: number): P2 => [r, L.p[1] + ((r - L.p[0]) * L.d[1]) / L.d[0]];
  const verts: P2[] = [];
  for (let i = 0; i + 1 < lines.length; i++) verts.push(meet(lines[i], lines[i + 1]));
  const first = lines[0];
  const last = lines[lines.length - 1];
  const a = W / 3;
  const toLocal = (q: P2): P2 => [q[0], q[1] + INNER_BELOW_OUTER];
  const contact = [atR(last, rH), ...verts.reverse()].map(toLocal); // von innen oben nach außen unten
  if (housed) {
    const rN = housedHeadRadius(rH, W);
    const q12: P2 = [rH + 1.743, -6.634];
    return [...contact, toLocal(atR(first, rN)), [rN, q12[1] - T35 * (rN - q12[0])], q12, [rH, q12[1]]];
  }
  void a;
  const q12: P2 = [rH + 1.743, -4.634];
  const iEdge = toLocal(atR(first, rH + W));
  return [...contact, iEdge, [rH + W, q12[1] - T35 * (W - 1.743)], q12, [rH, q12[1]]];
}

export function swivelOuter(p: OsvacParams, housed: boolean): Shape3D {
  const g = Math.min(p.slipRingGapSize, slipRingGapMax(p.generalMaterialWidth, housed));
  return revolveProfile(...poly(swivelOuterPts(p.hoseDiameterInner / 2, p.generalMaterialWidth, housed, g)));
}

export function swivelInner(p: OsvacParams, housed: boolean): Shape3D {
  const g = Math.min(p.slipRingGapSize, slipRingGapMax(p.generalMaterialWidth, housed));
  return revolveProfile(...poly(swivelInnerPts(p.hoseDiameterInner / 2, p.generalMaterialWidth, housed, g)));
}

// ---------------------------------------------------------------- druckoptimierter Drehring (in Entwicklung)

/**
 * Druckoptimierter Drehring (eigene Konstruktion, nicht im Original). Ziel: dreht sich direkt nach dem Druck.
 * Gegenüber dem Original umgedreht: Der Ring an der Kupplung bzw. am Gehäuse („oben“) sitzt innen und hat unten einen
 * schrägen Flansch; der Ring am Schlauchteil („unten“) liegt außen als Hülse mit einer Lippe über dem Flansch.
 * - Alle Flächen, die beim Druck nach unten zeigen, sind mindestens 45° steil (Flansch-Oberseite 50°) oder senkrecht;
 *   keine waagerechten Absätze über einem Spalt.
 * - Spalte nach Richtung: senkrecht = eingestelltes Spiel g (dichtet), an den Schrägen g + 0,15, mindestens 0,45
 *   (senkrecht gemessen 0,64 mm, also mehr als drei 0,2-mm-Schichten).
 * - Frei in der Luft beginnt nur die Spitze des Flanschs (ein schmaler Ring); der Rest des oberen Rings wächst von dort
 *   in 45° nach innen und oben.
 * Maße hängen nicht vom Durchmesser ab; die Hülse ist 1,6 mm (Mitte Spalt bis außen) stark, die Lippe greift 1,4 mm
 * über den Flansch.
 */
export const SWIVEL_PRINT = {
  /** Flanken: Unterseite des oberen Rings und Oberseite der Lippe 45°, Unterseite der Lippe 50° */
  k1: 1,
  k2: Math.tan((50 * Math.PI) / 180),
  k3: 1,
  /** Mitte Spalt am Austritt unter der Oberkante */
  top: 0.8,
  /** senkrechte Spitze des Flanschs, senkrechte Dichtfläche an der Lippe */
  tip: 2.2,
  seal: 0.8,
  /** Überdeckung Lippe/Flansch und Abstand Flanschspitze bis außen */
  overlap: 1.4,
  sleeve: 1.6,
  /** Zusatzspalt an den Schrägen, kleinster Spalt dort */
  flankExtra: 0.15,
  flankMin: 0.45,
  /** Schlauchteil unter der Oberkante des oberen Rings (FxxHyy; Original 6,0) */
  hoseBelow: 6.5,
  /** größtes Spiel (darüber wird die Hülse über dem Schlauchkonus zu dünn) */
  gapMax: 0.5,
};

/** Spiel an den Schrägen des druckoptimierten Drehrings: 0,15 mehr als an den Dichtflächen, mindestens 0,45 (senkrecht 0,64) */
export const swivelPrintFlankGap = (g: number) => Math.max(g + SWIVEL_PRINT.flankExtra, SWIVEL_PRINT.flankMin);

type OLine = { p: P2; d: P2 };
/** Linienzug um je gaps[i]/2 nach links (side 1) bzw. rechts (side −1) versetzen; Ecken = Schnittpunkte */
function offsetPath(path: P2[], gaps: number[], side: 1 | -1) {
  const lines: OLine[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [x1, z1] = path[i];
    const [x2, z2] = path[i + 1];
    const l = Math.hypot(x2 - x1, z2 - z1);
    const d: P2 = [(x2 - x1) / l, (z2 - z1) / l];
    const n: P2 = [-d[1] * side, d[0] * side];
    const h = gaps[i] / 2;
    lines.push({ p: [x1 + n[0] * h, z1 + n[1] * h], d });
  }
  const meet = (A: OLine, B: OLine): P2 => {
    const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
    return [A.p[0] + t * A.d[0], A.p[1] + t * A.d[1]];
  };
  const verts: P2[] = [];
  for (let i = 0; i + 1 < lines.length; i++) verts.push(meet(lines[i], lines[i + 1]));
  const at = (k: number, x: number): P2 => {
    const L = lines[k < 0 ? lines.length + k : k];
    return [x, L.p[1] + ((x - L.p[0]) * L.d[1]) / L.d[0]];
  };
  return { verts, at };
}

/** Oberkante des Schlauchteils im System des oberen Rings (x ab Bohrung): flach bis 1,743, dann Konus dz/dr = 0,7 */
const hoseTopAt = (below: number, x: number) => -below - T35 * Math.max(0, x - 1.743);

/**
 * Profile (x ab Bohrung, z ab Oberkante des oberen Rings) des druckoptimierten Drehrings.
 * Mittellinie des Spalts von der Bohrung bis außen (der obere Ring liegt links davon):
 * P0 Bohrung → P1 Flanschspitze unten (45° nach außen fallend) → P2 Spitze oben (senkrecht) → P3 Lippe innen unten
 * (50° nach innen steigend) → P4 Lippe innen oben (senkrecht, Dichtfläche) → P5 Austritt außen (45° nach außen steigend).
 */
export function swivelPrintProfile(W: number, housed: boolean, g: number) {
  const S = SWIVEL_PRINT;
  const gf = swivelPrintFlankGap(g);
  const rB = W - 1.2; // Bohrung im Gehäuse (MxxHyy)
  const rN = housedHeadRadius(0, W); // Schlauchkopf im Gehäuse
  const X = housed ? rN + 0.2 : W; // Austritt: außen bzw. Mitte des Spalts zur Gehäusebohrung
  const outer = housed ? rN : W; // Außenseite der Hülse
  const xF = outer - S.sleeve;
  const xI = xF - S.overlap;
  const P5: P2 = [X, -S.top];
  const P4: P2 = [xI, P5[1] - S.k3 * (X - xI)];
  const P3: P2 = [xI, P4[1] - S.seal];
  const P2_: P2 = [xF, P3[1] - S.k2 * S.overlap];
  const P1: P2 = [xF, P2_[1] - S.tip];
  const P0: P2 = [0, P1[1] + S.k1 * xF];
  const path = [P0, P1, P2_, P3, P4, P5];
  const gaps = [gf, g, gf, g, gf];
  const up = offsetPath(path, gaps, 1);
  const lo = offsetPath(path, gaps, -1);
  const below = housed ? SWIVEL_HOUSED_HOSE_BELOW_OUTER : S.hoseBelow;
  const top: P2[] = [[0, 0], up.at(0, 0), ...up.verts, up.at(-1, X)];
  if (housed) top.push([rB, top[top.length - 1][1]], [rB, 0]);
  else top.push([W, 0]);
  const bottom: P2[] = [lo.at(0, 0), ...lo.verts, lo.at(-1, outer), [outer, hoseTopAt(below, outer)], [1.743, -below], [0, -below]];
  return { top, bottom, path, below, lowest: P1 };
}

/** Schlauchkopf im Gehäuse (MxxHyy) unter dem Außenring: 1,367 + 6,634 (Fusion-Messung) */
const SWIVEL_HOUSED_HOSE_BELOW_OUTER = 8.001;

/** Druckoptimierter Drehring: oberer Ring (an Kupplung/Gehäuse), System wie swivelOuter (Oberkante z = 0) */
export function swivelPrintTop(p: OsvacParams, housed: boolean): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const g = Math.min(p.slipRingGapSize, SWIVEL_PRINT.gapMax);
  const pts = swivelPrintProfile(p.generalMaterialWidth, housed, g).top.map(([x, z]): P2 => [rH + x, z]);
  return revolveProfile(...poly(pts));
}

/** Druckoptimierter Drehring: unterer Ring (Hülse am Schlauchteil), gleiches System wie swivelPrintTop */
export function swivelPrintBottom(p: OsvacParams, housed: boolean): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const g = Math.min(p.slipRingGapSize, SWIVEL_PRINT.gapMax);
  const pts = swivelPrintProfile(p.generalMaterialWidth, housed, g).bottom.map(([x, z]): P2 => [rH + x, z]);
  return revolveProfile(...poly(pts));
}

/**
 * Gehäuse-Unterkante beim druckoptimierten Drehring: 45° statt 35° (Ecke an der Bohrung 0,36 höher, außen gleich),
 * die Schulter des Schlauchteils folgt im Abstand des Schrägen-Spiels. Die Unterkante beginnt wie im Original frei
 * über der Schulter (unvermeidlich), jetzt mit 0,64 statt 0,37 mm senkrechtem Abstand.
 */
const HOUSING_PRINT_RAISE = 1.2 * (1 - T35);

/** Gehäuse zwischen Male (oben, Spitze nach oben) und Drehring (MxxHyy). */
export function maleHousing(p: OsvacParams, opt: HoseOptions & { print?: boolean } = {}): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rB = rH + p.generalMaterialWidth - 1.2; // Bohrung für den Drehring
  const rMi = p.maleDiameterInner / 2;
  const rMo = p.maleDiameterOuter / 2;
  return revolveProfile(...poly([
    [rMi, 0],
    [rMo, 0],
    [rO, -3.006],
    [rO, -20.006],
    [rB, opt.print ? -19.166 + HOUSING_PRINT_RAISE : -19.166],
    [rB, -3.006],
    [rH, -3.006],
  ]));
}

/** Rändelung des Gehäuses (eigener Körper). */
export const housingKnurl = (p: OsvacParams) => gripKnurl(p.hoseDiameterInner / 2 + p.generalMaterialWidth, -4.006, -19.006, 'housing');
export const housingKnurlOverlap = (p: OsvacParams) => gripKnurlOverlap(p.hoseDiameterInner / 2 + p.generalMaterialWidth, -4.006, -19.006, 'housing');

/** Textfeld des Gehäuses (eigener Körper). */
export function housingFields(p: OsvacParams, opt: HoseOptions = {}): Shape3D {
  return gripFields(p.hoseDiameterInner / 2 + p.generalMaterialWidth, -4.006, -19.006, 'housing', opt.text === false ? null : '');
}

export const housingFieldsOverlap = (p: OsvacParams) => gripFieldsOverlap(p.hoseDiameterInner / 2 + p.generalMaterialWidth, -4.006, -19.006, 'housing');

/** Übergangskonus Female-Boden → Drehring (FxxHyy). Höhe wie Fusion: |H−F|/2 + 5·MiniValue. */
export function transitionConeFH(p: OsvacParams): { shape: Shape3D; h: number } {
  const h = p.hoseFemaleTransitionConeHeight + p.generalMiniValue * 5;
  const rFi = p.femaleDiameterInner / 2;
  const rH = p.hoseDiameterInner / 2;
  const W = p.generalMaterialWidth;
  return { shape: revolveProfile(...poly([[rFi, 0], [rFi + W, 0], [rH + W, -h], [rH, -h]])), h };
}
