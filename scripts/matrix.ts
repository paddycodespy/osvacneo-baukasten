import opencascade from 'replicad-opencascadejs';
import { setOC, getOC, measureVolume } from 'replicad';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { deriveParams } from '../src/lib/osvac/params';
import { initFont } from '../src/lib/osvac/text';
import { KINDS } from '../src/lib/osvac/catalog';
const here = path.dirname(fileURLToPath(import.meta.url));
setOC(await opencascade({ locateFile: (f: string) => path.join(here, '../node_modules/replicad-opencascadejs/dist/', f) }));
await initFont(fs.readFileSync(path.join(here, '../public/fonts/LiberationSans-Regular.ttf')).buffer as ArrayBuffer);
const cases = [
  { m: 25, f: 32, h: 36, W: 7, g: 0.2, sg: 0.3, text: true },
  { m: 32, f: 32, h: 27, W: 7, g: 0.5, sg: 0.4, text: true },
  { m: 40, f: 45, h: 50, W: 9, g: 0.3, sg: 0.6, text: false },
  { m: 25, f: 25, h: 25, W: 9, g: 0.1, sg: 0.2, text: false },
];
const pipes = [
  { d1Inner: 29.3, d2Inner: 33.3, length: 30, wall: 3, transition: 8, screwHoles: true },
  { d1Inner: 50, d2Inner: 50, length: 15, wall: 2, transition: 8, screwHoles: false },
  // Ø38–43 mit Schraubenlöchern: hier scheiterte der Schnitt früher
  { d1Inner: 40, d2Inner: 40, length: 30, wall: 4, transition: 12, screwHoles: true },
];
let fail = 0;
// Jeder Fall in einem eigenen Prozess (lange Läufe in einem WASM-Speicher werden instabil)
const only = process.env.MATRIX_CASE;
if (only === undefined) {
  const { spawnSync } = await import('child_process');
  let total = 0;
  for (let i = 0; i < cases.length; i++) {
    const r = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], { env: { ...process.env, MATRIX_CASE: String(i) }, encoding: 'utf8' });
    process.stdout.write(r.stdout);
    const m = /failures (\d+)/.exec(r.stdout);
    total += m ? +m[1] : 1;
  }
  console.log('failures', total);
  process.exit(total ? 1 : 0);
}
for (const c of [cases[+only]]) for (const k of KINDS) {
  if (!k.build) continue;
  const p = deriveParams({ maleDiameterInner: c.m, femaleDiameterInner: c.f, hoseDiameterInner: c.h, generalMaterialWidth: c.W, maleFemaleGapSize: c.g, slipRingGapSize: c.sg });
  for (const pipe of k.machine ? pipes : [undefined]) {
    const t = Date.now();
    try {
      const bodies = k.build(p, { text: c.text, pipe });
      const vols = bodies.map((b) => Math.round(measureVolume(b.shape)));
      // gültige Topologie wie im Worker geprüft (BRepCheck)
      const invalid = bodies.filter((b) => {
        const a = new (getOC().BRepCheck_Analyzer)((b.shape as unknown as { wrapped: never }).wrapped, false, false);
        const ok = a.IsValid();
        a.delete();
        return !ok;
      }).map((b) => b.name);
      for (const b of bodies) b.shape.delete(); // WASM-Speicher freigeben, sonst läuft er bei vielen Fällen voll
      const bad = vols.some((v) => !(v > 0)) || invalid.length > 0;
      if (bad) fail++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${k.id.padEnd(10)} M${c.m} F${c.f} H${c.h} W${c.W} g${c.g} sg${c.sg} text=${c.text} ${pipe ? 'pipe' + pipe.d1Inner : ''} ${Date.now() - t}ms vols=${vols.join(',')}${invalid.length ? ' ungültig: ' + invalid.join(', ') : ''}`);
    } catch (e) { fail++; console.log(`FAIL ${k.id} M${c.m} F${c.f} H${c.h} W${c.W}: ${e}`); }
  }
}
console.log('failures', fail);
