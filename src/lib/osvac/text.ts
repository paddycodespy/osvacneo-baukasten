/**
 * Beschriftung auf Zylinderflächen (Gravur/Prägung), Glyphe für Glyphe tangential platziert.
 */
import { drawText, loadFont, type Shape3D } from 'replicad';
import { tangentPlane, deg } from './geom';
export { tangentPlane };

type OTFont = Awaited<ReturnType<typeof loadFont>>;
let font: OTFont | null = null;
export const FONT_FAMILY = 'osvac';

export async function initFont(src: string | ArrayBuffer): Promise<void> {
  font = await loadFont(src, FONT_FAMILY);
}
export const fontReady = () => font !== null;

export interface CylText {
  text: string;
  /** Schrifthöhe (fontSize, entspricht ungefähr der Versalhöhe / 0.72) */
  size: number;
  /** Mittelwinkel in Grad */
  centerDeg: number;
  /** z der Grundlinie */
  baselineZ: number;
}

/**
 * Erzeugt einen Werkzeugkörper für Text auf einem Zylinder mit Radius rSurface.
 * depth > 0: Körper reicht von rSurface + 0.2 bis rSurface - depth (für cut = Gravur).
 */
export function textOnCylinder(rSurface: number, spec: CylText, depth: number): Shape3D | null {
  if (!font) return null;
  const { text, size, centerDeg, baselineZ } = spec;
  const total = font.getAdvanceWidth(text, size);
  const glyphs: Shape3D[] = [];
  const over = 0.2;
  const rPlane = rSurface + over;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch.trim() === '') continue;
    const x0 = font.getAdvanceWidth(text.slice(0, i), size);
    const gw = font.getAdvanceWidth(ch, size);
    // Glyphenmitte auf dem Umfang bei Radius rSurface
    const s = x0 + gw / 2 - total / 2;
    const th = centerDeg + deg(s / rSurface);
    let glyph;
    try {
      // Achtung: startX von drawText wirkt mit umgekehrtem Vorzeichen → explizit verschieben
      glyph = drawText(ch, { startX: 0, startY: 0, fontSize: size, fontFamily: FONT_FAMILY }).translate(-gw / 2, 0);
    } catch {
      continue;
    }
    const plane = tangentPlane(rPlane, th, baselineZ);
    const solid = glyph.sketchOnPlane(plane).extrude(-(depth + over)) as Shape3D;
    glyphs.push(solid);
  }
  // Glyphen vereinigen (ein Compound als Werkzeug ist in OpenCascade bei Überlappung nicht robust)
  let result: Shape3D | null = null;
  for (const g of glyphs) result = result ? (result.fuse(g) as Shape3D) : g;
  return result;
}

/** Breite eines Textes in mm (für Layout). */
export function textWidth(text: string, size: number): number {
  return font ? font.getAdvanceWidth(text, size) : text.length * size * 0.6;
}

/** Text-Werkzeuge nacheinander aus einem Körper schneiden. */
export function engrave(body: Shape3D, tools: (Shape3D | null)[]): Shape3D {
  for (const t of tools) if (t) body = body.cut(t);
  return body;
}

/**
 * Text auf einer ebenen, senkrechten Fläche, die im Abstand r von der Achse in Richtung thDeg nach außen zeigt
 * (gelesen von außen). Mitte des Textes bei z (Mitte der Versalhöhe). Werkzeugkörper zum Gravieren (depth tief).
 */
export function textOnFlat(r: number, thDeg: number, zMid: number, text: string, size: number, depth: number): Shape3D | null {
  if (!font) return null;
  const total = font.getAdvanceWidth(text, size);
  const over = 0.2;
  let d;
  try {
    d = drawText(text, { startX: 0, startY: 0, fontSize: size, fontFamily: FONT_FAMILY }).translate(-total / 2, 0);
  } catch {
    return null;
  }
  return d.sketchOnPlane(tangentPlane(r + over, thDeg, zMid - 0.36 * size)).extrude(-(depth + over)) as Shape3D;
}
