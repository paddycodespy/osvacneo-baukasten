/**
 * Zusammengesetzte Adapter von osVAC neo. Jedes Ergebnis ist eine Liste benannter Körper
 * (wie in Fusion: Körper überlappen/berühren sich und werden vom Slicer verschmolzen).
 * Globales System: Achse Z, Oberkante des Adapters bei z = 0.
 */
import type { Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { femaleRing, femaleFields, femaleFieldsOverlap, femaleKnurl, femaleKnurlOverlap } from './female';
import { maleTube, maleSupport } from './male';
import { sealGroove, type SealGroove } from './seal';
import { revolveProfile, L, L as L_ } from './geom';
import { hoseBody, hoseFields, hoseFieldsOverlap, hoseKnurl, hoseKnurlOverlap, hoseCupGrip, housingKnurl, housingKnurlOverlap, hoseThreadBody, hoseSkirt, swivelOuter, swivelInner, swivelPrintTop, swivelPrintBottom, swivelPrintProfile, SWIVEL_PRINT, maleHousing, housingFields, housingFieldsOverlap, transitionConeFH } from './hose';
import { pipeCone, pipeTransition, pipeRibs, DEFAULT_PIPE, type PipeSpec } from './machine';
import { deriveParams, type OsvacInput } from './params';
import { planFree, partPlacements, inPart2, hasSplit, placeShape, isIdentity, placementKey, localPlacement, loosePlacements, DEFAULT_FREE, OSVAC_TRANSITION, type FreeSpec, type Placement, type V3 } from './freeform';
import { DEFAULT_GATE, gateLayout, gateLower, gateUpper, gateSlider, gateClip, gateBed, upperOnBed, type GateSpec } from './gate';
import type { SectionCut } from '../worker/protocol';
import { helperForFemale, helperForMale, helperSide } from './helper';
import { BLEED, bleedLayout, bleedBody, bleedRing } from './bleed';
import { DEFAULT_MAGNET, MAG, PLATE, magnetAdapter, magnetCoupling, magnetThread, magnetThreadOverlap, magnetBed, magnetLayout, magnetPlate, plateTubeTop, portLayout, capFloor, type MagnetSpec, type PlatePort } from './magnet';
import { UserError } from '../errors';

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
  /** eigenes Objekt im 3MF (z. B. die Schieberplatte, die getrennt gedruckt und eingesetzt wird) */
  object?: string;
  /** Schnitt in der Vorschau durch diesen Punkt mit dieser Normalen (sonst durch den Ursprung, Normale y): für Teile, die
   * neben der Achse liegen (z. B. zweites Teil der Magnetkupplung) */
  cut?: SectionCut;
  /** Kupplung: Maße der Dichtnut (für den Hinweis im Download-Schritt) */
  seal?: SealGroove;
  make: () => Shape3D;
}

export interface BuildOptions {
  text?: boolean;
  knurl?: boolean;
  supports?: boolean;
  /** Rohr für Maschinenadapter */
  pipe?: PipeSpec;
  /** Aufbau des Freiform-Adapters */
  free?: FreeSpec;
  /** Schieber einzeln */
  gate?: GateSpec;
  /** Drehring-Lösehilfe: welche Halter */
  helper?: HelperSpec;
  /** Nebenluft-Regler: Anschluss oben, Spiel am Drehring */
  bleed?: BleedSpec;
  /** Magnet-Schnellkupplung Ø100 */
  magnet?: MagnetSpec;
  /** Magnet-Schnellkupplung: osVAC-Anschlüsse statt Schlauch („Gerät ↔ Kupplung/Stecker“) */
  magnetOsvac?: boolean;
  /** Drehring am Schlauch: 'print' = druckoptimiert (Standard in der App), sonst wie im Original */
  swivel?: 'print';
  /** Schlauchgewinde: 'right' = Rechtsgewinde, sonst links wie im Original */
  hoseHand?: 'right';
}

/** Nebenluft-Regler: unten Schlauch (H), oben Kupplung (F, Standard) oder Stecker (M) */
export interface BleedSpec {
  top: 'female' | 'male';
  gap: number;
}
export const DEFAULT_BLEED: BleedSpec = { top: 'female', gap: BLEED.gap };

/** Drehring-Lösehilfe: Halter für Kupplungen (Größe = Kupplung) und/oder für Stecker (Größe = Stecker) */
export interface HelperSpec {
  forF: boolean;
  forM: boolean;
}
export const DEFAULT_HELPER: HelperSpec = { forF: true, forM: true };

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

type Dep = Partial<Record<keyof OsvacParams | 'text' | 'knurl' | 'pipe' | 'z' | 'rot' | 'variant' | 'kind', unknown>> | object;

interface PartExtra {
  helper?: boolean;
  seal?: SealGroove;
  cut?: SectionCut;
  object?: string;
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
/** Schlüssel des Gewindekörpers: Rechtsgewinde nur, wenn gewählt (Linksgewinde behält die alten Schlüssel) */
const dHand = (o: BuildOptions) => (o.hoseHand === 'right' ? { hand: 'right' } : {});
const hand = (o: BuildOptions) => (o.hoseHand === 'right' ? 'right' : 'left');
const dH = (p: OsvacParams) => ({ hoseDiameterInner: p.hoseDiameterInner, generalMaterialWidth: p.generalMaterialWidth, slipRingGapSize: p.slipRingGapSize });
/** Griffzone der Schlauchseite: nur beim Schlauchteil im Gehäuse hängt ihre Lage am Drehring-Spalt */
const dHK = (p: OsvacParams, housed = false) => ({ hoseDiameterInner: p.hoseDiameterInner, generalMaterialWidth: p.generalMaterialWidth, ...(housed ? { slipRingGapSize: p.slipRingGapSize } : {}) });
/** Übergänge: von allen Maßen abhängig, aber nicht von Schrift und Rändelung */
const dAll = (p: OsvacParams, _o?: BuildOptions) => ({ ...p });

const female = (p: OsvacParams, o: BuildOptions): Part[] => [
  part('Female', 8, dF(p), () => femaleRing(p, { text: false }), { seal: sealGroove(p) }),
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
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s, kind: 'pipeF' }, () => pipeTransition(rFi, rFi + p.generalMaterialWidth, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
    ...pipeRibPart(s, o, zT - s.transition),
  ];
}

/** Klemmrippen am Rohr, falls gewählt (eigener Körper) */
function pipeRibPart(s: PipeSpec, o: BuildOptions, z: number): Part[] {
  if (!s.ribs || s.length < 8) return [];
  return [part('Klemmrippen', 0.5, { pipe: s, text: o.text, z, kind: 'pipeRibs' }, () => pipeRibs(s, o).translate([0, 0, z]))];
}

/** Maschinenadapter mit Stecker: Male (Spitze oben), Übergang, Rohrkonus. */
export function partsMachineM(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = o.pipe ?? DEFAULT_PIPE;
  const zT = -p.maleHeight;
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Übergang', 0.1, { ...dAll(p, o), pipe: s, kind: 'pipeM' }, () => pipeTransition(p.maleDiameterInner / 2, p.maleDiameterOuter / 2, s).translate([0, 0, zT])),
    part('Rohr', 12, { pipe: s, text: o.text, z: zT - s.transition }, () => pipeCone(s, o).translate([0, 0, zT - s.transition])),
    ...pipeRibPart(s, o, zT - s.transition),
  ];
}

/** Hose (Schlauch) einzeln: Gewindekörper + Knickschutz. */
export function partsHose(p: OsvacParams, o: BuildOptions = {}): Part[] {
  return [
    part('Schlauchteil', 0.5, { ...dHK(p), variant: 'plain' }, () => hoseBody(p, 'plain')),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p), variant: 'plain' }, () => hoseKnurl(p, 'plain'), hoseKnurlOverlap(p, 'plain')),
    part('Textfeld Schlauchteil', 7, { ...dHK(p), text: o.text, variant: 'plain' }, () => hoseFields(p, 'plain', o), { volumeOffset: hoseFieldsOverlap(p, 'plain') }),
    part('Gewinde', 8, { ...dH(p), variant: 'runout', ...dHand(o) }, () => hoseThreadBody(p, true, hand(o))),
    part('Knickschutz', 0.1, dH(p), () => hoseSkirt(p)),
  ];
}

/** Abstände im Drehring-Stapel (gemessen, unabhängig von der Größe). */
const SWIVEL = { innerBelowOuter: 1.367, hoseBelowOuter: 6.0, housedHoseBelowInner: 6.634, housingH: 32, outerBelowHousing: 3.006 };

/** Schlauchteil unter der Oberkante des Drehrings an der Kupplung (FxxHyy, Nebenluft-Regler) */
const swivelHoseBelow = (o: BuildOptions) => (o.swivel === 'print' ? SWIVEL_PRINT.hoseBelow : SWIVEL.hoseBelowOuter);

/**
 * Die beiden Ringe des Drehrings, Oberkante bei zO. Original: „Drehring außen“ (an Kupplung bzw. Gehäuse) und
 * „Drehring innen“ (am Schlauchteil). Druckoptimiert: „Drehring oben“ (innen, an Kupplung bzw. Gehäuse) und
 * „Drehring unten“ (Hülse am Schlauchteil), beide im selben System.
 */
function swivelParts(p: OsvacParams, o: BuildOptions, zO: number, housed: boolean): Part[] {
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  const v = housed ? { variant: 'housed' } : {};
  if (o.swivel === 'print') {
    const k = { ...dH(p), z: zO, ...v, swivel: 'print' };
    return [
      part('Drehring oben', 0.1, k, () => t(swivelPrintTop(p, housed), zO)),
      part('Drehring unten', 0.1, k, () => t(swivelPrintBottom(p, housed), zO)),
    ];
  }
  const zI = zO - SWIVEL.innerBelowOuter;
  return [
    part('Drehring außen', 0.1, { ...dH(p), z: zO, ...v }, () => t(swivelOuter(p, housed), zO)),
    part('Drehring innen', 0.1, { ...dH(p), z: zI, ...v }, () => t(swivelInner(p, housed), zI)),
  ];
}

/** FxxHyy: Female oben, Übergang, Drehring, Gewindekörper, Knickschutz. */
export function partsFxxHyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const h = p.hoseFemaleTransitionConeHeight + p.generalMiniValue * 5;
  const zO = -p.femaleHeight - h;
  const zH = zO - swivelHoseBelow(o);
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  return [
    ...female(p, o),
    part('Übergang', 0.1, { ...dAll(p, o), kind: 'FH' }, () => t(transitionConeFH(p).shape, -p.femaleHeight)),
    ...swivelParts(p, o, zO, false),
    part('Schlauchteil', 0.5, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseBody(p, 'plain'), zH)),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseKnurl(p, 'plain'), zH), hoseKnurlOverlap(p, 'plain')),
    part('Textfeld Schlauchteil', 7, { ...dHK(p), text: o.text, z: zH, variant: 'plain' }, () => t(hoseFields(p, 'plain', o), zH), { volumeOffset: hoseFieldsOverlap(p, 'plain') }),
    part('Gewinde', 8, { ...dH(p), z: zH, variant: 'runout', ...dHand(o) }, () => t(hoseThreadBody(p, true, hand(o)), zH)),
    part('Knickschutz', 0.1, { ...dH(p), z: zH }, () => t(hoseSkirt(p), zH)),
  ];
}

/** MxxHyy: Male (Spitze oben), Gehäuse, Drehring, Gewindekörper (ohne Knickschutz, wie im Original). */
export function partsMxxHyy(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const zHousing = -p.maleHeight;
  const zO = zHousing - SWIVEL.outerBelowHousing;
  const zH = zO - SWIVEL.innerBelowOuter - SWIVEL.housedHoseBelowInner;
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  const dHM = { ...dH(p), maleDiameterInner: p.maleDiameterInner, maleFemaleGapSize: p.maleFemaleGapSize };
  // druckoptimiert: Gehäuse-Unterkante 45°, Schulter des Schlauchteils folgt (eigene Schlüssel)
  const pr = o.swivel === 'print';
  const sw = pr ? { swivel: 'print' } : {};
  return [
    part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)),
    part('Gehäuse', 0.5, { ...dHM, z: zHousing, ...sw }, () => t(maleHousing(p, { print: pr }), zHousing)),
    ...knurlPart('Rändelung Gehäuse', o, { ...dHK(p), z: zHousing }, () => t(housingKnurl(p), zHousing), housingKnurlOverlap(p)),
    part('Textfeld Gehäuse', 2, { ...dHK(p), text: o.text, z: zHousing }, () => t(housingFields(p, o), zHousing), { volumeOffset: housingFieldsOverlap(p) }),
    ...swivelParts(p, o, zO, true),
    part('Schlauchteil', 0.5, { ...dH(p), z: zH, variant: 'housed', ...sw }, () => t(hoseBody(p, 'housed', { print: pr }), zH)),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p, true), z: zH, variant: 'housed', ...sw }, () => t(hoseKnurl(p, 'housed', pr), zH), hoseKnurlOverlap(p, 'housed', pr)),
    part('Textfeld Schlauchteil', 5, { ...dHK(p, true), text: o.text, z: zH, variant: 'housed', ...sw }, () => t(hoseFields(p, 'housed', { ...o, print: pr }), zH), { volumeOffset: hoseFieldsOverlap(p, 'housed', pr) }),
    part('Gewinde', 8, { ...dH(p), z: zH, variant: 'plain', ...dHand(o) }, () => t(hoseThreadBody(p, false, hand(o)), zH)),
  ];
}

// ---------------------------------------------------------------- Freiform

/** Teil an eine andere Lage legen (Schlüssel bekommt die Lage dazu; unverändert bei Einheitslage). */
function placedPart(q: Part, pl: Placement): Part {
  if (isIdentity(pl)) return q;
  return { ...q, key: JSON.stringify([JSON.parse(q.key), placementKey(pl)]), make: () => placeShape(q.make(), pl) };
}

/** Parameter mit eigenem Durchmesser für ein Ende (Spaltmaß, Materialstärke usw. bleiben). */
function withDiameter(p: OsvacParams, type: 'female' | 'male', d: number): OsvacParams {
  const i: OsvacInput = {
    maleDiameterInner: p.maleDiameterInner,
    femaleDiameterInner: p.femaleDiameterInner,
    hoseDiameterInner: p.hoseDiameterInner,
    generalMaterialWidth: p.generalMaterialWidth,
    maleFemaleGapSize: p.maleFemaleGapSize,
    slipRingGapSize: p.slipRingGapSize,
    supportStructureGapSize: p.supportStructureGapSize,
  };
  return deriveParams({ ...i, [type === 'female' ? 'femaleDiameterInner' : 'maleDiameterInner']: d });
}

const ringOf = (p: OsvacParams, type: 'female' | 'male') =>
  type === 'female' ? { rIn: p.femaleDiameterInner / 2, rOut: p.femaleDiameterInner / 2 + p.generalMaterialWidth } : { rIn: p.maleDiameterInner / 2, rOut: p.maleDiameterOuter / 2 };

/** Steht ein Stecker mit der Spitze auf dem Druckbett? Dann gibt es eine Druckhilfe. */
export function freeMaleOnBed(spec: FreeSpec): boolean {
  // mit Schieber stehen beide Teile auf ihrem Ende
  if (hasSplit(spec)) return spec.a.type === 'male' || spec.b.type === 'male';
  return spec.bed === 'A' ? spec.a.type === 'male' : spec.b.type === 'male';
}

/**
 * Freiform-Adapter: Anschluss A (osVAC neo, oben in der Achse wie bei den Stutzen-Adaptern), Formstücke,
 * Ende B (Gerät oder osVAC neo). Zum Schluss liegt das gewählte Ende flach auf dem Druckbett.
 */
export function partsFree(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const spec = o.free ?? DEFAULT_FREE;
  const plan = planFree(spec);
  const err = plan.issues.find((x) => x.level === 'error');
  if (err) throw new UserError(err.text.replace(/^[^:]*\(Baustein (\d+)\): /, 'Baustein $1: '));
  const { p1, p2 } = partPlacements(spec, plan);
  const split = !!plan.split;
  const bedA = split || spec.bed === 'A', bedB = split || spec.bed === 'B';
  const w = spec.wall;
  const pipeFor = (d: number): PipeSpec => ({ d1Inner: d, d2Inner: d, length: 0, wall: w, transition: OSVAC_TRANSITION, screwHoles: false });
  const out: Part[] = [];
  const support = o.supports !== false && freeMaleOnBed(spec);

  // Anschluss A
  const pA = withDiameter(p, spec.a.type, spec.a.d);
  const rA = ringOf(pA, spec.a.type);
  if (spec.a.type === 'female') {
    out.push(...female(pA, o));
    out.push(part('Übergang A', 0.1, { kind: 'freeA', a: 'female', ...dAll(pA), w }, () => pipeTransition(rA.rIn, rA.rOut, pipeFor(spec.a.d)).translate([0, 0, -pA.femaleHeight])));
  } else {
    out.push(part('Male', 9, { ...dM(pA, o), rot: 'flip' }, () => flippedMale(pA, o)));
    if (support && bedA && spec.a.type === 'male')
      out.push(part('Druckhilfe', 1, { ...dS(pA), rot: 'flip' }, () => maleSupport(pA).rotate(180, [0, 0, 0], [1, 0, 0]).rotate(180, [0, 0, 0], [0, 0, 1]).translate([0, 0, -pA.maleHeight]), { helper: true }));
    out.push(part('Übergang A', 0.1, { kind: 'freeA', a: 'male', ...dAll(pA), w }, () => pipeTransition(rA.rIn, rA.rOut, pipeFor(spec.a.d)).translate([0, 0, -pA.maleHeight])));
  }

  // Formstücke und Geräteanschluss
  for (const b of plan.bodies) out.push(part(b.name, b.cost, b.dep as object, b.make));

  // Ende B (und Ende C am Abzweig) als Anschluss von osVAC neo
  const osvacEnd = (E: { type: 'female' | 'male'; d: number }, fe: { o: V3; t: V3; u: V3 }, tag: 'B' | 'C', withSupport: boolean) => {
    const type = E.type;
    const pB = withDiameter(p, type, E.d);
    const rB = ringOf(pB, type);
    const at = (d: number): V3 => [fe.o[0] + fe.t[0] * d, fe.o[1] + fe.t[1] * d, fe.o[2] + fe.t[2] * d];
    const cone = localPlacement(at(OSVAC_TRANSITION), fe.u, fe.t);
    out.push(placedPart(part(`Übergang ${tag}`, 0.1, { kind: tag === 'B' ? 'freeB' : 'freeC', b: type, ...dAll(pB), w }, () => pipeTransition(rB.rIn, rB.rOut, pipeFor(E.d))), cone));
    if (type === 'female') {
      const pl = localPlacement(at(OSVAC_TRANSITION + pB.femaleHeight), fe.u, fe.t);
      for (const q of female(pB, o)) out.push(placedPart({ ...q, name: `${q.name} ${tag}` }, pl));
    } else {
      const neg: V3 = [-fe.t[0], -fe.t[1], -fe.t[2]];
      const pl = localPlacement(at(OSVAC_TRANSITION), fe.u, neg);
      out.push(placedPart(part(`Male ${tag}`, 9, dM(pB, o), () => maleTube(pB, o)), pl));
      if (withSupport) out.push(placedPart(part(`Druckhilfe ${tag}`, 1, dS(pB), () => maleSupport(pB), { helper: true }), pl));
    }
  };
  if (spec.b.type === 'female' || spec.b.type === 'male') osvacEnd({ type: spec.b.type, d: spec.b.d }, plan.chainEnd.frame, 'B', support && bedB && spec.b.type === 'male');
  if (plan.cChainEnd && spec.c && (spec.c.type === 'female' || spec.c.type === 'male')) osvacEnd({ type: spec.c.type, d: spec.c.d }, plan.cChainEnd.frame, 'C', false);
  // gleiche Anschlüsse an beiden Enden: Namen eindeutig halten (Vorschau ordnet über den Namen zu)
  const seen = new Map<string, number>();
  for (const q of out) {
    const n = seen.get(q.name) ?? 0;
    seen.set(q.name, n + 1);
    if (n) q.name = `${q.name} ${n + 1}`;
  }
  // geteilt (Schieber): B-Teil eigene Lage und eigenes Objekt im 3MF
  const isB = inPart2(plan);
  const placed = out.map((q) => (p2 && isB(q.name) ? { ...placedPart(q, p2), object: 'Teil B' } : placedPart(q, p1)));
  // Schieberplatten flach hinter den Adapter legen (in +x), untereinander in y
  const lp = plan.loose.length ? loosePlacements(spec, plan) : [];
  plan.loose.forEach((q, i) => placed.push(placedPart(part(q.name, q.cost, q.dep as object, q.make, { object: q.name }), lp[i])));
  return placed;
}

// ---------------------------------------------------------------- Schieber einzeln

/** Absperrschieber mit Muffen, zweiteilig verschraubt: Unterteil (stehend), Oberteil umgedreht daneben, Platte flach davor, ggf. Wandhalter dahinter */
export function partsGate(_p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = { ...DEFAULT_GATE, ...o.gate };
  const lay = gateLayout(s);
  const bed = gateBed(s);
  const dep = { kind: 'gate2', d: s.d, gap: s.pipeGap, pg: s.plateGap, depth: s.depth };
  const out = [
    part('Schieber-Unterteil', 2, { ...dep, mount: s.mount === 'clip' ? 'none' : s.mount, A: s.mount === 'plate' || s.mount === 'keyhole' ? lay.A : 0, ...(lay.keyTurned ? { orient: 'turned' } : {}), text: o.text !== false }, () => gateLower(s, o.text !== false)),
    part('Schieber-Oberteil', 1.5, { ...dep, at: bed.upper }, () => upperOnBed(gateUpper(s), bed.upper), { object: 'Schieber-Oberteil' }),
    part('Schieberplatte', 0.4, { kind: 'gate2Plate', d: s.d, gap: s.pipeGap, pg: s.plateGap, at: bed.plate }, () => gateSlider(lay.g).translate(bed.plate) as Shape3D, { object: 'Schieberplatte' }),
  ];
  if (s.mount === 'clip') out.push(part('Wandhalter', 0.3, { kind: 'gateClip', d: s.d, A: lay.A, at: bed.clip }, () => gateClip(s).translate(bed.clip) as Shape3D, { object: 'Wandhalter' }));
  return out;
}

// ---------------------------------------------------------------- Drehring-Lösehilfe

/**
 * Halter nebeneinander (6 mm Abstand): links der für Kupplungen (Größe der Kupplung), rechts der für Stecker
 * (Größe des Steckers). Spalt und Materialstärke wie eingestellt.
 */
export function partsHelper(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = { ...DEFAULT_HELPER, ...o.helper };
  if (!s.forF && !s.forM) s.forF = s.forM = true;
  const base = { generalMaterialWidth: p.generalMaterialWidth, maleFemaleGapSize: p.maleFemaleGapSize };
  const pF = deriveParams({ ...base, maleDiameterInner: p.femaleDiameterInner, femaleDiameterInner: p.femaleDiameterInner });
  const pM = deriveParams({ ...base, maleDiameterInner: p.maleDiameterInner, femaleDiameterInner: p.maleDiameterInner });
  const both = s.forF && s.forM;
  const xF = both ? -(helperSide(pF) / 2 + 3) : 0, xM = both ? helperSide(pM) / 2 + 3 : 0;
  const text = o.text !== false;
  const out: Part[] = [];
  if (s.forF) out.push(part('Lösehilfe für Kupplung', 1.5, { kind: 'helperF', d: p.femaleDiameterInner, ...base, text, x: xF }, () => helperForFemale(pF, text).translate([xF, 0, 0]) as Shape3D));
  if (s.forM) out.push(part('Lösehilfe für Stecker', 1.5, { kind: 'helperM', d: p.maleDiameterInner, ...base, text, x: xM }, () => helperForMale(pM, text).translate([xM, 0, 0]) as Shape3D, both ? { object: 'Lösehilfe für Stecker' } : {}));
  return out;
}

// ---------------------------------------------------------------- Nebenluft-Regler

/**
 * Nebenluft-Regler, kompakt: oben Kupplung oder Stecker, darunter das Rohr mit drei Fenstern und Drehring, unten wie
 * beim Schlauchadapter Drehring für den Schlauch und Schlauchteil mit Gewinde. Rohr innen wie der
 * Schlauch, außen wie der Schlauchteil. Oberkante bei z = 0, gedruckt mit dem Schlauchteil unten.
 */
export function partsBleed(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = { ...DEFAULT_BLEED, ...o.bleed };
  const lay = bleedLayout(p, s.top, s.gap);
  const { rH, rO, D, L, zT, zB, hC } = lay;
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]);
  const dB = { ...dH(p), gap: s.gap, top: s.top, kind: 'bleedH' };
  const out: Part[] = [];
  if (s.top === 'female') {
    out.push(...female(p, o));
    out.push(part('Übergang', 0.1, { ...dAll(p, o), kind: 'FH' }, () => t(transitionConeFH(p).shape, -p.femaleHeight)));
  } else {
    const rMi = p.maleDiameterInner / 2, rMo = p.maleDiameterOuter / 2;
    out.push(part('Male', 9, { ...dM(p, o), rot: 'flip' }, () => flippedMale(p, o)));
    out.push(part('Übergang', 0.1, { ...dAll(p, o), kind: 'MBleed' }, () => revolveProfile([rMi, -p.maleHeight], [L_(rMo, -p.maleHeight), L_(rO, zT), L_(rH, zT)])));
  }
  void hC;
  // darunter wie beim Schlauchadapter FxxHyy: Drehring (außen fest am Rohr, innen fest am Schlauchteil), Schlauchteil
  const zO = zB, zH = zO - swivelHoseBelow(o);
  out.push(
    part('Nebenluft · Rohr', 1, { ...dB, L, z: zB }, () => t(bleedBody(D, L), zB)),
    part('Nebenluft · Drehring', 1, { ...dB, z: zB }, () => t(bleedRing(D), zB)),
    ...swivelParts(p, o, zO, false),
    part('Schlauchteil', 0.5, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseBody(p, 'plain'), zH)),
    ...knurlPart('Rändelung Schlauchteil', o, { ...dHK(p), z: zH, variant: 'plain' }, () => t(hoseKnurl(p, 'plain'), zH), hoseKnurlOverlap(p, 'plain')),
    part('Textfeld Schlauchteil', 7, { ...dHK(p), text: o.text, z: zH, variant: 'plain' }, () => t(hoseFields(p, 'plain', o), zH), { volumeOffset: hoseFieldsOverlap(p, 'plain') }),
    part('Gewinde', 8, { ...dH(p), z: zH, variant: 'runout', ...dHand(o) }, () => t(hoseThreadBody(p, true, hand(o)), zH)),
    part('Knickschutz', 0.1, { ...dH(p), z: zH }, () => t(hoseSkirt(p), zH)),
  );
  return out;
}

// ---------------------------------------------------------------- Magnet-Schnellkupplung Ø100

/** Parameter für einen Anschluss auf der Magnetplatte: Kupplung, Stecker und Schlauch mit Durchmesser d */
function portParams(p: OsvacParams, d: number): OsvacParams {
  return deriveParams({
    maleDiameterInner: d, femaleDiameterInner: d, hoseDiameterInner: d,
    generalMaterialWidth: p.generalMaterialWidth, maleFemaleGapSize: p.maleFemaleGapSize,
    slipRingGapSize: p.slipRingGapSize, supportStructureGapSize: p.supportStructureGapSize,
  });
}

/**
 * Außenradius eines Anschlusses auf der Magnetplatte mit Gegenstück (gemessen): Kupplung d/2 + W + 1,5 (Rändelung und
 * Textfeld), Stecker ebenso (die aufgesteckte Kupplung ist das Breiteste), Schlauch d/2 + W + 0,5 (Rändelung am Becher).
 */
export function portEnvelope(W: number, t: 'F' | 'M' | 'H', d: number): number {
  return d / 2 + W + (t === 'H' ? 0.5 : 1.5);
}

/** Anschlüsse der Magnetplatte und ihre Lage (x), mit Prüfung, ob sie mit genug Abstand auf den Flansch passen */
export function magnetPortLayout(W: number, s: MagnetSpec, osvac: boolean) {
  const list: { t: 'F' | 'M' | 'H'; d: number; cap: boolean; hand: 'left' | 'right' }[] = osvac
    ? s.ports.map((q) => ({ ...q, hand: 'left' as const }))
    : s.hoses.map((h) => ({ t: 'H' as const, d: h.d, cap: false, hand: h.hand }));
  const env = list.map((q) => portEnvelope(W, q.t, q.d));
  const gap = !osvac ? PLATE.gapHose : list.every((q) => q.t === 'M') ? PLATE.gapMale : PLATE.gapBayonet;
  return { list, env, gap, ...portLayout(env, gap) };
}

/**
 * Maße der Magnetplatte für die Oberfläche (ohne zu bauen): Lage, passt es, Höhe über alles, Druckpause (Oberkante der
 * Magnettaschen über dem Druckbett).
 */
export function magnetPlateInfo(p: OsvacParams, s: MagnetSpec, osvac: boolean) {
  const W = p.generalMaterialWidth;
  const L = magnetPortLayout(W, s, osvac);
  const lay = magnetLayout(s);
  const pp: PlatePort[] = L.list.map((q, i) => ({ x: L.xs[i], rIn: q.d / 2, rOut: q.d / 2 + (q.t === 'H' ? W : PLATE.wall) }));
  const zTop = plateTubeTop(lay, pp);
  const g = Math.min(p.slipRingGapSize, SWIVEL_PRINT.gapMax);
  const prof = swivelPrintProfile(W, false, g);
  const lowBot = Math.min(...prof.bottom.map(([, z]) => z));
  const stack = (t: 'F' | 'M' | 'H', d: number) => {
    const q = portParams(p, d);
    return t === 'F' ? q.femaleHeight + OSVAC_TRANSITION : t === 'M' ? q.maleHeight + OSVAC_TRANSITION : -0.5 - lowBot + HOSE_CUP;
  };
  const height = Math.round((zTop + Math.max(...L.list.map((q) => stack(q.t, q.d)))) * 10) / 10;
  return { ...L, zTop, height, pause: Math.round((MAG.cover + lay.pH) * 100) / 100 };
}

/** Höhe des Bechers (Schlauchteil ohne Knickschutz, umgedreht) */
const HOSE_CUP = 27;

/** Kegel der 55°-Schulter am Schlauchkopf (wie hoseBody) */
const HEAD_CONE = 5.257 / 3.681;

/**
 * Magnet-Schnellkupplung Ø100: Maschinenadapter und/oder das Teil für den Schlauch bzw. für osVAC neo. Mit beiden
 * Teilen liegen sie diagonal nebeneinander, das zweite als eigenes Objekt im 3MF.
 * - Schlauch Ø100 (wie bisher): Schlauchkupplung mit Außengewinde, Kontaktfläche oben gedruckt.
 * - kleinere Schläuche (1 oder 2): flache Magnetplatte (Kontaktfläche unten), darauf je Schlauch ein Drehring
 *   (druckoptimiert) und ein Becher mit dem Innengewinde von osVAC neo (umgedreht: Öffnung oben). Platte und unterer
 *   Ring stehen, oberer Ring und Becher drehen.
 * - osVAC neo (1 oder 2): Magnetplatte mit Kupplung(en) oder Stecker(n) fest darauf, wahlweise mit Verschlusskappe.
 */
export function partsMagnet(p: OsvacParams, o: BuildOptions = {}): Part[] {
  const s = { ...DEFAULT_MAGNET, ...o.magnet };
  if (!s.adapter && !s.coupling) s.adapter = s.coupling = true;
  const osvac = !!o.magnetOsvac;
  const plate = osvac || s.hoseMode === 'small';
  const bed = magnetBed(s);
  const both = s.adapter && s.coupling;
  const place = (sh: Shape3D, at: [number, number, number], rot: number) => (rot ? sh.rotate(rot, [0, 0, 0], [0, 0, 1]) : sh).translate(at) as Shape3D;
  const dM = { kind: 'magnet', mag: s.magnet };
  const dC = { ...dM, hose: s.hose, fit: s.fitGap };
  const dT = { ...dM, hose: s.hose, pitch: s.pitch, hand: s.hand };
  const obj = both ? { object: plate ? (osvac ? 'Anschlussplatte' : 'Schlauchplatte') : 'Schlauchkupplung' } : {};
  const out: Part[] = [];
  // Schnitt in der Vorschau je Teil durch seine eigene Achse (die Teile liegen diagonal nebeneinander)
  const cutA: SectionCut = { p: bed.adapter, n: [0, 1, 0] };
  const cutC: SectionCut = { p: bed.coupling, n: [0, 1, 0] };
  if (s.adapter)
    out.push(part('Maschinenadapter', 2, { ...dM, stutzen: s.stutzen, depth: s.depth, gap: s.pipeGap, at: bed.adapter }, () => place(magnetAdapter(s), bed.adapter, 0), { cut: cutA }));
  if (s.coupling && !plate)
    out.push(
      part('Schlauchkupplung', 1.5, { ...dC, at: bed.coupling, rot: bed.rot }, () => place(magnetCoupling(s), bed.coupling, bed.rot), { ...obj, cut: cutC }),
      part('Gewinde', 1.5, { ...dT, at: bed.coupling, rot: bed.rot }, () => place(magnetThread(s), bed.coupling, bed.rot), { ...obj, volumeOffset: magnetThreadOverlap(s), cut: cutC }),
    );
  if (s.coupling && plate) out.push(...platePartsAll(p, s, osvac, bed, obj, o));
  return out;
}

/** Magnetplatte mit Anschlüssen (und Verschlusskappen) an ihrer Stelle auf dem Druckbett */
function platePartsAll(p: OsvacParams, s: MagnetSpec, osvac: boolean, bed: ReturnType<typeof magnetBed>, obj: PartExtra, o: BuildOptions): Part[] {
  const W = p.generalMaterialWidth;
  const L = magnetPortLayout(W, s, osvac);
  if (!L.fits)
    throw new UserError(
      L.list.length > 1
        ? `Die beiden Anschlüsse passen mit genug Abstand nicht nebeneinander auf die Platte (${Math.round(L.width)} mm breit, höchstens ${2 * MAG.flangeR} mm). Bitte einen kleineren Durchmesser wählen.`
        : 'Der Anschluss ist zu groß für die Platte. Bitte einen kleineren Durchmesser wählen.',
    );
  const lay = magnetLayout(s);
  const pp: PlatePort[] = L.list.map((q, i) => ({ x: L.xs[i], rIn: q.d / 2, rOut: q.d / 2 + (q.t === 'H' ? W : PLATE.wall) }));
  const zTop = plateTubeTop(lay, pp);
  const dP = { kind: 'magnetPlate', mag: s.magnet, fit: s.fitGap, ports: pp, zTop };
  // alles in Plattenkoordinaten bauen, dann wie die Kupplung auf das Druckbett (Lage und Drehung) setzen
  const at = bed.coupling, rot = bed.rot;
  const onBed = (sh: Shape3D) => (rot ? sh.rotate(rot, [0, 0, 0], [0, 0, 1]) : sh).translate(at) as Shape3D;
  const bedKey = { at, rot };
  // Schnitt: eine Ebene durch die Plattenmitte und die Achsen aller Anschlüsse (sie liegen in Plattenkoordinaten auf y = 0)
  const a = (rot * Math.PI) / 180;
  const cut: SectionCut = { p: at, n: [-Math.sin(a), Math.cos(a), 0] };
  const moved = (q: Part, v: [number, number, number], tag: string): Part => ({
    ...q, name: tag ? `${q.name} ${tag}` : q.name, key: JSON.stringify([JSON.parse(q.key), v, bedKey]), make: () => onBed(q.make().translate(v) as Shape3D), ...obj, cut,
  });
  const out: Part[] = [part(osvac ? 'Anschlussplatte' : 'Schlauchplatte', 2, { ...dP, ...bedKey }, () => onBed(magnetPlate(s, pp, zTop)), { ...obj, cut })];
  const pipeFor = (d: number): PipeSpec => ({ d1Inner: d, d2Inner: d, length: 0, wall: PLATE.wall, transition: OSVAC_TRANSITION, screwHoles: false });
  const noSupport: BuildOptions = { text: o.text, knurl: o.knurl, supports: false };
  L.list.forEach((q, i) => {
    const tag = L.list.length > 1 ? String(i + 1) : '';
    const x = L.xs[i];
    const pq = portParams(p, q.d);
    const o2 = { ...noSupport };
    if (q.t === 'F') {
      const v: [number, number, number] = [x, 0, zTop + pq.femaleHeight + OSVAC_TRANSITION];
      for (const r of [...female(pq, o2), part('Übergang', 0.1, { kind: 'magnetF', ...dAll(pq) }, () => pipeTransition(q.d / 2, q.d / 2 + W, pipeFor(q.d)).translate([0, 0, -pq.femaleHeight]))])
        out.push(moved(r, v, tag));
    } else if (q.t === 'M') {
      const v: [number, number, number] = [x, 0, zTop + pq.maleHeight + OSVAC_TRANSITION];
      for (const r of [part('Male', 9, { ...dM(pq, o2), rot: 'flip' }, () => flippedMale(pq, o2)), part('Übergang', 0.1, { kind: 'magnetM', ...dAll(pq) }, () => pipeTransition(pq.maleDiameterInner / 2, pq.maleDiameterOuter / 2, pipeFor(q.d)).translate([0, 0, -pq.maleHeight]))])
        out.push(moved(r, v, tag));
    } else out.push(...hosePortParts(pq, q.hand, zTop, { text: o.text, knurl: o.knurl }).map((r) => moved(r, [x, 0, 0], tag)));
  });
  // Verschlusskappen neben der Platte: Stopfen (geschlossener Stecker) für eine Kupplung, Kappe (geschlossene Kupplung) für einen Stecker
  const caps = L.list.map((q, i) => ({ q, i })).filter(({ q }) => q.cap && q.t !== 'H');
  // Lage der Kappen: mit Adapter in den freien Ecken der Diagonale, sonst rechts und links neben der Platte
  const lugOut = MAG.R + magnetLayout(s).lugR;
  const capAt = (k: number, r: number): [number, number, number] => {
    const D = lugOut + 4 + r;
    if (s.adapter) {
      const a = Math.abs(at[0]);
      const c = Math.max(r + 2, Math.sqrt(Math.max(0, (D * D - 2 * a * a) / 2)));
      return k === 0 ? [c, -c, 0] : [-c, c, 0];
    }
    return [k === 0 ? at[0] + D : at[0] - D, at[1], 0];
  };
  caps.forEach(({ q, i }, k) => {
    const pq = portParams(p, q.d);
    const rCap = q.d / 2 + W + 1.5;
    const capObj = { object: `Verschlusskappe ${caps.length > 1 ? i + 1 : ''}`.trim() };
    const c = capAt(k, rCap);
    const h = (q.t === 'F' ? pq.maleHeight : pq.femaleHeight) + OSVAC_TRANSITION;
    const v: [number, number, number] = [c[0], c[1], h + PLATE.wall];
    const mv = (r: Part): Part => ({ ...r, name: `${r.name} Kappe${caps.length > 1 ? ` ${i + 1}` : ''}`, key: JSON.stringify([JSON.parse(r.key), v]), make: () => r.make().translate(v) as Shape3D, ...capObj, cut: { p: c, n: [0, 1, 0] }, ...(r.seal ? { seal: { ...r.seal, cap: true } } : {}) });
    const floor = part('Kappenboden', 0.1, { kind: 'magnetCap', d: q.d, W, t: q.t }, () => capFloor(q.d / 2 + PLATE.wall, -h - PLATE.wall));
    if (q.t === 'F')
      out.push(...[part('Male', 9, { ...dM(pq, noSupport), rot: 'flip' }, () => flippedMale(pq, noSupport)), part('Übergang', 0.1, { kind: 'magnetM', ...dAll(pq) }, () => pipeTransition(pq.maleDiameterInner / 2, pq.maleDiameterOuter / 2, pipeFor(q.d)).translate([0, 0, -pq.maleHeight])), floor].map(mv));
    else
      out.push(...[...female(pq, noSupport), part('Übergang', 0.1, { kind: 'magnetF', ...dAll(pq) }, () => pipeTransition(q.d / 2, q.d / 2 + W, pipeFor(q.d)).translate([0, 0, -pq.femaleHeight])), floor].map(mv));
  });
  return out;
}

/**
 * Schlauch-Anschluss auf der Platte (Achse x = 0, Plattenkoordinaten): unten fest der untere Drehring mit dem Kopf des
 * Schlauchteils (sitzt auf dem Rohr der Platte, Oberkante zTop), darüber drehbar der obere Ring und ein Becher mit dem
 * Innengewinde von osVAC neo, umgedreht (Öffnung oben, ohne Knickschutz).
 */
function hosePortParts(pq: OsvacParams, hand: 'left' | 'right', zTop: number, o: BuildOptions): Part[] {
  const cg = hoseCupGrip(pq);
  const W = pq.generalMaterialWidth, rH = pq.hoseDiameterInner / 2, rO = rH + W;
  const g = Math.min(pq.slipRingGapSize, SWIVEL_PRINT.gapMax);
  const prof = swivelPrintProfile(W, false, g);
  const lowBot = Math.min(...prof.bottom.map(([, z]) => z)); // Unterkante des unteren Rings (am Schulterkegel außen)
  const zO = zTop - 0.5 - lowBot; // Oberkante des oberen Rings
  const zH = zO - prof.below; // Oberkante Schlauchkopf
  const k = { kind: 'magnetHose', ...dH(pq), zTop };
  const t = (sh: Shape3D, z: number) => sh.translate([0, 0, z]) as Shape3D;
  // Becher: Schlauchteil umgedreht (Kopf unten auf dem oberen Ring), Schulter außen aufgefüllt (sonst Überhang)
  const flip = (sh: Shape3D) => t(sh.rotate(180, [0, 0, 0], [1, 0, 0]) as Shape3D, zO);
  const zs = -(rO - rH - 1.743) / HEAD_CONE;
  const cup = () => flip(hoseBody(pq, 'plain').fuse(revolveProfile([rH + 1.743, 0], [L(rO, 0), L(rO, zs - 0.1), L(rO - 0.01, zs - 0.1)])) as Shape3D);
  return [
    part('Drehring unten', 0.1, { ...k, swivel: 'print' }, () => t(swivelPrintBottom(pq, false), zO)),
    part('Schlauchkopf', 0.3, k, () => t(hoseBody(pq, 'plain'), zH).intersect(revolveProfile([rH, zTop - 1], [L(rO + 0.01, zTop - 1), L(rO + 0.01, zH + 1), L(rH, zH + 1)])) as Shape3D),
    part('Drehring oben', 0.1, { ...k, swivel: 'print' }, () => t(swivelPrintTop(pq, false), zO)),
    part('Schlauchbecher', 0.5, k, cup),
    ...knurlPart('Rändelung Schlauchbecher', o, k, () => t(cg.knurl(), zO), cg.knurlOverlap),
    part('Textfeld Schlauchbecher', 7, { ...k, text: o.text }, () => t(cg.fields(o), zO), { volumeOffset: cg.fieldsOverlap }),
    part('Gewinde', 8, { ...k, hand }, () => flip(hoseThreadBody(pq, false, hand))),
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
export const buildFree = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsFree(p, o));
export const buildGate = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsGate(p, o));
export const buildHelper = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsHelper(p, o));
export const buildBleed = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsBleed(p, o));
export const buildMagnet = (p: OsvacParams, o: BuildOptions = {}) => buildAll(partsMagnet(p, o));
