/**
 * Client-Seite der CAD-Berechnung: ein Pool aus mehreren Workern.
 * Ein Adapter besteht aus mehreren Körpern (kind.parts). Jeder Körper wird als eigener Auftrag an einen
 * freien Worker gegeben – die teuren zuerst –, sodass mehrere Prozessorkerne gleichzeitig rechnen.
 * Jeder Worker hält fertige Körper vor; ein Auftrag geht bevorzugt an den Worker, der den Körper schon kennt.
 */
import CadWorker from './worker/cad.worker?worker';
import MeasureWorker from './worker/measure.worker?worker';
import type { UnionMeasures } from './unionMeasure';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { STL_HEADER } from './credits';
import type { BuildRequest, ExportFormat, MeshBody, WorkerReply, WorkerRequest, PartRef } from './worker/protocol';
import type { OsvacInput } from './osvac/params';
import { deriveParams } from './osvac/params';
import type { BuildOptions, Part } from './osvac/assemblies';
import { kindById } from './osvac/catalog';
import { build3MF } from './worker/threemf';
import { UserError } from './errors';

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

/**
 * OpenCascade (22 MB WebAssembly) nur einmal übersetzen und das fertige Modul an alle Worker geben.
 * Startet sofort beim Laden der Seite, also während man Schritt 1 ansieht.
 */
const wasmModule: Promise<WebAssembly.Module | undefined> = (async () => {
  try {
    const r = fetch(wasmUrl);
    return await (WebAssembly.compileStreaming ? WebAssembly.compileStreaming(r) : r.then((x) => x.arrayBuffer()).then((b) => WebAssembly.compile(b)));
  } catch {
    return undefined; // dann lädt jeder Worker selbst
  }
})();

/** Worker starten; stürzt er ab (z. B. kein Speicher mehr), werden seine Aufträge abgebrochen und er wird ersetzt */
function startWorker(slot: Slot) {
  const w = new CadWorker();
  let r!: () => void;
  slot.w = w;
  slot.busy = false;
  slot.known = new Set();
  slot.ready = new Promise<void>((res) => (r = res));
  w.onmessage = (ev: MessageEvent<WorkerReply>) => {
    const m = ev.data;
    if (m.type === 'ready') return r();
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    slot.busy = false;
    if (m.type === 'error') p.reject(new UserError(m.message));
    else p.resolve(m);
    pump();
  };
  w.onerror = (ev) => {
    ev.preventDefault();
    for (const [id, p] of pending) {
      if (p.slot !== slot) continue;
      pending.delete(id);
      p.reject(new UserError('Die Berechnung ist abgebrochen. Bitte einen Wert ändern oder die Seite neu laden.'));
    }
    w.terminate();
    startWorker(slot);
    pump();
  };
  wasmModule.then((module) => w.postMessage({ type: 'init', baseUrl, module } satisfies WorkerRequest));
  return r;
}

const slots: Slot[] = Array.from({ length: POOL_SIZE }, () => {
  const slot = {} as Slot;
  startWorker(slot);
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
    s.ready.then(() => {
      try {
        s.w.postMessage(job.msg);
      } catch (e) {
        // z. B. nicht übertragbare Daten: Auftrag mit Fehler beenden statt ewig zu warten
        pending.delete(job.msg.id);
        s.busy = false;
        job.reject(e instanceof Error ? e : new Error(String(e)));
        pump();
      }
    });
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
  if (!kind.parts) throw new UserError(`Adaptertyp ${kind.code} ist noch nicht verfügbar.`);
  return kind.parts(deriveParams(req.input), req.options);
}

const ref = (req: BuildRequest, index: number): PartRef => ({ kind: req.kind, input: req.input, options: req.options, index });

/** Namen der Körper einer Berechnung (ohne etwas zu bauen) */
export const partNames = (req: BuildRequest) => partsOf(req).map((q) => q.name);


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
  /** Hinweise der Körper (z. B. weggelassene Klemmrippen), ohne Wiederholungen */
  notes: string[];
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
    notes: [...new Set(res.flatMap((x) => x.r.notes ?? []))],
  };
}

/** Binäre STL aus mehreren Netzen */
function stlBlob(meshes: { vertices: Float32Array; triangles: Uint32Array }[]): Blob {
  const n = meshes.reduce((s, m) => s + m.triangles.length / 3, 0);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  // Kopf (80 Byte): Urheber und Lizenz, da STL sonst keine Angaben tragen kann
  for (let i = 0; i < Math.min(80, STL_HEADER.length); i++) dv.setUint8(i, STL_HEADER.charCodeAt(i));
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

/** fertige Datei: URL (bleibt gültig, damit sie über den Link erneut gespeichert werden kann) und Inhalt; gespeichert wird in save.svelte.ts */
function fileOf(blob: Blob, name: string) {
  return { fileName: name, url: URL.createObjectURL(blob), size: blob.size, blob };
}

/** Ein Adapter auf dem Druckbett: Berechnung, Druckhilfe ja/nein, Name im 3MF */
export interface PlateItem {
  req: BuildRequest;
  includeHelpers: boolean;
  label: string;
}

/**
 * Einen oder mehrere Adapter als eine Datei exportieren. Mehrere werden nebeneinander auf dem Druckbett
 * angeordnet (Reihen bis ca. 220 mm Breite, 6 mm Abstand), jeweils mit der Unterseite auf z = 0.
 */
export async function exportPlate(items: PlateItem[], format: ExportFormat, fileName: string) {
  await cadReady;
  // reine Daten (keine reaktiven Proxys der Oberfläche), sonst lassen sie sich nicht an die Worker schicken
  items = items.map((it) => ({ ...it, req: JSON.parse(JSON.stringify(it.req)) as BuildRequest }));
  type Sel = { item: PlateItem; q: Part; i: number };
  const groups = items.map((item) => {
    const parts = partsOf(item.req);
    return parts.map((q, i) => ({ item, q, i })).filter((x) => item.includeHelpers || !x.q.helper) as Sel[];
  });
  // Lage jedes Adapters aus den Vorschaunetzen (Zwischenspeicher der Worker, meist sofort da)
  const infos = await Promise.all(
    groups.map((g) => Promise.all(g.map((x) => enqueue<Extract<WorkerReply, { type: 'part' }>>({ type: 'part', id: nextId++, ...ref(x.item.req, x.i) }, x.q.cost, x.q.key, Infinity)))),
  );
  const boxes = infos.map((g) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of g) {
      const p = r.body.positions;
      for (let k = 0; k < p.length; k += 3) {
        x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
      }
    }
    return { x0, x1, y0, y1, dz: -Math.min(...g.map((r) => r.zMin)) };
  });
  // Anordnung in Reihen
  const GAP = 6, ROW = 220;
  const place: { dx: number; dy: number }[] = [];
  let cx = 0, cy = 0, rowH = 0, maxW = 0;
  for (const b of boxes) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (cx > 0 && cx + w > ROW) { cy -= rowH + GAP; cx = 0; rowH = 0; }
    place.push({ dx: cx - b.x0, dy: cy - b.y1 });
    cx += w + GAP;
    rowH = Math.max(rowH, h);
    maxW = Math.max(maxW, cx - GAP);
  }
  // Mitte des Ganzen auf den Ursprung
  const totalH = -cy + rowH;
  const ox = boxes.length > 1 ? -maxW / 2 : 0, oy = boxes.length > 1 ? totalH / 2 : 0;
  if (boxes.length === 1) place[0] = { dx: 0, dy: 0 };
  // eigene Objekte (z. B. Schieberplatte, B-Teil mit Schieber) liegen für sich auf dem Bett, unabhängig von einer
  // Druckhilfe darunter; alle Körper eines Objekts gemeinsam
  const objMin = new Map<string, number>();
  groups.forEach((g, gi) => g.forEach((x, k) => {
    if (!x.q.object) return;
    const key = `${gi}\u0000${x.q.object}`;
    objMin.set(key, Math.min(objMin.get(key) ?? Infinity, infos[gi][k].zMin));
  }));
  const jobs = groups.flatMap((g, gi) => g.map((x) => ({ ...x, gi, dx: place[gi].dx + ox, dy: place[gi].dy + oy, dz: x.q.object ? -objMin.get(`${gi}\u0000${x.q.object}`)! : boxes[gi].dz })));
  // je Adapter ein Objekt im 3MF, dazu eigene Objekte für Teile, die getrennt gedruckt werden
  const objKey = (x: (typeof jobs)[number]) => `${x.gi}${x.q.object ? `\u0000${x.q.object}` : ''}`;
  const objectIds = new Map<string, number>();
  const objectNames: string[] = [];
  for (const x of jobs) {
    const k = objKey(x);
    if (objectIds.has(k)) continue;
    objectIds.set(k, objectNames.length);
    objectNames.push(x.q.object ? `${x.item.label} · ${x.q.object}` : x.item.label);
  }
  let blob: Blob;
  if (format === 'step') {
    const breps = await Promise.all(jobs.map((x) => enqueue<Extract<WorkerReply, { type: 'partBrep' }>>({ type: 'partBrep', id: nextId++, dx: x.dx, dy: x.dy, dz: x.dz, ...ref(x.item.req, x.i) }, x.q.cost, x.q.key, Infinity)));
    const r = await enqueue<Extract<WorkerReply, { type: 'file' }>>({ type: 'step', id: nextId++, breps: breps.map((b) => b.data), name: fileName }, 100, undefined, Infinity);
    blob = r.blob;
  } else {
    const meshes = await Promise.all(jobs.map((x) => enqueue<Extract<WorkerReply, { type: 'partMesh' }>>({ type: 'partMesh', id: nextId++, dx: x.dx, dy: x.dy, dz: x.dz, ...ref(x.item.req, x.i) }, x.q.cost, x.q.key, Infinity)));
    blob =
      format === 'stl'
        ? stlBlob(meshes)
        : build3MF(
            meshes.map((m, k) => ({ name: jobs[k].q.name, group: objectIds.get(objKey(jobs[k]))!, vertices: m.vertices, triangles: m.triangles })),
            fileName,
            objectNames,
          );
  }
  return fileOf(blob, `${fileName}.${format}`);
}

export function exportFile(req: BuildRequest, format: ExportFormat, fileName: string, includeHelpers: boolean) {
  return exportPlate([{ req, includeHelpers, label: fileName }], format, fileName);
}

// ---------------------------------------------------------------- Filament: Volumen und Außenfläche des ganzen Teils


let measureWorker: Worker | null = null;
let measureSeq = 0;
const measureWaiting = new Map<number, (r: UnionMeasures | null) => void>();
/**
 * Alle Körper vereinigt messen (eigener Worker mit manifold-3d). null, wenn es nicht geht (z. B. offenes Netz):
 * dann bleibt die einfache Summe der Körper.
 */
export function measureBodies(bodies: MeshBody[]): Promise<UnionMeasures | null> {
  if (!measureWorker) {
    measureWorker = new MeasureWorker();
    measureWorker.onmessage = (e: MessageEvent<{ id: number; ok: boolean } & UnionMeasures>) => {
      const done = measureWaiting.get(e.data.id);
      measureWaiting.delete(e.data.id);
      done?.(e.data.ok ? { volume: e.data.volume, area: e.data.area, helperVolume: e.data.helperVolume, helperArea: e.data.helperArea } : null);
    };
    measureWorker.onerror = () => {
      for (const done of measureWaiting.values()) done(null);
      measureWaiting.clear();
    };
  }
  const id = ++measureSeq;
  return new Promise((resolve) => {
    measureWaiting.set(id, resolve);
    measureWorker!.postMessage({ id, bodies: bodies.map((b) => ({ helper: b.helper, positions: b.positions, indices: b.indices })) });
  });
}
