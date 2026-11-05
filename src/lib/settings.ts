/**
 * Einstellungen merken und als Link weitergeben.
 * Die aktuelle Konfiguration steht im Adressteil hinter „#“ (nur Abweichungen vom Standard) und im
 * localStorage des Browsers; beim Öffnen gilt zuerst der Link, sonst die zuletzt benutzte Einstellung.
 */
import type { OsvacInput } from './osvac/params';
import { KINDS } from './osvac/catalog';

export interface MachineSettings {
  mode: 'over' | 'into';
  dOpen: number;
  dDepth: number;
  length: number;
  wall: number;
  allowance: number;
  holes: boolean;
  transition: number;
}

export interface Settings {
  kindId: string;
  input: OsvacInput;
  machine: MachineSettings;
  text: boolean;
  supports: boolean;
}

const STORE = 'osvacneo-konfigurator';

// Kurzschlüssel im Link → [Bereich, Feld, kleinster, größter Wert]
const NUM: Record<string, ['input' | 'machine', string, number, number]> = {
  m: ['input', 'maleDiameterInner', 15, 60],
  f: ['input', 'femaleDiameterInner', 15, 60],
  h: ['input', 'hoseDiameterInner', 15, 60],
  w: ['input', 'generalMaterialWidth', 7, 9],
  g: ['input', 'maleFemaleGapSize', 0.1, 0.5],
  sg: ['input', 'slipRingGapSize', 0.2, 0.8],
  do: ['machine', 'dOpen', 8, 120],
  dd: ['machine', 'dDepth', 8, 120],
  l: ['machine', 'length', 5, 100],
  wa: ['machine', 'wall', 2, 8],
  a: ['machine', 'allowance', 0, 2],
  tr: ['machine', 'transition', 2, 40],
};

export function encode(s: Settings, def: Settings): string {
  const q = new URLSearchParams();
  q.set('k', s.kindId);
  for (const [key, [area, field]] of Object.entries(NUM)) {
    const v = (s[area] as unknown as Record<string, number>)[field];
    const d = (def[area] as unknown as Record<string, number>)[field];
    if (v !== d) q.set(key, String(v));
  }
  if (s.machine.mode !== def.machine.mode) q.set('mo', s.machine.mode);
  if (s.machine.holes !== def.machine.holes) q.set('ho', s.machine.holes ? '1' : '0');
  if (s.text !== def.text) q.set('t', s.text ? '1' : '0');
  if (s.supports !== def.supports) q.set('s', s.supports ? '1' : '0');
  return q.toString();
}

export function decode(str: string, def: Settings): Settings | null {
  const q = new URLSearchParams(str.replace(/^#/, ''));
  const k = q.get('k');
  if (!k || !KINDS.some((x) => x.id === k && x.available)) return null;
  const s: Settings = { kindId: k, input: { ...def.input }, machine: { ...def.machine }, text: def.text, supports: def.supports };
  for (const [key, [area, field, lo, hi]] of Object.entries(NUM)) {
    const raw = q.get(key);
    if (raw === null) continue;
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v)) (s[area] as unknown as Record<string, number>)[field] = Math.min(hi, Math.max(lo, v));
  }
  if (s.input.generalMaterialWidth !== 7 && s.input.generalMaterialWidth !== 9) s.input.generalMaterialWidth = def.input.generalMaterialWidth;
  const mo = q.get('mo');
  if (mo === 'over' || mo === 'into') s.machine.mode = mo;
  const bool = (key: string, cur: boolean) => (q.has(key) ? q.get(key) === '1' : cur);
  s.machine.holes = bool('ho', s.machine.holes);
  s.text = bool('t', s.text);
  s.supports = bool('s', s.supports);
  return s;
}

/** Link aus der Adresszeile, sonst zuletzt benutzte Einstellung, sonst null */
export function loadSettings(def: Settings): Settings | null {
  try {
    if (location.hash.length > 1) {
      const s = decode(location.hash, def);
      if (s) return s;
    }
    const stored = localStorage.getItem(STORE);
    return stored ? decode(stored, def) : null;
  } catch {
    return null;
  }
}

export function saveSettings(s: Settings, def: Settings) {
  const str = encode(s, def);
  try {
    localStorage.setItem(STORE, str);
  } catch {
    /* privater Modus o. Ä.: dann eben nicht merken */
  }
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#${str}`);
  } catch {
    /* ignorieren */
  }
}
