/**
 * Maschinenadapter nach "osVAC neo PipesConesFlangesHandles":
 * Anschluss von osVAC neo (F oder M) → Übergangskonus (TransitionConeLength) → Rohrkonus (PipeCone).
 * Lokales System: Oberkante des Übergangs bei z = 0, nach unten.
 */
import type { Shape3D } from 'replicad';
import { measureVolume, makeCompound, makeCylinder, loft, assembleWire, makeLine, makeThreePointArc, makeFace, basicFaceExtrusion, makeBSplineApproximation, Vector, type Point } from 'replicad';

/** Geschlossener Polygonzug als Kanten (für Regelflächen-Loft). */
function makePolygonWire(pts: Point[]) {
  return pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]));
}
import type { OsvacParams } from './params';
import { revolveProfile, L, A, rad } from './geom';
import { textOnCylinder, engrave } from './text';
import { TEXT } from './grip';
import { UserError, partNotes } from '../errors';

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
  /** Befestigung am Gerät (für Klemmrippen und Schlitze): Rohr über den Stutzen oder in die Öffnung */
  mode?: 'over' | 'into';
  /** Zugabe auf den Durchmesser (wie viel Luft zum Gerät bleibt) */
  allowance?: number;
  /** Klemmrippen auf der Anlagefläche (aufgesteckt innen, eingesteckt außen) */
  ribs?: boolean;
  /** nur aufgesteckt: 2 Schlitze vom offenen Ende her für eine Schlauchschelle */
  slots?: boolean;
}

/** Klemmrippen: so weit ragen sie über die Gerätefläche hinaus (wie bei Freiform) */
const RIB_CRUSH = 0.3;
/** Schlitze bei 0° und 180°: zwischen den Schraubenlöchern und neben der Beschriftung (90°/270°) */
const SLOT_ANGLES = [0, 180];
const r1iOf = (s: PipeSpec) => s.d1Inner / 2;
const slopeOf = (s: PipeSpec) => (s.d2Inner / 2 - s.d1Inner / 2) / s.length;

/** Maße der Schlitze, fest nach Größe: 80 % der Rohrlänge, Breite Umfang/40 (2,5–4 mm) */
export function pipeSlotLayout(s: PipeSpec) {
  const P = Math.PI * (s.d1Inner + s.d2Inner) / 2;
  return { len: Math.max(6, Math.min(Math.round(s.length * 0.8), s.length - 3)), width: Math.min(4, Math.max(2.5, Math.round((P / 40) * 2) / 2)) };
}

/**
 * Klemmrippen am Rohr (eigener Körper, Oberkante des Rohrs bei z = 0): dreieckig, 1,6 mm breit, 0,4 mm in der Wand,
 * ragen RIB_CRUSH über die Gerätefläche. Nicht an den Schraubenlöchern, den Schlitzen und (eingesteckt außen) der Beschriftung.
 */
export function pipeRibs(s: PipeSpec, opt: { text?: boolean } = {}): Shape3D {
  const w = pipeWall(s);
  const L0 = s.length;
  const over = s.mode !== 'into';
  const a = (s.allowance ?? 0.2) / 2;
  const r1i = r1iOf(s), slope = slopeOf(s);
  const rSurf = (z: number) => (over ? r1i + slope * -z : r1i + w + slope * -z);
  const z0 = -1, z1 = -(L0 - w / 2 - 2);
  const rMid = r1i + w / 2;
  const P = 2 * Math.PI * rMid;
  const n = Math.max(6, Math.min(24, Math.round(P / 10)));
  const arcDeg = (mm: number) => (mm / rMid) * (180 / Math.PI);
  const dist = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180);
  const sl = pipeSlotLayout(s);
  // Beschriftung außen bei 90° („osVAC neo“, ca. 36 mm breit) und 270° (Maße, ca. 29 mm): eingesteckt möglichst dort keine Rippen
  const rOut = r1i + w;
  const textHalf = [{ c: 90, half: (20 / rOut) * (180 / Math.PI) }, { c: 270, half: (16.5 / rOut) * (180 / Math.PI) }];
  const base = Array.from({ length: n }, (_, k) => ((k + 0.5) * 360) / n).filter(
    (g) => !(s.screwHoles && L0 >= 12 && HOLE_ANGLES.some((h) => dist(g, h) < arcDeg(6))) && !(over && s.slots && SLOT_ANGLES.some((h) => dist(g, h) < arcDeg(sl.width / 2 + 2))),
  );
  const besideText = base.filter((g) => !(!over && opt.text !== false && textHalf.some((t) => dist(g, t.c) < t.half)));
  // bei kleinen Rohren bedeckt die Schrift fast den halben Umfang: dann lieber Rippen über der Schrift als zu wenige
  const angles = besideText.length >= 6 ? besideText : base;
  const h = 0.4 + a + RIB_CRUSH;
  const tri = (deg: number, z: number) => {
    const e = [Math.cos(rad(deg)), Math.sin(rad(deg))], t = [-e[1], e[0]];
    const rb = over ? rSurf(z) + 0.4 : rSurf(z) - 0.4;
    const rt = over ? rb - h : rb + h;
    const pts: Point[] = [
      [e[0] * rb + t[0] * 0.8, e[1] * rb + t[1] * 0.8, z],
      [e[0] * rt, e[1] * rt, z],
      [e[0] * rb - t[0] * 0.8, e[1] * rb - t[1] * 0.8, z],
    ];
    return assembleWire(pts.map((p, i) => makeLine(p, pts[(i + 1) % 3])));
  };
  const expect = 0.5 * 1.6 * h * (z0 - z1);
  const ok = (r: Shape3D) => {
    const v = measureVolume(r);
    return v > expect * 0.7 && v < expect * 1.3;
  };
  const tapered = Math.abs(slope) > 1e-9;
  const solids: Shape3D[] = [];
  let lost = 0;
  for (const g of angles) {
    const tries = [
      ...(tapered ? [() => loft([tri(g, z0), tri(g, z1)], { ruled: true }) as unknown as Shape3D] : []),
      () => basicFaceExtrusion(makeFace(tri(g, z0)), new Vector([0, 0, z1 - z0])) as unknown as Shape3D,
    ];
    let done = false;
    for (const tr of tries) {
      try {
        const r = tr();
        if (ok(r)) {
          solids.push(r);
          done = true;
          break;
        }
      } catch {
        /* nächster Versuch */
      }
    }
    if (!done) lost++;
  }
  const total = solids.length + lost;
  if (!solids.length) throw new UserError('Die Klemmrippen ließen sich mit diesen Maßen nicht berechnen. Bitte die Rippen in den Feineinstellungen abwählen.');
  if (lost > total / 4) partNotes.push(`${lost} von ${total} Klemmrippen ließen sich nicht sauber berechnen und wurden weggelassen. Der Adapter klemmt dadurch etwas schwächer.`);
  return makeCompound(solids) as unknown as Shape3D;
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
    // beginnt 2,0 mm unter der Außenfläche in der Bohrung und endet auf der Außenfläche überall bei Ø7,88;
    // nachgebaut als Regelfläche zwischen den beiden Randkurven
    // Achse 8 mm über dem Rohrende, bei konischem Rohr um 2 · Steigung höher
    // (gemessen: gerade 8,000 bei Wand 3–6 und Ø30/40, Konus 29,3→33,3 7,867, Konus 40→42 7,900)
    const zH = -(L0 - 8 + 2 * slope);
    const rOutAt = (z: number) => r1i + w + slope * -z;
    const rAt = r1i + slope * -zH;
    const tools: Shape3D[] = [];
    /** Bohrung und Senkung getrennt (Rückfall, wenn der gemeinsame Schnitt scheitert) */
    const alt: [Shape3D, Shape3D][] = [];
    for (const a of HOLE_ANGLES) {
      const e: [number, number, number] = [Math.cos(rad(a)), Math.sin(rad(a)), 0];
      const t: [number, number, number] = [-e[1], e[0], 0];
      const start: [number, number, number] = [e[0] * (rAt - 2), e[1] * (rAt - 2), zH];
      const bore = makeCylinder(2, w + 6, start, e);
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
      // Fasenlinie über die Außenfläche hinaus verlängert (k = 1,25): liegt die Randkurve genau auf dem
      // Außenzylinder, scheitert der Schnitt je nach Durchmesser (z. B. Ø38–43 mm)
      const k = 1.25;
      const ext = (ph: number): [number, number] => {
        const y1 = rimY(ph, 2) - 2.0, y2 = rimY(ph, 3.94);
        return [y1 + k * (y2 - y1), 2 + k * (3.94 - 2)];
      };
      const w2 = ring((ph) => P(ext(ph)[0], ext(ph)[1], ph));
      const w3 = ring((ph) => P(ext(ph)[0] + 1.5, ext(ph)[1], ph));
      const sink = loft([w0, w1, w2, w3], { ruled: true });
      tools.push(bore.fuse(sink));
      alt.push([bore, sink]);
    }
    // Gegenprobe: entfernt werden darf höchstens das Volumen der Werkzeuge (bei gescheitertem Schnitt
    // blieb früher z. B. nur ein Rest des Rohrs übrig)
    // einzeln schneiden: alle drei auf einmal scheiterten bei konischen Rohren ab etwa Ø50 (Volumen wuchs statt zu sinken)
    let removed = 0, toolVol = 0;
    tools.forEach((tool, i) => {
      const before = measureVolume(body);
      const tv = measureVolume(tool);
      let next = body.cut(tool);
      let r = before - measureVolume(next);
      if (!(r > 0 && r < tv * 1.02)) {
        // Rückfall: erst die Bohrung, dann die Senkung (Volumen der Senkung allein ist als Regelfläche nicht verlässlich messbar)
        next.delete?.();
        const [bore, sink] = alt[i];
        const b1 = body.cut(bore.clone() as Shape3D);
        next = b1.cut(sink.clone() as Shape3D);
        r = before - measureVolume(next);
      }
      body = next;
      toolVol += tv;
      removed += r > 0 && r < tv * 1.05 ? r : -Infinity;
    });
    if (!(removed > 0 && removed < toolVol * 1.05)) throw new UserError('Die Schraubenlöcher ließen sich mit diesen Maßen nicht berechnen. Bitte ein Maß etwas ändern oder die Löcher in den Feineinstellungen abwählen.');
  }

  if (s.slots && s.mode !== 'into') {
    // Schlitze vom offenen Ende her, oben rund (gegen Einreißen); jeder einzeln geschnitten und geprüft
    const { len, width } = pipeSlotLayout(s);
    const sw = width / 2;
    const zTop = -L0 + len - sw;
    for (const deg of SLOT_ANGLES) {
      const e: [number, number, number] = [Math.cos(rad(deg)), Math.sin(rad(deg)), 0];
      const t: [number, number, number] = [-e[1], e[0], 0];
      const r0 = Math.min(r1i, s.d2Inner / 2) - 3;
      const Q = (y: number, z: number): Point => [e[0] * r0 + t[0] * y, e[1] * r0 + t[1] * y, z];
      const zBot = -L0 - 2;
      const wire = assembleWire([
        makeLine(Q(-sw, zBot), Q(-sw, zTop)),
        makeThreePointArc(Q(-sw, zTop), Q(0, zTop + sw), Q(sw, zTop)),
        makeLine(Q(sw, zTop), Q(sw, zBot)),
        makeLine(Q(sw, zBot), Q(-sw, zBot)),
      ]);
      const reach = w + 6 + Math.abs(slope) * L0;
      const tool = basicFaceExtrusion(makeFace(wire), new Vector([e[0] * reach, e[1] * reach, 0])) as unknown as Shape3D;
      const before = measureVolume(body);
      body = body.cut(tool);
      const after = measureVolume(body);
      if (!(after < before - 1e-3 && after > before * 0.5)) throw new UserError('Die Schlitze ließen sich mit diesen Maßen nicht schneiden. Bitte die Tiefe etwas ändern oder die Schlitze in den Feineinstellungen abwählen.');
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

