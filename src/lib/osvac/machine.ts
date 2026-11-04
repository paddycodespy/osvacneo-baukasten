/**
 * Maschinenadapter nach "osVAC neo PipesConesFlangesHandles":
 * Anschluss von osVAC neo (F oder M) → Übergangskonus (TransitionConeLength) → Rohrkonus (PipeCone).
 * Lokales System: Oberkante des Übergangs bei z = 0, nach unten.
 */
import type { Shape3D } from 'replicad';
import { makeCylinder, loft, assembleWire, makeLine, makeBSplineApproximation, type Point } from 'replicad';

/** Geschlossener Polygonzug als Kanten (für Regelflächen-Loft). */
function makePolygonWire(pts: Point[]) {
  return pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]));
}
import type { OsvacParams } from './params';
import { revolveProfile, L, A, rad } from './geom';
import { textOnCylinder, engrave } from './text';
import { TEXT } from './grip';

const HOLE_ANGLES = [90, 210, 330];

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
    // 3 Schraubenlöcher Ø4 bei 90/210/330° mit Senkung wie im Original (dort eine Fase an der Bohrungskante):
    // beginnt 2,0 mm unter der Außenfläche in der Bohrung und endet auf der Außenfläche überall bei Ø 7,88;
    // nachgebaut als Regelfläche zwischen den beiden Randkurven
    const zH = -(L0 - 7.867);
    const rOutAt = (z: number) => r1i + w + slope * -z;
    const rAt = r1i + slope * -zH;
    for (const a of HOLE_ANGLES) {
      const e: [number, number, number] = [Math.cos(rad(a)), Math.sin(rad(a)), 0];
      const t: [number, number, number] = [-e[1], e[0], 0];
      const start: [number, number, number] = [e[0] * (rAt - 2), e[1] * (rAt - 2), zH];
      body = body.cut(makeCylinder(2, w + 6, start, e));
      const P = (y: number, rho: number, ph: number): Point => {
        const c = rho * Math.cos(ph), zz = zH + rho * Math.sin(ph);
        return [y * e[0] + c * t[0], y * e[1] + c * t[1], zz];
      };
      // Randkurven als glatte B-Splines (wenige Flächen → schneller Schnitt als ein Polygonzug)
      const N = 24;
      const ring = (f: (ph: number) => Point) => {
        const pts: Point[] = [];
        for (let i = 0; i <= N; i++) pts.push(f((2 * Math.PI * i) / N));
        return assembleWire([makeBSplineApproximation(pts, { tolerance: 1e-4, degMax: 5 })]);
      };
      const rimY = (ph: number, rho: number) => Math.sqrt(rOutAt(zH + rho * Math.sin(ph)) ** 2 - (rho * Math.cos(ph)) ** 2);
      const w0 = ring((ph) => P(rimY(ph, 2) - 2.3, 1.7, ph)); // etwas innerhalb der Bohrung beginnen
      const w1 = ring((ph) => P(rimY(ph, 2) - 2.0, 2, ph));
      const w2 = ring((ph) => P(rimY(ph, 3.94), 3.94, ph));
      const w3 = ring((ph) => P(rimY(ph, 3.94) + 1.5, 3.94, ph));
      body = body.cut(loft([w0, w1, w2, w3], { ruled: true }));
    }
  }

  if (opt.text !== false) {
    const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US');
    // Lage und Größe wie im Original (Arial/Liberation Sans Regular, Versalhöhe ≈ 4 mm)
    const lines: { t: string; z: number; c: number; size?: number }[] = [
      { t: `${f(s.d1Inner)}/${f(s.d1Inner + 2 * w)}`, z: -4.7, c: 270 },
      { t: `${f(w)}/${f(L0)}`, z: -L0 / 2 - 1.44, c: 270 },
      { t: `${f(s.d2Inner)}/${f(s.d2Inner + 2 * w)}`, z: -L0 + 1.9, c: 270 },
      { t: 'osVAC neo', z: -7.55, c: 90, size: 7.2 },
    ];
    const tools = lines
      .filter((l) => !(l.z > -4.3 || l.z < -L0 + 1.85))
      .map((l) => textOnCylinder(r1i + w + slope * -(l.z + 2), { text: l.t, size: l.size ?? TEXT.small, centerDeg: l.c, baselineZ: l.z }, 0.5));
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
