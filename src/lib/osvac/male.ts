/**
 * Male (Stecker) mit drei Bajonettnasen und abnehmbarer Druckhilfe.
 * Lokales System: Oberkante z = 0 (Anschlussseite), Steckerspitze bei z = -maleHeight (32).
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, extrudeDown, channelOutline, L, A } from './geom';
import { textOnCylinder, engrave } from './text';
import { fmt } from './female';
import { draw } from 'replicad';

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
      textOnCylinder(rMo, { text: 'osVAC neo', size: 5, centerDeg: 90, baselineZ: -4.6 }, 0.5),
      textOnCylinder(rMo, { text: label, size: 10, centerDeg: 90, baselineZ: -14.5 }, 0.5),
      textOnCylinder(rMo, { text: 'CC BY-NC-SA 4.0', size: 5, centerDeg: 210, baselineZ: -4.6 }, 0.5),
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
  // Stützrippen (0.8 mm) bei 90/210/330°, 45° vom Teller bis an die Steckerwand
  const t = 0.8;
  const rib2D = draw([rMo, zCupTop - 1])
    .lineTo([rMo, zBrimTop + (rBrimOut - rMo)])
    .lineTo([rBrimOut, zBrimTop])
    .lineTo([rMo + 2.2, zBrimTop])
    .lineTo([rMo + 1, zCupTop])
    .close();
  let rib0 = rib2D.sketchOnPlane('XZ').extrude(t) as Shape3D;
  const bb = rib0.boundingBox.bounds;
  rib0 = rib0.translate([0, -(bb[0][1] + bb[1][1]) / 2, 0]);
  for (const a of [90, 210, 330]) {
    sup = sup.fuse(rib0.clone().rotate(a, [0, 0, 0], [0, 0, 1]));
  }
  return sup;
}
