/**
 * Dichtring aus TPU für die Dichtnut der Kupplung: Rotationskörper aus dem Querschnitt von sealRing() (seal.ts).
 * Liegt mit dem Boden auf z = 0 (so wird er gedruckt), Achse = Z.
 */
import type { Shape3D } from 'replicad';
import { revolveProfile, L, A } from './geom';
import type { SealRing } from './seal';

export function sealRingSolid(r: SealRing): Shape3D {
  return revolveProfile([r.ri, 0], [
    L(r.r1, 0),
    L(r.T[0], r.T[1]),
    A(r.J[0], r.J[1], r.cx, r.cz),
    L(r.rb, r.h - r.ch),
    L(r.rb - r.ch, r.h),
    L(r.ri + r.ch, r.h),
    L(r.ri, r.h - r.ch),
  ]);
}
