/**
 * Schlauchseite (osVAC neo "Hose"): Gewindekörper, Knickschutz-Trichter, Drehring (zwei
 * ineinandergreifende Ringe, im Druck beweglich) und Gehäuse für die Male-Variante.
 * Alle Radien hängen nur vom Schlauch-Innendurchmesser ab (rH = H/2), gemessen an H32 und H36.
 * Lokales System je Modul: Oberkante z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, L, A, type P2, type Seg } from './geom';
import { hoseThread, rootRadius } from './thread';
import { addGrip, addLabels } from './grip';
import { fmt } from './female';

export interface HoseOptions {
  text?: boolean;
  knurl?: boolean;
  label?: string;
}

const poly = (pts: P2[]): [P2, Seg[]] => [pts[0], pts.slice(1).map((p) => L(p[0], p[1]))];

/**
 * Gewindekörper. variant 'plain' = Hose (Schlauch) / FxxHyy, 'housed' = schmaler Kopf für MxxHyy.
 */
export function hoseBody(p: OsvacParams, variant: 'plain' | 'housed', opt: HoseOptions = {}): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rRootTop = rootRadius(p, -2.276);
  const rRootBot = rootRadius(p, -26.5);
  const cone = 5.257 / 3.681; // dr/dz der 55°-Schulter
  const segs: Seg[] = [L(rH + 1.743, 0)];
  let gripTop: number;
  if (variant === 'plain') {
    const zs = -(rO - rH - 1.743) / cone;
    segs.push(L(rO, zs), L(rO, zs - 0.1));
    gripTop = zs - 0.1;
  } else {
    const rN = rH + p.generalMaterialWidth - 1.6; // schmaler Kopf im Gehäuse
    const z1 = -(rN - rH - 1.743) / cone;
    segs.push(L(rN, z1), L(rN, -8.246));
    const z2 = -8.246 - (rO - rN) * (1.12 / 1.6);
    segs.push(L(rO, z2), L(rO, z2 - 1));
    gripTop = z2 - 1;
  }
  const gripBot = variant === 'plain' ? -26 : -25.5;
  segs.push(
    L(rO, -26.5),
    A(rO - 0.5, -27, rO - 0.5, -26.5),
    L(rRootBot + 0.5, -27),
    A(rRootBot, -26.5, rRootBot + 0.5, -26.5),
    L(rRootTop, -2.276),
  );
  // Das Gewinde ist ein eigener Körper (siehe hoseThreadBody): Boolesche Operationen mit den
  // Spline-Flächen der Schraubenlinie würden die Berechnung um Minuten verlängern.
  let body = revolveProfile([rH, 0], segs);
  const layout = variant === 'plain' ? 'full' : 'housedHose';
  body = addGrip(body, rO, gripTop, gripBot, { knurl: opt.knurl, layout });
  if (opt.text !== false) body = addLabels(body, rO, gripTop, gripBot, opt.label ?? `H${fmt(p.hoseDiameterInner)}`, layout);
  return body;
}

/**
 * Gewinderippe als eigener Körper; überlappt die Wand um 0.5 mm und wird im Slicer verschmolzen.
 * runout = true, wenn ein Knickschutz folgt: dann läuft die Rippe im Trichter aus.
 */
export function hoseThreadBody(p: OsvacParams, runout: boolean): Shape3D {
  return hoseThread(p, 0.5, runout);
}

/**
 * Knickschutz-Trichter unter dem Gewindekörper (Hose-System: Oberkante Hose = 0).
 * Gemessen bei 7 und 9 mm Materialstärke: Außenbogen R 64,875 beginnt am Außenradius rO = rH + W,
 * Innenbogen (gleicher Mittelpunkt) beginnt am Gewindegrund; die Endrundung verbindet beide Bögen.
 */
export function hoseSkirt(p: OsvacParams): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rIn = rootRadius(p, -26.5); // = rH + 4.944
  const zc = -26.5;
  const Rout = 64.875;
  const rc = rO + Rout;
  const Rin = rc - rIn;
  const dz = -19.5; // Länge des Trichters bis zum Außen-Ende
  const outEnd: P2 = [rc - Math.sqrt(Rout ** 2 - dz ** 2), zc + dz];
  const k = Rin / Rout;
  const inEnd: P2 = [rc + (outEnd[0] - rc) * k, zc + (outEnd[1] - zc) * k];
  const tc: P2 = [(outEnd[0] + inEnd[0]) / 2, (outEnd[1] + inEnd[1]) / 2];
  const tr = Math.hypot(outEnd[0] - inEnd[0], outEnd[1] - inEnd[1]) / 2;
  // Scheitel der Endrundung: senkrecht zur radialen Verbindung der Enden, in Laufrichtung (nach unten)
  let ux = -(outEnd[1] - zc);
  let uz = outEnd[0] - rc;
  const ul = Math.hypot(ux, uz);
  if (uz > 0) {
    ux = -ux;
    uz = -uz;
  }
  const tipMid: P2 = [tc[0] + (tr * ux) / ul, tc[1] + (tr * uz) / ul];
  return revolveProfile([rIn, zc], [
    L(rO, zc),
    A(outEnd[0], outEnd[1], rc, zc),
    { t: 'M', p: inEnd, m: tipMid },
    A(rIn, zc, rc, zc),
  ]);
}

/**
 * Drehring (zwei ineinandergreifende Ringe, im Druck beweglich). Gemessen bei 7 und 9 mm Materialstärke:
 * Alle Hakenflanken laufen unter 35° (dz/dr = 0,7), die Haken-Versätze wachsen mit a = W/3,
 * der Spalt zwischen den Ringen beträgt 0,3 mm (SlipRingGapSize).
 */
const T35 = 0.7;

/** Außenring: Haken außen, hängt an Kupplung (FxxHyy) bzw. sitzt im Gehäuse (MxxHyy). */
function swivelOuterPts(rH: number, W: number, housed: boolean): P2[] {
  const a = W / 3;
  const p10: P2 = [rH + a, -1.0];
  const p9: P2 = [rH + 2 * a + 0.15, p10[1] - T35 * (a + 0.15)];
  const p8: P2 = [p9[0], p9[1] - 0.612];
  const p7: P2 = [rH + a + 0.15, p8[1] - T35 * a];
  const p6: P2 = [p7[0], p7[1] - 0.3];
  const p11: P2 = [rH + 1.105, p10[1] - T35 * (a - 1.105)];
  const hook: P2[] = [p6, p7, p8, p9, p10, p11, [rH, p11[1]]];
  if (housed) {
    const rB = rH + W - 1.2;
    return [[rH, 0], [rB, 0], [rB, p6[1] - T35 * (rB - p6[0])], ...hook];
  }
  const p5: P2 = [rH + 2 * a, p6[1] - T35 * (2 * a - a - 0.15)];
  const p4: P2 = [rH + W - 1.2, p5[1] + T35 * (W - 1.2 - 2 * a)];
  return [[rH, 0], [rH + W, 0], [rH + W, p4[1]], p4, p5, ...hook];
}

/** Innenring: sitzt auf dem Gewindekörper. */
function swivelInnerPts(rH: number, W: number, housed: boolean): P2[] {
  const a = W / 3;
  const q3: P2 = [rH + a, 0];
  const q2: P2 = [rH + 1.2, -T35 * (a - 1.2)];
  const q4: P2 = [rH + 2 * a - 0.15, -T35 * (a - 0.15)];
  const q5: P2 = [q4[0], q4[1] - 0.3];
  const q6: P2 = [rH + a - 0.15, q5[1] - T35 * a];
  const q7: P2 = [q6[0], q6[1] - 0.612];
  const top: P2[] = [[rH, q2[1]], q2, q3, q4, q5, q6, q7];
  if (housed) {
    const rN = rH + W - 1.6;
    const q12: P2 = [rH + 1.743, -6.634];
    return [...top, [rN, q7[1] - T35 * (rN - q7[0])], [rN, q12[1] - T35 * (rN - q12[0])], q12, [rH, q12[1]]];
  }
  const q8: P2 = [rH + 2 * a, q7[1] - T35 * (a + 0.15)];
  const q9: P2 = [rH + W - 1.105, q8[1] + T35 * (W - 1.105 - 2 * a)];
  const q12: P2 = [rH + 1.743, -4.634];
  return [...top, q8, q9, [rH + W, q9[1]], [rH + W, q12[1] - T35 * (W - 1.743)], q12, [rH, q12[1]]];
}

export function swivelOuter(p: OsvacParams, housed: boolean): Shape3D {
  return revolveProfile(...poly(swivelOuterPts(p.hoseDiameterInner / 2, p.generalMaterialWidth, housed)));
}

export function swivelInner(p: OsvacParams, housed: boolean): Shape3D {
  return revolveProfile(...poly(swivelInnerPts(p.hoseDiameterInner / 2, p.generalMaterialWidth, housed)));
}

/** Gehäuse zwischen Male (oben, Spitze nach oben) und Drehring (MxxHyy). */
export function maleHousing(p: OsvacParams, opt: HoseOptions = {}): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rB = rH + p.generalMaterialWidth - 1.2; // Bohrung für den Drehring
  const rMi = p.maleDiameterInner / 2;
  const rMo = p.maleDiameterOuter / 2;
  let body = revolveProfile(...poly([
    [rMi, 0],
    [rMo, 0],
    [rO, -3.006],
    [rO, -20.006],
    [rB, -19.166],
    [rB, -3.006],
    [rH, -3.006],
  ]));
  body = addGrip(body, rO, -4.006, -19.006, { knurl: opt.knurl, layout: 'housing' });
  if (opt.text !== false) body = addLabels(body, rO, -4.006, -19.006, '', 'housing');
  return body;
}

/** Übergangskonus Female-Boden → Drehring (FxxHyy). Höhe wie Fusion: |H−F|/2 + 5·MiniValue. */
export function transitionConeFH(p: OsvacParams): { shape: Shape3D; h: number } {
  const h = p.hoseFemaleTransitionConeHeight + p.generalMiniValue * 5;
  const rFi = p.femaleDiameterInner / 2;
  const rH = p.hoseDiameterInner / 2;
  const W = p.generalMaterialWidth;
  return { shape: revolveProfile(...poly([[rFi, 0], [rFi + W, 0], [rH + W, -h], [rH, -h]])), h };
}
