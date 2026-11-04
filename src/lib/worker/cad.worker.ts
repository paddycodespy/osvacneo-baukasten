/// <reference lib="webworker" />
/**
 * CAD-Worker: OpenCascade (replicad) läuft hier, damit die Oberfläche flüssig bleibt.
 * Mehrere dieser Worker bilden einen Pool (siehe ../cad.ts); jeder baut einzelne Körper eines Adapters
 * und hält sie in einem Zwischenspeicher, damit unveränderte Teile nicht neu berechnet werden.
 */
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, makeCompound, measureVolume, measureArea, deserializeShape, type Shape3D } from 'replicad';
import { threadNetVolumeFactor } from '../osvac/thread';
import { deriveParams } from '../osvac/params';
import { initFont } from '../osvac/text';
import { kindById } from '../osvac/catalog';
import type { Part } from '../osvac/assemblies';
import type { PartRef, WorkerRequest, WorkerReply } from './protocol';

let ready: Promise<void> | null = null;

function init(baseUrl: string) {
  if (!ready) {
    ready = (async () => {
      const OC = await opencascade({ locateFile: () => wasmUrl });
      setOC(OC);
      const font = await fetch(baseUrl + 'fonts/LiberationSans-Regular.ttf').then((r) => r.arrayBuffer());
      await initFont(font);
    })();
  }
  return ready;
}

// --- Zwischenspeicher: Körper nach Schlüssel (LRU) ---
const MAX_CACHE = 40;
const cache = new Map<string, { shape: Shape3D; volume: number; area: number; zMin: number }>();

function partSpec(r: PartRef): Part {
  const kind = kindById(r.kind);
  if (!kind.parts) throw new Error(`Adaptertyp ${kind.code} ist noch nicht verfügbar.`);
  const parts = kind.parts(deriveParams(r.input), r.options);
  const q = parts[r.index];
  if (!q) throw new Error('Unbekannter Körper');
  return q;
}

function getPart(r: PartRef) {
  const q = partSpec(r);
  const hit = cache.get(q.key);
  if (hit) {
    cache.delete(q.key);
    cache.set(q.key, hit);
    return { q, ...hit };
  }
  const shape = q.make();
  let volume = measureVolume(shape);
  // Gewinde: die 0,5-mm-Überlappung mit der Wand nicht als Filament zählen
  if (q.name === 'Gewinde') volume *= threadNetVolumeFactor(deriveParams(r.input));
  if (q.volumeOffset) volume -= q.volumeOffset;
  const entry = { shape, volume, area: measureArea(shape), zMin: shape.boundingBox.bounds[0][2] };
  cache.set(q.key, entry);
  while (cache.size > MAX_CACHE) {
    const [k, v] = cache.entries().next().value as [string, { shape: Shape3D }];
    cache.delete(k);
    v.shape.delete?.();
  }
  return { q, ...entry };
}

const post = (msg: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await init(msg.baseUrl);
      post({ type: 'ready' });
      return;
    }
    await ready;
    if (msg.type === 'part') {
      const t0 = performance.now();
      const { q, shape, volume, area, zMin } = getPart(msg);
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
      const { shape } = getPart(msg);
      const placed = shape.clone().translate([0, 0, msg.dz]) as Shape3D;
      const m = placed.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
      placed.delete();
      const vertices = new Float32Array(m.vertices);
      const triangles = new Uint32Array(m.triangles);
      post({ type: 'partMesh', id: msg.id, vertices, triangles }, [vertices.buffer, triangles.buffer]);
      return;
    }
    if (msg.type === 'partBrep') {
      const { shape } = getPart(msg);
      const placed = shape.clone().translate([0, 0, msg.dz]) as Shape3D;
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
