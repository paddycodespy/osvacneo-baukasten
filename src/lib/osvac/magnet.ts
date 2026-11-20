/**
 * Magnet-Schnellkupplung Ø100 (eigenes System, nicht osVAC neo), nach dem Vorbild der magnetischen Schnellkupplung von
 * kleinholz.me: Maschinenadapter und Schlauchkupplung halten über Neodym-Scheiben zusammen, die beim Druck eingelegt und
 * überdruckt werden (geschlossene Taschen, Druckpause).
 *
 * - Maschinenadapter: Muffe über den Maschinenstutzen, unten am offenen Ende eine Schraubklemme (Schlitz mit
 *   Entlastungsloch, zwei Ohren, Zylinderschraube M5 × 25 ISO 4762 und selbstsichernde Mutter M5 DIN 985), innen ein
 *   45°-Anschlag für den Stutzen, oben der Flansch mit den Magnet-Nasen und dem Zentrierbund.
 * - Schlauchkupplung: unten das Schlauchgewinde (links oder rechts, Steigung wählbar), oben der gleiche Flansch mit einer
 *   Tasche für den Zentrierbund.
 *
 * Schnittstelle (Bund, Tasche, Bohrung, Teilkreis) ist fest, damit jede Kupplung an jeden Adapter mit derselben
 * Magnetgröße passt. Beide Teile werden mit der Kontaktfläche nach oben gedruckt, ohne Stützen: Unterseite von Flansch
 * und Nasen in 45°, Anschlag innen in 45°, Gewindeflanken 45°. Alle Höhen an den Taschen liegen im 0,2-mm-Raster.
 *
 * Lokales System: Unterseite bei z = 0, Achse Z.
 */
import { draw, drawCircle, makeBSplineApproximation, assembleWire, genericSweep, makeBox, makeCylinder, Plane, type Shape3D } from 'replicad';
import { revolveProfile, L, rad } from './geom';

export type MagnetSize = '10x3' | '12x5' | '15x3';
export const MAGNET_SIZES: Record<MagnetSize, { d: number; h: number; label: string }> = {
  '10x3': { d: 10, h: 3, label: '10 × 3 mm' },
  '12x5': { d: 12, h: 5, label: '12 × 5 mm' },
  '15x3': { d: 15, h: 3, label: '15 × 3 mm' },
};

export interface MagnetSpec {
  adapter: boolean;
  coupling: boolean;
  magnet: MagnetSize;
  /** Maschinenstutzen außen (mm) */
  stutzen: number;
  /** Tiefe der Muffe = Steckweg bis zum Anschlag (mm) */
  depth: number;
  /** Schlauch innen (mm) = Gewindegrund */
  hose: number;
  /** Steigung des Schlauchgewindes (mm) */
  pitch: number;
  hand: 'left' | 'right';
  /** Luft je Seite zwischen Stutzen und Muffe (mm) */
  pipeGap: number;
  /** Luft je Seite am Zentrierbund (mm) */
  fitGap: number;
  /** „Gerät ↔ Schlauch“: Schlauch Ø100 mit Außengewinde wie bisher oder kleinere Schläuche mit Drehring auf der Magnetplatte */
  hoseMode: 'large' | 'small';
  /** kleinere Schläuche: ein oder zwei, je Innendurchmesser und Drehrichtung des Gewindes */
  hoses: MagnetHose[];
  /** „Gerät ↔ Kupplung/Stecker“: ein oder zwei Anschlüsse, je Kupplung (F) oder Stecker (M), wahlweise mit Verschlusskappe */
  ports: MagnetPort[];
}

/** kleinerer Schlauch auf der Magnetplatte */
export interface MagnetHose {
  d: number;
  hand: 'left' | 'right';
}

/** Anschluss von osVAC neo auf der Magnetplatte */
export interface MagnetPort {
  t: 'F' | 'M';
  d: number;
  /** Verschlusskappe dazu: Stopfen (geschlossener Stecker) für eine Kupplung, Kappe (geschlossene Kupplung) für einen Stecker */
  cap: boolean;
}

export const DEFAULT_MAGNET: MagnetSpec = {
  adapter: true, coupling: true, magnet: '10x3', stutzen: 100, depth: 35, hose: 100, pitch: 12, hand: 'left', pipeGap: 0.3, fitGap: 0.3,
  hoseMode: 'large', hoses: [{ d: 32, hand: 'left' }], ports: [{ t: 'F', d: 32, cap: false }],
};
/** kleinere Schläuche und osVAC-Anschlüsse auf der Magnetplatte: Durchmesser innen */
export const PORT_D: readonly [number, number] = [15, 60];

export const MAGNET_LIMITS = {
  stutzen: [90, 110],
  depth: [20, 60],
  hose: [90, 110],
  pitch: [8, 20],
  pipeGap: [0.1, 1],
  fitGap: [0.2, 0.6],
} as const satisfies Partial<Record<keyof MagnetSpec, readonly [number, number]>>;

export const MAG = {
  /** Zahl der Magnete je Teil, auf dem Teilkreis R */
  n: 8,
  R: 63,
  /** Deckschicht über dem Magneten (Kontaktfläche), 3 Schichten à 0,2 mm */
  cover: 0.6,
  /** Tasche: Ø + 0,3, Höhe + 0,2 */
  pocketD: 0.3,
  pocketH: 0.2,
  /** Nase um die Tasche: Wand */
  lugWall: 3.5,
  /** Flansch: Radius, Mindestdicke, Boden unter der Tasche */
  flangeR: 59,
  flangeT: 8,
  pocketFloor: 1.6,
  /** Schnittstelle: Bohrung, Zentrierbund (Ø, Höhe, Fase oben) */
  boreR: 48.5,
  spigotR: 53,
  spigotH: 6,
  spigotChamfer: 0.8,
  /** Wandstärke von Muffe und Schlauchteil */
  wall: 3,
  /** Schlauchgewinde: Tiefe, Breite der Spitze; Flanken 45° */
  threadDepth: 3,
  threadCrest: 1.5,
  /** Länge des Gewindeteils */
  threadLen: 40,
  /** Klemme: Ohren (tangential je Ohr, hoch, radial), Schlitz, Entlastungsloch, Schraube M5 */
  earW: 11,
  earH: 16,
  earR: 12,
  slotW: 4,
  reliefD: 8,
  screwD: 5.5,
  screwZ: 8,
  /** Kopf ISO 4762 M5: Ø8,5 × 5 → Senkung Ø9,2; Mutter DIN 985 M5: SW 8 × 5 → Tasche SW 8,3; beide 5,3 tief */
  headD: 9.2,
  nutSW: 8.3,
  seat: 5.3,
  screw: 'M5 × 25',
  layer: 0.2,
} as const;

/** Rotationskörper aus Punkten (r, z); doppelte Punkte (z. B. Kegel der Höhe 0) fallen weg */
function revolvePts(pts: [number, number][]): Shape3D {
  const q = pts.filter((a, i) => i === 0 || Math.hypot(a[0] - pts[i - 1][0], a[1] - pts[i - 1][1]) > 1e-6);
  if (Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6) q.pop();
  return revolveProfile(q[0], q.slice(1).map(([r, z]) => L(r, z)));
}

const up = (v: number, s: number = MAG.layer) => Math.ceil(v / s - 1e-9) * s;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Abgeleitete Maße (für Geometrie, Hinweise und Tests) */
export function magnetLayout(s: MagnetSpec) {
  const m = MAGNET_SIZES[s.magnet];
  const pD = m.d + MAG.pocketD, pH = m.h + MAG.pocketH;
  const lugR = pD / 2 + MAG.lugWall;
  const flangeT = up(Math.max(MAG.flangeT, MAG.cover + pH + MAG.pocketFloor));
  const lugOut = MAG.R + lugR;
  // Maschinenadapter
  const Rs = s.stutzen / 2 + s.pipeGap, Ro = Rs + MAG.wall;
  // Übergang Muffe → Bohrung der Schnittstelle in 45°: enger (Anschlag) oder, bei dünnem Stutzen, weiter
  const stopH = Math.abs(Rs - MAG.boreR);
  // Schlitz mit Entlastungsloch bis knapp unter den Anschlag; die Schräge unter dem Flansch beginnt erst darüber, damit
  // die Muffe im Klemmbereich frei federn kann
  const slotTop = Math.max(MAG.earH + MAG.earR, s.depth - MAG.reliefD / 2 - 1);
  /** Kontaktfläche des Adapters (Oberkante Flansch); der Bund steht darüber */
  const zA = up(Math.max(s.depth + stopH + 2, slotTop + MAG.reliefD / 2 + 2 + flangeT + (lugOut - Ro)));
  // Schlauchkupplung
  const Rr = s.hose / 2, Ri = Rr - MAG.wall;
  // Gewinde bis unter die Schräge des Flanschs (sie beginnt an der Wand und reicht bis außen an die Nasen)
  const zFlC = MAG.threadLen + (lugOut - Rr);
  const zC = up(zFlC + flangeT);
  const recessR = MAG.spigotR + s.fitGap;
  const recessH = up(MAG.spigotH + s.fitGap);
  return {
    m, pD, pH, lugR, lugOut, flangeT,
    Rs: r2(Rs), Ro: r2(Ro), stopH, zA: r2(zA), zFlA: r2(zA - flangeT), slotTop: r2(slotTop), heightA: r2(zA + MAG.spigotH),
    Rr, Ri, zC: r2(zC), zFlC: r2(zC - flangeT), recessR, recessH,
    /** Druckpause: vor der ersten Schicht über den Taschen (Oberkante der Tasche) */
    pauseA: r2(zA - MAG.cover), pauseC: r2(zC - MAG.cover),
  };
}
export type MagnetLayout = ReturnType<typeof magnetLayout>;

/** Winkel der Magnete (Grad); die Klemme sitzt bei 270° (−y) zwischen zwei Nasen */
export const magnetAngles = () => Array.from({ length: MAG.n }, (_, i) => (360 * (i + 0.5)) / MAG.n);

const at = (r: number, a: number): [number, number] => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => makeBox([x0, y0, z0], [x1, y1, z1]) as unknown as Shape3D;
const cylZ = (r: number, z0: number, z1: number, x = 0, y = 0) => makeCylinder(r, z1 - z0, [x, y, z0], [0, 0, 1]) as unknown as Shape3D;

/**
 * Flansch mit Nasen, Oberkante zTop: Grundriss (Scheibe R 59 und die Nasen) mit einer 45°-Schräge darunter, die an der
 * Wand rWall beginnt. So hängt auch die äußerste Stelle einer Nase nicht in der Luft (druckt ohne Stützen).
 */
export function flangeDepth(lay: MagnetLayout, rWall: number) {
  return lay.lugOut - rWall;
}
function flange(lay: MagnetLayout, zTop: number, rWall: number): Shape3D {
  const zB = zTop - lay.flangeT, h = flangeDepth(lay, rWall);
  let outline = drawCircle(MAG.flangeR);
  for (const a of magnetAngles()) {
    const [x, y] = at(MAG.R, a);
    outline = outline.fuse(drawCircle(lay.lugR).translate(x, y));
  }
  const prism = outline.sketchOnPlane('XY', zB - h - 1).extrude(zTop - zB + h + 1) as Shape3D;
  const cone = revolvePts([[rWall - 1, zB - h - 1], [lay.lugOut + 1, zB + 1], [lay.lugOut + 1, zTop], [rWall - 1, zTop]]);
  return prism.intersect(cone) as Shape3D;
}

/** Geschlossene Taschen für die Magnete, Oberkante cover unter zTop */
function pockets(lay: MagnetLayout, zTop: number): Shape3D[] {
  const zT = zTop - MAG.cover;
  return magnetAngles().map((a) => {
    const [x, y] = at(MAG.R, a);
    return cylZ(lay.pD / 2, zT - lay.pH, zT, x, y);
  });
}

/** Die Magnete selbst (nur für Vorschau/Tests), in der Tasche unten aufliegend */
export function magnetDisks(lay: MagnetLayout, zTop: number): Shape3D[] {
  const zT = zTop - MAG.cover;
  return magnetAngles().map((a) => {
    const [x, y] = at(MAG.R, a);
    return cylZ(lay.m.d / 2, zT - lay.pH, zT - lay.pH + lay.m.h, x, y);
  });
}

/** Sechskant (Seitenzahl 6, Ecke oben) in der YZ-Ebene, extrudiert in +x von x0 um len */
function hexX(sw: number, x0: number, len: number, y: number, z: number): Shape3D {
  const rc = sw / Math.sqrt(3);
  const pts = Array.from({ length: 6 }, (_, i) => [y + rc * Math.cos(rad(90 + 60 * i)), z + rc * Math.sin(rad(90 + 60 * i))] as [number, number]);
  let d = draw(pts[0]);
  for (const p of pts.slice(1)) d = d.lineTo(p);
  return d.close().sketchOnPlane('YZ', x0).extrude(len) as Shape3D;
}

/** Maschinenadapter (Einbaulage = Drucklage: Muffe unten offen, Flansch oben, Bund darüber) */
export function magnetAdapter(s: MagnetSpec): Shape3D {
  const lay = magnetLayout(s);
  const { Rs, Ro, zA, zFlA, stopH } = lay;
  const zStop = s.depth;
  // Muffe + Bund außen, innen Bohrung mit 45°-Anschlag
  // ist die Muffe enger als die Schnittstelle, wird auch die Wand außen in 45° breiter (Wand dort mindestens 2,5 mm)
  const Rw = Math.max(Ro, MAG.boreR + 2.5);
  const outer = revolvePts([
    [Rs, 0], [Ro, 0], [Ro, zStop], [Rw, zStop + Rw - Ro], [Rw, zFlA], [MAG.spigotR, zA], [MAG.spigotR, zA + MAG.spigotH - MAG.spigotChamfer], [MAG.spigotR - MAG.spigotChamfer, zA + MAG.spigotH],
    [MAG.boreR, zA + MAG.spigotH], [MAG.boreR, zStop + stopH], [Rs, zStop],
  ]);
  let body = outer.fuse(flange(lay, zA, Ro)) as Shape3D;
  // Klemme: zwei Ohren bei −y, Dreieck-Stützen 45° nach oben zur Muffe
  const { earW, earH, earR, slotW } = MAG;
  const y0 = -(Ro - 2), y1 = -(Ro + earR);
  for (const sx of [-1, 1]) {
    const xa = sx * (slotW / 2), xb = sx * (slotW / 2 + earW);
    const [x0, x1] = sx > 0 ? [xa, xb] : [xb, xa];
    body = body.fuse(box(x0, x1, y1, y0, 0, earH)) as Shape3D;
    const g = draw([y1, earH]).lineTo([y0, earH]).lineTo([y0, earH + earR + 2]).close().sketchOnPlane('YZ', x0).extrude(x1 - x0) as Shape3D;
    body = body.fuse(g) as Shape3D;
  }
  // Bohrung innen (die Ohren dürfen nicht hineinragen)
  body = body.cut(cylZ(Rs, -1, zStop)) as Shape3D;
  // Schlitz mit Entlastungsloch (Schlüsselloch)
  const yS0 = -(Rs - 1), yS1 = y1 - 1;
  body = body.cut(box(-slotW / 2, slotW / 2, yS1, yS0, -1, lay.slotTop)) as Shape3D;
  body = body.cut(makeCylinder(MAG.reliefD / 2, Ro + 2 - (Rs - 1), [0, -(Rs - 1), lay.slotTop], [0, -1, 0]) as unknown as Shape3D) as Shape3D;
  // Schraube quer durch beide Ohren: Bohrung, Kopfsenkung (−x), Mutter-Tasche (+x)
  const ys = -(Ro + 5.5), zs = MAG.screwZ, xe = slotW / 2 + earW;
  body = body.cut(makeCylinder(MAG.screwD / 2, 2 * xe + 2, [-xe - 1, ys, zs], [1, 0, 0]) as unknown as Shape3D) as Shape3D;
  body = body.cut(makeCylinder(MAG.headD / 2, MAG.seat + 1, [-xe - 1, ys, zs], [1, 0, 0]) as unknown as Shape3D) as Shape3D;
  body = body.cut(hexX(MAG.nutSW, xe - MAG.seat, MAG.seat + 1, ys, zs)) as Shape3D;
  for (const p of pockets(lay, zA)) body = body.cut(p) as Shape3D;
  return body;
}

/** Gewinderippe außen: Spine auf dem Gewindegrund, Profil Trapez mit 45°-Flanken */
function hoseThreadOut(s: MagnetSpec, lay: MagnetLayout): Shape3D {
  const { threadDepth: D, threadCrest: c } = MAG;
  const hw = c / 2 + D, ext = 0.5;
  // beginnt unten mit einer senkrechten Stirnfläche (Unterkante auf dem Druckbett), endet in der Schräge unter dem Flansch
  const zc0 = hw + ext, zc1 = MAG.threadLen + 4.5;
  const turns = (zc1 - zc0) / s.pitch;
  const sgn = s.hand === 'right' ? 1 : -1;
  const steps = Math.max(16, Math.ceil(turns * 36));
  const pts: [number, number, number][] = [], aux: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (turns * 2 * Math.PI * i) / steps;
    const z = zc0 + (s.pitch * t) / (2 * Math.PI);
    pts.push([lay.Rr * Math.cos(sgn * t), lay.Rr * Math.sin(sgn * t), z]);
    aux.push([(lay.Rr + 10) * Math.cos(sgn * t), (lay.Rr + 10) * Math.sin(sgn * t), z]);
  }
  const spine = assembleWire([makeBSplineApproximation(pts, { tolerance: 1e-4, degMax: 5 })]);
  const auxSpine = assembleWire([makeBSplineApproximation(aux, { tolerance: 1e-4, degMax: 5 })]);
  // Profil in der Ebene durch die Achse bei φ = 0 (x = radial, y = z), Ursprung auf dem Gewindegrund
  const prof = draw([-ext, -hw - ext]).lineTo([0, -hw]).lineTo([D, -c / 2]).lineTo([D, c / 2]).lineTo([0, hw]).lineTo([-ext, hw + ext]).close();
  const plane = new Plane([lay.Rr, 0, zc0], [1, 0, 0], [0, -sgn, 0]);
  const wire = (prof.sketchOnPlane(plane) as unknown as { wire: Parameters<typeof genericSweep>[0] }).wire;
  return genericSweep(wire, spine, { auxiliarySpine: auxSpine, transitionMode: 'right' }) as Shape3D;
}

/**
 * Schlauchkupplung (Drucklage: Gewinde unten, Flansch mit Tasche oben), ohne Gewinderippe: die ist ein eigener Körper
 * (magnetThread), beide überlappen 0,5 mm und werden vom Slicer verschmolzen.
 */
export function magnetCoupling(s: MagnetSpec): Shape3D {
  const lay = magnetLayout(s);
  const { Rr, Ri, zC, recessR, recessH } = lay;
  const zR = zC - recessH;
  const ch = 1.5;
  // Rohr, innen unten Fase, oben 45° auf die Bohrung der Schnittstelle, Tasche für den Bund
  const rB = Math.max(MAG.boreR, Ri);
  const coneH = rB - Ri;
  // Ist die Bohrung der Schnittstelle weiter als der Schlauch, wird das Rohr oben in 45° breiter (innerhalb der Schräge
  // unter dem Flansch)
  const Rw = Math.max(Rr, rB + 2), zW = lay.zFlC - flangeDepth(lay, Rr);
  let body = revolvePts([[Ri + ch, 0], [Rr, 0], [Rr, zW], [Rw, zW + Rw - Rr], [Rw, zC], [rB, zC], [rB, zR - 1], [Ri, zR - 1 - coneH], [Ri, ch]]);
  body = body.fuse(flange(lay, zC, Rr)) as Shape3D;
  body = body.cut(cylZ(recessR, zR, zC + 1)) as Shape3D;
  // innen nichts vom Flansch
  body = body.cut(revolvePts([[0, zR - 2 - coneH], [Ri, zR - 2 - coneH], [Ri, zR - 1 - coneH], [rB, zR - 1], [rB, zR + 0.01], [0, zR + 0.01]])) as Shape3D;
  for (const p of pockets(lay, zC)) body = body.cut(p) as Shape3D;
  return body;
}

/** Gewinderippe der Schlauchkupplung (eigener Körper) */
export const magnetThread = (s: MagnetSpec) => hoseThreadOut(s, magnetLayout(s));

/** Volumen, mit dem die Gewinderippe in die Wand ragt (für die Filamentschätzung abzuziehen) */
export function magnetThreadOverlap(s: MagnetSpec): number {
  const D = MAG.threadDepth, c = MAG.threadCrest, hw = c / 2 + D, ext = 0.5;
  const turns = (MAG.threadLen + 4.5 - hw) / s.pitch;
  const len = turns * Math.hypot(2 * Math.PI * s.hose / 2, s.pitch);
  // Streifen in der Wand: Trapez (2·hw … 2·(hw + ext)) × ext
  return len * ext * (2 * hw + ext);
}

/**
 * Lage auf dem Druckbett: Adapter links vorne, Kupplung rechts hinten, um 22,5° verdreht, damit die Nasen ineinander
 * greifen (diagonal, so passen beide auf ein 256-mm-Bett). Mit nur einem Teil liegt es in der Mitte.
 */
export function magnetBed(s: MagnetSpec): { adapter: [number, number, number]; coupling: [number, number, number]; rot: number } {
  if (!(s.adapter && s.coupling)) return { adapter: [0, 0, 0], coupling: [0, 0, 0], rot: 0 };
  const lay = magnetLayout(s);
  // kleinster Abstand der Mitten (in Richtung 45°), bei dem sich die Grundrisse nicht näher als 3 mm kommen
  const sdfA = planform(lay, 0, true), sdfC = planform(lay, 22.5, false);
  const ptsA = outlinePoints(sdfA, lay.lugOut + 2);
  let d = lay.lugOut + MAG.flangeR;
  const dir: [number, number] = [Math.SQRT1_2, Math.SQRT1_2];
  for (; d < 2 * lay.lugOut + 10; d += 0.5) {
    let ok = true;
    for (const [x, y] of ptsA) if (sdfC(x - d * dir[0], y - d * dir[1]) < 3) { ok = false; break; }
    if (ok) break;
  }
  const h = d / 2;
  return { adapter: [-h * dir[0], -h * dir[1], 0], coupling: [h * dir[0], h * dir[1], 0], rot: 22.5 };
}

/** Grundriss als Abstandsfunktion (negativ innen): Flansch, Nasen, beim Adapter die Klemme */
function planform(lay: MagnetLayout, rot: number, clamp: boolean) {
  const lugs = magnetAngles().map((a) => at(MAG.R, a + rot));
  const xe = MAG.slotW / 2 + MAG.earW, y0 = -(lay.Ro - 2), y1 = -(lay.Ro + MAG.earR);
  return (x: number, y: number) => {
    let v = Math.hypot(x, y) - MAG.flangeR;
    for (const [lx, ly] of lugs) v = Math.min(v, Math.hypot(x - lx, y - ly) - lay.lugR);
    if (clamp) {
      const dx = Math.max(Math.abs(x) - xe, 0), dy = Math.max(y1 - y, y - y0, 0);
      v = Math.min(v, Math.hypot(dx, dy) - (dx === 0 && dy === 0 ? 1 : 0));
    }
    return v;
  };
}

function outlinePoints(sdf: (x: number, y: number) => number, R: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -R; x <= R; x += 1) for (let y = -R; y <= R; y += 1) if (sdf(x, y) <= 0 && sdf(x, y) > -1.5) out.push([x, y]);
  return out;
}

/** Kurzname für Dateien und Kopfzeile; osvac: „Gerät ↔ Kupplung/Stecker“ */
export function magnetName(s: MagnetSpec, osvac = false): { code: string; file: string; long: string } {
  const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const mag = s.magnet;
  const small = !osvac && s.hoseMode === 'small';
  const coupling = osvac ? 'Anschlussplatte' : small ? 'Schlauchplatte' : 'Kupplung';
  const parts = s.adapter && s.coupling ? `Adapter + ${coupling}` : s.adapter ? 'Adapter' : coupling;
  const portCode = osvac ? s.ports.map((q) => `${q.t}${f(q.d)}`).join('+') : small ? s.hoses.map((h) => `H${f(h.d)}${h.hand === 'right' ? 'R' : ''}`).join('+') : '';
  const caps = osvac ? s.ports.filter((q) => q.cap) : [];
  const file = [
    'Magnetkupplung',
    s.adapter && s.coupling ? '' : s.adapter ? 'Adapter' : osvac ? 'osVAC' : 'Schlauch',
    s.adapter ? `S${f(s.stutzen)}` : '',
    s.coupling ? (osvac || small ? portCode : `H${f(s.hose)}${s.hand === 'right' ? 'R' : 'L'}${f(s.pitch)}`) : '',
    s.coupling && caps.length ? 'mit Kappe' : '',
    `Mag${mag}`,
  ].filter(Boolean).join(' ');
  const portWord = (q: MagnetPort) => `${q.t === 'F' ? 'Kupplung' : 'Stecker'} ${q.t}${f(q.d)}`;
  const capWord = (q: MagnetPort) => (q.t === 'F' ? `Stopfen für ${q.t}${f(q.d)}` : `Kappe für ${q.t}${f(q.d)}`);
  const long = [
    parts,
    s.adapter ? `Stutzen Ø${f(s.stutzen)} mm, ${f(s.depth)} mm tief` : '',
    s.coupling && osvac ? `${s.ports.map(portWord).join(' und ')}${caps.length ? `, Verschlusskappe${caps.length > 1 ? 'n' : ''}: ${caps.map(capWord).join(' und ')}` : ''}` : '',
    s.coupling && small ? `${s.hoses.length > 1 ? 'zwei Schläuche mit Drehring: ' : 'Schlauch mit Drehring: '}${s.hoses.map((h) => `Ø${f(h.d)} mm ${h.hand === 'right' ? 'Rechts' : 'Links'}gewinde`).join(' und ')}` : '',
    s.coupling && !osvac && !small ? `Schlauch Ø${f(s.hose)} mm, ${s.hand === 'right' ? 'Rechts' : 'Links'}gewinde Steigung ${f(s.pitch)} mm` : '',
    `Magnete ${MAGNET_SIZES[mag].label}`,
  ].filter(Boolean).join(', ');
  const code = s.coupling && portCode ? `Ø100 · ${portCode}` : `Ø100 · ${MAGNET_SIZES[mag].label.replace(' mm', '')}`;
  return { code, file, long };
}

// ---------------------------------------------------------------- Magnetplatte mit kleineren Anschlüssen

/**
 * Magnetplatte statt der Schlauchkupplung Ø100: gleicher Flansch, gleiche Taschen, mit der Kontaktfläche nach unten
 * gedruckt (z = 0). Flach wie beim Vorbild: Die Platte schließt die Bohrung Ø97 des Adapters selbst, nur unter den
 * Anschlüssen ist sie durchbohrt. Für den Zentrierbund hat sie unten eine Ringnut (Decke 4,8 mm breit = Brücke), innen
 * ist sie dünner. So druckt sie ohne Stützen und braucht wenig Filament.
 */
export const PLATE = {
  /** Wand der Rohre unter Kupplung und Stecker (Übergang wie bei den Stutzen-Adaptern) */
  wall: 3,
  /** freier Abstand zwischen den Außenkonturen zweier Anschlüsse (mit Gegenstück): Bajonett greifen und drehen bzw. Schlauch aufdrehen */
  gapBayonet: 15,
  /** zwei Stecker: gemessen wird mit den aufgesteckten Kupplungen, dazwischen reichen 12 mm */
  gapMale: 12,
  gapHose: 8,
  /** Dicke der Platte innerhalb des Bunds und Wand an der Ringnut */
  disc: 4,
  grooveWall: 3,
} as const;

export interface PlatePort {
  /** Achse auf x */
  x: number;
  /** Rohr innen und außen */
  rIn: number;
  rOut: number;
}

/** Höhe der Platte (Kontaktfläche bis Oberseite), der Ringnut für den Bund und der Druckpause */
export function plateHeights(lay: MagnetLayout) {
  return { recessH: lay.recessH, plateT: r2(lay.recessH + 2), pause: r2(MAG.cover + lay.pH) };
}

/**
 * Lage der Anschlüsse: env = Außenradius je Anschluss (mit Gegenstück), gap = freier Abstand dazwischen.
 * Die Mitte der Gesamtbreite liegt auf der Achse. fits: beide innerhalb des Flanschs (R59).
 */
export function portLayout(env: number[], gap: number): { xs: number[]; width: number; fits: boolean; free: number } {
  if (env.length === 1) return { xs: [0], width: 2 * env[0], fits: env[0] <= MAG.flangeR, free: MAG.flangeR - env[0] };
  const width = 2 * env[0] + gap + 2 * env[1];
  const x0 = -width / 2 + env[0];
  const xs = [x0, x0 + env[0] + gap + env[1]];
  return { xs, width, fits: width <= 2 * MAG.flangeR + 1e-9, free: MAG.flangeR - width / 2 };
}

/** Oberseite der Platte = Unterkante der Anschlüsse */
export function plateTubeTop(lay: MagnetLayout, _ports?: PlatePort[]): number {
  return plateHeights(lay).plateT;
}

/** Flache Magnetplatte mit Sockeln und Löchern unter den Anschlüssen (Kontaktfläche unten, z = 0) */
export function magnetPlate(s: MagnetSpec, ports: PlatePort[], _zTop?: number): Shape3D {
  const lay = magnetLayout(s);
  const { recessH, plateT } = plateHeights(lay);
  const rGi = MAG.boreR - s.fitGap; // Ringnut innen (Bund innen Ø97)
  const rWall = rGi - PLATE.grooveWall;
  // Flansch und Nasen als Zylinder (Grundriss-Extrusionen aus vielen Bögen ließen spätere Vereinigungen scheitern)
  let body = revolvePts([[rWall, 0], [MAG.flangeR, 0], [MAG.flangeR, plateT], [rWall, plateT]]);
  for (const a of magnetAngles()) {
    const [x, y] = at(MAG.R, a);
    body = body.fuse(cylZ(lay.lugR, 0, plateT, x, y)) as Shape3D;
  }
  // innen dünner
  body = body.fuse(cylZ(rWall + 0.01, 0, PLATE.disc)) as Shape3D;
  // volle Höhe unter den Anschlüssen (Sockel)
  for (const q of ports) body = body.fuse(cylZ(q.rOut, 0, plateT, q.x)) as Shape3D;
  // Ringnut für den Bund (Decke = Brücke), Löcher
  body = body.cut(revolvePts([[rGi, -1], [lay.recessR, -1], [lay.recessR, recessH], [rGi, recessH]])) as Shape3D;
  for (const q of ports) body = body.cut(cylZ(q.rIn, -1, plateT + 1, q.x)) as Shape3D;
  // Magnettaschen 0,6 mm über der Kontaktfläche (geschlossen, Druckpause an der Oberkante)
  for (const a of magnetAngles()) {
    const [x, y] = at(MAG.R, a);
    body = body.cut(cylZ(lay.pD / 2, MAG.cover, MAG.cover + lay.pH, x, y)) as Shape3D;
  }
  return body;
}

/** Verschlusskappe: Boden unter dem Anschluss (Scheibe, schließt das Übergangsrohr) */
export function capFloor(rOut: number, z: number): Shape3D {
  return cylZ(rOut, z, z + PLATE.wall);
}
