/**
 * Katalog der konfigurierbaren osVACneo-Adapter.
 * Jeder Eintrag beschreibt, welche Durchmesser abgefragt werden und wie gebaut wird.
 */
import type { OsvacParams } from './params';
import * as asm from './assemblies';

export type DiameterKey = 'maleDiameterInner' | 'femaleDiameterInner' | 'hoseDiameterInner';

export interface AdapterKind {
  id: string;
  /** Name nach osVACneo-Schema, z. B. "MxxFyy" */
  code: string;
  title: string;
  description: string;
  /** Oben → unten, wie gedruckt */
  ends: { top: EndType; bottom: EndType | null };
  diameters: DiameterKey[];
  available: boolean;
  build?: (p: OsvacParams, o: asm.BuildOptions) => asm.Body[];
  fileName: (p: OsvacParams) => string;
}

export type EndType = 'female' | 'male' | 'hose' | 'machine';

const n = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));

export const KINDS: AdapterKind[] = [
  {
    id: 'MF',
    code: 'MxxFyy',
    title: 'Stecker ↔ Kupplung',
    description: 'Verbindet zwei osVACneo-Größen, z. B. M25 auf F32.',
    ends: { top: 'female', bottom: 'male' },
    diameters: ['femaleDiameterInner', 'maleDiameterInner'],
    available: true,
    build: asm.buildMxxFyy,
    fileName: (p) => `osVACneo-M${n(p.maleDiameterInner)}F${n(p.femaleDiameterInner)}`,
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
    fileName: (p) => `osVACneo-F${n(p.femaleDiameterInner)}`,
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
    fileName: (p) => `osVACneo-M${n(p.maleDiameterInner)}`,
  },
  {
    id: 'FH',
    code: 'FxxHyy',
    title: 'Kupplung ↔ Schlauch',
    description: 'Kupplung mit Drehring auf Schlauchgewinde. In Arbeit.',
    ends: { top: 'female', bottom: 'hose' },
    diameters: ['femaleDiameterInner', 'hoseDiameterInner'],
    available: false,
    fileName: (p) => `osVACneo-F${n(p.femaleDiameterInner)}H${n(p.hoseDiameterInner)}`,
  },
  {
    id: 'MH',
    code: 'MxxHyy',
    title: 'Stecker ↔ Schlauch',
    description: 'Stecker mit Drehring auf Schlauchgewinde. In Arbeit.',
    ends: { top: 'male', bottom: 'hose' },
    diameters: ['maleDiameterInner', 'hoseDiameterInner'],
    available: false,
    fileName: (p) => `osVACneo-M${n(p.maleDiameterInner)}H${n(p.hoseDiameterInner)}`,
  },
  {
    id: 'MACHINE',
    code: 'Maschine',
    title: 'Maschinenstutzen',
    description: 'osVACneo-Anschluss auf einen gemessenen Stutzen. In Arbeit.',
    ends: { top: 'female', bottom: 'machine' },
    diameters: ['femaleDiameterInner'],
    available: false,
    fileName: (p) => `osVACneo-F${n(p.femaleDiameterInner)}-Maschine`,
  },
];

export const kindById = (id: string) => KINDS.find((k) => k.id === id)!;
