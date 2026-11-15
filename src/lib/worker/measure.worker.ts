/**
 * Eigener kleiner Worker für die Filamentschätzung: vereinigt die Netze aller Körper mit manifold-3d und misst
 * Volumen und Außenfläche (siehe unionMeasure.ts). Läuft neben den CAD-Workern, damit die Oberfläche nicht hängt.
 */
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { measureUnion, type UnionBody } from '../unionMeasure';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: Promise<any> | null = null;
const load = () =>
  (wasm ??= Module({ locateFile: () => wasmUrl }).then((m) => {
    m.setup();
    return m;
  }));

self.onmessage = async (e: MessageEvent<{ id: number; bodies: UnionBody[] }>) => {
  const { id, bodies } = e.data;
  try {
    const r = measureUnion(await load(), bodies);
    self.postMessage({ id, ok: true, ...r });
  } catch (err) {
    self.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
