/**
 * Dichtnut unten in der Kupplung (Female): Maße für eine eigene Dichtung (Rundschnur, O-Ring, TPU-Ring).
 * Ohne replicad, damit die Oberfläche die Maße ohne CAD-Kern ausrechnen kann.
 *
 * Lokales System der Kupplung: Oberkante z = 0, Unterkante z = −femaleHeight (33,5).
 * Der Boden der Nut liegt 0,1 mm über der Unterkante (femaleRing: Profil endet bei −H + 0,1).
 */
import type { OsvacParams } from './params';

/** Kreisbogen der Dichtnut: Mittelpunkt dx außerhalb des Innenradius auf Höhe z, Radius r (vom Original, wandert nicht mit dem Spalt) */
export const BEAD = { dx: 2.15, z: -31.45, r: 1.95 };
/** Boden der Nut über der Unterkante der Kupplung */
export const BEAD_FLOOR = 0.1;
/** Bajonett-Nut der Kupplung: Boden und Oberkante der senkrechten Rückwand (darüber 59°-Fase bis zGrooveTop + bayonetChamfer) */
export const FEMALE_GROOVE = { bot: -26.8, top: -21.0 };
/** Neigung der 59°-Fasen an Nase und Nut (dz/dr) */
export const BAYONET_SLOPE = 0.6;
/** Kantenbruch an der Steckerspitze (innen Rundung, außen Fase) */
export const MALE_TIP_EDGE = 0.725;

export interface SealGroove {
  /** Kupplung F… (Innendurchmesser) */
  d: number;
  /** Spaltmaß Stecker/Kupplung */
  gap: number;
  /** Kupplung steckt in einer Verschlusskappe (Magnet-Platte: Kappe für einen Stecker) */
  cap?: boolean;
  /** Durchgang (Innen-Ø der Kupplung) */
  inner: number;
  /** Bohrung über der Nut, durch die die Dichtung eingesetzt wird */
  bore: number;
  /** größter Ø der Nut (tiefste Stelle der Hinterschneidung) */
  outer: number;
  /** Höhe der tiefsten Stelle über dem Boden */
  outerZ: number;
  /** Radius der Rundung außen und Ø ihres Mittelpunkts */
  radius: number;
  centerD: number;
  /** Höhe der Nut an der Bohrung (dort, wo die Rundung in die Bohrung übergeht) */
  heightAtBore: number;
  /** Steckerspitze über dem Boden: ganz hineingezogen (Nasen unten in der Nut) bzw. ganz herausgedrückt (Nasen oben an der Fase) */
  tipMin: number;
  tipMax: number;
  /** ebene Fläche der Steckerspitze (Ø innen/außen) */
  tipInner: number;
  tipOuter: number;
}

/**
 * Maße der Dichtnut einer Kupplung mit den Parametern p. Der Stecker hat denselben Innendurchmesser wie die Kupplung.
 * Lage der Steckerspitze aus dem Bajonett: Nasen-Unterkante −H_M + Randabstand, Nasen-Oberkante + Höhe + Fase;
 * die Nase kann zwischen Nutboden und der 59°-Fase oben spielen.
 */
export function sealGroove(p: OsvacParams): SealGroove {
  const rFi = p.femaleDiameterInner / 2;
  const rFm = p.femaleDiameterMiddle / 2;
  const rMo = rFi + (p.maleDiameterOuter - p.maleDiameterInner) / 2; // Stecker gleicher Größe
  const floor = -p.femaleHeight + BEAD_FLOOR;
  const cx = rFi + BEAD.dx;
  const dxBore = rFm - cx;
  const topAtBore = BEAD.z + Math.sqrt(Math.max(0, BEAD.r ** 2 - dxBore ** 2));
  // Steckerspitze im System der Kupplung
  const lugBot = -p.maleHeight + p.bajonettNaseMaleRandAbstand;
  const lugTop = lugBot + p.bajonettNaseHoehe1 + p.bayonetChamfer; // Beginn der Fase am Rohr (r = rMo)
  const shiftDown = FEMALE_GROOVE.bot - lugBot; // Nase liegt auf dem Nutboden
  // Fase der Nut (beginnt an der Bohrung rFm auf top + Fase) gegen Fase der Nase (beginnt am Rohr rMo auf lugTop), gleiche Neigung
  const shiftUp = FEMALE_GROOVE.top + p.bayonetChamfer + BAYONET_SLOPE * (rFm - rMo) - lugTop;
  const tip = (s: number) => -p.maleHeight + s - floor;
  return {
    d: p.femaleDiameterInner,
    gap: p.maleFemaleGapSize,
    inner: 2 * rFi,
    bore: 2 * rFm,
    outer: 2 * (cx + BEAD.r),
    outerZ: BEAD.z - floor,
    radius: BEAD.r,
    centerD: 2 * cx,
    heightAtBore: topAtBore - floor,
    tipMin: tip(shiftDown),
    tipMax: tip(shiftUp),
    tipInner: 2 * (rFi + MALE_TIP_EDGE),
    tipOuter: 2 * (rMo - MALE_TIP_EDGE),
  };
}

/**
 * Dichtring aus TPU als Lippendichtung: Vorspannung der Lippe (so viel steht sie ohne Stecker über der Steckerspitze),
 * Grenzen und Standard; Lippe 0,8 mm dick, mindestens 55° steil (druckt ohne Stützen).
 */
export const SEAL_RING = { squeeze: 0.5, min: 0.2, max: 1.0, step: 0.05, clearance: 0.1, inner: 0.3, lip: 0.8, angle: 55, density: 1.21 };

export interface SealRing {
  /** Querschnitt (r, z) als geschlossenes Polygon, gegen den Uhrzeigersinn, Boden z = 0 */
  pts: [number, number][];
  /** innen (Radius), größter Ø, Oberkante der Lippe, Oberkante des Fußes */
  ri: number;
  outer: number;
  h: number;
  zb: number;
  /** Neigung der Lippe (Grad über der Waagerechten), Vorspannung in Ruhe */
  angle: number;
  squeeze: number;
  /** Volumen (mm³), Gewicht TPU (g) */
  volume: number;
  grams: number;
}

/**
 * Querschnitt des Dichtrings (r, z; Boden z = 0 = Boden der Nut), Lippendichtung:
 * - Fuß: flach auf dem Boden, innen senkrecht (Durchgang + 0,3), außen der Rundung der Nut entlang bis in die
 *   Hinterschneidung (unten anliegend, oben 0,1 mm Luft, knapp über ihrer weitesten Stelle), oben eben. Er hält den Ring
 *   in der Nut.
 * - Lippe: 0,8 mm dick, wächst innen aus dem Fuß schräg nach oben außen und steht ohne Stecker um die Vorspannung über
 *   der Steckerspitze (Stellung ohne Sog). Der Stecker biegt sie beim Einstecken nach unten; die Außenluft kommt über den
 *   Spalt an der Bohrung unter die Lippe und drückt sie gegen die Spitze (zieht sich unter Sog selbst zu).
 * Die Lippe wird steiler, wenn ihre obere Außenkante sonst über den Stecker hinaus an die Bohrung käme.
 */
export function sealRing(s: SealGroove, squeeze: number): SealRing {
  const c = SEAL_RING.clearance, t = SEAL_RING.lip;
  const rFi = s.inner / 2, cx = s.centerD / 2, cz = s.outerZ, rc = s.radius - c;
  const ri = rFi + SEAL_RING.inner;
  const rMo = s.tipOuter / 2 + MALE_TIP_EDGE; // Stecker außen
  // Fuß: Boden bis zum tiefsten Punkt der Rundung, dann der Rundung entlang (Radius rc, Mittelpunkt um die Luft c
  // tiefer: berührt den Boden dort, wo die Rundung beginnt, und hat oben c Luft zur Nut) bis knapp über ihre weiteste
  // Stelle. Rückmeldung aus dem Forum: der Fuß soll überall an der Kupplung anliegen (vorher 45°-Schräge mit Hohlraum
  // darunter und einer Spitze außen). Druckt trotzdem ohne Stützen: nur die untersten Schichten stehen etwas über.
  const czr = cz - c;
  const zb = cz + 0.05;
  const aTop = Math.asin(Math.min(1, (zb - czr) / rc));
  const arc: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const ang = -Math.PI / 2 + ((aTop + Math.PI / 2) * i) / 24;
    arc.push([cx + rc * Math.cos(ang), czr + rc * Math.sin(ang)]);
  }
  const T = arc[arc.length - 1];
  const h = s.tipMax + squeeze;
  // Lippe: Innenkante von (ri, zb) unter dem Winkel ang bis h, Außenkante parallel im Abstand t
  const outerAt = (deg: number) => {
    const g = (deg * Math.PI) / 180;
    return ri + (h - zb) / Math.tan(g) + t / Math.sin(g);
  };
  const xMax = Math.min(rMo, s.bore / 2 - 0.25);
  let angle = SEAL_RING.angle;
  while (angle < 80 && outerAt(angle) > xMax) angle += 0.5;
  const g = (angle * Math.PI) / 180;
  const xIn = ri + (h - zb) / Math.tan(g);
  const xOut = xIn + t / Math.sin(g);
  const xRoot = xOut - (h - zb) / Math.tan(g); // Außenkante der Lippe auf der Oberkante des Fußes
  const pts: [number, number][] = [[ri, 0], ...arc, [xRoot, zb], [xOut, h], [xIn, h], [ri, zb]];
  // Fläche und Schwerpunktradius → Volumen nach Guldin
  let A2 = 0, Sr = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const cr = x0 * y1 - x1 * y0;
    A2 += cr;
    Sr += (x0 + x1) * cr;
  }
  const area = Math.abs(A2) / 2, rBar = Math.abs(Sr / (3 * A2));
  const volume = 2 * Math.PI * rBar * area;
  return { pts, ri, outer: 2 * (cx + rc), h, zb, angle, squeeze: h - s.tipMax, volume, grams: (volume / 1000) * SEAL_RING.density };
}
