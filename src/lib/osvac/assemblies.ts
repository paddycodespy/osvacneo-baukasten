/**
 * Zusammengesetzte Adapter von osVAC neo. Jedes Ergebnis ist eine Liste benannter Körper
 * (wie in Fusion: Körper überlappen/berühren sich und werden vom Slicer verschmolzen).
 * Globales System: Achse Z, Oberkante des Adapters bei z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { femaleRing, femaleFields, femaleFieldsOverlap, femaleKnurl, femaleKnurlOverlap } from './female';
import { maleTube, maleSupport } from './male';
import { revolveProfile, L } from './geom';
import { hoseBody, hoseFields, hoseFieldsOverlap, hoseKnurl, hoseKnurlOverlap, housingKnurl, housingKnurlOverlap, hoseThreadBody, hoseSkirt, swivelOuter, swivelInner, maleHousing, housingFields, housingFieldsOverlap, transitionConeFH } from './hose';
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
  /** von der gemessenen Oberfläche abzuziehen (Flächen, die im Inneren eines anderen Körpers liegen) */
  areaOffset?: number;
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

type Dep = Partial<Record<keyof OsvacParams | 'text' | 'knurl' | 'pipe' | 'z' | 'rot' | 'variant' | 'kind', unknown>>;

interface PartExtra {
  helper?: boolean;
  volumeOffset?: number;
  areaOffset?: number;
}

function part(name: string, cost: number, dep: Dep, make: () => Shape3D, extra: PartExtra = {}): Part {
  return { name, cost, key: JSON.stringify([name, dep]), make, ...extra };
}

/* Schlüssel: gleicher Name + gleiche Abhängigkeiten = gleicher Körper. Gleichnamige Körper verschiedener
   Adaptertypen mit anderer Form (z. B. „Übergang“) tragen deshalb kind im Schlüssel. */

/** Rändelring als eigener Körper (entfällt in der schnellen Vorschau); Überlappung mit dem Grundkörper herausgerechnet */
function knurlPart(name: string, o: BuildOptions, dep: Dep, make: () => Shape3D, ov: { volume: number; area: number }): Part[] {
  return o.knurl === false ? [] : [part(name, 2, dep, make, { volumeOffset: ov.volume, areaOffset: ov.area })];
}

/** Alle Körper sofort bauen (Skripte, Tests). */
export function buildAll(parts: Part[]): Body[] {
  return parts.map((q) => ({ name: q.name, shape: q.make(), helper: q.helper }));
}

// Abhängigkeiten der Einzelteile (nur Eingaben, die das Teil wirklich beeinflussen)
const dF = (p: OsvacParams) => ({ femaleDiameterInner: p.femaleDiameterInner, generalMaterialWidth: p.generalMaterialWidth, maleFemaleGapSize: p.maleFemaleGapSize });
/** Rändelung und Textfelder hängen nur vom Außendurchmesser ab (Spaltmaß ändert ihn nicht) */
const dFK = (p: OsvacParams) => ({ femaleDiameterOuter: p.femaleDiameterOuter });
const dFT = (p: OsvacParams, o: BuildOptions) => ({ ...dFK(p), femaleDiameterInner: p.femaleDiameterInner, text: o.text });
const dM = (p: OsvacParams, o: BuildOptions) => ({ maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize, generalMaterialWidth: p.generalMaterialWidth, text: o.text });
const dS = (p: OsvacParams) => ({ maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize, generalMaterialWidth: p.generalMaterialWidth, supportStructureGapSize: p.supportStructureGapSize });
const dH = (p: OsvacParams) => ({ hoseDiameterInner: p.hoseDiameterInner, generalMaterialWidth: p.generalMaterialWidth, slipRingGapSize: p.slipRingGapSize });
/** Griffzone der Schlauchseite: nur beim Schlauchteil im Gehäuse hängt ihre Lage am Drehring-Spalt */
const dHK = (p: OsvacParams, housed = false) => ({ hoseDiameterInner: p.hoseDiameterInner, generalMaterialWidth: p.generalMaterialWidth, ...(housed ? { slipRingGapSize: p.slipRingGapSize } : {}) });
/** Übergänge: von allen Maßen abhängig, aber nicht von Schrift und Rändelung */
const dAll = (p: OsvacParams, _o?: BuildOptions) => ({ ...p });

const female = (p: OsvacParams, o: BuildOptions): Part[] => [
  part('Female', 8, dF(p), () => femaleRing(p, { text: false })),
  ...knurlPart('Rändelung Female', o, dFK(p), () => femaleKnurl(p), femaleKnurlOverlap(p)),
  part('Textfeld Female', 7, dFT(p, o), () => femaleFields(p, o), { volumeOffset: femaleFieldsOverlap(p) }),
];

/** Einzelteil Female (Kupplung). */
export function partsFemale(p: OsvacParams, o: BuildOptions = {}): Part[] {
  return female(p, o);
}

/** Einzelteil Male (Stecker) inkl. Druckhilfe. */
export function partsMale(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const out = [part('Male', 9, dM(p, o), () => maleTube(p, o))];
  if (o.supports !== false) out.push(part('Druckhilfe', 1, dS(p), () => maleSupport(p), { helper: true }));
  return out;
}

/** MxxFyy: Female oben, Übergangskonus, Male unten. */
export function partsMxxFyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const zCone = -p.femaleHeight;
  const zMale = zCone - p.mxxFyyTransitionConeHeight;
  const out = [
    ...female(p, o),
    part('Übergang', 0.1, { ...dAll(p, o), kind: 'MF' }, () => transitionConeMF(p).translate([0, 0, zCone])),
    part('Male', 9, { ...dM(p, o), z: zMale }, () => maleTube(p, o).translate([0, 0, zMale])),
  ];
  if (o.supports !== false) out.push(part('Druckhilfe', 1, { ...dS(p), z: zMale }, () => maleSupport(p).translate([0, 0, zMale]), { helper: true }));
  return out;
}

/** Maschinenadapter mit Kupplung: Female oben, Übergang, Rohrkonus. */
export function partsMachineF(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.femaleHeight;
  const rFi = p.femaleDiameterInner / 2;
  return [
    ...female(p, o),
    part('Dichtnut-Füllung', 0.2, dF(p), () => femaleBeadFill(p)),
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s, kind: 'pipeF' }, () => pipeTransition(rFi, rFi + p.generalMaterialWidth, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
  ];
}

/** Maschinenadapter mit Stecker: Male (Spitze oben), Übergang, Rohrkonus. */
export function partsMachineM(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.maleHeight;
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s, kind: 'pipeM' }, () => pipeTransition(p.maleDiameterInner / 2, p.maleDiameterOuter / 2, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
  ];
}

/** Hose (Schlauch) einzeln: Gewindekörper + Knickschutz. */
export function partsHose(p: OsvacParams, o: BuildOptions = {}): Part[] {
  return [
    part('Schlauchteil', 0.5, { ...dHK(p), variant: 'plain' }, () => hoseBody(p, 'plain')),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p), variant: 'plain' }, () => hoseKnurl(p, 'plain'), hoseKnurlOverlap(p, 'plain')),
    part('Textfeld Schlauchteil', 7, { ...dHK(p), text: o.text, variant: 'plain' }, () => hoseFields(p, 'plain', o), { volumeOffset: hoseFieldsOverlap(p, 'plain') }),
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
    part('Übergang', 0.1, { ...dAll(p, o), kind: 'FH' }, () => t(transitionConeFH(p).shape, -p.femaleHeight)),
    part('Drehring außen', 0.1, { ...dH(p), z: zO }, () => t(swivelOuter(p, false), zO)),
    part('Drehring innen', 0.1, { ...dH(p), z: zI }, () => t(swivelInner(p, false), zI)),
    part('Schlauchteil', 0.5, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseBody(p, 'plain'), zH)),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseKnurl(p, 'plain'), zH), hoseKnurlOverlap(p, 'plain')),
    part('Textfeld Schlauchteil', 7, { ...dHK(p), text: o.text, z: zH, variant: 'plain' }, () => t(hoseFields(p, 'plain', o), zH), { volumeOffset: hoseFieldsOverlap(p, 'plain') }),
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
  const dHM = { ...dH(p), maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize };
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Gehäuse', 0.5, { ...dHM, z: zHousing }, () => t(maleHousing(p), zHousing)),
    ...knurlPart('Rändelung Gehäuse', o, { ...dHK(p), z: zHousing }, () => t(housingKnurl(p), zHousing), housingKnurlOverlap(p)),
    part('Textfeld Gehäuse', 2, { ...dHK(p), text: o.text, z: zHousing }, () => t(housingFields(p, o), zHousing), { volumeOffset: housingFieldsOverlap(p) }),
    part('Drehring außen', 0.1, { ...dH(p), z: zO, variant: 'housed' }, () => t(swivelOuter(p, true), zO)),
    part('Drehring innen', 0.1, { ...dH(p), z: zI, variant: 'housed' }, () => t(swivelInner(p, true), zI)),
    part('Schlauchteil', 0.5, { ...dH(p), z: zH, variant: 'housed' }, () => t(hoseBody(p, 'housed'), zH)),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p, true), z: zH, variant: 'housed' }, () => t(hoseKnurl(p, 'housed'), zH), hoseKnurlOverlap(p, 'housed')),
    part('Textfeld Schlauchteil', 5, { ...dHK(p, true), text: o.text, z: zH, variant: 'housed' }, () => t(hoseFields(p, 'housed', o), zH), { volumeOffset: hoseFieldsOverlap(p, 'housed') }),
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
