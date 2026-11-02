/**
 * Maschinenadapter nach "osVAC neo PipesConesFlangesHandles":
 * Anschluss von osVAC neo (F oder M) → Übergangskonus (TransitionConeLength) → Rohrkonus (PipeCone).
 * Lokales System: Oberkante des Übergangs bei z = 0, nach unten.
 */
import type { Shape3D } from 'replicad';
import { makeCylinder } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, L, A, rad } from './geom';
import { textOnCylinder, engrave } from './text';

export interface PipeSpec {
  /** Innen-Ø oben (am Übergang) – PipeConeDiameter1Inner */
  d1Inner: number;
  /** Innen-Ø unten (offenes Ende) – PipeConeDiameter2Inner */
  d2Inner: number;
  /** Rohrlänge – PipeConeLength */
  length: number;
  /** Wandstärke – PipeConeMaterialWidth (min. 2) */
  wall: number;
  /** Länge des Übergangskonus – TransitionConeLength */
  transition: number;
  /** 3 radiale Schraubenlöcher Ø4 */
  screwHoles: boolean;
}

export const DEFAULT_PIPE: PipeSpec = { d1Inner: 29.3, d2Inner: 33.3, length: 30, wall: 3, transition: 8, screwHoles: true };

export const pipeWall = (s: PipeSpec) => Math.max(s.wall, 2);

/** Übergangskonus vom Anschluss von osVAC neo (rIn..rOut oben) auf den Rohranfang. */
export function pipeTransition(rIn: number, rOut: number, s: PipeSpec): Shape3D {
  const w = pipeWall(s);
  const r1i = s.d1Inner / 2;
  const r1o = r1i + w;
  return revolveProfile([rIn, 0], [L(rOut, 0), L(r1o, -s.transition), L(r1i, -s.transition)]);
}

/** Rohrkonus mit gerundetem Ende, Schraubenlöchern und Maßbeschriftung. Oberkante z = 0. */
export function pipeCone(s: PipeSpec, opt: { text?: boolean } = {}): Shape3D {
  const w = pipeWall(s);
  const L0 = s.length;
  const r1i = s.d1Inner / 2;
  const r2i = s.d2Inner / 2;
  const slope = (r2i - r1i) / L0; // dr/d(-z)
  const rc = w / 2;
  // Mittelpunkt der Endrundung auf der Wandmitte, um rc vor dem Ende
  const zc = -(L0 - rc);
  const rMidC = r1i + slope * (L0 - rc) + w / 2;
  const n = Math.hypot(1, slope);
  // Tangentenpunkte: senkrecht zur Wand (Wandrichtung (slope, -1)/n → Normale (1, slope)/n)
  const nx = 1 / n;
  const nz = slope / n;
  const pOut: [number, number] = [rMidC + rc * nx, zc + rc * nz];
  const pIn: [number, number] = [rMidC - rc * nx, zc - rc * nz];
  const pBot: [number, number] = [rMidC - rc * nz, zc - rc * nx * 1];
  let body = revolveProfile([r1i, 0], [
    L(r1i + w, 0),
    L(pOut[0], pOut[1]),
    A(pBot[0], pBot[1], rMidC, zc),
    A(pIn[0], pIn[1], rMidC, zc),
  ]);

  if (s.screwHoles) {
    const zH = -(L0 - 7.82);
    const rAt = r1i + slope * -zH;
    for (const a of [97, 217, 337]) {
      const dir: [number, number, number] = [Math.cos(rad(a)), Math.sin(rad(a)), 0];
      const start: [number, number, number] = [dir[0] * (rAt - 2), dir[1] * (rAt - 2), zH];
      const hole = makeCylinder(2, w + 6, start, dir);
      body = body.cut(hole);
    }
  }

  if (opt.text !== false) {
    const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US');
    const lines = [
      { t: `${f(s.d1Inner)}/${f(s.d1Inner + 2 * w)}`, z: -4.5 },
      { t: `${f(w)}/${f(L0)}`, z: -L0 / 2 - 1.5 },
      { t: `${f(s.d2Inner)}/${f(s.d2Inner + 2 * w)}`, z: -L0 + 6.5 },
    ];
    const tools = lines
      .filter((l) => !(l.z > -0.5 || l.z < -L0 + 2.5))
      .map((l) => textOnCylinder(r1i + w + slope * -(l.z + 2), { text: l.t, size: 5.2, centerDeg: 270, baselineZ: l.z }, 0.5));
    body = engrave(body, tools);
  }
  return body;
}

/** Füllring für die Dichtnut am Female-Boden mit 45°-Einlauf (Maschinenadapter). Female-System. */
export function femaleBeadFill(p: OsvacParams): Shape3D {
  const rFi = p.femaleDiameterInner / 2;
  const rFm = p.femaleDiameterMiddle / 2;
  const H = p.femaleHeight;
  const beadC: [number, number] = [rFm - 0.95, -31.45];
  const beadR = 1.95;
  const beadTopZ = beadC[1] + Math.sqrt(beadR ** 2 - (rFm - beadC[0]) ** 2);
  const zBot = -H + 0.1;
  const zCh = zBot + (rFm - (rFi + 0.1));
  return revolveProfile([rFm, beadTopZ], [
    { t: 'A', p: [beadC[0], beadC[1] - beadR], c: beadC },
    L(rFi + 0.1, zBot),
    L(rFm, Math.min(zCh, beadTopZ)),
  ]);
}
