/**
 * Katalog der konfigurierbaren Adapter von osVAC neo.
 * Jeder Eintrag beschreibt, welche Durchmesser abgefragt werden und wie gebaut wird.
 */
import type { OsvacParams } from './params';
import * as asm from './assemblies';
import { DEFAULT_FREE, freeSummary } from './freeform';
import { DEFAULT_GATE, gateName } from './gate';
import { DEFAULT_MAGNET, magnetName } from './magnet';

export type DiameterKey = 'maleDiameterInner' | 'femaleDiameterInner' | 'hoseDiameterInner';

export interface AdapterKind {
  id: string;
  /** Name nach dem Schema von osVAC neo, z. B. "MxxFyy" */
  code: string;
  title: string;
  description: string;
  /** Gruppe in Schritt 1 (Überschrift über den Karten) */
  group: KindGroup;
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
  /** Saugdüse: kurzes Formular, gebaut als Freiform (freeform ist dann auch gesetzt) */
  nozzle?: boolean;
  /** Nebenluft-Regler: unten Schlauch, oben Kupplung oder Stecker (eigenes Formular) */
  bleed?: boolean;
  /** Drehring-Lösehilfe: Halter für Kupplung und/oder Stecker */
  helper?: boolean;
  /** Magnet-Schnellkupplung Ø100: eigenes System mit eingedruckten Neodym-Magneten */
  magnet?: boolean;
  /** Magnet-Schnellkupplung mit Anschlüssen von osVAC neo („Gerät ↔ osVAC neo“) */
  magnetOsvac?: boolean;
  fileName: (p: OsvacParams, o?: asm.BuildOptions) => string;
}

export type KindGroup = 'osvac' | 'hose' | 'machine' | 'magnet' | 'accessory' | 'custom';
/** Überschriften der Gruppen in Schritt 1, in dieser Reihenfolge */
export const KIND_GROUPS: { id: KindGroup; title: string }[] = [
  { id: 'osvac', title: 'osVAC neo untereinander' },
  { id: 'hose', title: 'An den Schlauch' },
  { id: 'machine', title: 'An ein Gerät' },
  { id: 'custom', title: 'Eigener Aufbau' },
  { id: 'accessory', title: 'Zubehör' },
  { id: 'magnet', title: 'Magnet-Schnellkupplung Ø100' },
];

export type EndType = 'female' | 'male' | 'hose' | 'machine' | 'free' | 'gate' | 'nozzle' | 'bleed' | 'helper' | 'magnet';

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
    group: 'osvac',
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
    group: 'osvac',
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
    group: 'osvac',
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
    group: 'hose',
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
    group: 'hose',
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
    group: 'machine',
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
    group: 'machine',
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
    id: 'MAGNET',
    group: 'magnet',
    code: 'Magnet',
    title: 'Gerät ↔ Schlauch',
    description: 'Adapter am Gerät und Kupplung für den Schlauch: Ø100 oder ein bis zwei kleinere Schläuche mit Drehring, gehalten von eingedruckten Neodym-Magneten. Umstecken in Sekunden.',
    ends: { top: 'magnet', bottom: null },
    diameters: [],
    magnet: true,
    available: true,
    build: asm.buildMagnet,
    parts: asm.partsMagnet,
    fileName: (_p, o) => `${magnetName({ ...DEFAULT_MAGNET, ...o?.magnet }).file}`,
  },
  {
    id: 'MAGNET_OSVAC',
    group: 'magnet',
    code: 'Magnet',
    title: 'Gerät ↔ osVAC neo',
    description: 'Adapter am Gerät und eine Platte mit ein oder zwei Anschlüssen von osVAC neo (Kupplung oder Stecker), wahlweise mit Verschlusskappe.',
    ends: { top: 'magnet', bottom: null },
    diameters: [],
    magnet: true,
    magnetOsvac: true,
    available: true,
    build: (p, o) => asm.buildMagnet(p, { ...o, magnetOsvac: true }),
    parts: (p, o) => asm.partsMagnet(p, { ...o, magnetOsvac: true }),
    fileName: (_p, o) => `${magnetName({ ...DEFAULT_MAGNET, ...o?.magnet }, true).file}`,
  },
  {
    id: 'NOZZLE',
    group: 'accessory',
    code: 'Düse',
    title: 'Saugdüse',
    description: 'Eigene Düse zum Aufstecken: Fugen-, Breit- oder Polsterdüse, gerade oder gebogen, mit schräger Spitze.',
    ends: { top: 'nozzle', bottom: 'male' },
    diameters: [],
    freeform: true,
    nozzle: true,
    available: true,
    build: asm.buildFree,
    parts: asm.partsFree,
    fileName: (_p, o) => `osVAC neo ${freeSummary(o?.free ?? DEFAULT_FREE).file.replace(' Freiform', '').replace(' Duese ', ' Saugduese ')}`,
  },
  {
    id: 'BLEED',
    group: 'accessory',
    code: 'NL',
    title: 'Nebenluft-Regler',
    description: 'Kommt direkt auf den Schlauch: unten Schlauchgewinde, oben Kupplung oder Stecker. Am Drehring Nebenluft stufenlos auf und zu.',
    ends: { top: 'bleed', bottom: 'hose' },
    diameters: [],
    bleed: true,
    available: true,
    build: asm.buildBleed,
    parts: asm.partsBleed,
    fileName: (p, o) => {
      const s = { ...asm.DEFAULT_BLEED, ...o?.bleed };
      return `osVAC neo Nebenluft ${s.top === 'female' ? `F${n(p.femaleDiameterInner)}` : `M${n(p.maleDiameterInner)}`}H${n(p.hoseDiameterInner)}`;
    },
  },
  {
    id: 'GATE',
    group: 'accessory',
    code: 'Schieber',
    title: 'Schieber einzeln',
    description: 'Absperrschieber für Rohre, zwei Teile zum Verschrauben: das Rohr wird beidseitig eingesteckt. Mit Wandbefestigung.',
    ends: { top: 'gate', bottom: null },
    diameters: [],
    gate: true,
    available: true,
    build: asm.buildGate,
    parts: asm.partsGate,
    fileName: (_p, o) => `osVAC neo ${gateName({ ...DEFAULT_GATE, ...o?.gate }).file}`,
  },
  {
    id: 'HELPER',
    group: 'accessory',
    code: 'Lösehilfe',
    title: 'Drehring-Lösehilfe',
    description: 'Hält Kupplung oder Stecker fest, damit sich ein festsitzender Drehring am Schlauchadapter lösen lässt.',
    ends: { top: 'helper', bottom: null },
    diameters: ['femaleDiameterInner', 'maleDiameterInner'],
    helper: true,
    available: true,
    build: asm.buildHelper,
    parts: asm.partsHelper,
    fileName: (p, o) => {
      const s = { ...asm.DEFAULT_HELPER, ...o?.helper };
      const both = s.forF === s.forM;
      // wie die Beschriftung: Halter für Kupplungen = Stecker (M), für Stecker = Kupplung (F)
      return `osVAC neo Loesehilfe${both || s.forF ? ` M${n(p.femaleDiameterInner)}` : ''}${both || s.forM ? ` F${n(p.maleDiameterInner)}` : ''}`;
    },
  },
  {
    id: 'FREE',
    group: 'custom',
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

/** Verbindungen, die die Oberfläche anbietet */
/** Karten in Schritt 1: nach der Reihenfolge der Gruppen (KIND_GROUPS), innerhalb einer Gruppe wie in KINDS */
export const VISIBLE_KINDS = KIND_GROUPS.flatMap((g) => KINDS.filter((k) => k.group === g.id));
/** Verbindung wählbar (bekannt und verfügbar) */
export const kindSelectable = (id: string) => VISIBLE_KINDS.some((k) => k.id === id && k.available);
