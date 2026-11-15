/**
 * Drehring-Lösehilfe nach „osVACneo SlipRingHelper“ von Ludo Kerz (odul), parametrisch nachgebaut.
 * Zwei Halter, in die ein Teil von osVAC neo verdrehsicher gesteckt wird, damit sich ein festsitzender Drehring am
 * Schlauchadapter lösen lässt:
 * - für Kupplungen (FxxHyy): Block mit einem Stecker-Stutzen, dessen drei Rippen bis fast oben laufen (die Kupplung
 *   lässt sich aufstecken, aber nicht drehen). Im Original „SlipRingHelperMale“.
 * - für Stecker (MxxHyy): Block mit Bohrung wie die Kupplung und sechs Taschen für die Bajonettnasen (Stecker passt in
 *   zwei Lagen). Im Original „SlipRingHelperFemale“.
 * Maße wie im Original (Fusion-Export, Parameter mit _Ref aus dem Master):
 * Block (FemaleDiameterOuter + 2) im Quadrat, FemaleHeight hoch; Taschen FemaleBayonetNoseWidth breit, 2 tief, R 1;
 * Bohrung oben R 1; Rippen (FemaleBayonetNoseWidth − 2 · Spalt) breit, BajonettNaseDicke hoch, bis MaleHeight −
 * BajonettNaseMaleRandAbstand, R 1; Stutzen oben innen R 0,725, außen Fase 0,725. Schrift 0,5 tief auf der Vorderseite.
 * Lokales System: Unterseite bei z = 0, Mitte auf der Achse.
 */
import { draw, drawCircle, makeBox, type Drawing, type Shape3D } from 'replicad';
import type { OsvacParams } from './params';
import { revolveProfile, L, A, rad } from './geom';
import { textOnFlat, textWidth } from './text';

/** Kante oben am Stutzen / an der Bohrung */
const R_TOP = 0.725;
const R_BORE = 1;
const R_LOBE = 1;
const TEXT_DEPTH = 0.5;

/** Seitenlänge des Blocks */
export const helperSide = (p: OsvacParams) => p.femaleDiameterOuter + 2;

/**
 * Kreis R mit Ausbuchtungen (Rippen bzw. Taschen) bis Rout, Breite 2·hw mit parallelen Seiten, Mitten bei angles (Grad).
 * Alle Ecken mit fillet gerundet.
 */
function lobed(R: number, Rout: number, hw: number, angles: number[], fillet: number): Drawing {
  const aR = Math.asin(hw / R), aO = Math.asin(hw / Rout);
  const pt = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  const cs = [...angles].sort((a, b) => a - b).map(rad);
  let pen = draw(pt(R, cs[0] - aR));
  cs.forEach((c, i) => {
    pen = pen.lineTo(pt(Rout, c - aO)).threePointsArcTo(pt(Rout, c + aO), pt(Rout, c)).lineTo(pt(R, c + aR));
    const next = i + 1 < cs.length ? cs[i + 1] : cs[0] + 2 * Math.PI;
    const end = pt(R, next - aR);
    if (i + 1 < cs.length) pen = pen.threePointsArcTo(end, pt(R, (c + aR + next - aR) / 2));
    else pen = pen.threePointsArcTo(end, pt(R, (c + aR + next - aR) / 2));
  });
  return pen.close().fillet(fillet);
}

/** Schrift auf der Vorderseite (−y): „osVAC neo“, Größe, „Drehring-Lösehilfe“ (zu breit: kleiner) */
function frontText(body: Shape3D, S: number, H: number, size: string): Shape3D {
  const half = S / 2, mid = H / 2, maxW = S - 6;
  const fit = (t: string, s: number) => Math.min(s, (s * maxW) / textWidth(t, s));
  const lines: [string, number, number][] = [
    ['osVAC neo', mid + 7.5, 5.7],
    [size, mid - 0.05, 11.25],
    ['Drehring-Lösehilfe', mid - 7.5, 5.7],
  ];
  for (const [t, z, s] of lines) {
    const tool = textOnFlat(half, 270, z, t, fit(t, s), TEXT_DEPTH);
    if (tool) body = body.cut(tool);
  }
  return body;
}

const box = (S: number, H: number) => makeBox([-S / 2, -S / 2, 0], [S / 2, S / 2, H]) as unknown as Shape3D;

/** Halter für Kupplungen: Block mit Stecker-Stutzen und drei Rippen. */
export function helperForFemale(p: OsvacParams, text = true): Shape3D {
  const S = helperSide(p), H = p.femaleHeight;
  const ri = p.maleDiameterInner / 2, ro = p.maleDiameterOuter / 2;
  const zTop = H + p.maleHeight, zRib = H + p.maleHeight - p.bajonettNaseMaleRandAbstand;
  const tube = revolveProfile([ri, H - 0.5], [L(ro, H - 0.5), L(ro, zTop - R_TOP), L(ro - R_TOP, zTop), L(ri + R_TOP, zTop), A(ri, zTop - R_TOP, ri + R_TOP, zTop - R_TOP)]);
  const ribs = lobed(ro, ro + p.bajonettNaseDicke, (p.femaleBayonetNoseWidth - 2 * p.maleFemaleGapSize) / 2, [30, 150, 270], R_LOBE)
    .cut(drawCircle(ro - 0.5))
    .sketchOnPlane('XY', H - 0.5)
    .extrude(zRib - H + 0.5) as Shape3D;
  let body = box(S, H).fuse(tube).fuse(ribs) as Shape3D;
  if (text) body = frontText(body, S, H, `F${num(p.maleDiameterInner)}`);
  return body;
}

/** Halter für Stecker: Block mit Bohrung wie die Kupplung und sechs Taschen für die Nasen. */
export function helperForMale(p: OsvacParams, text = true): Shape3D {
  const S = helperSide(p), H = p.femaleHeight;
  const Rm = p.femaleDiameterMiddle / 2;
  const angles = [30, 90, 150, 210, 270, 330];
  const hole = lobed(Rm, Rm + p.bajonettNaseDicke, p.femaleBayonetNoseWidth / 2, angles, R_LOBE).sketchOnPlane('XY', -1).extrude(H + 2) as Shape3D;
  let body = box(S, H).cut(hole) as Shape3D;
  // Bohrung oben rund (alle Kanten der Oberseite im Bereich der Bohrung)
  const lim = Rm + p.bajonettNaseDicke + 0.5;
  body = body.fillet((e) => {
    const a = e.startPoint, b = e.endPoint;
    return Math.abs(a.z - H) < 1e-4 && Math.abs(b.z - H) < 1e-4 && Math.hypot(a.x, a.y) < lim ? R_BORE : 0;
  });
  if (text) body = frontText(body, S, H, `M${num(p.femaleDiameterInner)}`);
  return body;
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10).replace('.', ','));
