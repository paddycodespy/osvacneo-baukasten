/**
 * Innengewinde für Saugschläuche (osVAC neo "Hose"): linksgängig, Steigung 5 mm,
 * ca. 3,8 Umdrehungen + Auslauf, Konus −4°, Dreiecksprofil (Coil SectionSize 3 mm).
 * Vermessen am Fusion-Export H32/H36: Spitzen bei z = −4.5 − φ/72 (φ in Grad).
 */
import { makeBSplineApproximation, assembleWire, draw, genericSweep, getOC, makePolygon, makeSolid, Plane, type Shape3D, type Point } from 'replicad';
import type { OsvacParams } from './params';
import { rad, deg } from './geom';

export const THREAD = {
  pitch: 5,
  /**
   * Sweep beginnt hier; die eigentliche Anschnittkante entsteht durch startCut
   * (H50: Ebene schneidet bei 46,9°, H60 bei 43,9°, daher früh genug beginnen)
   */
  startDeg: 40,
  startCut: { dist: 9.42, normalDeg: -62.6, refDeg: 55, aMin: 30, zTop: -1, zBot: -7.8 },
  /** Ende ohne Knickschutz: senkrechte Ebene wie am Anfang (Rippe läuft dort von voller Tiefe auf 0) */
  endCut: { dist: 10.55, distPerMm: 0.0057, normalDeg: 135.4, refDeg: 15, aMax: 45, zTop: -22.0, zBot: -28.5 },
  /**
   * Auslauf: Stützstellen der Profilskalierung. Gemessen am Original (H32/H36, 7 und 9 mm):
   * Tiefe fällt linear von 2,8 bei φ 1441,8° auf 0 bei φ 2127,6°. Die Werte hier sind so gewählt,
   * dass das gebaute Gewinde genau das ergibt (die Interpolation rundet den Knick etwas ab).
   */
  fullEndDeg: 1419.4,
  runoutEndDeg: 2124.8,
  /** Sweep-Ende ohne Knickschutz (MxxHyy); die eigentliche Endkante entsteht durch endCut */
  plainEndDeg: 1470,
  taperDeg: 4,
  /** Gewindegrund oben: r = H/2 + Einrückung bei z = −2.276 */
  rootZ0: -2.276,
  /** Spitze liegt 2.80 mm innerhalb des Grundes */
  depth: 2.8,
  /** Flankenlängen in z (oben/unten) am Grund */
  upper: 1.556,
  lower: 1.687,
};

export function rootRadius(p: OsvacParams, z: number): number {
  return p.hoseDiameterInner / 2 + p.hoseAdapterThreadIndentation + (THREAD.rootZ0 - z) * Math.tan(rad(THREAD.taperDeg));
}

/**
 * Gewinderippe als Volumenkörper im Hose-System (Oberkante Hose = z 0).
 * ext: wie weit das Profil in die Wand ragt (0.5 für sicheres Verschmelzen, 0 für die Volumenberechnung).
 * runout: Auslauf im Trichter (Knickschutz) wie im Original – die Rippe läuft nach dem vollen Gewinde
 * über knapp 2 Umdrehungen linear auf Tiefe 0 aus. Ohne Knickschutz behält sie die volle Tiefe bis zur Endkante.
 */
export function hoseThread(p: OsvacParams, ext = 0.5, runout = false): Shape3D {
  const s = THREAD.startCut;
  let t = threadSweep(p, ext, THREAD.startDeg, runout ? THREAD.runoutEndDeg : THREAD.plainEndDeg, runout);
  t = t.cut(planeCut(s.dist, s.normalDeg, s.refDeg, s.aMin, s.zTop, s.zBot)) as Shape3D;
  if (!runout) {
    const e = THREAD.endCut;
    // Lage der Endebene wächst leicht mit dem Schlauchdurchmesser (gemessen: H25 10,55, H36 10,613)
    const dist = e.dist + e.distPerMm * (p.hoseDiameterInner - 25);
    t = t.cut(planeCut(dist, e.normalDeg, e.refDeg, e.aMax, e.zTop, e.zBot)) as Shape3D;
  }
  return t;
}

/**
 * Anschnitt am Gewindeanfang und (ohne Knickschutz) am Ende wie im Original: die Rippe ist von einer
 * senkrechten Ebene abgeschnitten. Die Anfangsebene hängt nicht von der Schlauchgröße ab, die Endebene
 * rückt mit dem Durchmesser leicht nach außen (gemessen an H25, H32 und H36, 7 und 9 mm). Weggeschnitten wird die Seite n·p > −dist. Das Werkzeug reicht vom Schnittpunkt der Ebene
 * mit dem Gewinde bis zum Winkel aFar und ist in z auf die betroffene Windung begrenzt.
 */
function planeCut(dist: number, normalDeg: number, refDeg: number, aFar: number, zTop: number, zBot: number): Shape3D {
  const nA = rad(normalDeg);
  const n: [number, number] = [Math.cos(nA), Math.sin(nA)];
  const dir: [number, number] = [-n[1], n[0]];
  const d0 = -dist;
  const onLine = (r: number): [number, number] => {
    const foot: [number, number] = [n[0] * d0, n[1] * d0];
    const t = Math.sqrt(Math.max(0, r * r - d0 * d0));
    const c1: [number, number] = [foot[0] + dir[0] * t, foot[1] + dir[1] * t];
    const c2: [number, number] = [foot[0] - dir[0] * t, foot[1] - dir[1] * t];
    const ang = (q: [number, number]) => Math.abs(((deg(Math.atan2(q[1], q[0])) - refDeg + 540) % 360) - 180);
    return ang(c1) < ang(c2) ? c1 : c2;
  };
  const pol = (r: number, a: number): [number, number] => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
  const pts = [onLine(30), onLine(11), pol(11, aFar), pol(30, aFar)];
  // Umlaufsinn für makePolygon egal; ShapeFix richtet die Flächen aus
  const P = (q: [number, number], z: number): Point => [q[0], q[1], z];
  const top = pts.map((q) => P(q, zTop));
  const bot = pts.map((q) => P(q, zBot));
  const faces = [makePolygon(top), makePolygon([...bot].reverse())];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push(makePolygon([bot[i], bot[j], top[j], top[i]]));
  }
  return makeSolid(faces) as unknown as Shape3D;
}

/** Profilskalierung über φ: 1 bis fullEndDeg, dann linear auf 0 bei runoutEndDeg (min. 3 %). */
function scaleAt(phi: number): number {
  const f = (phi - THREAD.fullEndDeg) / (THREAD.runoutEndDeg - THREAD.fullEndDeg);
  return Math.max(0.03, Math.min(1, 1 - f));
}

const zOf = (phi: number) => -4.5 - (THREAD.pitch * phi) / 360;

/** Sweep der Rippe zwischen phiA und phiB; Spine auf dem Gewindegrund, Profil mit scaleAt(φ) skaliert. */
function threadSweep(p: OsvacParams, ext: number, phiA: number, phiB: number, runout: boolean): Shape3D {
  const steps = Math.max(8, Math.ceil(((phiB - phiA) / 360) * 36));
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = phiA + ((phiB - phiA) * i) / steps;
    const z = zOf(phi);
    const r = rootRadius(p, z);
    pts.push([r * Math.cos(rad(phi)), r * Math.sin(rad(phi)), z]);
  }
  const spineEdge = makeBSplineApproximation(pts, { tolerance: 1e-4, degMax: 5 });
  const spine = assembleWire([spineEdge]);
  // Hilfsspine (radial nach außen versetzt) für stabile Profilausrichtung
  const aux: [number, number, number][] = pts.map(([x, y, z]) => {
    const r = Math.hypot(x, y);
    const k = (r + 10) / r;
    return [x * k, y * k, z];
  });
  const auxSpine = assembleWire([makeBSplineApproximation(aux, { tolerance: 1e-4, degMax: 5 })]);

  // Profil in der Ebene durch die Achse bei phiA, Ursprung auf dem Gewindegrund (x = radial, y = z)
  const z0 = zOf(phiA);
  const rR = rootRadius(p, z0);
  const zu = z0 + THREAD.upper;
  const zd = z0 - THREAD.lower;
  const prof = draw([-THREAD.depth, 0])
    .lineTo([rootRadius(p, zu) + ext - rR, zu - z0 + ext * 0.577])
    .lineTo([rootRadius(p, zd) + ext - rR, zd - z0 - ext * 0.577])
    .close();
  const a = rad(phiA);
  const plane = new Plane([rR * Math.cos(a), rR * Math.sin(a), z0], [Math.cos(a), Math.sin(a), 0], [Math.sin(a), -Math.cos(a), 0]);
  const sk = prof.sketchOnPlane(plane);
  const wire = (sk as unknown as { wire: Parameters<typeof genericSweep>[0] }).wire;
  let law = null;
  if (runout) {
    // Interpolierte Skalierung über dem Spine-Parameter (Stützstellen gleichmäßig in φ)
    const oc = getOC();
    const ad = (spineEdge.curve as unknown as { wrapped: { FirstParameter(): number; LastParameter(): number } }).wrapped;
    const u0 = ad.FirstParameter();
    const u1 = ad.LastParameter();
    const n = Math.ceil((phiB - phiA) / 10);
    const arr = new oc.NCollection_Array1_gp_Pnt2d(1, n + 1);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      arr.SetValue(i + 1, new oc.gp_Pnt2d(u0 + f * (u1 - u0), scaleAt(phiA + f * (phiB - phiA))));
    }
    const li = new oc.Law_Interpol();
    li.Set(arr, false);
    law = li;
  }
  return genericSweep(wire, spine, { auxiliarySpine: auxSpine, transitionMode: 'right', law }) as Shape3D;
}

/**
 * Verhältnis Volumen ohne / mit Überlappung (ext) der Gewinderippe – über die Profilfläche,
 * damit für die Filamentschätzung kein zweites Gewinde gebaut werden muss.
 */
export function threadNetVolumeFactor(p: OsvacParams, ext = 0.5): number {
  const area = (e: number) => {
    const z0 = 0;
    const rR = rootRadius(p, z0);
    const zu = z0 + THREAD.upper;
    const zd = z0 - THREAD.lower;
    const P: [number, number][] = [
      [-THREAD.depth, 0],
      [rootRadius(p, zu) + e - rR, zu - z0 + e * 0.577],
      [rootRadius(p, zd) + e - rR, zd - z0 - e * 0.577],
    ];
    return Math.abs((P[0][0] * (P[1][1] - P[2][1]) + P[1][0] * (P[2][1] - P[0][1]) + P[2][0] * (P[0][1] - P[1][1])) / 2);
  };
  return area(0) / area(ext);
}
