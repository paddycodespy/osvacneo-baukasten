/**
 * Filamentschätzung für PETG (1,27 g/cm³, 1,75 mm).
 * Normalfall: Materialvolumen wie im Slicer (unionMeasure.ts, printedVolume: 3 Wände, 15 % Füllung), eine Zahl.
 * Ersatz, wenn das nicht geht: Spanne von 1,2 mm Hülle an jeder Oberfläche + 15 % Füllung bis massiv.
 */
export const PETG = { density: 1.27, diameter: 1.75 };

export interface FilamentEstimate {
  gramsMin: number;
  gramsMax: number;
  metersMin: number;
  metersMax: number;
}

export function estimateFilament(volumeMm3: number, areaMm2: number, printed?: number, shell = 1.2, infill = 0.15): FilamentEstimate {
  if (printed !== undefined && printed > 0) {
    const g = (printed / 1000) * PETG.density;
    const m = printed / (Math.PI * (PETG.diameter / 2) ** 2) / 1000;
    return { gramsMin: g, gramsMax: g, metersMin: m, metersMax: m };
  }
  const vShell = Math.min(volumeMm3, areaMm2 * shell);
  const vMin = vShell + Math.max(0, volumeMm3 - vShell) * infill;
  const g = (v: number) => (v / 1000) * PETG.density;
  const crossSection = Math.PI * (PETG.diameter / 2) ** 2;
  const m = (v: number) => v / crossSection / 1000;
  return { gramsMin: g(vMin), gramsMax: g(volumeMm3), metersMin: m(vMin), metersMax: m(volumeMm3) };
}
