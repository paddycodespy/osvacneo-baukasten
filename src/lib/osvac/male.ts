/**
 * Male (Stecker) mit drei Bajonettnasen und abnehmbarer Druckhilfe.
 * Lokales System: Oberkante z = 0 (Anschlussseite), Steckerspitze bei z = -maleHeight (32).
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, extrudeDown, channelOutline, L, A } from './geom';
import { textOnCylinder, engrave } from './text';
import { TEXT, LICENSE_TEXT } from './grip';
import { fmt } from './female';
import { makePolygon, makeSolid, type Point } from 'replicad';

export const MALE_NOSE_ANGLES = [30, 150, 270];

export interface MaleOptions {
  text?: boolean;
  label?: string;
}

export function maleTube(p: OsvacParams, opt: MaleOptions = {}): Shape3D {
  const rMi = p.maleDiameterInner / 2;
  const rMo = p.maleDiameterOuter / 2;
  const H = p.maleHeight;
  const e = 0.725; // Kantenbruch Spitze
  let body = revolveProfile([rMi, 0], [
    L(rMi, -H + e),
    A(rMi + e, -H, rMi + e, -H + e),
    L(rMo - e, -H),
    L(rMo, -H + e),
    L(rMo, 0),
  ]);

  // Bajonettnasen
  const zBot = -H + p.bajonettNaseMaleRandAbstand; // -28.7
  const zTop = zBot + p.bajonettNaseHoehe1 + p.bayonetChamfer; // -22.0
  const Rn = rMo + p.bajonettNaseDicke;
  const top2D = channelOutline(p.maleBayonetNoseWidth, Rn, 1, rMo - 1);
  const zBevel = zTop - p.bayonetChamfer * (p.bajonettNaseDicke / 2); // Fase 59° über volle Nasendicke
  const noseProfile = revolveProfile([rMo - 1, zTop], [L(rMo, zTop), L(Rn, zTop - (Rn - rMo) * 0.6), L(Rn, zBot), L(rMo - 1, zBot)]);
  void zBevel;
  for (const a of MALE_NOSE_ANGLES) {
    const prism = extrudeDown(top2D, zTop, zTop - zBot).rotate(a, [0, 0, 0], [0, 0, 1]);
    body = body.fuse(prism.intersect(noseProfile) as Shape3D);
  }

  if (opt.text !== false) {
    const label = opt.label ?? `M${fmt(p.maleDiameterInner)}`;
    const tools = [
      textOnCylinder(rMo, { text: 'osVAC neo', size: TEXT.small, centerDeg: 270, baselineZ: -3.89 }, 0.5),
      textOnCylinder(rMo, { text: label, size: TEXT.label, centerDeg: 270, baselineZ: -14.53 }, 0.5),
      textOnCylinder(rMo, { text: LICENSE_TEXT, size: TEXT.small, centerDeg: 90, baselineZ: -5.01 }, 0.5),
    ];
    body = engrave(body, tools);
  }
  return body;
}

/**
 * Druckhilfe unter der Steckerspitze: Teller (0.5 mm) + Fangring + 3 Stützrippen (0.8 mm).
 * Gleiches lokales System wie maleTube (Steckeroberkante z = 0).
 */
export function maleSupport(p: OsvacParams): Shape3D {
  const rMi = p.maleDiameterInner / 2;
  const rMo = p.maleDiameterOuter / 2;
  const H = p.maleHeight;
  const g = p.supportStructureGapSize;
  const e = 0.725;
  const rBrimIn = rMi - 3;
  const rBrimOut = rMo + 20;
  const zBrimTop = -H - 0.5;
  const zBrimBot = -H - 1;
  const zCupTop = -H + 0.7;
  const s2 = Math.SQRT2 * g; // 45°-Fase um g versetzt
  let sup = revolveProfile([rBrimIn, zBrimBot], [
    L(rBrimOut, zBrimBot),
    L(rBrimOut, zBrimTop),
    L(rMo + 2.2, zBrimTop),
    L(rMo + 1, zCupTop),
    L(rMo + g, zCupTop),
    L(rMo + g, -H + e + g - s2),
    L(rMo + s2 - e - g, -H - g),
    L(rMi + e, -H - g),
    A(rMi - g, -H + e, rMi + e, -H + e),
    L(rMi - g, zCupTop),
    L(rBrimIn, zCupTop),
  ]);
  // Stützblöcke unter den Bajonettnasen (wie im Original): Grundriss der Nase, innen ab rMo + 0,8,
  // oben an der Nasenunterseite mit 45°-Fase nach innen, unten auf Fangring und Teller
  const Rn = rMo + p.bajonettNaseDicke;
  const zNose = -H + p.bajonettNaseMaleRandAbstand; // Unterseite der Nasen (−28,7)
  const nose2D = channelOutline(p.maleBayonetNoseWidth, Rn, 1, rMo - 1);
  const blockProfile = revolveProfile([rMo + 0.8, zBrimTop - 0.25], [
    L(Rn, zBrimTop - 0.25),
    L(Rn, zNose),
    L(rMo + 1.6, zNose),
    L(rMo + 0.8, zNose - 1),
  ]);
  for (const a of MALE_NOSE_ANGLES) {
    const prism = extrudeDown(nose2D, zNose + 0.1, zNose + 0.1 - zBrimTop + 0.5).rotate(a, [0, 0, 0], [0, 0, 1]);
    sup = sup.fuse(prism.intersect(blockProfile) as Shape3D);
  }
  // Stützrippen 0,8 mm bei 90/210/330°: 45° vom Teller bis an die Steckerwand; an den Auflagen
  // (Steckerwand, Fangring, Teller) auf 0,4 mm verjüngt, damit sie sich leicht abbrechen lassen
  const rib0 = taperedRib(rMo, zBrimTop + (rBrimOut - rMo), zCupTop + 1, rMo + 2.2, zBrimTop, rBrimOut);
  for (const a of [90, 210, 330]) {
    sup = sup.fuse(rib0.clone().rotate(a, [0, 0, 0], [0, 0, 1]));
  }
  return sup;
}

/**
 * Rippe als konvexes Polyeder im System x = radial, y = tangential, z: Profil V1 (Steckerwand oben),
 * V2 (Steckerwand unten), V3 (Fuß der 45°-Schräge auf dem Teller), V4 (Tellerrand); V4→V1 ist die freie Kante.
 * An den drei Auflagekanten V1V2, V2V3, V3V4 halbe Breite 0,2 statt 0,4 (Übergang über 0,8 mm).
 */
function taperedRib(rW: number, zTop: number, zW: number, rC: number, zB: number, rOut: number): Shape3D {
  type V = [number, number];
  const emb = 0.05; // Fuß minimal in Fangring und Teller versenkt (Flächen- statt Kantenkontakt)
  const V1: V = [rW, zTop];
  const V2: V = [rW, zW - emb];
  const V3: V = [rC, zB - emb];
  const V4: V = [rOut, zB - emb];
  const P = [V1, V2, V3, V4];
  // innere Kontur: Auflagekanten um 0,8 nach innen versetzt, freie Kante bleibt
  const off = (a: V, b: V, d: number): [V, V] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    const n: V = [-dz / l, dx / l]; // links der Laufrichtung = innen (Umlauf im Uhrzeigersinn in x-z)
    return [[a[0] + n[0] * d, a[1] + n[1] * d], [b[0] + n[0] * d, b[1] + n[1] * d]];
  };
  const inter = (p1: V, p2: V, q1: V, q2: V): V => {
    const d1: V = [p2[0] - p1[0], p2[1] - p1[1]], d2: V = [q2[0] - q1[0], q2[1] - q1[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    const t = ((q1[0] - p1[0]) * d2[1] - (q1[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
  };
  const e12 = off(V1, V2, 0.8), e23 = off(V2, V3, 0.8), e34 = off(V3, V4, 0.8);
  const V1i = inter(e12[0], e12[1], V4, V1);
  const V2i = inter(e12[0], e12[1], e23[0], e23[1]);
  const V3i = inter(e23[0], e23[1], e34[0], e34[1]);
  const V4i = inter(e34[0], e34[1], V4, V1);
  const Pi = [V1i, V2i, V3i, V4i];
  const p3 = (v: V, y: number): Point => [v[0], y, v[1]];
  const f = (...pts: Point[]) => makePolygon(pts);
  const faces = [];
  for (const s of [1, -1]) {
    faces.push(f(...Pi.map((v) => p3(v, 0.4 * s)))); // Seitenfläche
    for (let i = 0; i < 3; i++) {
      faces.push(f(p3(P[i], 0.2 * s), p3(P[i + 1], 0.2 * s), p3(Pi[i + 1], 0.4 * s), p3(Pi[i], 0.4 * s))); // Verjüngung
    }
  }
  for (let i = 0; i < 3; i++) faces.push(f(p3(P[i], 0.2), p3(P[i + 1], 0.2), p3(P[i + 1], -0.2), p3(P[i], -0.2))); // Auflage
  faces.push(
    f(p3(V1, 0.2), p3(V1i, 0.4), p3(V4i, 0.4), p3(V4, 0.2), p3(V4, -0.2), p3(V4i, -0.4), p3(V1i, -0.4), p3(V1, -0.2)),
  ); // freie Kante
  return makeSolid(faces) as unknown as Shape3D;
}
