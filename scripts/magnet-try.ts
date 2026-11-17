/** Probelauf Magnetkupplung: baut alle Körper wie die App (auf dem Druckbett) und schreibt STL nach out/ */
import opencascade from 'replicad-opencascadejs';
import { setOC, type Shape3D } from 'replicad';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { partsMagnet } from '../src/lib/osvac/assemblies';
import { magnetLayout, magnetDisks, magnetBed, DEFAULT_MAGNET, type MagnetSpec } from '../src/lib/osvac/magnet';

const here = path.dirname(fileURLToPath(import.meta.url));
setOC(await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) }));
const out = process.argv[2] ?? path.join(here, '../out');
fs.mkdirSync(out, { recursive: true });
const extra = JSON.parse(process.argv[3] ?? '{}');
const s: MagnetSpec = { ...DEFAULT_MAGNET, ...extra };
const lay = magnetLayout(s), bed = magnetBed(s);
console.log(JSON.stringify({ ...lay, m: undefined }), JSON.stringify(bed));
for (const q of partsMagnet(deriveParams({}), { magnet: s })) {
  const t0 = Date.now();
  const sh = q.make() as Shape3D;
  console.log(q.name, Date.now() - t0, 'ms');
  fs.writeFileSync(path.join(out, `${q.name}.stl`), Buffer.from(await sh.blobSTL({ tolerance: 0.02, angularTolerance: 0.1 }).arrayBuffer()));
}
// Magnete in Lage (nur zum Ansehen)
const disks = (z: number, at: [number, number, number], rot: number) => magnetDisks(lay, z).map((d) => (rot ? d.rotate(rot, [0, 0, 0], [0, 0, 1]) : d).translate(at) as Shape3D);
let all = [...(s.adapter ? disks(lay.zA, bed.adapter, 0) : []), ...(s.coupling ? disks(lay.zC, bed.coupling, bed.rot) : [])];
let c = all[0]; for (const d of all.slice(1)) c = c.fuse(d) as Shape3D;
fs.writeFileSync(path.join(out, 'Magnete.stl'), Buffer.from(await c.blobSTL({ tolerance: 0.02, angularTolerance: 0.1 }).arrayBuffer()));
