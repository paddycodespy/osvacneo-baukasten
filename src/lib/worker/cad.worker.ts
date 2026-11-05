/// <reference lib="webworker" />
/**
 * CAD-Worker: OpenCascade (replicad) läuft hier, damit die Oberfläche flüssig bleibt.
 * Mehrere dieser Worker bilden einen Pool (siehe ../cad.ts); jeder baut einzelne Körper eines Adapters
 * und hält sie in einem Zwischenspeicher, damit unveränderte Teile nicht neu berechnet werden.
 */
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, getOC, makeCompound, measureVolume, measureArea, deserializeShape, type Shape3D } from 'replicad';
import { threadNetVolumeFactor } from '../osvac/thread';
import { deriveParams } from '../osvac/params';
import { initFont } from '../osvac/text';
import { kindById } from '../osvac/catalog';
import type { Part } from '../osvac/assemblies';
import type { PartRef, WorkerRequest, WorkerReply } from './protocol';

let ready: Promise<void> | null = null;

function init(baseUrl: string, module?: WebAssembly.Module) {
  if (!ready) {
    ready = (async () => {
      // Das WebAssembly-Modul übersetzt die Hauptseite einmal für alle Worker (spart beim Start je Worker
      // mehrere Sekunden); ohne Modul lädt der Worker es selbst
      const OC = await opencascade({
        locateFile: () => wasmUrl,
        ...(module
          ? {
              instantiateWasm: (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
                WebAssembly.instantiate(module, imports).then((inst) => done(inst, module));
                return {};
              },
            }
          : {}),
      } as never);
      setOC(OC);
      const font = await fetch(baseUrl + 'fonts/LiberationSans-Regular.ttf').then((r) => r.arrayBuffer());
      await initFont(font);
    })();
  }
  return ready;
}

// --- Zwischenspeicher: Körper nach Schlüssel (LRU) ---
const MAX_CACHE = 40;
type Entry = { shape: Shape3D; volume: number; area: number; zMin: number };
const cache = new Map<string, Entry>();

// --- Dauerhafter Zwischenspeicher im Browser (IndexedDB): teure Körper überleben ein Neuladen der Seite ---
// Schlüssel enthält die Prüfsumme des Geometrie-Codes, damit nach einem Update nichts Veraltetes erscheint.
const STORE = 'parts';
const MAX_STORED = 150;
const persist = !import.meta.env.DEV && typeof indexedDB !== 'undefined';
let dbp: Promise<IDBDatabase | null> | null = null;
function db() {
  dbp ??= new Promise((res) => {
    try {
      const r = indexedDB.open('osvacneo-konfigurator', 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}
const reqP = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
type Stored = { brep: string; volume: number; area: number; zMin: number; used: number };
async function loadStored(key: string): Promise<Stored | undefined> {
  if (!persist) return undefined;
  try {
    const d = await db();
    if (!d) return undefined;
    const v = (await reqP(d.transaction(STORE, 'readonly').objectStore(STORE).get(__GEOM_VERSION__ + key))) as Stored | undefined;
    if (v) d.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...v, used: Date.now() }, __GEOM_VERSION__ + key);
    return v;
  } catch {
    return undefined;
  }
}
async function saveStored(key: string, e: Entry) {
  if (!persist) return;
  try {
    const d = await db();
    if (!d) return;
    const st = d.transaction(STORE, 'readwrite').objectStore(STORE);
    st.put({ brep: e.shape.serialize(), volume: e.volume, area: e.area, zMin: e.zMin, used: Date.now() } satisfies Stored, __GEOM_VERSION__ + key);
    // aufräumen: fremde Versionen und die am längsten unbenutzten Einträge entfernen
    const keys = (await reqP(d.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys())) as string[];
    const stale = keys.filter((k) => !k.startsWith(__GEOM_VERSION__));
    let drop = stale;
    const own = keys.length - stale.length;
    if (own > MAX_STORED) {
      const all = (await reqP(d.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as Stored[];
      const used = keys.map((k, i) => ({ k, u: all[i]?.used ?? 0 })).filter((x) => x.k.startsWith(__GEOM_VERSION__));
      used.sort((a, b) => a.u - b.u);
      drop = [...stale, ...used.slice(0, own - MAX_STORED).map((x) => x.k)];
    }
    if (drop.length) {
      const w = d.transaction(STORE, 'readwrite').objectStore(STORE);
      for (const k of drop) w.delete(k);
    }
  } catch {
    /* Speicher voll oder nicht erlaubt: dann eben ohne */
  }
}

function partSpec(r: PartRef): Part {
  const kind = kindById(r.kind);
  if (!kind.parts) throw new Error(`Adaptertyp ${kind.code} ist noch nicht verfügbar.`);
  const parts = kind.parts(deriveParams(r.input), r.options);
  const q = parts[r.index];
  if (!q) throw new Error('Unbekannter Körper');
  return q;
}

function remember(key: string, entry: Entry) {
  cache.set(key, entry);
  while (cache.size > MAX_CACHE) {
    const [k, v] = cache.entries().next().value as [string, Entry];
    cache.delete(k);
    v.shape.delete?.();
  }
}

async function getPart(r: PartRef) {
  const q = partSpec(r);
  const hit = cache.get(q.key);
  if (hit) {
    cache.delete(q.key);
    cache.set(q.key, hit);
    return { q, ...hit };
  }
  // teure Körper zuerst im Browser-Speicher suchen
  if (q.cost >= 0.5) {
    const st = await loadStored(q.key);
    if (st) {
      try {
        const entry: Entry = { shape: deserializeShape(st.brep) as Shape3D, volume: st.volume, area: st.area, zMin: st.zMin };
        remember(q.key, entry);
        return { q, ...entry };
      } catch {
        /* beschädigt: neu berechnen */
      }
    }
  }
  const shape = q.make();
  let volume = measureVolume(shape);
  // Plausibilität: OpenCascade liefert bei gescheiterten Booleschen Operationen mitunter kaputte Körper
  const oc = getOC();
  const check = new oc.BRepCheck_Analyzer((shape as unknown as { wrapped: unknown }).wrapped as never, false, false);
  const valid = check.IsValid();
  check.delete();
  if (!valid || !(volume > 0)) {
    shape.delete?.();
    throw new Error(`„${q.name}“ ließ sich mit diesen Maßen nicht sauber berechnen. Bitte die Maße prüfen oder einen Wert leicht ändern.`);
  }
  // Gewinde: die 0,5-mm-Überlappung mit der Wand nicht als Filament zählen
  if (q.name === 'Gewinde') volume *= threadNetVolumeFactor(deriveParams(r.input));
  if (q.volumeOffset) volume -= q.volumeOffset;
  const area = measureArea(shape) - (q.areaOffset ?? 0);
  const entry: Entry = { shape, volume, area, zMin: shape.boundingBox.bounds[0][2] };
  remember(q.key, entry);
  if (q.cost >= 0.5) void saveStored(q.key, entry);
  return { q, ...entry };
}

const post = (msg: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await init(msg.baseUrl, msg.module);
      post({ type: 'ready' });
      return;
    }
    await ready;
    if (msg.type === 'part') {
      const t0 = performance.now();
      const { q, shape, volume, area, zMin } = await getPart(msg);
      const m = shape.mesh({ tolerance: msg.options.text ? 0.03 : 0.05, angularTolerance: 0.25 });
      const body = {
        name: q.name,
        helper: !!q.helper,
        positions: new Float32Array(m.vertices),
        normals: new Float32Array(m.normals),
        indices: new Uint32Array(m.triangles),
      };
      post({ type: 'part', id: msg.id, body, volume, area, zMin, ms: performance.now() - t0 }, [body.positions.buffer, body.normals.buffer, body.indices.buffer]);
      return;
    }
    if (msg.type === 'partMesh') {
      const { shape } = await getPart(msg);
      const placed = shape.clone().translate([msg.dx ?? 0, msg.dy ?? 0, msg.dz]) as Shape3D;
      const m = placed.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
      placed.delete();
      const vertices = new Float32Array(m.vertices);
      const triangles = new Uint32Array(m.triangles);
      post({ type: 'partMesh', id: msg.id, vertices, triangles }, [vertices.buffer, triangles.buffer]);
      return;
    }
    if (msg.type === 'partBrep') {
      const { shape } = await getPart(msg);
      const placed = shape.clone().translate([msg.dx ?? 0, msg.dy ?? 0, msg.dz]) as Shape3D;
      const data = placed.serialize();
      placed.delete();
      post({ type: 'partBrep', id: msg.id, data });
      return;
    }
    if (msg.type === 'step') {
      const shapes = msg.breps.map((b) => deserializeShape(b) as Shape3D);
      const c = makeCompound(shapes) as Shape3D;
      const blob = c.blobSTEP();
      c.delete();
      post({ type: 'file', id: msg.id, blob });
      return;
    }
  } catch (e) {
    const id = 'id' in msg ? msg.id : -1;
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
};
