/**
 * Kleine Geometrie-Helfer auf Basis von replicad.
 * Konvention für alle Module: Achse = Z, Oberkante des Moduls bei z = 0,
 * das Modul erstreckt sich nach unten (negative z). Profile werden als (r, z) angegeben.
 */
import { draw, Plane, type Shape3D, type Drawing } from 'replicad';

export type P2 = [number, number];

/** Polygon/Profil-Segmente in der r-z-Ebene. */
export type Seg =
  | { t: 'L'; p: P2 } // Linie zum Punkt
  | { t: 'A'; p: P2; c: P2 } // Kreisbogen zum Punkt um Mittelpunkt c (kürzerer Bogen)
  | { t: 'M'; p: P2; m: P2 }; // Kreisbogen zum Punkt durch Zwischenpunkt m

export const L = (r: number, z: number): Seg => ({ t: 'L', p: [r, z] });
export const A = (r: number, z: number, cr: number, cz: number): Seg => ({ t: 'A', p: [r, z], c: [cr, cz] });

function arcMid(from: P2, to: P2, c: P2, preferFar = false): P2 {
  const a1 = Math.atan2(from[1] - c[1], from[0] - c[0]);
  let a2 = Math.atan2(to[1] - c[1], to[0] - c[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (preferFar) d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
  const am = a1 + d / 2;
  const R = Math.hypot(from[0] - c[0], from[1] - c[1]);
  return [c[0] + R * Math.cos(am), c[1] + R * Math.sin(am)];
}

/** Baut eine geschlossene 2D-Zeichnung aus Startpunkt + Segmenten. */
export function drawPath(start: P2, segs: Seg[]): Drawing {
  let pen = draw(start);
  let cur = start;
  for (const s of segs) {
    if (s.t === 'L') pen = pen.lineTo(s.p);
    else if (s.t === 'M') pen = pen.threePointsArcTo(s.p, s.m);
    else pen = pen.threePointsArcTo(s.p, arcMid(cur, s.p, s.c));
    cur = s.p;
  }
  return pen.close();
}

/** Rotationskörper aus (r,z)-Profil um die Z-Achse (voller Umlauf). */
export function revolveProfile(start: P2, segs: Seg[]): Shape3D {
  return drawPath(start, segs).sketchOnPlane('XZ').revolve() as Shape3D;
}

/** Teil-Rotationskörper: Profil um Z von Winkel a0 bis a1 (Grad, mathematisch positiv). */
export function revolveProfileSector(start: P2, segs: Seg[], a0: number, a1: number): Shape3D {
  const s = drawPath(start, segs).sketchOnPlane('XZ').revolve([0, 0, 1], { angle: a1 - a0 }) as Shape3D;
  // replicad dreht von +X aus in mathematisch negativer Richtung für die XZ-Skizze → wir prüfen über bbox nicht,
  // sondern normieren: Sektor wird um a0 bzw. a1 gedreht (siehe sectorSign).
  return s.rotate(sectorSign() > 0 ? a0 : a1, [0, 0, 0], [0, 0, 1]);
}

let _sectorSign = 0;
/** Ermittelt einmalig, in welche Drehrichtung revolve() für XZ-Skizzen läuft. */
export function sectorSign(): number {
  if (_sectorSign) return _sectorSign;
  const s = draw([10, 0]).lineTo([11, 0]).lineTo([11, 1]).lineTo([10, 1]).close().sketchOnPlane('XZ')
    .revolve([0, 0, 1], { angle: 90 }) as Shape3D;
  const bb = s.boundingBox.bounds;
  _sectorSign = bb[1][1] > 1 ? 1 : -1; // y-max > 0 → positive Drehung
  s.delete?.();
  return _sectorSign;
}

/** Zeichnung in der XY-Ebene bei Höhe z0 extrudieren (nach unten um h > 0). */
export function extrudeDown(d: Drawing, zTop: number, h: number): Shape3D {
  return d.sketchOnPlane('XY', zTop - h).extrude(h) as Shape3D;
}

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** Ebene tangential an einen Zylinder (Radius r) bei Winkel th (Grad), Ursprung auf Höhe z.
 *  x-Richtung = Umfangsrichtung (zunehmender Winkel), y = +Z, Normale = radial nach außen. */
export function tangentPlane(r: number, thDeg: number, z: number): Plane {
  const t = rad(thDeg);
  return new Plane([r * Math.cos(t), r * Math.sin(t), z], [-Math.sin(t), Math.cos(t), 0], [Math.cos(t), Math.sin(t), 0]);
}

/**
 * Draufsicht-Kontur eines "Kanals" mit parallelen Wänden (Breite w, symmetrisch zur +X-Achse),
 * begrenzt außen durch den Kreis Rb (Rückwand) mit Ausrundungen f an den Rückwand-Ecken.
 * Innen beginnt die Kontur bei rIn (z. B. innerhalb der Bohrung).
 * Optional: Ausrundung fm der Mündung (Kante Bohrung rBore ↔ Seitenwand).
 */
export function channelOutline(w: number, Rb: number, f: number, rIn: number, mouth?: { rBore: number; fm: number }): Drawing {
  const h = w / 2;
  // Ecke Rückwand (oben, y>0): Kreis-Mittelpunkt
  const cy = h - f;
  const cx = Math.sqrt((Rb - f) ** 2 - cy ** 2);
  const tWall: P2 = [cx, h];
  const tBack: P2 = [(cx * Rb) / (Rb - f), (cy * Rb) / (Rb - f)];
  const segs: Seg[] = [];
  let start: P2;
  if (mouth) {
    const { rBore, fm } = mouth;
    const my = h + fm;
    const mx = Math.sqrt((rBore + fm) ** 2 - my ** 2);
    const mWall: P2 = [mx, h];
    const mBore: P2 = [(mx * rBore) / (rBore + fm), (my * rBore) / (rBore + fm)];
    start = [rIn, -mBore[1]];
    segs.push(L(mBore[0], -mBore[1]));
    segs.push(A(mWall[0], -h, mx, -my));
    segs.push(L(tWall[0], -h));
    segs.push(A(tBack[0], -tBack[1], cx, -cy));
    segs.push({ t: 'A', p: [tBack[0], tBack[1]], c: [0, 0] });
    segs.push(A(tWall[0], h, cx, cy));
    segs.push(L(mWall[0], h));
    segs.push(A(mBore[0], mBore[1], mx, my));
    segs.push(L(rIn, mBore[1]));
  } else {
    start = [rIn, -h];
    segs.push(L(tWall[0], -h));
    segs.push(A(tBack[0], -tBack[1], cx, -cy));
    segs.push({ t: 'A', p: [tBack[0], tBack[1]], c: [0, 0] });
    segs.push(A(tWall[0], h, cx, cy));
    segs.push(L(rIn, h));
  }
  return drawPath(start, segs);
}

/** Kreisring-Sektor (Draufsicht) zwischen Radien r0<r1 und Winkeln a0<a1 (Grad). */
export function annularSector(r0: number, r1: number, a0: number, a1: number): Drawing {
  const p = (r: number, a: number): P2 => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
  const am = (a0 + a1) / 2;
  return draw(p(r0, a0))
    .lineTo(p(r1, a0))
    .threePointsArcTo(p(r1, a1), p(r1, am))
    .lineTo(p(r0, a1))
    .threePointsArcTo(p(r0, a0), p(r0, am))
    .close();
}

/** Rändelung: n schmale Dreieckszähne (Basisbreite bw, Höhe h) auf Radius r0, innen offen bis rIn.
 *  Zahnspitzen bei i * 360/n (wie im Original), dazwischen glatter Grund. */
export function knurlRing(n: number, r0: number, h: number, rIn: number, bw = 0.55): Drawing {
  const pts: P2[] = [];
  const hw = bw / 2 / r0;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([r0 * Math.cos(a - hw), r0 * Math.sin(a - hw)]);
    pts.push([(r0 + h) * Math.cos(a), (r0 + h) * Math.sin(a)]);
    pts.push([r0 * Math.cos(a + hw), r0 * Math.sin(a + hw)]);
  }
  let pen = draw(pts[0]);
  for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
  const star = pen.close();
  return star.cut(drawCircleSafe(rIn));
}

import { drawCircle } from 'replicad';
function drawCircleSafe(r: number): Drawing {
  return drawCircle(r);
}
