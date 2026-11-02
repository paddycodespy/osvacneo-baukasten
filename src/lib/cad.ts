/**
 * Client-Seite des CAD-Workers: Promise-basierte Aufrufe.
 */
import CadWorker from './worker/cad.worker?worker';
import type { BuildRequest, ExportFormat, MeshBody, WorkerReply } from './worker/protocol';
import type { OsvacInput } from './osvac/params';
import type { BuildOptions } from './osvac/assemblies';

const worker = new CadWorker();
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let readyResolve: () => void;
export const cadReady = new Promise<void>((r) => (readyResolve = r));

worker.onmessage = (ev: MessageEvent<WorkerReply>) => {
  const m = ev.data;
  if (m.type === 'ready') return readyResolve();
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.type === 'error') p.reject(new Error(m.message));
  else p.resolve(m);
};
worker.postMessage({ type: 'init', baseUrl: new URL(import.meta.env.BASE_URL, location.href).href });

function call<T>(msg: { id: number; [k: string]: unknown }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, { resolve: resolve as (v: unknown) => void, reject });
    worker.postMessage(msg);
  });
}

export function makeBuild(kind: string, input: OsvacInput, options: BuildOptions): BuildRequest {
  return { type: 'build', id: nextId++, kind, input: { ...input }, options: { ...options } };
}

export async function build(req: BuildRequest): Promise<{ bodies: MeshBody[]; ms: number; volume: number; area: number; helperVolume: number; helperArea: number }> {
  await cadReady;
  return call({ ...req, id: nextId++ } as unknown as { id: number });
}

export async function exportFile(req: BuildRequest, format: ExportFormat, fileName: string, includeHelpers: boolean) {
  await cadReady;
  const r = await call<{ blob: Blob; fileName: string }>({ type: 'export', id: nextId++, build: req, format, fileName, includeHelpers });
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = r.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // URL bleibt gültig, damit die Datei über den Link erneut gespeichert werden kann
  return { fileName: r.fileName, url, size: r.blob.size };
}
