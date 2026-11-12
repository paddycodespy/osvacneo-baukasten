/**
 * Katalog der konfigurierbaren Adapter von osVAC neo.
 * Jeder Eintrag beschreibt, welche Durchmesser abgefragt werden und wie gebaut wird.
 */
import type { OsvacParams } from './params';
import * as asm from './assemblies';
import { DEFAULT_FREE, freeSummary } from './freeform';
import { DEFAULT_GATE, gateName } from './gate';

export type DiameterKey = 'maleDiameterInner' | 'femaleDiameterInner' | 'hoseDiameterInner';

export interface AdapterKind {
  id: string;
  /** Name nach dem Schema von osVAC neo, z. B. "MxxFyy" */
  code: string;
  title: string;
  description: string;
  /** Oben → unten, wie gedruckt */
  ends: { top: EndType; bottom: EndType | null };
  diameters: DiameterKey[];
  available: boolean;
  build?: (p: OsvacParams, o: asm.BuildOptions) => asm.Body[];
  /** Körper einzeln (für parallele Berechnung) */
  parts?: (p: OsvacParams, o: asm.BuildOptions) => asm.Part[];
  /** Maschinenadapter: fragt Stutzenmaße ab */
  machine?: boolean;
  /** Freiform: Aufbau aus Bausteinen statt fester Größen */
  freeform?: boolean;
  /** Schieber einzeln: eigene Maße (Rohr, Muffen, Befestigung) */
  gate?: boolean;
  fileName: (p: OsvacParams, o?: asm.BuildOptions) => string;
}

export type EndType = 'female' | 'male' | 'hose' | 'machine' | 'free' | 'gate';

function pipeName(o?: asm.BuildOptions): string {
  const s = o?.pipe;
  if (!s) return '';
  const r = (v: number) => n(Math.round(v * 10) / 10);
  return `${r(s.d2Inner)}-${r(s.d1Inner)}x${r(s.length)}`;
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));

export const KINDS: AdapterKind[] = [
  {
    id: 'MF',
    code: 'MxxFyy',
    title: 'Stecker ↔ Kupplung',
    description: 'Verbindet zwei Größen von osVAC neo, z. B. M25 auf F32.',
    ends: { top: 'female', bottom: 'male' },
    diameters: ['femaleDiameterInner', 'maleDiameterInner'],
    available: true,
    build: asm.buildMxxFyy,
    parts: asm.partsMxxFyy,
    fileName: (p) => `osVAC neo M${n(p.maleDiameterInner)}F${n(p.femaleDiameterInner)}`,
  },
  {
    id: 'F',
    code: 'Fxx',
    title: 'Kupplung einzeln',
    description: 'Nur der Bajonett-Ring, zum Einbau in eigene Konstruktionen.',
    ends: { top: 'female', bottom: null },
    diameters: ['femaleDiameterInner'],
    available: true,
    build: asm.buildFemale,
    parts: asm.partsFemale,
    fileName: (p) => `osVAC neo F${n(p.femaleDiameterInner)}`,
  },
  {
    id: 'M',
    code: 'Mxx',
    title: 'Stecker einzeln',
    description: 'Nur der Stecker mit Bajonettnasen und Druckhilfe.',
    ends: { top: 'male', bottom: null },
    diameters: ['maleDiameterInner'],
    available: true,
    build: asm.buildMale,
    parts: asm.partsMale,
    fileName: (p) => `osVAC neo M${n(p.maleDiameterInner)}`,
  },
  {
    id: 'FH',
    code: 'FxxHyy',
    title: 'Kupplung ↔ Schlauch',
    description: 'Kupplung mit Drehring und Schlauchgewinde, z. B. für den Saugschlauch.',
    ends: { top: 'female', bottom: 'hose' },
    diameters: ['femaleDiameterInner', 'hoseDiameterInner'],
    available: true,
    build: asm.buildFxxHyy,
    parts: asm.partsFxxHyy,
    fileName: (p) => `osVAC neo F${n(p.femaleDiameterInner)}H${n(p.hoseDiameterInner)}`,
  },
  {
    id: 'MH',
    code: 'MxxHyy',
    title: 'Stecker ↔ Schlauch',
    description: 'Stecker mit Drehring und Schlauchgewinde.',
    ends: { top: 'male', bottom: 'hose' },
    diameters: ['maleDiameterInner', 'hoseDiameterInner'],
    available: true,
    build: asm.buildMxxHyy,
    parts: asm.partsMxxHyy,
    fileName: (p) => `osVAC neo M${n(p.maleDiameterInner)}H${n(p.hoseDiameterInner)}`,
  },
  {
    id: 'MACHINE_F',
    code: 'Fxx-Rohr',
    title: 'Kupplung → Stutzen',
    description: 'Kupplung auf einen gemessenen Stutzen, gerade oder konisch.',
    ends: { top: 'female', bottom: 'machine' },
    diameters: ['femaleDiameterInner'],
    machine: true,
    available: true,
    build: asm.buildMachineF,
    parts: asm.partsMachineF,
    fileName: (p, o) => `osVAC neo F${n(p.femaleDiameterInner)}-Rohr${pipeName(o)}`,
  },
  {
    id: 'MACHINE_M',
    code: 'Mxx-Rohr',
    title: 'Stecker → Stutzen',
    description: 'Stecker auf einen gemessenen Stutzen, gerade oder konisch.',
    ends: { top: 'male', bottom: 'machine' },
    diameters: ['maleDiameterInner'],
    machine: true,
    available: true,
    build: asm.buildMachineM,
    parts: asm.partsMachineM,
    fileName: (p, o) => `osVAC neo M${n(p.maleDiameterInner)}-Rohr${pipeName(o)}`,
  },
  {
    id: 'GATE',
    code: 'Schieber',
    title: 'Schieber einzeln',
    description: 'Absperrschieber für Rohre: das Rohr wird beidseitig eingesteckt. Mit Wandbefestigung.',
    ends: { top: 'gate', bottom: null },
    diameters: [],
    gate: true,
    available: true,
    build: asm.buildGate,
    parts: asm.partsGate,
    fileName: (_p, o) => `osVAC neo ${gateName({ ...DEFAULT_GATE, ...o?.gate }).file}`,
  },
  {
    id: 'FREE',
    code: 'Freiform',
    title: 'Freiform',
    description: 'Eigener Adapter aus Bausteinen: Bogen, Übergang, eckige Haube, Versatz. Für Geräte ohne runden Stutzen.',
    ends: { top: 'female', bottom: 'free' },
    diameters: [],
    freeform: true,
    available: true,
    build: asm.buildFree,
    parts: asm.partsFree,
    fileName: (_p, o) => `osVAC neo ${freeSummary(o?.free ?? DEFAULT_FREE).file}`,
  },
];

export const kindById = (id: string) => KINDS.find((k) => k.id === id)!;
