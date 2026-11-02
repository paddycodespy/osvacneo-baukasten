/**
 * Innengewinde für Saugschläuche (osVACneo "Hose"): linksgängig, Steigung 5 mm,
 * 3,8 Umdrehungen, Konus −4°, Dreiecksprofil (Coil SectionSize 3 mm).
 * Vermessen am Fusion-Export H32/H36: Spitzen bei z = −4.5 − φ/72 (φ in Grad).
 */
import { makeBSplineApproximation, assembleWire, draw, genericSweep, Plane, type Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { rad } from './geom';

export const THREAD = {
  pitch: 5,
  turns: 3.8,
  startDeg: 60,
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

/** Gewinderippe als Volumenkörper im Hose-System (Oberkante Hose = z 0). */
/** ext: wie weit das Profil in die Wand ragt (0.5 für sicheres Verschmelzen, 0 für die Volumenberechnung). */
export function hoseThread(p: OsvacParams, ext = 0.5): Shape3D {
  const t = Math.tan(rad(THREAD.taperDeg));
  const tipR = (z: number) => rootRadius(p, z) - THREAD.depth + 0.0;
  const zOf = (phi: number) => -4.5 - (THREAD.pitch * phi) / 360;
  const phi0 = THREAD.startDeg;
  const phi1 = phi0 + THREAD.turns * 360;

  // Spine: Spitzenlinie als B-Spline-Näherung der konischen Schraubenlinie
  const pts: [number, number, number][] = [];
  const steps = Math.ceil(THREAD.turns * 36);
  for (let i = 0; i <= steps; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / steps;
    const z = zOf(phi);
    const r = tipR(z);
    pts.push([r * Math.cos(rad(phi)), r * Math.sin(rad(phi)), z]);
  }
  const spine = assembleWire([makeBSplineApproximation(pts, { tolerance: 1e-4, degMax: 5 })]);

  // Hilfsspine (gleiche Schraubenlinie auf der Achse-nahen Seite) für stabile Profilausrichtung
  const aux: [number, number, number][] = pts.map(([x, y, z]) => {
    const r = Math.hypot(x, y);
    const k = (r + 10) / r;
    return [x * k, y * k, z];
  });
  const auxSpine = assembleWire([makeBSplineApproximation(aux, { tolerance: 1e-4, degMax: 5 })]);

  // Profil in der Ebene durch die Achse beim Startwinkel (x = radial, y = z)
  const z0 = zOf(phi0);
  const rT = tipR(z0);
  const zu = z0 + THREAD.upper;
  const zd = z0 - THREAD.lower;
  const prof = draw([0, 0])
    .lineTo([rootRadius(p, zu) + ext - rT, zu - z0 + ext * 0.577])
    .lineTo([rootRadius(p, zd) + ext - rT, zd - z0 - ext * 0.577])
    .close();
  const a = rad(phi0);
  const plane = new Plane([rT * Math.cos(a), rT * Math.sin(a), z0], [Math.cos(a), Math.sin(a), 0], [Math.sin(a), -Math.cos(a), 0]);
  const sk = prof.sketchOnPlane(plane);
  const wire = (sk as unknown as { wire: Parameters<typeof genericSweep>[0] }).wire;
  void t;
  return genericSweep(wire, spine, { auxiliarySpine: auxSpine, transitionMode: 'right' }) as Shape3D;
}
