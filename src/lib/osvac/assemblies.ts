/**
 * Zusammengesetzte Adapter von osVAC neo. Jedes Ergebnis ist eine Liste benannter Körper
 * (wie in Fusion: Körper überlappen/berühren sich und werden vom Slicer verschmolzen).
 * Globales System: Achse Z, Oberkante des Adapters bei z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { femaleRing, femaleFields, femaleFieldsOverlap } from './female';
import { maleTube, maleSupport } from './male';
import { revolveProfile, L } from './geom';
import { hoseBody, hoseFields, hoseFieldsOverlap, hoseThreadBody, hoseSkirt, swivelOuter, swivelInner, maleHousing, housingFields, housingFieldsOverlap, transitionConeFH } from './hose';
import { pipeCone, pipeTransition, femaleBeadFill, DEFAULT_PIPE, type PipeSpec } from './machine';

export interface Body {
  name: string;
  shape: Shape3D;
  /** Druckhilfe – nach dem Druck entfernen */
  helper?: boolean;
}

/**
 * Ein Körper, der erst bei Bedarf gebaut wird. key beschreibt alles, wovon der Körper abhängt
 * (Eingaben, Optionen, Lage): gleicher key → gleicher Körper, er kann aus einem Zwischenspeicher kommen.
 * So kann der Worker-Pool die Körper parallel und einzeln berechnen.
 */
export interface Part {
  name: string;
  helper?: boolean;
  key: string;
  /** grobe relative Rechenzeit (für die Verteilung auf die Worker) */
  cost: number;
  /** vom gemessenen Volumen abzuziehen (Überlappung mit einem anderen Körper) */
  volumeOffset?: number;
  make: () => Shape3D;
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

type Dep = Partial<Record<keyof OsvacParams | 'text' | 'knurl' | 'pipe' | 'z' | 'rot' | 'variant', unknown>>;

function part(name: string, cost: number, dep: Dep, make: () => Shape3D, helper?: boolean, volumeOffset?: number): Part {
  return { name, cost, helper, key: JSON.stringify([name, dep]), make, volumeOffset };
}

/** Alle Körper sofort bauen (Skripte, Tests). */
export function buildAll(parts: Part[]): Body[] {
  return parts.map((q) => ({ name: q.name, shape: q.make(), helper: q.helper }));
}

// Abhängigkeiten der Einzelteile (nur Eingaben, die das Teil wirklich beeinflussen)
const dF = (p: OsvacParams, o: BuildOptions) => ({ femaleDiameterInner: p.femaleDiameterInner, generalMaterialWidth: p.generalMaterialWidth, maleFemaleGapSize: p.maleFemaleGapSize, knurl: o.knurl });
const dFT = (p: OsvacParams, o: BuildOptions) => ({ ...dF(p, o), text: o.text });
const dM = (p: OsvacParams, o: BuildOptions) => ({ maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize, generalMaterialWidth: p.generalMaterialWidth, text: o.text });
const dS = (p: OsvacParams) => ({ maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize, generalMaterialWidth: p.generalMaterialWidth, supportStructureGapSize: p.supportStructureGapSize });
const dH = (p: OsvacParams) => ({ hoseDiameterInner: p.hoseDiameterInner, generalMaterialWidth: p.generalMaterialWidth, slipRingGapSize: p.slipRingGapSize });
/** Schlauchseitige Griffzonen hängen zusätzlich von der Textfeld-Breite ab */
const dHT = (p: OsvacParams) => ({ ...dH(p), tv: p.generalTextFieldWidthVariation });
const dAll = (p: OsvacParams, o: BuildOptions) => ({ ...p, text: o.text, knurl: o.knurl });

const female = (p: OsvacParams, o: BuildOptions): Part[] => [
  part('Female', 8, dF(p, o), () => femaleRing(p, { ...o, text: false })),
  part('Textfeld Female', 7, dFT(p, o), () => femaleFields(p, o), false, femaleFieldsOverlap(p)),
];

/** Einzelteil Female (Kupplung). */
export function partsFemale(p: OsvacParams, o: BuildOptions = {}): Part[] {
  return female(p, o);
}

/** Einzelteil Male (Stecker) inkl. Druckhilfe. */
export function partsMale(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const out = [part('Male', 9, dM(p, o), () => maleTube(p, o))];
  if (o.supports !== false) out.push(part('Druckhilfe', 1, dS(p), () => maleSupport(p), true));
  return out;
}

/** MxxFyy: Female oben, Übergangskonus, Male unten. */
export function partsMxxFyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const zCone = -p.femaleHeight;
  const zMale = zCone - p.mxxFyyTransitionConeHeight;
  const out = [
    ...female(p, o),
    part('Übergang', 0.1, dAll(p, o), () => transitionConeMF(p).translate([0, 0, zCone])),
    part('Male', 9, { ...dM(p, o), z: zMale }, () => maleTube(p, o).translate([0, 0, zMale])),
  ];
  if (o.supports !== false) out.push(part('Druckhilfe', 1, { ...dS(p), z: zMale }, () => maleSupport(p).translate([0, 0, zMale]), true));
  return out;
}

/** Maschinenadapter mit Kupplung: Female oben, Übergang, Rohrkonus. */
export function partsMachineF(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.femaleHeight;
  const rFi = p.femaleDiameterInner / 2;
  return [
    ...female(p, o),
    part('Dichtnut-Füllung', 0.2, dF(p, o), () => femaleBeadFill(p)),
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s }, () => pipeTransition(rFi, rFi + p.generalMaterialWidth, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
  ];
}

/** Maschinenadapter mit Stecker: Male (Spitze oben), Übergang, Rohrkonus. */
export function partsMachineM(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.maleHeight;
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s }, () => pipeTransition(p.maleDiameterInner / 2, p.maleDiameterOuter / 2, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
  ];
}

/** Hose (Schlauch) einzeln: Gewindekörper + Knickschutz. */
export function partsHose(p: OsvacParams, o: BuildOptions = {}): Part[] {
  return [
    part('Schlauchteil', 4, { ...dHT(p), knurl: o.knurl, variant: 'plain' }, () => hoseBody(p, 'plain', { ...o, text: false })),
    part('Textfeld Schlauchteil', 7, { ...dHT(p), text: o.text, variant: 'plain' }, () => hoseFields(p, 'plain', o), false, hoseFieldsOverlap(p, 'plain')),
    part('Gewinde', 8, { ...dH(p), variant: 'runout' }, () => hoseThreadBody(p, true)),
    part('Knickschutz', 0.1, dH(p), () => hoseSkirt(p)),
  ];
}

/** Abstände im Drehring-Stapel (gemessen, unabhängig von der Größe). */
const SWIVEL = { innerBelowOuter: 1.367, hoseBelowOuter: 6.0, housedHoseBelowInner: 6.634, housingH: 32, outerBelowHousing: 3.006 };

/** FxxHyy: Female oben, Übergang, Drehring, Gewindekörper, Knickschutz. */
export function partsFxxHyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const h = p.hoseFemaleTransitionConeHeight + p.generalMiniValue * 5;
  const zO = -p.femaleHeight - h;
  const zI = zO - SWIVEL.innerBelowOuter;
  const zH = zO - SWIVEL.hoseBelowOuter;
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  return [
    ...female(p, o),
    part('Übergang', 0.1, dAll(p, o), () => t(transitionConeFH(p).shape, -p.femaleHeight)),
    part('Drehring außen', 0.1, { ...dH(p), z: zO }, () => t(swivelOuter(p, false), zO)),
    part('Drehring innen', 0.1, { ...dH(p), z: zI }, () => t(swivelInner(p, false), zI)),
    part('Schlauchteil', 4, { ...dHT(p), knurl: o.knurl, z: zH, variant: 'plain' }, () => t(hoseBody(p, 'plain', { ...o, text: false }), zH)),
    part('Textfeld Schlauchteil', 7, { ...dHT(p), text: o.text, z: zH, variant: 'plain' }, () => t(hoseFields(p, 'plain', o), zH), false, hoseFieldsOverlap(p, 'plain')),
    part('Gewinde', 8, { ...dH(p), z: zH, variant: 'runout' }, () => t(hoseThreadBody(p, true), zH)),
    part('Knickschutz', 0.1, { ...dH(p), z: zH }, () => t(hoseSkirt(p), zH)),
  ];
}

/** MxxHyy: Male (Spitze oben), Gehäuse, Drehring, Gewindekörper (ohne Knickschutz, wie im Original). */
export function partsMxxHyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const zHousing = -p.maleHeight;
  const zO = zHousing - SWIVEL.outerBelowHousing;
  const zI = zO - SWIVEL.innerBelowOuter;
  const zH = zI - SWIVEL.housedHoseBelowInner;
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  const dHM = { ...dHT(p), maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize };
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Gehäuse', 3, { ...dHM, knurl: o.knurl, z: zHousing }, () => t(maleHousing(p, { ...o, text: false }), zHousing)),
    part('Textfeld Gehäuse', 2, { ...dHT(p), text: o.text, z: zHousing }, () => t(housingFields(p, o), zHousing), false, housingFieldsOverlap(p)),
    part('Drehring außen', 0.1, { ...dH(p), z: zO, variant: 'housed' }, () => t(swivelOuter(p, true), zO)),
    part('Drehring innen', 0.1, { ...dH(p), z: zI, variant: 'housed' }, () => t(swivelInner(p, true), zI)),
    part('Schlauchteil', 4, { ...dHT(p), knurl: o.knurl, z: zH, variant: 'housed' }, () => t(hoseBody(p, 'housed', { ...o, text: false }), zH)),
    part('Textfeld Schlauchteil', 5, { ...dHT(p), text: o.text, z: zH, variant: 'housed' }, () => t(hoseFields(p, 'housed', o), zH), false, hoseFieldsOverlap(p, 'housed')),
    part('Gewinde', 8, { ...dH(p), z: zH, variant: 'plain' }, () => t(hoseThreadBody(p, false), zH)),
  ];
}

// Kompatible Bau-Funktionen (alle Körper sofort)
export const buildFemale = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsFemale(p, o));
export const buildMale = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMale(p, o));
export const buildMxxFyy = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMxxFyy(p, o));
export const buildMachineF = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMachineF(p, o));
export const buildMachineM = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMachineM(p, o));
export const buildHose = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsHose(p, o));
export const buildFxxHyy = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsFxxHyy(p, o));
export const buildMxxHyy = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMxxHyy(p, o));
