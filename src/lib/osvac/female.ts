/**
 * Female (Kupplung) – Bajonett-Aufnahme mit Rändelung und Textfeldern.
 * Lokales System: Oberkante z = 0, Unterkante z = -femaleHeight (33.5).
 * Vermessen an osVAC neo Master v366 (F32 und F25).
 */
import { makePolygon, makeSolid, makeCylinder, type Shape3D, type Point } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, revolveProfileSector, extrudeDown, channelOutline, drawPath, L, A, rad, deg, type P2 } from './geom';
import { gripKnurl, gripKnurlOverlap, gripFields, gripFieldsOverlap } from './grip';

export interface FemaleOptions {
  text?: boolean;
  label?: string; // z. B. "F32"
  knurl?: boolean;
}

/** Winkel der drei Einführkanäle (Grad). Nut läuft von hier aus um bayonetRotateAngle in negative Richtung. */
export const FEMALE_SLOT_ANGLES = [90, 210, 330];

/**
 * Lage des Nutendes: Bogenlänge 12,896 + Spaltmaß auf dem Radius Rückwand − 0,38 vom Kanal bis zur Mitte
 * des Nutendes (gemessen an F32, F40, F50 mit Spalt 0,2 und F32 mit Spalt 0,4, jeweils auf 0,01° genau).
 */
const GROOVE_END_ARC = 12.896;
const GROOVE_END_R = 0.38;

/**
 * Draufsicht der Rastnase im Kanal-System (Kanal entlang +X, Nut bei negativem y):
 * Rastnasenfläche r = rr, zur Kanalecke und zur Nut hin mit R 1 (konvex) und R 1 (konkav) an die Rückwand.
 */
function rastnase2D(h: number, Rb: number, rr: number, yOut: number) {
  const C0: P2 = [Math.sqrt((Rb - 1) ** 2 - (h - 1) ** 2), -(h - 1)]; // Eckrundung des Kanals
  const C1 = circleCircle([0, 0], rr + 1, C0, 2, -1);
  const aOut = Math.asin(yOut / rr);
  const C2: P2 = [(rr + 1) * Math.cos(aOut), -(rr + 1) * Math.sin(aOut)];
  const C3 = circleCircle([0, 0], Rb - 1, C2, 2, -1);
  const mid = (p: P2, q: P2): P2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const sc = (p: P2, r: number): P2 => {
    const k = r / Math.hypot(p[0], p[1]);
    return [p[0] * k, p[1] * k];
  };
  const T01 = mid(C0, C1);
  const T23 = mid(C2, C3);
  const Ro = Rb + 0.5;
  // Beginnt an der Rückwand in der Eckrundung des Kanals (die Nut hat sie weggeschnitten)
  return drawPath(sc(C0, Ro), [
    L(...sc(C0, Rb)),
    A(...T01, ...C0),
    A(...sc(C1, rr), ...C1),
    A(...sc(C2, rr), 0, 0),
    A(...T23, ...C2),
    A(...sc(C3, Rb), ...C3),
    L(...sc(C3, Ro)),
    A(...sc(C0, Ro), 0, 0),
  ]);
}

/** Schnittpunkt zweier Kreise; ySign wählt den Punkt mit dem kleineren (−1) bzw. größeren (+1) y. */
function circleCircle(c0: P2, r0: number, c1: P2, r1: number, ySign: number): P2 {
  const dx = c1[0] - c0[0];
  const dy = c1[1] - c0[1];
  const d = Math.hypot(dx, dy);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const mx = c0[0] + (a * dx) / d;
  const my = c0[1] + (a * dy) / d;
  const p1: P2 = [mx + (hh * dy) / d, my - (hh * dx) / d];
  const p2: P2 = [mx - (hh * dy) / d, my + (hh * dx) / d];
  return (p1[1] - p2[1]) * ySign > 0 ? p1 : p2;
}

/**
 * Einlaufschräge vom Kanal in die Nut. Im Original eine nahezu ebene Fläche (Abweichung < 0,04 mm),
 * die durch drei gemessene Eckpunkte festgelegt ist: zwei auf der Bohrung (rFm), einer auf der Rastnase (rr).
 * Werkzeug = Bereich unter dieser Ebene neben dem Kanal, begrenzt auf r ≤ rr (Rastnase wird danach angesetzt).
 * Kanal-System: x = Abstand von der Kanalmitte zur Nutseite hin, y = radial entlang der Kanalachse.
 */
function rampBelow(a: number, h: number, rFm: number, rr: number, x0 = h - 0.6): Shape3D {
  type V3 = [number, number, number];
  const onR = (t: number, r: number, z: number): V3 => [t, Math.sqrt(r * r - t * t), z];
  // Eckpunkte gemessen an F25 (rFm 15,6) und F32 (rFm 19,1), dazwischen linear
  const k = (rFm - 15.6) / 3.5;
  const lin = (a: number, b: number) => a + (b - a) * k;
  const A = onR(h + lin(0.633, 0.697), rFm, lin(-17.836, -17.884));
  const B = onR(h + lin(2.551, 2.584), rFm, -19.8);
  const D = onR(h + lin(0.288, 0.279), rr, lin(-18.847, -18.823));
  const u: V3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const v: V3 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const zOn = (x: number, y: number) => A[2] - (n[0] * (x - A[0]) + n[1] * (y - A[1])) / n[2];
  const er: [number, number] = [Math.cos(rad(a)), Math.sin(rad(a))];
  const et: [number, number] = [Math.sin(rad(a)), -Math.cos(rad(a))]; // zur Nut hin (negative Winkel)
  const G = (x: number, y: number, z: number): Point => [y * er[0] + x * et[0], y * er[1] + x * et[1], z];
  const x1 = h + 4.5, y0 = Math.sqrt(rFm * rFm - x1 * x1) - 0.5, y1 = rr + 0.6, zb = -26; // y0: bis an die Bohrung, auch bei kleinen Kupplungen
  const top = [G(x0, y0, zOn(x0, y0)), G(x1, y0, zOn(x1, y0)), G(x1, y1, zOn(x1, y1)), G(x0, y1, zOn(x0, y1))];
  const bot = [G(x0, y0, zb), G(x1, y0, zb), G(x1, y1, zb), G(x0, y1, zb)];
  const faces = [makePolygon(top), makePolygon([...bot].reverse())];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push(makePolygon([bot[i], bot[j], top[j], top[i]]));
  }
  return makeSolid(faces) as unknown as Shape3D;
}

const rampWedge = (a: number, h: number, rFm: number, rr: number) =>
  rampBelow(a, h, rFm, rr).intersect(makeCylinder(rr + 0.3, 10, [0, 0, -27])) as Shape3D;

export function femaleRing(p: OsvacParams, opt: FemaleOptions = {}): Shape3D {
  const rFi = p.femaleDiameterInner / 2;
  const rFm = p.femaleDiameterMiddle / 2;
  const rFo = p.femaleDiameterOuter / 2;
  const H = p.femaleHeight;

  // --- Grundprofil (Rotationskörper) ---
  // Dichtnut: Lage fest zum Innendurchmesser (bei Spalt 0,4 gemessen: wandert nicht mit der Bohrung)
  const beadC: [number, number] = [p.femaleDiameterInner / 2 + 2.15, -31.45];
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

  // --- Bajonett ---
  const w = p.femaleBayonetNoseWidth;
  const h = w / 2;
  const Rb = rFm + p.bajonettNaseDicke; // Rückwand von Kanal und Nut
  const rr = Rb - p.rastnasenStaerke; // Fläche der Rastnase
  const zGrooveBot = -26.8;
  const zGrooveTop = -21.0;
  const zBevelTop = zGrooveTop + p.bayonetChamfer; // -19.8
  const slot2D = channelOutline(w, Rb, 1, rFm - 2, { rBore: rFm, fm: 1 });
  const grooveProfile = (a0: number, a1: number) =>
    revolveProfileSector([rFm - 1, zBevelTop], [L(rFm, zBevelTop), L(Rb, zGrooveTop), L(Rb, zGrooveBot), L(rFm - 1, zGrooveBot)], a0, a1);
  // Nutende: gleiche Kontur wie der Kanal, gedreht um (12,896 + g) / (Rb − 0,38),
  // höchstens 60° vom Kanal entfernt (vermessen an F25, F32, F40, F50)
  const endRot = deg((GROOVE_END_ARC + p.maleFemaleGapSize) / (Rb - GROOVE_END_R));
  const clip = 60;
  const clipped = endRot + deg(Math.asin(h / Rb)) > clip; // äußere Kante des Nutendes jenseits von 60°
  for (const a of FEMALE_SLOT_ANGLES) {
    // Einführkanal von oben bis Nutboden
    body = body.cut(extrudeDown(slot2D, 0.5, 0.5 - zGrooveBot).rotate(a, [0, 0, 0], [0, 0, 1]));
    // Umlaufende Nut (Sektor) inkl. 59°-Fase oben
    if (clipped) {
      // Nutende läge hinter 60°: Nut endet wie im Original (F25) mit einer geraden, scharfkantigen Fläche bei 60°
      body = body.cut(grooveProfile(a - clip, a));
    } else {
      body = body.cut(grooveProfile(a - endRot, a));
      // Nutende; die 59°-Fase läuft wie im Original bis an die Stirnwand
      const endPrism = extrudeDown(slot2D, zBevelTop + 0.01, zBevelTop + 0.01 - zGrooveBot).rotate(a - endRot, [0, 0, 0], [0, 0, 1]);
      body = body.cut(endPrism.intersect(grooveProfile(a - endRot - 30, a - endRot + 30)) as Shape3D);
    }
    // Einlaufschräge vom Kanal in die Nut oberhalb der Rastnase
    body = body.cut(rampWedge(a, h, rFm, rr));
  }
  // Oberkante der Einführkanäle mit R 1 gerundet (wie im Original)
  const slotHalf = deg(Math.asin((h + 1.5) / rFm));
  body = body.fillet((e) => {
    const m = e.pointAt(0.5);
    if (m.z < -1.05 || m.z > 0.05) return null;
    const r = Math.hypot(m.x, m.y);
    if (r < rFm - 0.1 || r > Rb + 0.1) return null;
    const th = deg(Math.atan2(m.y, m.x));
    return FEMALE_SLOT_ANGLES.some((a) => Math.abs(((th - a + 540) % 360) - 180) < slotHalf) ? 1 : null;
  });

  // --- Rastnasen: 0,4-mm-Steg neben dem Kanal mit R-1-Übergängen ---
  const yOut = 6.88 + (w - 10.2) / 2; // Ende der Rastnasenfläche, tangential zur Kanalmitte (gemessen bei F32)
  const ridge2D = rastnase2D(h, Rb, rr, yOut);
  for (const a of FEMALE_SLOT_ANGLES) {
    body = body.fuse(extrudeDown(ridge2D, -18.8, -18.8 - zGrooveBot).rotate(a, [0, 0, 0], [0, 0, 1]));
    // Wo die Einlaufschräge höher liegt als −18,8, reicht die Rastnase bis an die Schräge (wie im Original)
    const high = extrudeDown(ridge2D, -17.3, 1.55).rotate(a, [0, 0, 0], [0, 0, 1]).intersect(rampBelow(a, h, rFm, rr, h - 1.5)) as Shape3D;
    body = body.fuse(high);
  }

  return body;
}

/** Textfelder der Kupplung (eigener Körper, siehe gripFields). */
export function femaleFields(p: OsvacParams, opt: FemaleOptions = {}): Shape3D {
  const label = opt.text === false ? null : (opt.label ?? `F${fmt(p.femaleDiameterInner)}`);
  return gripFields(p.femaleDiameterOuter / 2, -2, -31.5, 'full', label);
}

/** Rändelung der Kupplung (eigener Körper). */
export const femaleKnurl = (p: OsvacParams) => gripKnurl(p.femaleDiameterOuter / 2, -2, -31.5, 'full');
export const femaleKnurlOverlap = (p: OsvacParams) => gripKnurlOverlap(p.femaleDiameterOuter / 2, -2, -31.5, 'full');

export const femaleFieldsOverlap = (p: OsvacParams) => gripFieldsOverlap(p.femaleDiameterOuter / 2, -2, -31.5, 'full');

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
