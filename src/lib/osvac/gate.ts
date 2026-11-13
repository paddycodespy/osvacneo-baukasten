/**
 * Absperrschieber (Blast Gate): ein flacher Rahmen um einen Schlitz quer zum Rohr, darin gleitet eine Platte.
 * Die Platte hat ein volles Stück (zu) und ein Fenster in Rohrweite (auf). Zwei Noppen auf der Platte rasten in
 * Mulden im Rahmen, so bleibt sie in beiden Stellungen stehen. Die Platte wird flach daneben gedruckt.
 *
 * Lokales System: Rohrachse +Z (z = 0 … Länge), die Platte gleitet entlang X, der Schlitz liegt in der Mitte.
 * Gedruckt wird mit der Achse senkrecht. Rahmen breiter als das Rohr laufen unter 45° aus (ohne Stützen), über dem
 * Schlitz helfen zwei flache Stufen der Brücke (erst ein Streifen, dann ein Quadrat um die Bohrung).
 *
 * Der Schieber einzeln hat statt Kupplung und Stecker zwei Muffen: das Rohr wird beidseitig bis zu einem Anschlag
 * eingesteckt. Dazu optional eine Wandplatte, Schlüssellöcher oder ein eigener Wandhalter für das Rohr.
 */
import { makeBox, makeCylinder, makeSphere, draw, type Shape3D } from 'replicad';
import { revolveProfile, L } from './geom';
import { textOnFlat } from './text';

/** Dicke der Platte */
export const GATE_T = 2.4;
/** Rahmen über und unter dem Schlitz */
const GATE_FR = 2.4;
/** Tiefe je Stufe der Brückenhilfe über (und unter) dem Schlitz */
const POCKET = 0.4;
/** Nase der Zunge: so weit steht sie seitlich über die Platte (1 mm Anschlag am Rahmen), Länge der Zunge, Höhe des Griffs über der Platte */
const NUB = 1.3, ZUNGE = 16, GRIP_H = 2.5;
/** Spiel der Platte im Schlitz (je Seite), Standard */
export const GATE_GAP = 0.3;
/** Wand der Muffen beim Schieber einzeln */
export const SOCKET_WALL = 2.4;
/** Anschlag in der Muffe: so viel enger als das Rohr außen (Radius) */
const STOP = 2;

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  makeBox([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]) as unknown as Shape3D;
const cylZ = (r: number, z0: number, z1: number, x = 0, y = 0) => makeCylinder(r, Math.abs(z1 - z0), [x, y, Math.min(z0, z1)], [0, 0, 1]) as unknown as Shape3D;

/**
 * Maße des Schiebers aus der lichten Weite am Schlitz (Rm), dem Außenradius des Rohrs daneben (Ro) und dem Spiel der Platte.
 * Platte: x0 … x1 entlang der Gleitrichtung, Fenster bei −P, Griffloch bei gripX; zu = Platte bei 0, auf = um +P verschoben.
 * Anschläge: der Griff ist dicker als der Schlitz (schlägt bei „zu“ am Rahmen an), am anderen Ende sitzt eine federnde
 * Zunge mit Nase (seitlich, in der Ebene der Platte): sie drückt sich beim Einschieben weg, springt hinter dem Rahmen
 * heraus und schlägt bei „auf“ an. Anschlagfläche der Nase bei xs.
 */
export function gateDims(Rm: number, Ro: number, gap: number) {
  const T = GATE_T, fr = GATE_FR;
  const slot = T + 2 * gap;
  /** halbe Breite des Schlitzes und der Platte */
  const yS = Rm + 1.2, pw = yS - 0.3;
  /** halbe Kantenlänge des Rahmens: mindestens so breit wie das Rohr, damit nichts übersteht */
  const half = Math.max(yS + fr, Ro);
  const Hf = slot + 2 * fr;
  const Rc = half * Math.SQRT2;
  /** Länge der 45°-Schräge vom Rohr bis zur Ecke des Rahmens */
  const ch = Math.max(0, Rc - Ro);
  /**
   * Rastmulden bei ±pd auf der x-Achse, Noppen der Platte bei +pd und −pd: „zu“ rasten beide, „auf“ (Platte um P = 2 · pd
   * verschoben) rastet die zweite in der Mulde bei +pd. Das Fenster liegt bei „zu“ außerhalb des Rahmens.
   * Gleich auf beiden Seiten, so passt die Platte von links wie von rechts. Die Noppe ist etwas höher als das Spiel.
   */
  const pd = (Rm + half) / 2, dr = Math.min(1.4, (half - Rm) / 2 - 0.5), hb = 2 * gap + 0.25;
  const P = 2 * pd;
  const xs = -half - 0.5 - P;
  const x0 = xs - ZUNGE - 3, x1 = half + 16, gripX = half + 9.5;
  /** halbe Breite der Platte mit Nase */
  const hw = pw + NUB;
  return { T, gap, slot, fr, yS, pw, hw, half, Hf, Rc, ch, P, pd, dr, hb, xs, x0, x1, gripX, Rm, Ro, minLen: Hf + 2 * ch };
}
export type GateDims = ReturnType<typeof gateDims>;

/** Rahmen (voll) um den Schlitz bei zc, mit 45°-Schrägen zum Rohr hin; außen bei z0 … z1 abgeschnitten */
function frame(g: GateDims, zc: number, z0: number, z1: number): Shape3D {
  const zb = zc - g.Hf / 2, zt = zc + g.Hf / 2;
  const a = zb - g.ch, b = zt + g.ch;
  const rev = revolveProfile([0, a], [L(g.Ro, a), L(g.Rc + 0.02, zb), L(g.Rc + 0.02, zt), L(g.Ro, b), L(0, b)]);
  return box(-g.half, g.half, -g.half, g.half, Math.max(a, z0), Math.min(b, z1)).intersect(rev) as Shape3D;
}

/** Achteck (Kanten an x = ±r, y = ±r und diagonal), Inkreis r, zwischen z0 und z1 */
function octagon(r: number, z0: number, z1: number): Shape3D {
  const a = r * Math.tan(Math.PI / 8);
  const pts: [number, number][] = [[r, -a], [r, a], [a, r], [-a, r], [-r, a], [-r, -a], [-a, -r], [a, -r]];
  let d = draw(pts[0]);
  for (const q of pts.slice(1)) d = d.lineTo(q);
  return (d.close().sketchOnPlane('XY', Math.min(z0, z1)).extrude(Math.abs(z1 - z0)) as unknown as Shape3D);
}

/** Schlitz, Brückenhilfe und Rastmulden aus dem Gehäuse schneiden */
function cutSlot(h: Shape3D, g: GateDims, zc: number): Shape3D {
  h = h.cut(box(-g.half - 1, g.half + 1, -g.yS, g.yS, zc - g.slot / 2, zc + g.slot / 2));
  for (const s of [1, -1]) {
    const z = zc + (s * g.slot) / 2;
    // Stufe 1: Streifen quer über den Schlitz (Brücke von Seitenwand zu Seitenwand), Stufe 2: Quadrat um die Bohrung,
    // Stufe 3: Achteck. Jede Stufe überbrückt nur Ecken, die auf zwei Seiten aufliegen; über dem Achteck bleiben
    // nur noch schmale Sicheln zur runden Bohrung (beim Quadrat wären es Ecken bis 0,4 × Radius)
    h = h.cut(box(-g.Rm, g.Rm, -g.yS, g.yS, z - s * 0.01, z + s * POCKET));
    h = h.cut(box(-g.Rm, g.Rm, -g.Rm, g.Rm, z + s * (POCKET - 0.01), z + s * 2 * POCKET));
    h = h.cut(octagon(g.Rm, z + s * (2 * POCKET - 0.01), z + s * 3 * POCKET));
    for (const sx of [1, -1]) h = h.cut(cylZ(g.dr, z - s * 0.01, z + s * (g.hb + 0.1), sx * g.pd, 0));
  }
  return h;
}

/** Gehäuse auf einem Rohr (Freiform): Rohr innen Rm, außen Ro, Länge len, Schlitz in der Mitte */
export function gateTube(g: GateDims, len: number): Shape3D {
  const zc = len / 2;
  let h = cylZ(g.Ro, 0, len).fuse(frame(g, zc, 0, len));
  h = h.cut(cylZ(g.Rm, -1, len + 1));
  return cutSlot(h, g, zc);
}

/** Platte flach (z = 0 … T), Gleitrichtung x, Griff bei +x, Noppen oben */
export function gatePlate(g: GateDims): Shape3D {
  const outline = (h: number) => box(g.x0, g.x1, -g.pw, g.pw, 0, h).fillet(Math.min(3, g.pw - 0.5), (e) => e.inDirection('Z')) as Shape3D;
  let pl = outline(g.T);
  // Griff dicker als der Schlitz: Anschlag bei „zu“ (0,5 mm Luft, damit die Noppen vorher einrasten)
  pl = pl.fuse(outline(g.T + GRIP_H).intersect(box(g.half + 0.5, g.x1 + 1, -g.pw - 1, g.pw + 1, -1, g.T + GRIP_H + 1)));
  pl = pl.cut(cylZ(g.Rm, -1, g.T + 1, -g.P, 0));
  pl = pl.cut(cylZ(4.5, -1, g.T + GRIP_H + 1, g.gripX, 0));
  // Zunge an der Kante +y: fest bei xs − ZUNGE, freies Ende kurz hinter der Nase; Schlitz 0,8 mm, Zunge 1,8 mm breit
  const yz = g.pw - 1.8;
  pl = pl.cut(box(g.xs - ZUNGE, g.xs + 1.3, yz - 0.8, yz, -1, g.T + 1));
  pl = pl.cut(box(g.xs + 0.5, g.xs + 1.3, yz - 0.8, g.pw + 1, -1, g.T + 1));
  // Nase: Schräge zum festen Ende hin (beim Einschieben voran), Anschlagfläche bei xs
  const nub = draw([g.xs - 5, g.pw - 0.3]).lineTo([g.xs - 0.4, g.pw + NUB]).lineTo([g.xs, g.pw + NUB]).lineTo([g.xs, g.pw - 0.3]).close();
  pl = pl.fuse(nub.sketchOnPlane('XY').extrude(g.T) as unknown as Shape3D);
  const a = Math.min(1.1, g.dr - 0.3), rs = (a * a + g.hb * g.hb) / (2 * g.hb);
  // Kugel um 90° gekippt: ihre Pole liegen seitlich in der Platte (ein Pol oben ergäbe im Netz eine entartete Spitze)
  for (const x of [g.pd, -g.pd]) pl = pl.fuse(makeSphere(rs).rotate(90, [0, 0, 0], [1, 0, 0]).translate([x, 0, g.T + g.hb - rs]) as unknown as Shape3D);
  return pl;
}

/** Lage der Platte im Gehäuse (für Prüfungen): mittig im Schlitz, zu oder auf */
export const plateInSlot = (g: GateDims, zc: number, open: boolean): [number, number, number] => [open ? g.P : 0, 0, zc - g.T / 2];

// ---------------------------------------------------------------- Schieber einzeln

export type GateMount = 'none' | 'plate' | 'keyhole' | 'clip';
export const MOUNT_LABELS: Record<GateMount, string> = { none: 'Ohne', plate: 'Wandplatte', keyhole: 'Schlüssellöcher', clip: 'Wandhalter' };
/** Lage an der Wand: Rohr senkrecht (Platte gleitet waagerecht) oder waagerecht (Platte gleitet senkrecht) */
export type GateOrient = 'upright' | 'turned';
export const ORIENT_LABELS: Record<GateOrient, string> = { upright: 'Rohr senkrecht', turned: 'Rohr waagerecht' };

export interface GateSpec {
  /** Außendurchmesser des Rohrs */
  d: number;
  /** Tiefe der Muffen */
  depth: number;
  mount: GateMount;
  /** Lage an der Wand: nur für die Schlüssellöcher (Schlitz muss nach oben zeigen); Wandplatte und Wandhalter passen in beiden Lagen */
  orient: GateOrient;
  /** Abstand Wand bis Rohrmitte; 0 = so nah wie möglich, höchstens 50 mm mehr */
  wallDist: number;
  /** Spiel am Rohr (Durchmesser der Muffe = d + 2 × Spiel) und der Platte im Schlitz */
  pipeGap: number;
  plateGap: number;
}

/** Spiel der Platte beim Schieber einzeln: die Dichtlippen (0,3 mm) drücken dann je Seite 0,05 mm auf die Platte */
export const DEFAULT_GATE: GateSpec = { d: 50, depth: 20, mount: 'plate', orient: 'upright', wallDist: 0, pipeGap: 0.4, plateGap: 0.25 };
/** so viel weiter als der kleinste Wandabstand geht es höchstens */
export const WALL_MORE = 50;

/** Wandplatte und Wandhalter: Dicke, Höhe des Halters, Lage der Schrauben */
const WALL_T = 3, CLIP_H = 14, CLIP_W = 3.5;

/**
 * Schieber einzeln, zweiteilig verschraubt (Sandwich): Unterteil mit Muffe, Kanal für die Platte und Wandplatte,
 * Oberteil als Deckel mit Muffe. Um die Bohrung läuft oben und unten eine Dichtlippe, die die Platte leicht andrückt:
 * so zieht der Schieber über die offenen Enden des Kanals keine Falschluft. Beide Teile stehen mit der Muffe auf dem
 * Bett, nichts hängt über einem Schlitz in der Luft.
 *
 * Höhen (z, Rohrachse, z = 0 Ende der unteren Muffe): Muffe 0 … zL, Boden zL … zF, Kanal zF … zT, Deckel zT … zT + TP,
 * obere Muffe bis H. Die Platte gleitet entlang x, die Wand liegt auf der Seite −y.
 */
/** Dicke der Platte, Dicke von Boden und Deckel, Höhe der Dichtlippen, Lage der Lippen (ab der Bohrung) */
export const SINGLE_T = 4;
const TP = 3.5, LIP = 0.3, LIP_IN = 1, LIP_W = 1.2;
/** Schrauben M3: Loch, Mutter (Schlüsselweite 5,5 + Luft), Kopf; Mutter und Kopf sitzen je 1,5 mm vor dem Kanal */
const M3_R = 1.7, NUT_AF = 5.8, HEAD_R = 3.2, SEAT = 1.5;
/** Spiel der Platte im Kanal seitlich (je Seite) */
const SIDE_GAP = 0.3;
/** Schräge zwischen Gehäuse und Muffe: so viel Höhe je mm Radius (1,2 = 50°) */
const CH_K = 1.2;

export function singleDims(Rm: number, Ro: number, gap: number) {
  const T = SINGLE_T;
  /** Höhe des Kanals */
  const ch = T + 2 * gap;
  /** halbe Breite der Platte und des Kanals: Platte deckt die Bohrung 3 mm rundum ab */
  const pw = Rm + 3, yC = pw + SIDE_GAP;
  /** Gehäuse: halbe Länge in Gleitrichtung so knapp wie möglich, quer Platz für die Schrauben neben dem Kanal */
  // Schrauben: zwischen Kanal und Kopfsenkung bzw. Muttertasche mindestens 1,2 mm Wand, außen 1,6 mm
  const hx = Ro + 3, sx = hx - 5, sy = yC + 1.2 + HEAD_R, hy = sy + HEAD_R + 1.6;
  /** Ecke des Gehäuses und Länge der 45°-Schräge zur Muffe */
  const Rc = Math.hypot(hx, hy), cl = Rc - Ro;
  /** Platte: zu bei x = 0, auf um +P (Fenster bei −P liegt bei „zu“ außerhalb des Gehäuses) */
  const P = Rm + hx + 2;
  /** Anschlag für „auf“: Fläche bei xs, 8 mm lang */
  const xs = -hx - 0.5 - P;
  const x0 = xs - 8, x1 = hx + 16, gripX = hx + 9.5;
  const hw = pw;
  return { T, gap, ch, pw, yC, hx, hy, sx, sy, Rc, cl, P, xs, x0, x1, gripX, hw, Rm, Ro };
}
export type SingleDims = ReturnType<typeof singleDims>;

export function gateLayout(s: GateSpec) {
  const Rs = s.d / 2 + s.pipeGap, Rm = s.d / 2 - STOP, Ro = Rs + SOCKET_WALL;
  const g = singleDims(Rm, Ro, s.plateGap);
  const zL = s.depth, zF = zL + TP, zT = zF + g.ch, H = zT + TP + s.depth;
  const zc = (zF + zT) / 2;
  const r1 = s.d / 2 + 0.2, r2 = r1 + CLIP_W;
  /** kleinster Abstand Wand bis Rohrmitte (Teil direkt an der Wand) */
  const minA = s.mount === 'clip' ? r2 + WALL_T : g.hy + WALL_T;
  const maxA = minA + WALL_MORE;
  const A = Math.min(maxA, Math.max(minA, s.wallDist));
  /** Schrauben neben dem Gehäuse (x = ±holeX); Wandplatte: je Seite unten und oben (z = holeZ, H − holeZ) */
  const holeX = s.mount === 'clip' ? r2 + 6 : g.hx + 6;
  const holeZ = 7;
  /** Schlüssellöcher bei waagerechtem Rohr: beide auf der Seite +x (oben), unten und oben am Gehäuse, Schlitz nach +x */
  const keyTurned = s.mount === 'keyhole' && s.orient === 'turned';
  const keyZ = 7.5, keyX = g.hx + 4.5;
  /** Abstände der Schrauben (zum Anzeichnen): [quer zum Rohr, entlang dem Rohr] */
  const pitch: [number, number] =
    s.mount === 'plate' ? [2 * holeX, H - 2 * holeZ] : keyTurned ? [0, H - 2 * keyZ] : [2 * holeX, 0];
  /** Länge der Schrauben M3 (Kopf bis Ende der Mutter, aufgerundet) */
  const screwLen = Math.ceil((g.ch + 2 * SEAT + 2.4 + 0.5) / 2) * 2;
  return { g, Rs, Rm, Ro, H, zL, zF, zT, zc, r1, r2, minA, maxA, A, holeX, holeZ, keyTurned, keyZ, keyX, pitch, screwLen };
}

/** Senkloch für Ø-4-Senkkopfschrauben, Achse +y, Senkung an der Fläche bei y = yFace (Kopf auf der Seite +y) */
function sinkHole(x: number, z: number, yFace: number, depth: number): Shape3D {
  const hr = 2.3, sr = 4.3;
  return revolveProfile([0, 0.02], [L(sr + 0.02, 0.02), L(hr, -(sr - hr)), L(hr, -depth - 1), L(0, -depth - 1)])
    .rotate(-90, [0, 0, 0], [1, 0, 0])
    .translate([x, yFace, z]) as Shape3D;
}

/** Sechskant (Schlüsselweite af, Kanten parallel zu x) zwischen z0 und z1 */
function hexPrism(af: number, x: number, y: number, z0: number, z1: number): Shape3D {
  const r = af / Math.sqrt(3);
  const pts: [number, number][] = [0, 1, 2, 3, 4, 5].map((i) => [x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3)]);
  let d = draw(pts[0]);
  for (const q of pts.slice(1)) d = d.lineTo(q);
  return d.close().sketchOnPlane('XY', Math.min(z0, z1)).extrude(Math.abs(z1 - z0)) as unknown as Shape3D;
}

/**
 * Hälfte des Gehäuses: Platte zwischen zFace (innen, zum Kanal) und zOut, davor 45°-Schräge bis zur Muffe, Muffe bis zEnd.
 * s = Richtung von innen nach außen (−1 unten, +1 oben); backY: Rückseite (−y) etwas zurückgesetzt.
 */
function half(lay: ReturnType<typeof gateLayout>, s: 1 | -1, zFace: number, depth: number, backY: number): Shape3D {
  const { g, Rs, Rm, Ro } = lay;
  const zOut = zFace + s * TP, zEnd = zOut + s * depth;
  const zA = Math.min(zFace, zOut), zB = Math.max(zFace, zOut);
  let h = box(-g.hx, g.hx, -g.hy + backY, g.hy, zA, zB);
  // Schräge: Kegel von der Ecke zur Muffe (50° zur Waagerechten, sicher ohne Stützen), nicht länger als die Muffe
  const rEnd = Math.max(Ro, g.Rc + 0.02 - depth / CH_K), zc1 = zOut + s * CH_K * (g.Rc + 0.02 - rEnd);
  const cone = s > 0 ? revolveProfile([0, zOut], [L(g.Rc + 0.02, zOut), L(rEnd, zc1), L(0, zc1)]) : revolveProfile([0, zc1], [L(rEnd, zc1), L(g.Rc + 0.02, zOut), L(0, zOut)]);
  h = h.fuse(box(-g.hx, g.hx, -g.hy + backY, g.hy, Math.min(zOut, zc1), Math.max(zOut, zc1)).intersect(cone) as Shape3D);
  h = h.fuse(cylZ(Ro, zOut, zEnd));
  // Muffe bis zum Anschlag, der Anschlag läuft unter 45° zur lichten Weite (hängt beim Druck nicht in der Luft)
  h = h.cut(cylZ(Rs, zEnd + s, zOut + s * 0.01));
  const k = Rs - Rm;
  h = h.cut(s > 0 ? revolveProfile([0, zOut - k], [L(Rm, zOut - k), L(Rs, zOut + 0.01), L(0, zOut + 0.01)]) : revolveProfile([0, zOut - 0.01], [L(Rs, zOut - 0.01), L(Rm, zOut + k), L(0, zOut + k)]));
  return h;
}

/** Dichtlippe: Ring um die Bohrung auf der Fläche z, ragt um LIP in Richtung s */
const lipRing = (Rm: number, z: number, s: 1 | -1) => cylZ(Rm + LIP_IN + LIP_W, z, z + s * LIP).cut(cylZ(Rm + LIP_IN, z - 1, z + 1));

const screwPts = (g: SingleDims): [number, number][] => [[g.sx, g.sy], [-g.sx, g.sy], [g.sx, -g.sy], [-g.sx, -g.sy]];

/** Unterteil (stehend, Muffe unten auf dem Bett) mit Kanal, Dichtlippe, Muttern und Wandplatte oder Schlüssellöchern */
export function gateLower(s: GateSpec, text = true): Shape3D {
  const lay = gateLayout(s);
  const { g, Rm, H, zL, zF, zT, A, holeX, holeZ, keyTurned, keyZ, keyX } = lay;
  let h = half(lay, -1, zF, s.depth, 0);
  // Seitenwände des Kanals
  h = h.fuse(box(-g.hx, g.hx, -g.hy, g.hy, zF - 0.01, zT).cut(box(-g.hx - 1, g.hx + 1, -g.yC, g.yC, zF - 1, zT + 1)));
  h = h.fuse(lipRing(Rm, zF - 0.01, 1));
  if (s.mount === 'plate' || s.mount === 'keyhole') {
    // Wandplatte über die ganze Höhe (auch neben dem Deckel), Stege zum Gehäuse: außen bis in die Seitenwand,
    // in der Mitte bis in die Muffe (nicht in den Kanal)
    const X = g.hx + 12, Xp = keyTurned ? keyX + 12.5 : X;
    const yW = -A + WALL_T;
    h = h.fuse(box(-X, Xp, -A, yW, 0, H));
    for (const sx of [1, -1]) h = h.fuse(box(sx * (g.hx - 3), sx * g.hx, yW - 0.01, -g.hy + 1, 0, zT));
    const wc = Math.min(6, lay.Ro * 0.5);
    h = h.fuse(box(-wc, wc, yW - 0.01, -lay.Ro + 1, 0, zL + 1));
  }
  h = h.cut(cylZ(Rm, -1, H + 1));
  // Schrauben: Loch durch, Mutter von unten eingesetzt (Tasche bis 1,5 mm unter den Kanal)
  for (const [x, y] of screwPts(g)) h = h.cut(cylZ(M3_R, -1, zT + 1, x, y)).cut(hexPrism(NUT_AF, x, y, -1, zF - SEAT));
  if (s.mount === 'plate') for (const sx of [1, -1]) for (const z of [holeZ, H - holeZ]) h = h.cut(sinkHole(sx * holeX, z, -A + WALL_T, WALL_T));
  if (s.mount === 'keyhole') {
    // Schlüsselloch: großes Loch für den Schraubenkopf, Schlitz nach oben (Rohr senkrecht: zum oberen Ende wie gedruckt,
    // Rohr waagerecht: zur Seite +x, beide Löcher dort, damit der Kopf neben dem Gehäuse Platz hat)
    const thru = (r: number, x: number, z: number) => makeCylinder(r, WALL_T + 2, [x, -A - 1, z], [0, 1, 0]) as unknown as Shape3D;
    const slot = (x0: number, x1: number, z0: number, z1: number) => box(x0, x1, -A - 1, -A + WALL_T + 1, z0, z1);
    if (keyTurned)
      for (const z of [keyZ, H - keyZ]) h = h.cut(thru(4.5, keyX, z)).cut(slot(keyX, keyX + 8, z - 2.2, z + 2.2)).cut(thru(2.2, keyX + 8, z));
    else
      for (const sx of [1, -1]) {
        const x = sx * holeX, zh = H / 2 - 4, ze = H / 2 + 5;
        h = h.cut(thru(4.5, x, zh)).cut(slot(x - 2.2, x + 2.2, zh, ze)).cut(thru(2.2, x, ze));
      }
  }
  // Rohr-Ø vorne (Seite gegenüber der Wand), 0,4 mm tief, zum Sortieren
  if (text) {
    const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
    const size = Math.min(5, zT - zL - 2.4);
    const tool = textOnFlat(g.hy, 90, (zL + zT) / 2, `Ø${f(s.d)}`, size, 0.4);
    if (tool) h = h.cut(tool);
  }
  return h;
}

/** Oberteil (Deckel) in Einbaulage: Platte zT … zT + TP, Muffe nach oben; Rückseite 0,4 mm zurückgesetzt (Luft zur Wandplatte) */
export function gateUpper(s: GateSpec): Shape3D {
  const lay = gateLayout(s);
  const { g, Rm, H, zT } = lay;
  let h = half(lay, 1, zT, s.depth, 0.4);
  h = h.fuse(lipRing(Rm, zT + 0.01, -1));
  h = h.cut(cylZ(Rm, -1, H + 1));
  for (const [x, y] of screwPts(g)) h = h.cut(cylZ(M3_R, zT - 1, H + 1, x, y)).cut(cylZ(HEAD_R, zT + SEAT, H + 1, x, y));
  return h;
}

/**
 * Platte des Schiebers einzeln flach (z = 0 … T), Gleitrichtung x. An beiden Enden 2,5 mm dicker: der Griff (+x) schlägt
 * bei „zu“ am Gehäuse an, der Anschlag am anderen Ende bei „auf“. Die Platte wird vor dem Aufschrauben des Oberteils
 * eingelegt, eine federnde Zunge braucht es deshalb nicht.
 */
export function gateSlider(g: SingleDims): Shape3D {
  const outline = (h: number) => box(g.x0, g.x1, -g.pw, g.pw, 0, h).fillet(Math.min(3, g.pw - 0.5), (e) => e.inDirection('Z')) as Shape3D;
  let pl = outline(g.T);
  const thick = outline(g.T + GRIP_H);
  pl = pl.fuse(thick.clone().intersect(box(g.hx + 0.5, g.x1 + 1, -g.pw - 1, g.pw + 1, -1, g.T + GRIP_H + 1)) as Shape3D);
  pl = pl.fuse(thick.intersect(box(g.x0 - 1, g.xs, -g.pw - 1, g.pw + 1, -1, g.T + GRIP_H + 1)) as Shape3D);
  pl = pl.cut(cylZ(g.Rm, -1, g.T + 1, -g.P, 0));
  pl = pl.cut(cylZ(4.5, -1, g.T + GRIP_H + 1, g.gripX, 0));
  return pl;
}

/** Lage der Platte im Gehäuse (für Prüfungen): mittig im Kanal, zu oder auf */
export const sliderInGate = (lay: ReturnType<typeof gateLayout>, open: boolean): [number, number, number] => [open ? lay.g.P : 0, 0, lay.zc - lay.g.T / 2];

/** Wandhalter (eigenes Teil): Ring um das Rohr mit Öffnung nach vorne, Grundplatte an der Wand bei y = −A */
export function gateClip(s: GateSpec): Shape3D {
  const { r1, r2, A, holeX } = gateLayout(s);
  const H = CLIP_H;
  let c = cylZ(r2, 0, H);
  c = c.fuse(box(-(holeX + 6), holeX + 6, -A, -A + WALL_T, 0, H)).fuse(box(-r2 * 0.6, r2 * 0.6, -A + WALL_T - 0.01, 0, 0, H));
  c = c.cut(cylZ(r1, -1, H + 1));
  // Öffnung zum Einklipsen: 80 % des Durchmessers, das Rohr schnappt hinein
  c = c.cut(box(-r1 * 0.8, r1 * 0.8, r1 * 0.35, r2 + 1, -1, H + 1));
  for (const sx of [1, -1]) c = c.cut(sinkHole(sx * holeX, H / 2, -A + WALL_T, WALL_T));
  return c;
}

/**
 * Lage der Teile auf dem Druckbett: Unterteil im Ursprung (Wand auf der Seite −y), Oberteil umgedreht daneben (+x,
 * Muffe unten), Platte flach davor, Wandhalter dahinter. Liefert die Verschiebung je Teil; das Oberteil wird vorher
 * um die x-Achse gedreht (upperFlip).
 */
export function gateBed(s: GateSpec) {
  const lay = gateLayout(s);
  const { g, A, r2, keyTurned, keyX } = lay;
  const lowerX = s.mount === 'plate' || s.mount === 'keyhole' ? (keyTurned ? keyX + 12.5 : g.hx + 12) : g.hx;
  const upper: [number, number, number] = [lowerX + 8 + g.hx, 0, lay.H];
  const front = g.hy + 8;
  const plate: [number, number, number] = [-(g.x0 + g.x1) / 2 + 4 + g.hx, front + g.pw, 0];
  const clipY = front + g.pw + g.hw + 8 + A;
  const clip: [number, number, number] = [0, clipY, 0];
  return { upper, plate, clip, clipFront: clipY + r2 };
}
/** Oberteil für das Bett: um 180° um die x-Achse gedreht (Muffe nach unten), dann verschoben */
export const upperOnBed = (sh: Shape3D, at: [number, number, number]) => sh.rotate(180, [0, 0, 0], [1, 0, 0]).translate(at) as Shape3D;

/** Kurztext für Dateiname und Kopfzeile */
export function gateName(s: GateSpec): { code: string; file: string; long: string } {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const lay = gateLayout(s);
  const far = s.mount !== 'none' && lay.A > lay.minA + 0.05;
  const mountFile = { none: '', plate: 'Wandplatte', keyhole: 'Schluesselloecher', clip: 'Wandhalter' }[s.mount];
  const turned = s.mount === 'keyhole' && s.orient === 'turned';
  return {
    code: `Schieber Ø${f(s.d)}`,
    file: ['Schieber', `Rohr${f(s.d)}`, mountFile, turned ? 'waagerecht' : '', far ? `Wand${f(lay.A)}` : ''].filter(Boolean).join(' '),
    long: `Rohr Ø ${f(s.d)} mm außen, Muffen ${f(s.depth)} mm tief, ${s.mount === 'none' ? 'ohne Befestigung' : `${MOUNT_LABELS[s.mount]}${s.mount === 'keyhole' ? `, ${ORIENT_LABELS[s.orient]}` : ''}, Rohrmitte ${f(lay.A)} mm vor der Wand`}`,
  };
}
