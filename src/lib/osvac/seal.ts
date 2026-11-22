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
