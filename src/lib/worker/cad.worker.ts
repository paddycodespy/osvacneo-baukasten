/// <reference lib="webworker" />
/**
 * CAD-Worker: OpenCascade (replicad) läuft hier, damit die Oberfläche flüssig bleibt.
 */
import opencascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC, makeCompound, measureVolume, type Shape3D } from 'replicad';
import { deriveParams } from '../osvac/params';
import { initFont } from '../osvac/text';
import { kindById } from '../osvac/catalog';
import type { Body } from '../osvac/assemblies';
import { build3MF } from './threemf';
import type { BuildRequest, ExportRequest, WorkerReply, MeshBody } from './protocol';

let ready: Promise<void> | null = null;

function init(baseUrl: string) {
  if (!ready) {
    ready = (async () => {
      const OC = await opencascade({ locateFile: () => wasmUrl });
      setOC(OC);
      const font = await fetch(baseUrl + 'fonts/LiberationSans-Bold.ttf').then((r) => r.arrayBuffer());
      await initFont(font);
    })();
  }
  return ready;
}

let cache: { key: string; bodies: Body[] } | null = null;

function specKey(r: BuildRequest) {
  return JSON.stringify({ k: r.kind, i: r.input, o: r.options });
}

function buildBodies(r: BuildRequest): Body[] {
  const key = specKey(r);
  if (cache && cache.key === key) return cache.bodies;
  const kind = kindById(r.kind);
  if (!kind.build) throw new Error(`Adaptertyp ${kind.code} ist noch nicht verfügbar.`);
  const p = deriveParams(r.input);
  const bodies = kind.build(p, r.options);
  if (cache) for (const b of cache.bodies) b.shape.delete?.();
  cache = { key, bodies };
  return bodies;
}

function toMesh(shape: Shape3D, tol: number): Omit<MeshBody, 'name' | 'helper'> {
  const m = shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
  return {
    positions: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.triangles),
  };
}

const post = (msg: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (ev: MessageEvent<BuildRequest | ExportRequest | { type: 'init'; baseUrl: string }>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await init(msg.baseUrl);
      post({ type: 'ready' });
      return;
    }
    await ready;
    if (msg.type === 'build') {
      const t0 = performance.now();
      const bodies = buildBodies(msg);
      const meshes: MeshBody[] = bodies.map((b) => ({ name: b.name, helper: !!b.helper, ...toMesh(b.shape, msg.options.text ? 0.03 : 0.05) }));
      let volume = 0;
      for (const b of bodies) if (!b.helper) volume += measureVolume(b.shape);
      post(
        { type: 'mesh', id: msg.id, bodies: meshes, ms: performance.now() - t0, volume },
        meshes.flatMap((m) => [m.positions.buffer, m.normals.buffer, m.indices.buffer]),
      );
      return;
    }
    if (msg.type === 'export') {
      const bodies = buildBodies(msg.build);
      const selected = bodies.filter((b) => msg.includeHelpers || !b.helper);
      let blob: Blob;
      // makeCompound übernimmt die Körper → mit Kopien arbeiten, der Cache bleibt gültig
      // Unterseite auf z = 0 legen, damit das Teil im Slicer direkt auf dem Bett steht
      const zMin = Math.min(...selected.map((b) => b.shape.boundingBox.bounds[0][2]));
      const placed = selected.map((b) => ({ name: b.name, shape: b.shape.clone().translate([0, 0, -zMin]) as Shape3D }));
      const compound = () => makeCompound(placed.map((b) => b.shape.clone())) as Shape3D;
      if (msg.format === 'step') {
        const c = compound();
        blob = c.blobSTEP();
        c.delete();
      } else if (msg.format === 'stl') {
        const c = compound();
        blob = c.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true });
        c.delete();
      } else {
        const parts = placed.map((b) => {
          const m = b.shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
          return { name: b.name, vertices: m.vertices, triangles: m.triangles };
        });
        blob = build3MF(parts, msg.fileName);
      }
      for (const b of placed) b.shape.delete();
      post({ type: 'file', id: msg.id, blob, fileName: `${msg.fileName}.${msg.format}` });
      return;
    }
  } catch (e) {
    const id = 'id' in msg ? msg.id : -1;
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
};
