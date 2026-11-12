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
import { makeBox, makeCylinder, makeSphere, type Shape3D } from 'replicad';
import { revolveProfile, L } from './geom';

/** Dicke der Platte */
export const GATE_T = 2.4;
/** Rahmen über und unter dem Schlitz */
const GATE_FR = 2.4;
/** Tiefe je Stufe der Brückenhilfe über (und unter) dem Schlitz */
const POCKET = 0.4;
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
  const x0 = -(P + Rm + 3), x1 = half + 16, gripX = half + 9.5;
  return { T, gap, slot, fr, yS, pw, half, Hf, Rc, ch, P, pd, dr, hb, x0, x1, gripX, Rm, Ro, minLen: Hf + 2 * ch };
}
export type GateDims = ReturnType<typeof gateDims>;

/** Rahmen (voll) um den Schlitz bei zc, mit 45°-Schrägen zum Rohr hin; außen bei z0 … z1 abgeschnitten */
function frame(g: GateDims, zc: number, z0: number, z1: number): Shape3D {
  const zb = zc - g.Hf / 2, zt = zc + g.Hf / 2;
  const a = zb - g.ch, b = zt + g.ch;
  const rev = revolveProfile([0, a], [L(g.Ro, a), L(g.Rc + 0.02, zb), L(g.Rc + 0.02, zt), L(g.Ro, b), L(0, b)]);
  return box(-g.half, g.half, -g.half, g.half, Math.max(a, z0), Math.min(b, z1)).intersect(rev) as Shape3D;
}

/** Schlitz, Brückenhilfe und Rastmulden aus dem Gehäuse schneiden */
function cutSlot(h: Shape3D, g: GateDims, zc: number): Shape3D {
  h = h.cut(box(-g.half - 1, g.half + 1, -g.yS, g.yS, zc - g.slot / 2, zc + g.slot / 2));
  for (const s of [1, -1]) {
    const z = zc + (s * g.slot) / 2;
    // Stufe 1: Streifen quer über den Schlitz (Brücke von Seitenwand zu Seitenwand), Stufe 2: Quadrat um die Bohrung
    h = h.cut(box(-g.Rm, g.Rm, -g.yS, g.yS, z - s * 0.01, z + s * POCKET));
    h = h.cut(box(-g.Rm, g.Rm, -g.Rm, g.Rm, z + s * (POCKET - 0.01), z + s * 2 * POCKET));
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
  let pl = box(g.x0, g.x1, -g.pw, g.pw, 0, g.T).fillet(Math.min(3, g.pw - 0.5), (e) => e.inDirection('Z')) as Shape3D;
  pl = pl.cut(cylZ(g.Rm, -1, g.T + 1, -g.P, 0));
  pl = pl.cut(cylZ(4.5, -1, g.T + 1, g.gripX, 0));
  const a = Math.min(1.1, g.dr - 0.3), rs = (a * a + g.hb * g.hb) / (2 * g.hb);
  for (const x of [g.pd, -g.pd]) pl = pl.fuse(makeSphere(rs).translate([x, 0, g.T + g.hb - rs]) as unknown as Shape3D);
  return pl;
}

/** Lage der Platte im Gehäuse (für Prüfungen): mittig im Schlitz, zu oder auf */
export const plateInSlot = (g: GateDims, zc: number, open: boolean): [number, number, number] => [open ? g.P : 0, 0, zc - g.T / 2];

// ---------------------------------------------------------------- Schieber einzeln

export type GateMount = 'none' | 'plate' | 'keyhole' | 'clip';
export const MOUNT_LABELS: Record<GateMount, string> = { none: 'Ohne', plate: 'Wandplatte', keyhole: 'Schlüssellöcher', clip: 'Wandhalter' };

export interface GateSpec {
  /** Außendurchmesser des Rohrs */
  d: number;
  /** Tiefe der Muffen */
  depth: number;
  mount: GateMount;
  /** Abstand Wand bis Rohrmitte; 0 = so nah wie möglich */
  wallDist: number;
  /** Spiel am Rohr (Durchmesser der Muffe = d + 2 × Spiel) und der Platte im Schlitz */
  pipeGap: number;
  plateGap: number;
}

export const DEFAULT_GATE: GateSpec = { d: 50, depth: 20, mount: 'plate', wallDist: 0, pipeGap: 0.4, plateGap: GATE_GAP };

/** Wandplatte und Wandhalter: Dicke, Höhe des Halters, Lage der Schrauben */
const WALL_T = 3, CLIP_H = 14, CLIP_W = 3.5;

export function gateLayout(s: GateSpec) {
  const Rs = s.d / 2 + s.pipeGap, Rm = s.d / 2 - STOP, Ro = Rs + SOCKET_WALL;
  const g = gateDims(Rm, Ro, s.plateGap);
  const H = 2 * s.depth + g.Hf, zc = H / 2;
  const r1 = s.d / 2 + 0.2, r2 = r1 + CLIP_W;
  /** kleinster Abstand Wand bis Rohrmitte (Teil direkt an der Wand) */
  const minA = s.mount === 'clip' ? r2 + WALL_T : g.half + WALL_T;
  const A = Math.max(minA, s.wallDist);
  /** Schrauben: Abstand der Mitten */
  const holeX = s.mount === 'clip' ? r2 + 6 : g.half + 6;
  return { g, Rs, Rm, Ro, H, zc, r1, r2, minA, A, holeX, pitch: 2 * holeX };
}

/** Senkloch für Ø-4-Senkkopfschrauben, Achse +y, Senkung an der Fläche bei y = yFace (Kopf auf der Seite +y) */
function sinkHole(x: number, z: number, yFace: number, depth: number): Shape3D {
  const hr = 2.3, sr = 4.3;
  return revolveProfile([0, 0.02], [L(sr + 0.02, 0.02), L(hr, -(sr - hr)), L(hr, -depth - 1), L(0, -depth - 1)])
    .rotate(-90, [0, 0, 0], [1, 0, 0])
    .translate([x, yFace, z]) as Shape3D;
}

/** Gehäuse des Schiebers einzeln (stehend, Muffe unten auf dem Bett), mit Wandplatte oder Schlüssellöchern */
export function gateHousing(s: GateSpec): Shape3D {
  const { g, Rs, Rm, Ro, H, zc, A, holeX } = gateLayout(s);
  let h = cylZ(Ro, 0, H).fuse(frame(g, zc, 0, H));
  if (s.mount === 'plate' || s.mount === 'keyhole') {
    // Wandplatte vom Druckbett bis etwas über den Schlitz (spart Material), zwei Stege zum Gehäuse (die Bohrung schneidet sie innen frei)
    const X = g.half + 12, top = Math.min(H, zc + g.Hf / 2 + 8);
    h = h.fuse(box(-X, X, -A, -A + WALL_T, 0, top));
    for (const sx of [1, -1]) h = h.fuse(box(sx * (g.half - 3), sx * g.half, -A + WALL_T - 0.01, 0, 0, top));
  }
  // Muffen mit Anschlag; der untere Anschlag läuft unter 45° aus (hängt beim Druck nicht in der Luft)
  h = h.cut(cylZ(Rs, -1, s.depth));
  h = h.cut(revolveProfile([0, s.depth - 0.01], [L(Rs, s.depth - 0.01), L(Rm, s.depth + (Rs - Rm)), L(0, s.depth + (Rs - Rm))]));
  h = h.cut(cylZ(Rs, H - s.depth, H + 1));
  h = h.cut(cylZ(Rm, -1, H + 1));
  h = cutSlot(h, g, zc);
  if (s.mount === 'plate') for (const sx of [1, -1]) h = h.cut(sinkHole(sx * holeX, zc, -A + WALL_T, WALL_T));
  if (s.mount === 'keyhole')
    for (const sx of [1, -1]) {
      // Schlüsselloch: großes Loch für den Schraubenkopf, Schlitz nach oben (zum oberen Ende, wie gedruckt)
      const x = sx * holeX, zh = zc - 4, ze = zc + 5;
      const thru = (r: number, z: number) => makeCylinder(r, WALL_T + 2, [x, -A - 1, z], [0, 1, 0]) as unknown as Shape3D;
      h = h.cut(thru(4.5, zh)).cut(box(x - 2.2, x + 2.2, -A - 1, -A + WALL_T + 1, zh, ze)).cut(thru(2.2, ze));
    }
  return h;
}

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
 * Lage der Teile auf dem Druckbett: Gehäuse im Ursprung (Wand auf der Seite −y), Platte flach davor, Wandhalter
 * dahinter. Liefert die Verschiebung je Teil.
 */
export function gateBed(s: GateSpec) {
  const { g, A, r2 } = gateLayout(s);
  const front = g.half + 8;
  const plate: [number, number, number] = [-(g.x0 + g.x1) / 2, front + g.pw, 0];
  const clipY = front + 2 * g.pw + 8 + A;
  const clip: [number, number, number] = [0, clipY, 0];
  return { plate, clip, clipFront: clipY + r2 };
}

/** Kurztext für Dateiname und Kopfzeile */
export function gateName(s: GateSpec): { code: string; file: string; long: string } {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const lay = gateLayout(s);
  const far = s.mount !== 'none' && s.wallDist > lay.minA + 0.05;
  const mountFile = { none: '', plate: 'Wandplatte', keyhole: 'Schluesselloecher', clip: 'Wandhalter' }[s.mount];
  return {
    code: `Schieber Ø${f(s.d)}`,
    file: ['Schieber', `Rohr${f(s.d)}`, mountFile, far ? `Wand${f(lay.A)}` : ''].filter(Boolean).join(' '),
    long: `Rohr Ø ${f(s.d)} mm außen, Muffen ${f(s.depth)} mm tief, ${s.mount === 'none' ? 'ohne Befestigung' : `${MOUNT_LABELS[s.mount]}, Rohrmitte ${f(lay.A)} mm vor der Wand`}`,
  };
}
