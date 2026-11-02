/**
 * Female (Kupplung) – Bajonett-Aufnahme mit Rändelung und Textfeldern.
 * Lokales System: Oberkante z = 0, Unterkante z = -femaleHeight (33.5).
 * Vermessen an osVAC neo Master v366 (F32 und F25).
 */
import { makePolygon, makeSolid, type Shape3D, type Point } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, revolveProfileSector, extrudeDown, channelOutline, drawPath, L, A, rad, deg, type P2 } from './geom';
import { addGrip, addLabels } from './grip';

export interface FemaleOptions {
  text?: boolean;
  label?: string; // z. B. "F32"
  knurl?: boolean;
}

/** Winkel der drei Einführkanäle (Grad). Nut läuft von hier aus um bayonetRotateAngle in negative Richtung. */
export const FEMALE_SLOT_ANGLES = [90, 210, 330];

/** Bogenlänge (Radius Rückwand − 1) vom Kanal bis zur Mitte des Nutendes. */
const GROOVE_END_ARC = 12.7;

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
 * Einlaufschräge vom Kanal in die Nut (im Original eine Freiformfläche): Keil zwischen Kanalwand
 * und der Schräge durch die gemessenen Eckpunkte an Bohrung (rFm) und Rastnase (rr).
 * t = Abstand von der Kanalmitte zur Nutseite hin.
 */
function rampWedge(a: number, h: number, rFm: number, rr: number): Shape3D {
  const P = (t: number, r: number, z: number): Point => {
    const phi = rad(a) - Math.asin(t / r);
    return [r * Math.cos(phi), r * Math.sin(phi), z];
  };
  const ts = h - 0.6;
  const ri = rFm - 0.3;
  const ro = rr + 0.05;
  const zA = -17.884, zB = -19.8, zC = -20.354, zD = -18.823, zE = -20.807;
  const Ai = P(h + 0.697, ri, zA), Bi = P(h + 2.584, ri, zB), Bs = P(ts, ri, zB - 1), As = P(ts, ri, zA);
  const Do = P(h + 0.279, ro, zD), Co = P(h + 1.791, ro, zC), Eo = P(h + 2.173, ro, zE), Es = P(ts, ro, zE - 1), Ds = P(ts, ro, zD);
  const tri = (p: Point, q: Point, r: Point) => makePolygon([p, q, r]);
  const quad = (p: Point, q: Point, r: Point, s: Point) => [tri(p, q, r), tri(p, r, s)];
  return makeSolid([
    ...quad(As, Ai, Bi, Bs), // innen
    tri(Ds, Es, Eo), tri(Ds, Eo, Co), tri(Ds, Co, Do), // außen
    ...quad(As, Ds, Do, Ai), // oben
    tri(Ai, Do, Co), tri(Ai, Co, Eo), tri(Ai, Eo, Bi), // Schräge
    ...quad(Bi, Eo, Es, Bs), // unten
    ...quad(Bs, Es, Ds, As), // Kanalseite
  ]) as unknown as Shape3D;
}

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
  // Nutende: gleiche Kontur wie der Kanal, um 12,7 mm (auf dem Radius der Eckrundungen) gedreht,
  // höchstens 60° vom Kanal entfernt (vermessen an F32 und F25)
  const endRot = deg(GROOVE_END_ARC / (Rb - 1));
  const clip = 60;
  for (const a of FEMALE_SLOT_ANGLES) {
    // Einführkanal von oben bis Nutboden
    body = body.cut(extrudeDown(slot2D, 0.5, 0.5 - zGrooveBot).rotate(a, [0, 0, 0], [0, 0, 1]));
    // Umlaufende Nut (Sektor) inkl. 59°-Fase oben
    const aEnd = a - Math.min(endRot, clip);
    body = body.cut(grooveProfile(aEnd, a));
    // Nutende; die 59°-Fase läuft wie im Original bis an die Stirnwand
    const endPrism = extrudeDown(slot2D, zBevelTop + 0.01, zBevelTop + 0.01 - zGrooveBot).rotate(a - endRot, [0, 0, 0], [0, 0, 1]);
    body = body.cut(endPrism.intersect(grooveProfile(Math.max(a - endRot - 30, a - clip), a - endRot + 30)) as Shape3D);
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

  // --- Rändelung + Textfelder ---
  body = addGrip(body, rFo, -2, -31.5, { knurl: opt.knurl });

  // --- Rastnasen: 0,4-mm-Steg neben dem Kanal mit R-1-Übergängen ---
  const yOut = 6.88 + (w - 10.2) / 2; // Ende der Rastnasenfläche, tangential zur Kanalmitte (gemessen bei F32)
  const ridge2D = rastnase2D(h, Rb, rr, yOut);
  for (const a of FEMALE_SLOT_ANGLES) {
    body = body.fuse(extrudeDown(ridge2D, -18.8, -18.8 - zGrooveBot).rotate(a, [0, 0, 0], [0, 0, 1]));
  }

  // --- Beschriftung ---
  if (opt.text !== false) body = addLabels(body, rFo, -2, -31.5, opt.label ?? `F${fmt(p.femaleDiameterInner)}`);
  return body;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
