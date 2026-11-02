import type { OsvacInput } from '../osvac/params';
import type { BuildOptions } from '../osvac/assemblies';

export interface BuildRequest {
  type: 'build';
  id: number;
  kind: string;
  input: OsvacInput;
  options: BuildOptions;
}

export type ExportFormat = 'stl' | '3mf' | 'step';

export interface ExportRequest {
  type: 'export';
  id: number;
  build: BuildRequest;
  format: ExportFormat;
  fileName: string;
  includeHelpers: boolean;
}

export interface MeshBody {
  name: string;
  helper: boolean;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'mesh'; id: number; bodies: MeshBody[]; ms: number; volume: number }
  | { type: 'file'; id: number; blob: Blob; fileName: string }
  | { type: 'error'; id: number; message: string };
