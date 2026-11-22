/**
 * Lippendichtung aus TPU für die Dichtnut der Kupplung: Rotationskörper aus dem Querschnitt von sealRing() (seal.ts).
 * Liegt mit dem Boden auf z = 0 (so wird er gedruckt), Achse = Z.
 */
import type { Shape3D } from 'replicad';
import { revolveProfile, L } from './geom';
import type { SealRing } from './seal';

export function sealRingSolid(r: SealRing): Shape3D {
  const [p0, ...rest] = r.pts;
  return revolveProfile(p0, rest.map(([x, z]) => L(x, z)));
}
