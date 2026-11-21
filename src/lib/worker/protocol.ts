import type { OsvacInput } from '../osvac/params';
import type { BuildOptions } from '../osvac/assemblies';

/** Was gebaut werden soll (ganzer Adapter). */
export interface BuildRequest {
  type: 'build';
  id: number;
  kind: string;
  input: OsvacInput;
  options: BuildOptions;
}

export type ExportFormat = 'stl' | '3mf' | 'step';

export interface MeshBody {
  name: string;
  helper: boolean;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Schnittebene in der Vorschau (Modellkoordinaten), aus Part.cut; nur im Hauptthread gesetzt */
  cut?: SectionCut;
}

/** Schnittebene: Punkt und Normale (Modellkoordinaten) */
export interface SectionCut {
  p: [number, number, number];
  n: [number, number, number];
}

/** Ein einzelner Körper eines Adapters (Index in kind.parts). */
export interface PartRef {
  kind: string;
  input: OsvacInput;
  options: BuildOptions;
  index: number;
}

export type WorkerRequest =
  | { type: 'init'; baseUrl: string; module?: WebAssembly.Module }
  /** Körper bauen (oder aus dem Zwischenspeicher), Vorschaunetz + Kennwerte zurück */
  | ({ type: 'part'; id: number } & PartRef)
  /** feines Netz für STL/3MF, um dz (und für das Druckbett um dx/dy) verschoben */
  | ({ type: 'partMesh'; id: number; dz: number; dx?: number; dy?: number } & PartRef)
  /** BRep-Text des Körpers (für den STEP-Export), um dz (dx/dy) verschoben */
  | ({ type: 'partBrep'; id: number; dz: number; dx?: number; dy?: number } & PartRef)
  /** STEP aus BRep-Texten zusammensetzen */
  | { type: 'step'; id: number; breps: string[]; name?: string };

export type WorkerReply =
  | { type: 'ready' }
  | {
      type: 'part';
      id: number;
      body: MeshBody;
      volume: number;
      area: number;
      zMin: number;
      /** Hinweise zum Körper (gebaut, aber mit Einschränkung) */
      notes: string[];
      ms: number;
    }
  | { type: 'partMesh'; id: number; vertices: Float32Array; triangles: Uint32Array }
  | { type: 'partBrep'; id: number; data: string }
  | { type: 'file'; id: number; blob: Blob }
  | { type: 'error'; id: number; message: string; user?: boolean };
