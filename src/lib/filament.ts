/**
 * Filamentschätzung für PETG (1,27 g/cm³, 1,75 mm).
 * Untergrenze: 3 Wände à 0,4 mm (≈ 1,2 mm Hülle an jeder Oberfläche) + 15 % Infill.
 * Obergrenze: massiv gedruckt. Volumen und Fläche kommen aus der Vereinigung aller Körper (unionMeasure.ts), sonst
 * zählten die Stoßflächen zwischen den Körpern als Außenwand.
 */
export const PETG = { density: 1.27, diameter: 1.75 };

export interface FilamentEstimate {
  gramsMin: number;
  gramsMax: number;
  metersMin: number;
  metersMax: number;
}

export function estimateFilament(volumeMm3: number, areaMm2: number, shell = 1.2, infill = 0.15): FilamentEstimate {
  const vShell = Math.min(volumeMm3, areaMm2 * shell);
  const vMin = vShell + Math.max(0, volumeMm3 - vShell) * infill;
  const g = (v: number) => (v / 1000) * PETG.density;
  const crossSection = Math.PI * (PETG.diameter / 2) ** 2;
  const m = (v: number) => v / crossSection / 1000;
  return { gramsMin: g(vMin), gramsMax: g(volumeMm3), metersMin: m(vMin), metersMax: m(volumeMm3) };
}
