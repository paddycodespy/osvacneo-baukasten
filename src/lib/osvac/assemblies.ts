/**
 * Zusammengesetzte Adapter von osVAC neo. Jedes Ergebnis ist eine Liste benannter Körper
 * (wie in Fusion: Körper überlappen/berühren sich und werden vom Slicer verschmolzen).
 * Globales System: Achse Z, Oberkante des Adapters bei z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { femaleRing } from './female';
import { maleTube, maleSupport } from './male';
import { revolveProfile, L } from './geom';
import { hoseBody, hoseThreadBody, hoseSkirt, swivelOuter, swivelInner, maleHousing, transitionConeFH } from './hose';
import { pipeCone, pipeTransition, femaleBeadFill, DEFAULT_PIPE, type PipeSpec } from './machine';

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
  /** Rohr für Maschinenadapter */
  pipe?: PipeSpec;
}

/** Male mit Spitze nach oben (Anschluss unten bei z = -maleHeight); Nasen wie im Original bei 30/150/270°. */
function flippedMale(p: OsvacParams, o: BuildOptions): Shape3D {
  return maleTube(p, o).rotate(180, [0, 0, 0], [1, 0, 0]).rotate(180, [0, 0, 0], [0, 0, 1]).translate([0, 0, -p.maleHeight]);
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

/** Maschinenadapter mit Kupplung: Female oben, Übergang, Rohrkonus. */
export function buildMachineF(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.femaleHeight;
  const rFi = p.femaleDiameterInner / 2;
  return [
    { name: 'Female', shape: femaleRing(p, o) },
    { name: 'Dichtnut-Füllung', shape: femaleBeadFill(p) },
    { name: 'Übergang', shape: pipeTransition(rFi, rFi + p.generalMaterialWidth, s).translate([0, 0, zT]) },
    { name: 'Rohr', shape: pipeCone(s, o).translate([0, 0, zT - s.transition]) },
  ];
}

/** Maschinenadapter mit Stecker: Male (Spitze oben), Übergang, Rohrkonus. */
export function buildMachineM(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.maleHeight;
  const male = flippedMale(p, o);
  return [
    { name: 'Male', shape: male },
    { name: 'Übergang', shape: pipeTransition(p.maleDiameterInner / 2, p.maleDiameterOuter / 2, s).translate([0, 0, zT]) },
    { name: 'Rohr', shape: pipeCone(s, o).translate([0, 0, zT - s.transition]) },
  ];
}

/** Hose (Schlauch) einzeln: Gewindekörper + Knickschutz. */
export function buildHose(p: OsvacParams, o: BuildOptions = {}): Body[] {
  return [
    { name: 'Schlauchteil', shape: hoseBody(p, 'plain', o) },
    { name: 'Gewinde', shape: hoseThreadBody(p, true) },
    { name: 'Knickschutz', shape: hoseSkirt(p) },
  ];
}

/** Abstände im Drehring-Stapel (gemessen, unabhängig von der Größe). */
const SWIVEL = { innerBelowOuter: 1.367, hoseBelowOuter: 6.0, housedHoseBelowInner: 6.634, housingH: 32, outerBelowHousing: 3.006 };

/** FxxHyy: Female oben, Übergang, Drehring, Gewindekörper, Knickschutz. */
export function buildFxxHyy(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const cone = transitionConeFH(p);
  const zO = -p.femaleHeight - cone.h;
  const zI = zO - SWIVEL.innerBelowOuter;
  const zH = zO - SWIVEL.hoseBelowOuter;
  return [
    { name: 'Female', shape: femaleRing(p, o) },
    { name: 'Übergang', shape: cone.shape.translate([0, 0, -p.femaleHeight]) },
    { name: 'Drehring außen', shape: swivelOuter(p, false).translate([0, 0, zO]) },
    { name: 'Drehring innen', shape: swivelInner(p, false).translate([0, 0, zI]) },
    { name: 'Schlauchteil', shape: hoseBody(p, 'plain', o).translate([0, 0, zH]) },
    { name: 'Gewinde', shape: hoseThreadBody(p, true).translate([0, 0, zH]) },
    { name: 'Knickschutz', shape: hoseSkirt(p).translate([0, 0, zH]) },
  ];
}

/** MxxHyy: Male (Spitze oben), Gehäuse, Drehring, Gewindekörper (ohne Knickschutz, wie im Original). */
export function buildMxxHyy(p: OsvacParams, o: BuildOptions = {}): Body[] {
  const male = flippedMale(p, o);
  const zHousing = -p.maleHeight;
  const zO = zHousing - SWIVEL.outerBelowHousing;
  const zI = zO - SWIVEL.innerBelowOuter;
  const zH = zI - SWIVEL.housedHoseBelowInner;
  return [
    { name: 'Male', shape: male },
    { name: 'Gehäuse', shape: maleHousing(p, o).translate([0, 0, zHousing]) },
    { name: 'Drehring außen', shape: swivelOuter(p, true).translate([0, 0, zO]) },
    { name: 'Drehring innen', shape: swivelInner(p, true).translate([0, 0, zI]) },
    { name: 'Schlauchteil', shape: hoseBody(p, 'housed', o).translate([0, 0, zH]) },
    { name: 'Gewinde', shape: hoseThreadBody(p, false).translate([0, 0, zH]) },
  ];
}
