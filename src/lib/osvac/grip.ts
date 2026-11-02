/**
 * Griffbereich wie im Original: 100 Rändelzähne (0.475 hoch) zwischen zTop und zBot,
 * Textfeld A (40 mm Bogen, 16 mm hoch) bei 270°, Textband B (48 mm Bogen, 6 mm) bei 90°,
 * beide erhaben (+0.5 mm) und mittig im Griffbereich.
 */
import type { Shape3D } from 'replicad';
import { extrudeDown, annularSector, knurlRing, deg } from './geom';
import { textOnCylinder, engrave } from './text';

const FIELD_A_W = 40;
const FIELD_A_H = 16;
const FIELD_B_W = 48;
const FIELD_B_H = 6;

function fields(r: number, zTop: number, zBot: number) {
  const zc = (zTop + zBot) / 2;
  return {
    zc,
    a: { c: 270, half: deg(FIELD_A_W / 2 / r), z0: zc + FIELD_A_H / 2, z1: zc - FIELD_A_H / 2 },
    b: { c: 90, half: deg(FIELD_B_W / 2 / r), z0: zc + FIELD_B_H / 2, z1: zc - FIELD_B_H / 2 },
  };
}

export function addGrip(body: Shape3D, r: number, zTop: number, zBot: number, o: { clearFieldA?: boolean; knurl?: boolean } = {}): Shape3D {
  const f = fields(r, zTop, zBot);
  const fitA = zTop - zBot >= FIELD_A_H + 0.5;
  if (o.knurl !== false) {
    let knurl = extrudeDown(knurlRing(100, r, 0.475, r - 0.3), zTop, zTop - zBot);
    if (o.clearFieldA && fitA) {
      knurl = knurl.cut(extrudeDown(annularSector(r - 0.5, r + 1, f.a.c - f.a.half, f.a.c + f.a.half), zTop + 0.1, zTop - zBot + 0.2));
    }
    body = body.fuse(knurl);
  }
  if (fitA) body = body.fuse(extrudeDown(annularSector(r - 0.3, r + 0.5, f.a.c - f.a.half, f.a.c + f.a.half), f.a.z0, FIELD_A_H));
  body = body.fuse(extrudeDown(annularSector(r - 0.3, r + 0.5, f.b.c - f.b.half, f.b.c + f.b.half), f.b.z0, FIELD_B_H));
  return body;
}

export function addLabels(body: Shape3D, r: number, zTop: number, zBot: number, label: string): Shape3D {
  const f = fields(r, zTop, zBot);
  const rT = r + 0.5;
  const fitA = zTop - zBot >= FIELD_A_H + 0.5;
  const tools = [
    fitA ? textOnCylinder(rT, { text: 'osVAC neo', size: 5, centerDeg: f.a.c, baselineZ: f.zc + 3.75 }, 0.5) : null,
    fitA ? textOnCylinder(rT, { text: label, size: 10, centerDeg: f.a.c, baselineZ: f.zc - 5.85 }, 0.5) : null,
    textOnCylinder(rT, { text: `osVAC neo  ${label}`, size: 5, centerDeg: f.b.c, baselineZ: f.zc - 1.75 }, 0.5),
  ];
  return engrave(body, tools);
}
