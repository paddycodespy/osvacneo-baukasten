/**
 * Prüft die Zwischenspeicher-Schlüssel: Körper mit gleichem Schlüssel aus verschiedenen Adaptertypen
 * müssen identisch sein (npm run test:keys).
 */
import opencascade from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { KINDS } from '../src/lib/osvac/catalog';
const here = path.dirname(fileURLToPath(import.meta.url));
setOC(await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(here, '../public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const p = deriveParams({ maleDiameterInner: 25, femaleDiameterInner: 32, hoseDiameterInner: 36 });
const pipe = { d1Inner: 29.3, d2Inner: 33.3, length: 30, wall: 3, transition: 8, screwHoles: true };
const by = new Map<string, { kind: string; make: () => any }[]>();
for (const o of [{ text: false, knurl: false, supports: true }, { text: true, knurl: true, supports: true }])
  for (const k of KINDS) for (const q of k.parts!(p, { ...o, pipe })) { const a = by.get(q.key) ?? []; a.push({ kind: k.id, make: q.make }); by.set(q.key, a); }
let bad = 0;
for (const [key, a] of by) {
  const kinds = [...new Set(a.map((x) => x.kind))];
  if (kinds.length < 2) continue;
  const sig = kinds.map((kd) => { const s = a.find((x) => x.kind === kd)!.make(); const b = s.boundingBox.bounds.flat().map((v: number) => v.toFixed(2)).join(','); const v = measureVolume(s).toFixed(0); s.delete(); return v + '|' + b; });
  const same = sig.every((x) => x === sig[0]);
  if (!same) bad++;
  console.log(same ? 'gleich ' : 'FEHLER ', JSON.parse(key)[0], kinds.join(','), same ? '' : sig.join('  '));
}
console.log('Kollisionen', bad);
process.exit(bad ? 1 : 0);
