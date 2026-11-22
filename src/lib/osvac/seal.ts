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

/** Dichtring aus TPU: Pressung ohne Sog (Ring höher als die Steckerspitze in Ruhe), Grenzen und Standard */
export const SEAL_RING = { squeeze: 0.3, min: 0.1, max: 0.8, step: 0.05, clearance: 0.1, inner: 0.3, chamfer: 0.3, density: 1.21 };

export interface SealRing {
  /** innen, außen an der Bohrung (Radien), Höhe */
  ri: number;
  rb: number;
  h: number;
  /** Boden bis r1, dann 45° bis T (auf der Rundung, kurz über der weitesten Stelle), Bogen um (cx, cz) mit Radius rc bis J an der Bohrung */
  r1: number;
  T: [number, number];
  J: [number, number];
  cx: number;
  cz: number;
  rc: number;
  ch: number;
  /** größter Ø des Rings, Pressung ohne und unter Sog, Volumen (mm³), Gewicht TPU (g) */
  outer: number;
  squeeze: number;
  squeezeSog: number;
  volume: number;
  grams: number;
}

/**
 * Querschnitt des Dichtrings (r, z; Boden z = 0 = Boden der Nut), folgt der Nut mit Luft `clearance` nach außen:
 * innen senkrecht (Durchgang + 0,3), Boden flach bis kurz vor den tiefsten Punkt der Rundung (dort beginnt sie am
 * Boden), dann 45° nach außen (druckt ohne Stützen) bis auf die Rundung kurz über ihrer weitesten Stelle, der Rundung
 * entlang bis zur Bohrung, dort senkrecht bis zur Höhe Steckerspitze ohne Sog + Pressung, oben innen und außen gefast.
 * Unter der 45°-Schräge bleibt in der Nut ein kleiner Hohlraum.
 */
export function sealRing(s: SealGroove, squeeze: number): SealRing {
  const c = SEAL_RING.clearance, ch = SEAL_RING.chamfer;
  const rFi = s.inner / 2, cx = s.centerD / 2, cz = s.outerZ, rc = s.radius - c;
  const ri = rFi + SEAL_RING.inner;
  const rb = s.bore / 2 - c;
  // Boden endet 0,15 vor dem tiefsten Punkt der Rundung; die 45°-Gerade schneidet den Bogen (Radius rc) dann kurz über
  // seiner weitesten Stelle und liegt dazwischen ganz innerhalb der Nut
  const a = 0.15, r1 = cx - a;
  const u = (cz - a + Math.sqrt(Math.max(0, 2 * rc * rc - (cz - a) ** 2))) / 2;
  const T: [number, number] = [cx + u, u + a];
  const J: [number, number] = [rb, cz + Math.sqrt(Math.max(0, rc * rc - (rb - cx) ** 2))];
  const h = Math.max(s.tipMax + squeeze, J[1] + ch + 0.1);
  // Fläche und Schwerpunktradius (Polygon mit fein abgetastetem Bogen) → Volumen nach Guldin
  const pts: [number, number][] = [[ri, 0], [r1, 0], T];
  const a0 = Math.atan2(T[1] - cz, T[0] - cx), a1 = Math.atan2(J[1] - cz, J[0] - cx);
  for (let i = 1; i <= 24; i++) {
    const a = a0 + ((a1 - a0) * i) / 24;
    pts.push([cx + rc * Math.cos(a), cz + rc * Math.sin(a)]);
  }
  pts.push([rb, h - ch], [rb - ch, h], [ri + ch, h], [ri, h - ch]);
  let A2 = 0, Sr = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const cr = x0 * y1 - x1 * y0;
    A2 += cr;
    Sr += (x0 + x1) * cr;
  }
  const area = Math.abs(A2) / 2, rBar = Math.abs(Sr / (3 * A2));
  const volume = 2 * Math.PI * rBar * area;
  return { ri, rb, h, r1, T, J, cx, cz, rc, ch, outer: 2 * Math.max(T[0], cx + (a0 < 0 ? rc : rc * Math.cos(a0))), squeeze: h - s.tipMax, squeezeSog: h - s.tipMin, volume, grams: (volume / 1000) * SEAL_RING.density };
}
