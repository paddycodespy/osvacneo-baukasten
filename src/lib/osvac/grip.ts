/**
 * Griffbereich wie im Original: 100 Rändelzähne (0.475 hoch) zwischen zTop und zBot,
 * erhabene Felder (+0.5 mm) mittig im Griffbereich, darüber/darunter läuft die Rändelung durch.
 *
 * Layouts (aus den Fusion-Exporten vermessen, Schrift Arial/Liberation Sans Regular):
 *  - 'full'       (Female, Schlauchteil): Feld A 40×16 bei 270° mit „osVAC neo“ + Kennung, Band B 48×6 bei 90° mit der Lizenzzeile
 *  - 'housing'    (Gehäuse MxxHyy):       Feld A 40×6 bei 270° nur mit „osVAC neo“, kein Band
 *  - 'housedHose' (Schlauchteil MxxHyy):  Feld A 40×10 bei 270° nur mit Kennung, Band B 48×6 bei 90° mit der Lizenzzeile
 */
import type { Shape3D } from 'replicad';
import { extrudeDown, annularSector, knurlRing, deg, rad } from './geom';
import { textOnCylinder, engrave } from './text';

export type GripLayout = 'full' | 'housing' | 'housedHose';

const FIELD_A_W = 40;
const FIELD_B_W = 48;
const FIELD_B_H = 6;
const FIELD_A_H: Record<GripLayout, number> = { full: 16, housing: 6, housedHose: 10 };

/** Schriftgrößen (fontSize) und Grundlinien relativ zur Feldmitte – gemessen am Original. */
/** Lizenzzeile wie im Original (Band B, Stecker bei 90°). */
export const LICENSE_TEXT = 'CC BY-NC-SA 4.0';

export const TEXT = {
  small: 5.847, // „osVAC neo“, Versalhöhe ≈ 4.0 mm
  label: 11.525, // Kennung im 16-mm-Feld (F32, H36 …)
  labelMid: 8.672, // Kennung im 10-mm-Feld
  fullLine1: 2.94,
  fullLine2: -6.98,
  band: -2.01,
  midLabel: -3.03,
};

function fields(r: number, zTop: number, zBot: number, layout: GripLayout) {
  const zc = (zTop + zBot) / 2;
  const hA = FIELD_A_H[layout];
  return {
    zc,
    hA,
    a: { c: 270, half: deg(FIELD_A_W / 2 / r), z0: zc + hA / 2 },
    b: layout === 'housing' ? null : { c: 90, half: deg(FIELD_B_W / 2 / r), z0: zc + FIELD_B_H / 2 },
  };
}

/**
 * Rändelung des Griffbereichs als eigener Körper (Ring, KNURL_BASE in den Grundkörper greifend). Unter den
 * Textfeldern ist sie ausgespart; die Felder sind ebenfalls eigene Körper (siehe gripFields). Der Slicer
 * verschmilzt alles. So hängt der Grundkörper nicht an Rändelung und Schrift, und die langsamen
 * Schriftschnitte laufen auf den kleinen Feldkörpern parallel zum Rest.
 */
export function gripKnurl(r: number, zTop: number, zBot: number, layout: GripLayout = 'full'): Shape3D {
  const f = fields(r, zTop, zBot, layout);
  let knurl = extrudeDown(knurlRing(100, r, 0.475, r - KNURL_BASE), zTop, zTop - zBot);
  knurl = knurl.cut(extrudeDown(annularSector(r - 0.5, r + 1, f.a.c - f.a.half, f.a.c + f.a.half), f.a.z0, f.hA)) as Shape3D;
  if (f.b) knurl = knurl.cut(extrudeDown(annularSector(r - 0.5, r + 1, f.b.c - f.b.half, f.b.c + f.b.half), f.b.z0, FIELD_B_H)) as Shape3D;
  return knurl;
}

/** Rändelring greift KNURL_BASE in den Grundkörper (Volumen und innere Flächen werden herausgerechnet). */
const KNURL_BASE = 0.3;

/** Doppelt gezähltes Volumen und innere Fläche (Ring-Innenseite + verdeckte Außenfläche des Grundkörpers). */
export function gripKnurlOverlap(r: number, zTop: number, zBot: number, layout: GripLayout = 'full') {
  const f = fields(r, zTop, zBot, layout);
  const h = zTop - zBot;
  const cut = rad(2 * f.a.half) * f.hA + (f.b ? rad(2 * f.b.half) * FIELD_B_H : 0); // Winkel·Höhe der Aussparungen
  const ri = r - KNURL_BASE;
  const ang = 2 * Math.PI * h - cut;
  return { volume: ((r * r - ri * ri) / 2) * ang, area: (r + ri) * ang };
}

/**
 * Erhabene Textfelder (0,5 mm) als eigener Körper, mit eingravierter Schrift (label = null: ohne Schrift).
 * Die Felder greifen 0,05 mm in den Grundkörper ein (dort ist die Rändelung ausgespart), damit die
 * Schrifttaschen einen Boden haben; das doppelt gezählte Volumen liefert gripFieldsOverlap.
 */
const FIELD_OVERLAP = 0.05;

/** Volumen, mit dem die Textfelder in den Grundkörper eingreifen (für die Filamentschätzung abziehen). */
export function gripFieldsOverlap(r: number, zTop: number, zBot: number, layout: GripLayout): number {
  const f = fields(r, zTop, zBot, layout);
  const ring = (half: number, h: number) => rad(2 * half) * ((r * r - (r - FIELD_OVERLAP) ** 2) / 2) * h;
  return ring(f.a.half, f.hA) + (f.b ? ring(f.b.half, FIELD_B_H) : 0);
}

export function gripFields(r: number, zTop: number, zBot: number, layout: GripLayout, label: string | null): Shape3D {
  const f = fields(r, zTop, zBot, layout);
  let a = extrudeDown(annularSector(r - FIELD_OVERLAP, r + 0.5, f.a.c - f.a.half, f.a.c + f.a.half), f.a.z0, f.hA);
  let b = f.b ? extrudeDown(annularSector(r - FIELD_OVERLAP, r + 0.5, f.b.c - f.b.half, f.b.c + f.b.half), f.b.z0, FIELD_B_H) : null;
  if (label !== null) {
    const rT = r + 0.5;
    const t = (text: string, size: number, c: number, dz: number) => textOnCylinder(rT, { text, size, centerDeg: c, baselineZ: f.zc + dz }, 0.5);
    const toolsA =
      layout === 'full'
        ? [t('osVAC neo', TEXT.small, 270, TEXT.fullLine1), t(label, TEXT.label, 270, TEXT.fullLine2)]
        : layout === 'housing'
          ? [t('osVAC neo', TEXT.small, 270, TEXT.band)]
          : [t(label, TEXT.labelMid, 270, TEXT.midLabel)];
    a = engrave(a, toolsA);
    if (b) b = engrave(b, [t(LICENSE_TEXT, TEXT.small, 90, TEXT.band)]);
  }
  return b ? (a.fuse(b) as Shape3D) : a;
}
