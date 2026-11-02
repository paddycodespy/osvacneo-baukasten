/**
 * Schlauchseite (osVACneo "Hose"): Gewindekörper, Knickschutz-Trichter, Drehring (zwei
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
    const rN = rH + 5.4;
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
  body = addGrip(body, rO, gripTop, gripBot, { knurl: opt.knurl });
  if (opt.text !== false) body = addLabels(body, rO, gripTop, gripBot, opt.label ?? `H${fmt(p.hoseDiameterInner)}`);
  return body;
}

/** Gewinderippe als eigener Körper; überlappt die Wand um 0.5 mm und wird im Slicer verschmolzen. */
export function hoseThreadBody(p: OsvacParams): Shape3D {
  return hoseThread(p);
}

/** Knickschutz-Trichter unter dem Gewindekörper (Hose-System: Oberkante Hose = 0). */
export function hoseSkirt(p: OsvacParams): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rc = rH + 71.875;
  const zc = -26.5;
  // Endrundung: Bogen über die Unterseite (Zwischenpunkt radial vom Krümmungsmittelpunkt weg)
  const tc: P2 = [rH + 9.02, -46.311];
  const tr = 1.028;
  const dx = tc[0] - rc;
  const dz = tc[1] - zc;
  const dl = Math.hypot(dx, dz);
  const tipMid: P2 = [tc[0] + (tr * dx) / dl, tc[1] + (tr * dz) / dl];
  return revolveProfile([rH + 4.944, zc], [
    L(rH + 7, zc),
    A(rH + 10, -46.0, rc, zc),
    { t: 'M', p: [rH + 8.039, -46.62], m: tipMid },
    A(rH + 4.944, zc, rc, zc),
  ]);
}

/** Drehring außen (hängt an Kupplung bzw. Gehäuse). outer: Außenradius-Offset zu rH. */
function swivelOuterPts(rH: number, rOut: number, housed: boolean): P2[] {
  const hook: P2[] = [
    [rH + 2.483, -5.285],
    [rH + 2.483, -4.985],
    [rH + 4.817, -3.351],
    [rH + 4.817, -2.739],
    [rH + 2.333, -1.0],
    [rH + 1.105, -1.86],
    [rH, -1.86],
  ];
  if (housed) return [[rH, 0], [rOut, 0], [rOut, -7.607], ...hook];
  return [[rH, 0], [rOut, 0], [rOut, -6.02], [rH + 5.8, -6.02], [rH + 4.667, -6.814], ...hook];
}

/** Drehring innen (sitzt auf dem Gewindekörper). */
function swivelInnerPts(rH: number, rO: number, housed: boolean): P2[] {
  const top: P2[] = [
    [rH, -0.794],
    [rH + 1.2, -0.794],
    [rH + 2.333, 0],
    [rH + 4.517, -1.529],
    [rH + 4.517, -1.829],
    [rH + 2.183, -3.463],
    [rH + 2.183, -4.075],
  ];
  if (housed) {
    const rN = rH + 5.4;
    return [...top, [rN, -6.327], [rN, -9.194], [rH + 1.743, -6.634], [rH, -6.634]];
  }
  return [...top, [rH + 4.667, -5.814], [rH + 5.895, -4.954], [rO, -4.954], [rO, -8.314], [rH + 1.743, -4.634], [rH, -4.634]];
}

export function swivelOuter(p: OsvacParams, housed: boolean): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rOut = housed ? rH + 5.8 : rH + p.generalMaterialWidth;
  return revolveProfile(...poly(swivelOuterPts(rH, rOut, housed)));
}

export function swivelInner(p: OsvacParams, housed: boolean): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  return revolveProfile(...poly(swivelInnerPts(rH, rH + p.generalMaterialWidth, housed)));
}

/** Gehäuse zwischen Male (oben, Spitze nach oben) und Drehring (MxxHyy). */
export function maleHousing(p: OsvacParams, opt: HoseOptions = {}): Shape3D {
  const rH = p.hoseDiameterInner / 2;
  const rO = rH + p.generalMaterialWidth;
  const rB = rH + 5.8;
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
  body = addGrip(body, rO, -4.006, -19.006, { knurl: opt.knurl });
  if (opt.text !== false) body = addLabels(body, rO, -4.006, -19.006, opt.label ?? `M${fmt(p.maleDiameterInner)}`);
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
