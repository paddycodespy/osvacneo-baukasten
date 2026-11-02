import opencascade from 'replicad-opencascadejs';
import { setOC, draw } from 'replicad';
import fs from 'fs';
import { fileURLToPath } from 'url';

const t0 = Date.now();
const OC = await opencascade({
  locateFile: (f) => fileURLToPath(new URL('../node_modules/replicad-opencascadejs/dist/' + f, import.meta.url)),
});
setOC(OC);
console.log('init ms', Date.now() - t0);
const prof = draw([16, 0]).lineTo([19, 0]).lineTo([19, 30]).lineTo([16, 30]).close();
const s = prof.sketchOnPlane('XZ').revolve();
const stl = s.blobSTL({ tolerance: 0.01 });
const step = s.blobSTEP();
fs.writeFileSync('/tmp/t.stl', Buffer.from(await stl.arrayBuffer()));
fs.writeFileSync('/tmp/t.step', Buffer.from(await step.arrayBuffer()));
console.log('ok', Date.now() - t0);
