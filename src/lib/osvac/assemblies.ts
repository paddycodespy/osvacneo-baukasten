/**
 * Zusammengesetzte osVACneo-Adapter. Jedes Ergebnis ist eine Liste benannter Körper
 * (wie in Fusion: Körper überlappen/berühren sich und werden vom Slicer verschmolzen).
 * Globales System: Achse Z, Oberkante des Adapters bei z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { femaleRing } from './female';
import { maleTube, maleSupport } from './male';
import { revolveProfile, L } from './geom';

export interface Body {
  name: string;
  shape: Shape3D;
  /** Druckhilfe – nach dem Druck entfernen */
  helper?: boolean;
}

export interface BuildOptions {
  text?: boolean;
  knurl?: boolean;
  supports?: boolean;
}

/** Übergangskonus Female-Unterseite → Male-Oberseite (MxxFyyTransitionCone). */
export function transitionConeMF(p: OsvacParams): Shape3D {
  const h = p.mxxFyyTransitionConeHeight;
  const rFi = p.femaleDiameterInner / 2;
  const rMi = p.maleDiameterInner / 2;
  const rMo = p.maleDiameterOuter / 2;
  return revolveProfile([rFi, 0], [L(rFi + p.generalMaterialWidth, 0), L(rMo, -h), L(rMi, -h)]);
}

/** Einzelteil Female (Kupplung). */
export function buildFemale(p: OsvacParams, o: BuildOptions = {}): Body[] {
  return [{ name: 'Female', shape: femaleRing(p, o) }];
}

/** Einzelteil Male (Stecker) inkl. Druckhilfe. */
export function buildMale(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const out: Body[] = [{ name: 'Male', shape: maleTube(p, o) }];
  if (o.supports !== false) out.push({ name: 'Druckhilfe', shape: maleSupport(p), helper: true });
  return out;
}

/** Drehlage des Male im MxxFyy relativ zum Einzelteil (wie im Original). */
const MF_MALE_ROT = 0;

/** MxxFyy: Female oben, Übergangskonus, Male unten. */
export function buildMxxFyy(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const zCone = -p.femaleHeight;
  const zMale = zCone - p.mxxFyyTransitionConeHeight;
  const out: Body[] = [
    { name: 'Female', shape: femaleRing(p, o) },
    { name: 'Übergang', shape: transitionConeMF(p).translate([0, 0, zCone]) },
    { name: 'Male', shape: maleTube(p, o).rotate(MF_MALE_ROT, [0, 0, 0], [0, 0, 1]).translate([0, 0, zMale]) },
  ];
  if (o.supports !== false) out.push({ name: 'Druckhilfe', shape: maleSupport(p).rotate(MF_MALE_ROT, [0, 0, 0], [0, 0, 1]).translate([0, 0, zMale]), helper: true });
  return out;
}
