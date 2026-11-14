/**
 * Saugdüse (Verbindung „Saugdüse“): kurzes Formular mit Düsenart und wenigen Maßen. Daraus entsteht eine
 * Freiform-Kette (Anschluss A unten, Übergang, Gerade, ggf. Bogen, Gerade, Düsenspitze als Ende B), die genauso
 * gebaut und geprüft wird wie jeder Freiform-Adapter und sich in der Freiform weiterbearbeiten lässt.
 */
import { newBlock, sec, tipGeom, DEFAULT_DEVICE, DEFAULT_TIP, NOZZLE, type Block, type FreeSpec, type OsvacEnd, type Section } from './freeform';

export type NozzleKind = 'round' | 'crevice' | 'bent' | 'wide' | 'upholstery';

export interface NozzleSpec {
  kind: NozzleKind;
  a: { type: OsvacEnd; d: number };
  /** Rundrohr: Innen-Ø der Öffnung */
  d: number;
  /** sonst: Öffnung innen breit × hoch */
  w: number;
  h: number;
  /** Länge ohne Anschluss (vom Ende des Steckers bzw. der Kupplung bis zur Spitze, längste Stelle) */
  length: number;
  /** Biegung kurz vor der Spitze (0 = gerade) */
  bend: number;
  /** Schräge der Spitze */
  tip: number;
  wall: number;
  ring: boolean;
  brush: boolean;
}

/** Werte, die eine Düsenart setzt (Anschluss, Wand und Extras bleiben) */
type Preset = Pick<NozzleSpec, 'd' | 'w' | 'h' | 'length' | 'bend' | 'tip'>;
export const NOZZLE_KINDS: { id: NozzleKind; title: string; hint: string; values: Preset }[] = [
  { id: 'round', title: 'Rundrohr', hint: 'Dünn, für Löcher', values: { d: 14, w: 30, h: 9, length: 160, bend: 0, tip: 0 } },
  { id: 'crevice', title: 'Fugendüse', hint: 'Schmal, schräge Spitze', values: { d: 14, w: 30, h: 9, length: 185, bend: 0, tip: 45 } },
  { id: 'bent', title: 'Fugendüse gebogen', hint: 'Für Ecken und Spalten', values: { d: 14, w: 28, h: 10, length: 180, bend: 35, tip: 35 } },
  { id: 'wide', title: 'Breitdüse', hint: 'Flach, für Flächen', values: { d: 14, w: 90, h: 8, length: 95, bend: 0, tip: 30 } },
  { id: 'upholstery', title: 'Polsterdüse', hint: 'Breit, gerade Kante', values: { d: 14, w: 80, h: 14, length: 85, bend: 0, tip: 0 } },
];

export const DEFAULT_NOZZLE: NozzleSpec = {
  kind: 'crevice',
  a: { type: 'male', d: 32 },
  ...NOZZLE_KINDS[1].values,
  wall: 2,
  ring: false,
  brush: false,
};

/** Grenzen der Eingabefelder */
export const NOZZLE_LIMITS = {
  d: [6, 60],
  w: [6, 150],
  h: [4, 60],
  length: [20, 300],
  bend: [0, 45],
  tip: [0, NOZZLE.maxAngle],
  wall: [1.6, 4],
  a: [15, 60],
} as const;

/** Querschnitt der Öffnung */
export function nozzleSection(n: NozzleSpec): Section {
  if (n.kind === 'round') return sec('circle', { d: n.d });
  if (n.kind === 'upholstery') {
    const r = Math.min(4, n.h / 2);
    return sec('rect', { w: n.w, h: n.h, r, r2: r });
  }
  return sec('slot', { w: n.w, h: n.h });
}

/**
 * Aufteilung der Länge: Übergang vom Anschluss auf die Öffnung (flach genug zum Drucken, höchstens etwa 34°),
 * Bogen um die schmale Seite (rund: in Richtung der Schräge), gerades Stück an der Spitze lang genug für Ring und Fenster.
 */
export function nozzleLayout(n: NozzleSpec) {
  const s = nozzleSection(n);
  const isCircle = s.shape === 'circle';
  const W = isCircle ? n.d : n.w, H = isCircle ? n.d : n.h;
  const delta = Math.max(Math.abs(n.a.d - W), Math.abs(n.a.d - H)) / 2;
  const same = isCircle && Math.abs(n.d - n.a.d) < 1e-9;
  const trans = same ? 0 : Math.min(80, Math.max(20, Math.round(2.2 * delta)));
  // flache Düsen biegen über die schmale Seite, die Schräge liegt dann in der Biegeebene
  const bendDir = isCircle ? 0 : 90;
  const tipDir = n.bend > 0 ? bendDir : n.kind === 'wide' || n.kind === 'upholstery' ? 90 : 0;
  const tip = { ...DEFAULT_TIP, angle: n.tip, dir: tipDir, ring: n.ring, brush: n.brush };
  const g = tipGeom(s, 0, n.wall, tip);
  const across = (isCircle ? n.d : n.h) / 2 + n.wall;
  const radius = n.bend > 0 ? Math.max(50, Math.round(3 * across)) : 0;
  const arc = (radius * n.bend * Math.PI) / 180;
  // Spitzenstück: nach einem Bogen mindestens 15 mm (bzw. ein Viertel), sonst so lang wie für Ring/Fenster nötig
  const tipMin = Math.max(g.need, n.bend > 0 ? 15 : 5);
  const rest = n.length - trans - arc;
  const s2 = n.bend > 0 ? Math.ceil(Math.max(tipMin, 0.25 * rest) * 10) / 10 : rest;
  const s1 = n.bend > 0 ? Math.floor((rest - s2) * 10) / 10 : 0;
  const minLength = Math.ceil(trans + arc + tipMin + (n.bend > 0 ? 5 : 0));
  return { s, trans, bendDir, tipDir, tip, radius, arc, s1, s2, minLength };
}

/** Freiform-Aufbau der Düse (Anschluss A unten auf dem Druckbett, Spitze oben) */
export function nozzleToFree(n: NozzleSpec): FreeSpec {
  const L = nozzleLayout(n);
  const blocks: Block[] = [];
  if (L.trans > 0) blocks.push(newBlock('transition', { length: L.trans, section: L.s }));
  if (n.bend > 0) {
    if (L.s1 > 0.5) blocks.push(newBlock('straight', { length: L.s1 }));
    blocks.push(newBlock('bend', { angle: n.bend, radius: L.radius, dir: L.bendDir }));
  }
  blocks.push(newBlock('straight', { length: Math.max(1, L.s2) }));
  return {
    a: { ...n.a },
    wall: n.wall,
    blocks,
    b: { type: 'nozzle', d: n.a.d, device: { ...DEFAULT_DEVICE, section: { ...DEFAULT_DEVICE.section } }, transition: 10, tip: L.tip },
    bed: 'A',
  };
}

export interface NozzleIssue {
  level: 'error' | 'warn';
  text: string;
  fixes?: { label: string; fields: string[]; set: (n: NozzleSpec) => void }[];
}

const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');

/** Prüfung des Formulars; fields = aria-label der Zahlenfelder (Markierung) */
export function nozzleIssues(n: NozzleSpec): NozzleIssue[] {
  const out: NozzleIssue[] = [];
  const fix = (label: string, field: string, set: (n: NozzleSpec) => void) => ({ label, fields: [field], set });
  const lim = (k: 'd' | 'w' | 'h' | 'length' | 'bend' | 'tip' | 'wall', name: string, field: string, unit = 'mm') => {
    const [lo, hi] = NOZZLE_LIMITS[k];
    const v = n[k];
    if (!(v >= lo)) out.push({ level: 'error', text: `${name}: mindestens ${f(lo)}${unit === '°' ? '°' : ' ' + unit}.`, fixes: [fix(`${name} auf ${f(lo)}${unit === '°' ? '°' : ' ' + unit} setzen`, field, (x) => void (x[k] = lo))] });
    else if (v > hi) out.push({ level: 'error', text: `${name}: höchstens ${f(hi)}${unit === '°' ? '°' : ' ' + unit}.`, fixes: [fix(`${name} auf ${f(hi)}${unit === '°' ? '°' : ' ' + unit} setzen`, field, (x) => void (x[k] = hi))] });
  };
  if (n.kind === 'round') lim('d', 'Ø der Öffnung', 'Ø der Öffnung');
  else {
    lim('w', 'Breite der Öffnung', 'Öffnung breit');
    lim('h', 'Höhe der Öffnung', 'Öffnung hoch');
    if (n.h > n.w) out.push({ level: 'warn', text: 'Die Öffnung ist höher als breit. Breite und Höhe vertauscht?', fixes: [{ label: 'Breite und Höhe tauschen', fields: ['Öffnung breit', 'Öffnung hoch'], set: (x) => void ([x.w, x.h] = [x.h, x.w]) }] });
  }
  lim('bend', 'Biegung', 'Biegung', '°');
  lim('tip', 'Schräge an der Spitze', 'Schräge an der Spitze', '°');
  lim('wall', 'Wandstärke', 'Wandstärke der Düse');
  if (!(n.a.d >= 15 && n.a.d <= 60)) out.push({ level: 'error', text: 'Anschluss: Ø zwischen 15 und 60 mm.' });
  if (out.some((x) => x.level === 'error')) return out;
  const L = nozzleLayout(n);
  if (n.length < L.minLength)
    out.push({
      level: 'error',
      text: `Für diese Öffnung${n.bend > 0 ? ', die Biegung' : ''}${L.tip.ring || L.tip.brush ? ' und die Extras' : ''} muss die Düse mindestens ${f(L.minLength)} mm lang sein.`,
      fixes: [fix(`Länge auf ${f(L.minLength)} mm setzen`, 'Länge der Düse', (x) => void (x.length = L.minLength))],
    });
  const area = (s: Section) => (s.shape === 'circle' ? (Math.PI * s.d * s.d) / 4 : s.w * s.h - (4 - Math.PI) * Math.min(s.h / 2, s.shape === 'rect' ? s.r : s.h / 2) ** 2);
  const ratio = area(L.s) / ((Math.PI * n.a.d * n.a.d) / 4);
  if (ratio < 0.12) out.push({ level: 'warn', text: `Die Öffnung ist sehr klein (${Math.round(ratio * 100)} % des Anschlusses). Die Düse saugt an der Spitze kräftig, lässt aber wenig Luft durch und verstopft leicht.` });
  return out;
}
