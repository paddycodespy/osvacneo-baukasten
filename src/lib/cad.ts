/**
 * Client-Seite der CAD-Berechnung: ein Pool aus mehreren Workern.
 * Ein Adapter besteht aus mehreren Körpern (kind.parts). Jeder Körper wird als eigener Auftrag an einen
 * freien Worker gegeben – die teuren zuerst –, sodass mehrere Prozessorkerne gleichzeitig rechnen.
 * Jeder Worker hält fertige Körper vor; ein Auftrag geht bevorzugt an den Worker, der den Körper schon kennt.
 */
import CadWorker from './worker/cad.worker?worker';
import type { BuildRequest, ExportFormat, MeshBody, WorkerReply, WorkerRequest, PartRef } from './worker/protocol';
import type { OsvacInput } from './osvac/params';
import { deriveParams } from './osvac/params';
import type { BuildOptions, Part } from './osvac/assemblies';
import { kindById } from './osvac/catalog';
import { build3MF } from './worker/threemf';

const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
/** Anzahl Worker: Kerne − 1, höchstens 4 (jeder Worker lädt OpenCascade, ~100 MB) */
export const POOL_SIZE = Math.max(1, Math.min(4, hc - 1));

interface Slot {
  w: Worker;
  busy: boolean;
  ready: Promise<void>;
  known: Set<string>;
}

let nextId = 1;
const pending = new Map<number, { resolve: (v: WorkerReply) => void; reject: (e: Error) => void; slot: Slot }>();
const baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;

const slots: Slot[] = Array.from({ length: POOL_SIZE }, () => {
  const w = new CadWorker();
  let r!: () => void;
  const slot: Slot = { w, busy: false, ready: new Promise<void>((res) => (r = res)), known: new Set() };
  w.onmessage = (ev: MessageEvent<WorkerReply>) => {
    const m = ev.data;
    if (m.type === 'ready') return r();
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    slot.busy = false;
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
    pump();
  };
  w.postMessage({ type: 'init', baseUrl } satisfies WorkerRequest);
  return slot;
});

/** bereit, sobald der erste Worker geladen ist */
export const cadReady = Promise.race(slots.map((s) => s.ready));

// --- Warteschlange ---
interface Job {
  msg: WorkerRequest & { id: number };
  key?: string;
  cost: number;
  gen: number;
  resolve: (v: WorkerReply) => void;
  reject: (e: Error) => void;
}
const queue: Job[] = [];
let generation = 0;

function pump() {
  while (queue.length) {
    const free = slots.filter((s) => !s.busy);
    if (!free.length) return;
    // teuerster Auftrag zuerst; bevorzugt der Worker, der den Körper schon hat
    queue.sort((a, b) => b.cost - a.cost);
    let ji = 0;
    let slot = free.find((s) => queue[0].key && s.known.has(queue[0].key)) ?? null;
    if (!slot) {
      // gibt es einen Auftrag, den ein freier Worker schon kennt? Den zuerst (geht fast sofort)
      for (let i = 0; i < queue.length && !slot; i++) {
        const s = free.find((f) => queue[i].key && f.known.has(queue[i].key!));
        if (s) {
          slot = s;
          ji = i;
        }
      }
    }
    if (!slot) slot = free.find((s) => s.known.size === Math.min(...free.map((f) => f.known.size))) ?? free[0];
    const job = queue.splice(ji, 1)[0];
    slot.busy = true;
    if (job.key) slot.known.add(job.key);
    pending.set(job.msg.id, { resolve: job.resolve, reject: job.reject, slot });
    const s = slot;
    s.ready.then(() => s.w.postMessage(job.msg));
  }
}

function enqueue<T extends WorkerReply>(msg: WorkerRequest & { id: number }, cost: number, key?: string, gen = generation): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ msg, cost, key, gen, resolve: resolve as (v: WorkerReply) => void, reject });
    pump();
  });
}

/** noch nicht gestartete Aufträge älterer Berechnungen verwerfen (laufende laufen zu Ende) */
function dropStale() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].gen < generation && queue[i].msg.type === 'part') {
      queue[i].reject(new Error('überholt'));
      queue.splice(i, 1);
    }
  }
}

function partsOf(req: BuildRequest): Part[] {
  const kind = kindById(req.kind);
  if (!kind.parts) throw new Error(`Adaptertyp ${kind.code} ist noch nicht verfügbar.`);
  return kind.parts(deriveParams(req.input), req.options);
}

const ref = (req: BuildRequest, index: number): PartRef => ({ kind: req.kind, input: req.input, options: req.options, index });

export function makeBuild(kind: string, input: OsvacInput, options: BuildOptions): BuildRequest {
  return { type: 'build', id: nextId++, kind, input: { ...input }, options: { ...options } };
}

export interface BuildResult {
  bodies: MeshBody[];
  ms: number;
  volume: number;
  area: number;
  helperVolume: number;
  helperArea: number;
  zMin: number;
}

/**
 * Alle Körper parallel berechnen. onPart wird für jeden fertigen Körper aufgerufen (Index, Netz),
 * damit die Vorschau schon während der Berechnung wachsen kann.
 */
export async function build(req: BuildRequest, onPart?: (index: number, body: MeshBody) => void): Promise<BuildResult> {
  generation++;
  dropStale();
  const t0 = performance.now();
  const parts = partsOf(req);
  const res = await Promise.all(
    parts.map((q, i) =>
      enqueue<Extract<WorkerReply, { type: 'part' }>>({ type: 'part', id: nextId++, ...ref(req, i) }, q.cost, q.key).then((r) => {
        onPart?.(i, r.body);
        return { q, r };
      }),
    ),
  );
  const sum = (f: (x: (typeof res)[number]) => number, helper: boolean) => res.filter((x) => !!x.q.helper === helper).reduce((s, x) => s + f(x), 0);
  return {
    bodies: res.map((x) => x.r.body),
    ms: performance.now() - t0,
    volume: sum((x) => x.r.volume, false),
    area: sum((x) => x.r.area, false),
    helperVolume: sum((x) => x.r.volume, true),
    helperArea: sum((x) => x.r.area, true),
    zMin: Math.min(...res.map((x) => x.r.zMin)),
  };
}

/** Binäre STL aus mehreren Netzen */
function stlBlob(meshes: { vertices: Float32Array; triangles: Uint32Array }[]): Blob {
  const n = meshes.reduce((s, m) => s + m.triangles.length / 3, 0);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const { vertices: v, triangles: t } of meshes) {
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const x of [nx, ny, nz, v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2]]) {
        dv.setFloat32(o, x, true);
        o += 4;
      }
      o += 2;
    }
  }
  return new Blob([buf], { type: 'model/stl' });
}

export async function exportFile(req: BuildRequest, format: ExportFormat, fileName: string, includeHelpers: boolean) {
  await cadReady;
  const parts = partsOf(req);
  const sel = parts.map((q, i) => ({ q, i })).filter((x) => includeHelpers || !x.q.helper);
  // Unterseite auf z = 0 legen, damit das Teil im Slicer direkt auf dem Bett steht
  const infos = await Promise.all(sel.map((x) => enqueue<Extract<WorkerReply, { type: 'part' }>>({ type: 'part', id: nextId++, ...ref(req, x.i) }, x.q.cost, x.q.key, Infinity)));
  const dz = -Math.min(...infos.map((r) => r.zMin));
  let blob: Blob;
  if (format === 'step') {
    const breps = await Promise.all(
      sel.map((x) => enqueue<Extract<WorkerReply, { type: 'partBrep' }>>({ type: 'partBrep', id: nextId++, dz, ...ref(req, x.i) }, x.q.cost, x.q.key, Infinity)),
    );
    const r = await enqueue<Extract<WorkerReply, { type: 'file' }>>({ type: 'step', id: nextId++, breps: breps.map((b) => b.data) }, 100, undefined, Infinity);
    blob = r.blob;
  } else {
    const meshes = await Promise.all(
      sel.map((x) => enqueue<Extract<WorkerReply, { type: 'partMesh' }>>({ type: 'partMesh', id: nextId++, dz, ...ref(req, x.i) }, x.q.cost, x.q.key, Infinity)),
    );
    blob = format === 'stl' ? stlBlob(meshes) : build3MF(meshes.map((m, k) => ({ name: sel[k].q.name, vertices: m.vertices, triangles: m.triangles })), fileName);
  }
  const name = `${fileName}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // URL bleibt gültig, damit die Datei über den Link erneut gespeichert werden kann
  return { fileName: name, url, size: blob.size };
}
