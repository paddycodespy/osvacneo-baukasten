/**
 * Female (Kupplung) – Bajonett-Aufnahme mit Rändelung und Textfeldern.
 * Lokales System: Oberkante z = 0, Unterkante z = -femaleHeight (33.5).
 * Vermessen an osVACneo Master v366 (F32 und F25).
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, revolveProfileSector, extrudeDown, channelOutline, annularSector, knurlRing, L, A, rad, deg } from './geom';
import { textOnCylinder } from './text';

export interface FemaleOptions {
  text?: boolean;
  label?: string; // z. B. "F32"
  knurl?: boolean;
}

/** Winkel der drei Einführkanäle (Grad). Nut läuft von hier aus um bayonetRotateAngle in negative Richtung. */
export const FEMALE_SLOT_ANGLES = [90, 210, 330];

export function femaleRing(p: OsvacParams, opt: FemaleOptions = {}): Shape3D {
  const rFi = p.femaleDiameterInner / 2;
  const rFm = p.femaleDiameterMiddle / 2;
  const rFo = p.femaleDiameterOuter / 2;
  const H = p.femaleHeight;

  // --- Grundprofil (Rotationskörper) ---
  const beadC: [number, number] = [rFm - 0.95, -31.45];
  const beadR = 1.95;
  const beadTopZ = beadC[1] + Math.sqrt(beadR ** 2 - (rFm - beadC[0]) ** 2);
  let body = revolveProfile([rFi, -H], [
    L(rFo - 1, -H),
    L(rFo, -H + 1),
    L(rFo, -1),
    A(rFo - 1, 0, rFo - 1, -1),
    L(rFm + 1, 0),
    A(rFm, -1, rFm + 1, -1),
    L(rFm, beadTopZ),
    { t: 'A', p: [beadC[0], beadC[1] - beadR], c: beadC },
    L(rFi + 0.1, -H + 0.1),
  ]);

  // --- Rändelung (100 Zähne, 0.475 hoch) zwischen z = -2 und -31.5 ---
  const knurlTop = -2;
  const knurlBot = -31.5;
  // Textfeld A (40 mm Bogen, volle Feldhöhe 16 mm) bei 270°, Textfeld B (48 mm Bogen, 6 mm Band) bei 90°
  const fieldAHalf = deg(p.generalTextFieldWidth / 2 / rFo);
  const fieldBHalf = deg(48 / 2 / rFo);
  const fieldA = { c: 270, z0: -8.75, z1: -24.75 };
  const fieldB = { c: 90, z0: -13.75, z1: -19.75 };

  if (opt.knurl !== false) {
    let knurl = extrudeDown(knurlRing(100, rFo, 0.475, rFo - 0.3), knurlTop, knurlTop - knurlBot);
    // Bereich Textfeld A: keine Rändelung über die volle Höhe
    const clearA = extrudeDown(annularSector(rFo - 0.5, rFo + 1, fieldA.c - fieldAHalf, fieldA.c + fieldAHalf), knurlTop + 0.1, knurlTop - knurlBot + 0.2);
    knurl = knurl.cut(clearA);
    body = body.fuse(knurl);
  }
  // erhabene Textfelder (+0.5 mm)
  const raisedA = extrudeDown(annularSector(rFo - 0.3, rFo + 0.5, fieldA.c - fieldAHalf, fieldA.c + fieldAHalf), fieldA.z0, fieldA.z0 - fieldA.z1);
  const raisedB = extrudeDown(annularSector(rFo - 0.3, rFo + 0.5, fieldB.c - fieldBHalf, fieldB.c + fieldBHalf), fieldB.z0, fieldB.z0 - fieldB.z1);
  body = body.fuse(raisedA).fuse(raisedB);

  // --- Bajonett ---
  const w = p.femaleBayonetNoseWidth;
  const Rb = rFm + p.bajonettNaseDicke; // Rückwand von Kanal und Nut
  const zGrooveBot = -26.8;
  const zGrooveTop = -21.0;
  const zBevelTop = zGrooveTop + p.bayonetChamfer; // -19.8
  const slot2D = channelOutline(w, Rb, 1, rFm - 2, { rBore: rFm, fm: 1 });
  const grooveEnd2D = channelOutline(w, Rb, 1, rFm - 2);
  for (const a of FEMALE_SLOT_ANGLES) {
    // Einführkanal von oben bis Nutboden
    const slot = extrudeDown(slot2D, 0.5, 0.5 - zGrooveBot).rotate(a, [0, 0, 0], [0, 0, 1]);
    body = body.cut(slot);
    // Umlaufende Nut (Sektor) inkl. 59°-Fase oben
    const groove = revolveProfileSector([rFm - 1, zBevelTop], [
      L(rFm, zBevelTop),
      L(Rb, zGrooveTop),
      L(Rb, zGrooveBot),
      L(rFm - 1, zGrooveBot),
    ], a - p.bayonetRotateAngle, a);
    body = body.cut(groove);
    // Nutende: Kanalform an Endposition
    const end = extrudeDown(grooveEnd2D, zGrooveTop, zGrooveTop - zGrooveBot).rotate(a - p.bayonetRotateAngle, [0, 0, 0], [0, 0, 1]);
    body = body.cut(end);
    // Rastnase: 0.4 mm Steg in der Nut direkt neben dem Kanal
    const rr = Rb - p.rastnasenStaerke;
    const yOut = 6.88 + (w - 10.2) / 2; // tangentiale Lage relativ zur Kanalmitte (gemessen bei F32)
    const yIn = 5.39 + (w - 10.2) / 2;
    const aOut = deg(Math.asin(yOut / rr));
    const aIn = deg(Math.asin(yIn / rr));
    const ridge = extrudeDown(annularSector(rr, Rb + 0.01, a - aOut, a - aIn), -18.8, -18.8 - zGrooveBot);
    body = body.fuse(ridge);
  }

  // --- Beschriftung (Gravur 0.5 mm in die erhabenen Felder) ---
  if (opt.text !== false) {
    const label = opt.label ?? `F${fmt(p.femaleDiameterInner)}`;
    const rT = rFo + 0.5;
    const tools = [
      textOnCylinder(rT, { text: 'osVAC neo', size: 5, centerDeg: fieldA.c, baselineZ: -13.0 }, 0.5),
      textOnCylinder(rT, { text: label, size: 10, centerDeg: fieldA.c, baselineZ: -22.6 }, 0.5),
      textOnCylinder(rT, { text: `osVAC neo  ${label}`, size: 5, centerDeg: fieldB.c, baselineZ: -18.5 }, 0.5),
    ];
    for (const t of tools) if (t) body = body.cut(t);
  }
  void rad;
  return body;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
