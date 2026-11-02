/**
 * Griffbereich wie im Original: 100 Rändelzähne (0.475 hoch) zwischen zTop und zBot,
 * erhabene Felder (+0.5 mm) mittig im Griffbereich, darüber/darunter läuft die Rändelung durch.
 *
 * Layouts (aus den Fusion-Exporten vermessen, Schrift Arial/Liberation Sans Regular):
 *  - 'full'       (Female, Schlauchteil): Feld A 40×16 bei 270° mit „osVAC neo“ + Kennung, Band B 48×6 bei 90°
 *  - 'housing'    (Gehäuse MxxHyy):       Feld A 40×6 bei 270° nur mit „osVAC neo“, kein Band
 *  - 'housedHose' (Schlauchteil MxxHyy):  Feld A 40×10 bei 270° nur mit Kennung, Band B 48×6 bei 90°
 */
import type { Shape3D } from 'replicad';
import { extrudeDown, annularSector, knurlRing, deg } from './geom';
import { textOnCylinder, engrave } from './text';

export type GripLayout = 'full' | 'housing' | 'housedHose';

const FIELD_A_W = 40;
const FIELD_B_W = 48;
const FIELD_B_H = 6;
const FIELD_A_H: Record<GripLayout, number> = { full: 16, housing: 6, housedHose: 10 };

/** Schriftgrößen (fontSize) und Grundlinien relativ zur Feldmitte – gemessen am Original. */
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

export function addGrip(
  body: Shape3D,
  r: number,
  zTop: number,
  zBot: number,
  o: { knurl?: boolean; layout?: GripLayout } = {},
): Shape3D {
  const f = fields(r, zTop, zBot, o.layout ?? 'full');
  if (o.knurl !== false) body = body.fuse(extrudeDown(knurlRing(100, r, 0.475, r - 0.3), zTop, zTop - zBot));
  body = body.fuse(extrudeDown(annularSector(r - 0.3, r + 0.5, f.a.c - f.a.half, f.a.c + f.a.half), f.a.z0, f.hA));
  if (f.b) body = body.fuse(extrudeDown(annularSector(r - 0.3, r + 0.5, f.b.c - f.b.half, f.b.c + f.b.half), f.b.z0, FIELD_B_H));
  return body;
}

export function addLabels(body: Shape3D, r: number, zTop: number, zBot: number, label: string, layout: GripLayout = 'full'): Shape3D {
  const f = fields(r, zTop, zBot, layout);
  const rT = r + 0.5;
  const t = (text: string, size: number, c: number, dz: number) => textOnCylinder(rT, { text, size, centerDeg: c, baselineZ: f.zc + dz }, 0.5);
  const tools =
    layout === 'full'
      ? [t('osVAC neo', TEXT.small, 270, TEXT.fullLine1), t(label, TEXT.label, 270, TEXT.fullLine2)]
      : layout === 'housing'
        ? [t('osVAC neo', TEXT.small, 270, TEXT.band)]
        : [t(label, TEXT.labelMid, 270, TEXT.midLabel)];
  if (f.b) tools.push(t(`osVAC neo  ${label}`, TEXT.small, 90, TEXT.band));
  return engrave(body, tools);
}
