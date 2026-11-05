/**
 * Node-Testlauf: baut Teile und schreibt STL/STEP nach out/<name>.
 * usage: npx tsx scripts/build-ref.ts <part> <M> <F> <H> [--notext] [--w=9]
 */
import opencascade from 'replicad-opencascadejs';
import { setOC, makeCompound } from 'replicad';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import * as asm from '../src/lib/osvac/assemblies';

const here = path.dirname(fileURLToPath(import.meta.url));
const OC = await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) });
setOC(OC);
const args = process.argv.slice(2);
const [part, M, F, H] = args;
const notext = args.includes('--notext');
if (!notext) await initFont(fs.readFileSync(path.join(here, '../public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const wArg = args.find((a) => a.startsWith('--w='));
const W = wArg ? +wArg.slice(4) : 7;
const sgArg = args.find((a) => a.startsWith('--sg='));
const SG = sgArg ? +sgArg.slice(5) : 0.3;
const gArg = args.find((a) => a.startsWith('--g='));
const G = gArg ? +gArg.slice(4) : 0.2;
// --pipe=d1,d2,Länge,Wand,Übergang[,0 = ohne Schraubenlöcher]
const pipeArg = args.find((a) => a.startsWith('--pipe='));
const pv = pipeArg ? pipeArg.slice(7).split(',').map(Number) : undefined;
const pipe = pv ? { d1Inner: pv[0], d2Inner: pv[1], length: pv[2], wall: pv[3], transition: pv[4], screwHoles: pv[5] !== 0 } : undefined;
const p = deriveParams({ maleDiameterInner: +M, femaleDiameterInner: +F, hoseDiameterInner: +H, generalMaterialWidth: W, slipRingGapSize: SG, maleFemaleGapSize: G });
const fn = (asm as Record<string, unknown>)['build' + part] as (p: unknown, o: unknown) => asm.Body[];
const t0 = Date.now();
const bodies = fn(p, { text: !notext, pipe });
console.log('build ms', Date.now() - t0);
const outDir = path.join(here, '../out');
fs.mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, `${part}_M${M}_F${F}_H${H}${W !== 7 ? '_W' + W : ''}${SG !== 0.3 ? '_SG' + SG : ''}${G !== 0.2 ? '_G' + G : ''}${pv ? '_P' + pv.join('-') : ''}`);
for (const b of bodies) {
  const stl = b.shape.blobSTL({ tolerance: 0.01, angularTolerance: 0.1 });
  fs.writeFileSync(`${base}__${b.name}.stl`, Buffer.from(await stl.arrayBuffer()));
}
const comp = makeCompound(bodies.map((b) => b.shape));
fs.writeFileSync(`${base}.stl`, Buffer.from(await comp.blobSTL({ tolerance: 0.01, angularTolerance: 0.1 }).arrayBuffer()));
console.log('total ms', Date.now() - t0, base);
