/**
 * Innengewinde für Saugschläuche (osVAC neo "Hose"): linksgängig, Steigung 5 mm,
 * ca. 3,8 Umdrehungen + Auslauf, Konus −4°, Dreiecksprofil (Coil SectionSize 3 mm).
 * Vermessen am Fusion-Export H32/H36: Spitzen bei z = −4.5 − φ/72 (φ in Grad).
 */
import { makeBSplineApproximation, assembleWire, draw, genericSweep, getOC, Plane, type Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { rad } from './geom';

export const THREAD = {
  pitch: 5,
  startDeg: 60,
  /** volles Profil bis hier (Spitze z = −24.5), danach Auslauf */
  fullEndDeg: 1440,
  /** Ende des Auslaufs im Knickschutz (Tiefe 0 bei z ≈ −34.1) */
  runoutEndDeg: 2131,
  /** Ende ohne Knickschutz (MxxHyy): Stirnfläche wie im Original */
  plainEndDeg: 1455,
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
 * über knapp 2 Umdrehungen linear auf Tiefe 0 aus. Ohne Knickschutz endet sie kurz nach Beginn des Auslaufs.
 */
export function hoseThread(p: OsvacParams, ext = 0.5, runout = false): Shape3D {
  const phi2 = runout ? THREAD.runoutEndDeg : THREAD.plainEndDeg;
  return threadSweep(p, ext, THREAD.startDeg, phi2);
}

/** Profilskalierung über φ: 1 bis fullEndDeg, dann linear auf 0 bei runoutEndDeg (min. 3 %). */
function scaleAt(phi: number): number {
  const f = (phi - THREAD.fullEndDeg) / (THREAD.runoutEndDeg - THREAD.fullEndDeg);
  return Math.max(0.03, Math.min(1, 1 - f));
}

const zOf = (phi: number) => -4.5 - (THREAD.pitch * phi) / 360;

/** Sweep der Rippe zwischen phiA und phiB; Spine auf dem Gewindegrund, Profil mit scaleAt(φ) skaliert. */
function threadSweep(p: OsvacParams, ext: number, phiA: number, phiB: number): Shape3D {
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
  if (phiB > THREAD.fullEndDeg) {
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
