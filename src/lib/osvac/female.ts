/**
 * Female (Kupplung) – Bajonett-Aufnahme mit Rändelung und Textfeldern.
 * Lokales System: Oberkante z = 0, Unterkante z = -femaleHeight (33.5).
 * Vermessen an osVAC neo Master v366 (F32 und F25).
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, revolveProfileSector, extrudeDown, channelOutline, annularSector, L, A, rad, deg } from './geom';
import { addGrip, addLabels } from './grip';

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

  // --- Rändelung + Textfelder ---
  body = addGrip(body, rFo, -2, -31.5, { clearFieldA: true, knurl: opt.knurl });

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

  // --- Beschriftung ---
  if (opt.text !== false) body = addLabels(body, rFo, -2, -31.5, opt.label ?? `F${fmt(p.femaleDiameterInner)}`);
  void rad;
  return body;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
