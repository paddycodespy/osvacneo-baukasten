import opencascade from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { KINDS } from '../src/lib/osvac/catalog';
const here = path.dirname(fileURLToPath(import.meta.url));
setOC(await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(here, '../public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const cases = [
  
  
  { m: 32, f: 32, h: 27, W: 7, g: 0.5, text: true },
];
const pipes = [{ d1Inner: 29.3, d2Inner: 33.3, length: 30, wall: 3, transition: 8, screwHoles: true }, { d1Inner: 50, d2Inner: 50, length: 15, wall: 2, transition: 8, screwHoles: false }];
let fail = 0;
for (const c of cases) for (const k of KINDS) {
  if (!k.build) continue;
  const p = deriveParams({ maleDiameterInner: c.m, femaleDiameterInner: c.f, hoseDiameterInner: c.h, generalMaterialWidth: c.W, maleFemaleGapSize: c.g });
  for (const pipe of k.machine ? pipes : [undefined]) {
    const t = Date.now();
    try {
      const bodies = k.build(p, { text: c.text, pipe });
      const vols = bodies.map((b) => Math.round(measureVolume(b.shape)));
      const bad = vols.some((v) => !(v > 0));
      if (bad) fail++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${k.id.padEnd(10)} M${c.m} F${c.f} H${c.h} W${c.W} g${c.g} text=${c.text} ${pipe ? 'pipe' + pipe.d1Inner : ''} ${Date.now() - t}ms vols=${vols.join(',')}`);
    } catch (e) { fail++; console.log(`FAIL ${k.id} M${c.m} F${c.f} H${c.h} W${c.W}: ${e}`); }
  }
}
console.log('failures', fail);
