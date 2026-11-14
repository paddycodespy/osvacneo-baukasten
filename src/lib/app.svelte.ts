/**
 * Zustand der Anwendung: Eingaben aller Schritte, daraus abgeleitete Werte, Export und Druckbett.
 * Die Schritt-Komponenten lesen und ändern diesen Zustand direkt; App.svelte kümmert sich um Vorschau und Berechnung.
 * Der Stand wird im Browser gespeichert und beim nächsten Start wiederhergestellt.
 */
import { exportFile, exportPlate, makeBuild, type PlateItem } from './cad';
import { kindById, type DiameterKey } from './osvac/catalog';
import { DEFAULT_INPUT, deriveParams, type OsvacInput } from './osvac/params';
import type { ExportFormat } from './worker/protocol';
import { pipeWall, type PipeSpec } from './osvac/machine';
import type { Dimensions } from './viewer';
import { slipRingGapMax } from './osvac/hose';
import { estimateFilament } from './filament';
import { userMessage } from './errors';
import { TEMPLATES, planFree, freeSummary, withFreshIds, specKey, flangeExtent, newBlock, bleedMinLen, DEFAULT_DEVICE, BRIM_FROM, AUTO_HOLE_D, type FreeSpec } from './osvac/freeform';
import { freeMaleOnBed } from './osvac/assemblies';
import { BLEED, bleedTransition } from './osvac/bleed';
import { DEFAULT_NOZZLE, NOZZLE_KINDS, NOZZLE_LIMITS, nozzleIssues, nozzleLayout, nozzleToFree, type NozzleSpec } from './osvac/nozzle';
import { DEFAULT_GATE, GATE_GAP, snapPlateGap, MOUNT_LABELS, ORIENT_LABELS, WALL_MORE, gateLayout, gateName, type GateSpec, type GateMount, type GateOrient } from './osvac/gate';

export const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: '3mf', label: '3MF', hint: 'Empfohlen für Bambu Studio, PrusaSlicer, Orca, Cura' },
  { id: 'stl', label: 'STL', hint: 'Funktioniert mit jedem Slicer' },
  { id: 'step', label: 'STEP', hint: 'Exaktes CAD-Modell zum Weiterkonstruieren' },
];

/** Startwerte (auf diese setzt „Zurücksetzen“ zurück) */
export const START_INPUT: OsvacInput = { ...DEFAULT_INPUT, maleDiameterInner: 32, femaleDiameterInner: 32, hoseDiameterInner: 36 };

/** Bereiche der Eingabefelder (beim Laden eines gespeicherten Stands) */
const INPUT_LIMITS: Record<keyof OsvacInput, [number, number]> = {
  maleDiameterInner: [15, 60],
  femaleDiameterInner: [15, 60],
  hoseDiameterInner: [15, 60],
  generalMaterialWidth: [7, 9],
  maleFemaleGapSize: [0.1, 0.5],
  slipRingGapSize: [0.2, 0.8],
  supportStructureGapSize: [0.1, 1],
};

export type MachineMode = 'over' | 'into';
export const MACHINE_DEFAULT = { mode: 'over' as MachineMode, dOpen: 32, dDepth: 33, length: 30, wall: 3, allowance: 0.2, holes: true, transition: 8, ribs: false, slots: false };
export type Machine = typeof MACHINE_DEFAULT;
const MACHINE_KEYS = ['dOpen', 'dDepth', 'length', 'wall', 'allowance', 'holes', 'transition', 'ribs', 'slots'] as const;
const MACHINE_FLAGS: readonly string[] = ['holes', 'ribs', 'slots'];

export const LABELS: Record<DiameterKey, { name: string; word: string; letter: 'F' | 'M' | 'H'; hint: string; presets: number[] }> = {
  femaleDiameterInner: { name: 'Kupplung (F)', word: 'Kupplung', letter: 'F', hint: 'Innendurchmesser der Bajonett-Kupplung', presets: [25, 32, 36, 40, 50] },
  maleDiameterInner: { name: 'Stecker (M)', word: 'Stecker', letter: 'M', hint: 'Innendurchmesser des Steckers', presets: [25, 32, 36, 40, 50] },
  hoseDiameterInner: { name: 'Schlauch (H)', word: 'Schlauch', letter: 'H', hint: 'Innendurchmesser des Schlauchs', presets: [27, 32, 36, 40, 50] },
};

export type Status = 'start' | 'preview' | 'detail' | 'ready' | 'error';
export type FileEntry = { fileName: string; url: string; size: number; key: string };

export const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
const round2 = (v: number) => Math.round(v * 100) / 100;

// alter Name bleibt, damit gespeicherte Stände nach Umbenennungen erhalten bleiben
const STORE_KEY = 'osvacneo-konfigurator:stand:v1';
/** Mehrfach-Druckbett getrennt gespeichert (gehört nicht zum Stand, „Neu anfangen“ lässt es stehen) */
const PLATE_KEY = 'osvacneo-baukasten:druckbett:v1';

class AppState {
  // ---------------------------------------------------------------- Eingaben
  step = $state(0);
  kindId = $state('MF');
  input = $state<OsvacInput>({ ...START_INPUT });
  /**
   * Druckhilfe je Verbindung (Anzeige und Export, berechnet wird sie immer). Gespeichert sind nur die
   * abgeschalteten Verbindungen, Standard ist überall an.
   */
  supportsOff = $state<Record<string, true>>({});
  get supports() {
    return !this.supportsOff[this.kindId];
  }
  set supports(on: boolean) {
    const { [this.kindId]: _, ...rest } = this.supportsOff;
    this.supportsOff = on ? rest : { ...rest, [this.kindId]: true };
  }
  machine = $state<Machine>({ ...MACHINE_DEFAULT });
  /** Freiform: Aufbau, zuletzt gewählte Vorlage, aufgeklappte Karte */
  freeState = $state<FreeSpec>(TEMPLATES[0].make());
  /** Saugdüse: Formular; gebaut wird der daraus erzeugte Freiform-Aufbau */
  nozzle = $state<NozzleSpec>(structuredClone(DEFAULT_NOZZLE));
  nozzleFree = $derived(nozzleToFree($state.snapshot(this.nozzle)));
  /** Aufbau, der gerade gilt: bei der Saugdüse der erzeugte (nur lesen), sonst der Freiform-Aufbau */
  /** Nebenluft-Regler: Stecker unten (Innen-Ø m), Kupplung oben (f), Spiel am Drehring */
  bleed = $state({ m: 32, f: 32, bleedGap: BLEED.gap });
  bleedFree = $derived.by((): FreeSpec => {
    const b = this.bleed, wall = 3;
    return {
      a: { type: 'male', d: b.m },
      wall,
      blocks: [newBlock('bleed', { length: bleedMinLen(b.m, wall, b.bleedGap) })],
      // Übergang zur Kupplung flach genug zum Drucken (auch bei sehr verschiedenen Größen)
      b: { type: 'female', d: b.f, device: { ...DEFAULT_DEVICE, section: { ...DEFAULT_DEVICE.section } }, transition: bleedTransition(b.m, b.f) },
      bed: 'A',
      bleedGap: b.bleedGap,
    };
  });
  /** Aufbau, der gerade gilt: bei Saugdüse und Nebenluft-Regler der erzeugte (nur lesen), sonst der Freiform-Aufbau */
  get free(): FreeSpec {
    return this.kind.nozzle ? this.nozzleFree : this.kind.bleed ? this.bleedFree : this.freeState;
  }
  set free(v: FreeSpec) {
    if (!this.kind.nozzle && !this.kind.bleed) this.freeState = v;
  }
  /** Saugdüse in die Freiform übernehmen (als Bausteine weiterbearbeiten) */
  nozzleToFreeform() {
    this.freeState = withFreshIds(structuredClone($state.snapshot(this.nozzleFree)));
    this.freeTemplate = '';
    this.fromNozzle = true;
    this.freeRef = specKey(this.freeState);
    this.freeOpen = 'B';
    this.kindId = 'FREE';
  }
  /** Freiform kommt aus der Saugdüse: Link „Zurück zur Düse“, bis eine Vorlage geladen wird */
  fromNozzle = $state(false);
  /** Stand der Freiform beim Übernehmen aus der Saugdüse (für „geändert?“) */
  freeRef = $state('');
  /**
   * Wurde der Freiform-Aufbau gegenüber seiner Vorlage bzw. der übernommenen Düse verändert? Dann fragt
   * „In der Freiform weiterbauen“ nach, bevor es ihn ersetzt.
   */
  get freeModified(): boolean {
    const k = specKey($state.snapshot(this.freeState));
    const t = TEMPLATES.find((x) => x.id === this.freeTemplate);
    return t ? k !== specKey(t.make()) : k !== this.freeRef;
  }
  /** Düsenart wählen: setzt deren Maße (Anschluss, Wand und Extras bleiben) */
  setNozzleKind(id: NozzleSpec['kind']) {
    const k = NOZZLE_KINDS.find((x) => x.id === id)!;
    Object.assign(this.nozzle, k.values, { kind: id });
    // mit den gewählten Extras ist manche Düse länger nötig als der Standard der Düsenart
    this.nozzle.length = Math.max(this.nozzle.length, nozzleLayout($state.snapshot(this.nozzle)).minLength);
  }
  freeTemplate = $state(TEMPLATES[0].id);
  freeOpen = $state<number | 'A' | 'B' | 'C' | null>(null);
  /** Schieber einzeln */
  gate = $state<GateSpec>({ ...DEFAULT_GATE });
  /** aufgeklappte Erklärungen (Passung, Download) */
  helpOpen = $state<Record<string, boolean>>({});

  // ---------------------------------------------------------------- Berechnung (setzt App.svelte)
  status = $state<Status>('start');
  errorMsg = $state('');
  measures = $state<{ volume: number; area: number; helperVolume: number; helperArea: number } | null>(null);
  dims = $state<Dimensions | null>(null);
  /** Fortschritt der vollen Berechnung */
  progress = $state<{ done: number; total: number } | null>(null);
  /** Freiform: Fläche, die beim Druck frei nach unten hängt (mm², aus dem Vorschaunetz) */
  overhang = $state(0);
  /** Hinweise aus der vollen Berechnung (z. B. weggelassene Klemmrippen) */
  buildNotes = $state<string[]>([]);
  /** Freiform: Teil liegt tiefer als das Ende auf dem Druckbett (so nicht druckbar) */
  layoutError = $state('');

  // ---------------------------------------------------------------- Export
  activeFormat = $state<ExportFormat>('3mf');
  exporting = $state<ExportFormat | null>(null);
  files = $state<FileEntry[]>([]);
  // $state.raw: die Einträge gehen per postMessage an die Worker, Proxys ließen sich nicht übertragen
  plate = $state.raw<(PlateItem & { key: string })[]>([]);
  plateBusy = $state<ExportFormat | null>(null);

  // ---------------------------------------------------------------- abgeleitet
  kind = $derived(kindById(this.kindId));
  steps = $derived(this.kind.bleed ? (['Verbindung', 'Größen', 'Passung', 'Download'] as const) : this.kind.nozzle ? (['Verbindung', 'Düse', 'Passung', 'Download'] as const) : this.kind.freeform ? (['Verbindung', 'Aufbau', 'Passung', 'Download'] as const) : (['Verbindung', 'Größen', 'Passung', 'Download'] as const));
  lastStep = $derived(this.steps.length - 1);
  /** Prüfung des Freiform-Aufbaus (reine Rechnung, ohne CAD-Kern) */
  freePlan = $derived(this.kind.freeform ? planFree($state.snapshot(this.free)) : null);
  freeIssues = $derived(this.freePlan?.issues ?? []);
  nozzleIssues = $derived(this.kind.nozzle ? nozzleIssues(this.nozzle) : []);
  /** Download gesperrt, solange der Adapter einen Fehler hat (Berechnung gescheitert oder Aufbau fehlerhaft) */
  blocked = $derived(this.status === 'error' || this.freeIssues.some((x) => x.level === 'error') || this.nozzleIssues.some((x) => x.level === 'error') || !!this.layoutError);
  params = $derived(deriveParams(this.input));
  /** Druckhilfe gibt es nur, wenn der Stecker mit der Spitze nach unten gedruckt wird */
  hasSupport = $derived(this.kind.id === 'M' || this.kind.id === 'MF' || (!!this.kind.freeform && freeMaleOnBed(this.free)));
  hasSwivel = $derived(this.kind.id === 'FH' || this.kind.id === 'MH');
  /** Beim Drehring an der Kupplung (FxxHyy) begrenzt die Geometrie des Originals das Spaltmaß (7 mm: 0,5, 9 mm: 0,35) */
  swivelMax = $derived(slipRingGapMax(this.input.generalMaterialWidth, this.kind.id === 'MH'));

  pipe = $derived.by((): PipeSpec => {
    const m = this.machine;
    const w = Math.max(2, m.wall);
    const toInner = (d: number) => (m.mode === 'over' ? d + m.allowance : d - m.allowance - 2 * w);
    // D1 (am Übergang, tief im Adapter) ↔ Stutzen vorne; D2 (Öffnung des Adapters) ↔ Stutzen in der Tiefe
    return {
      d1Inner: round2(toInner(m.dOpen)),
      d2Inner: round2(toInner(m.dDepth)),
      length: m.length,
      wall: w,
      transition: Math.max(2, m.transition),
      screwHoles: m.holes,
      // Extras nur, wenn gewählt (sonst bleiben die Cache-Schlüssel wie bisher)
      ...(m.ribs || m.slots ? { mode: m.mode, allowance: m.allowance, ribs: m.ribs, slots: m.slots && m.mode === 'over' } : {}),
    };
  });
  pipeRows = $derived([
    { label: 'innen Ø', a: this.pipe.d1Inner, b: this.pipe.d2Inner },
    { label: 'außen Ø', a: this.pipe.d1Inner + 2 * this.pipe.wall, b: this.pipe.d2Inner + 2 * this.pipe.wall },
  ]);
  buildOpts = $derived(this.kind.freeform ? { free: $state.snapshot(this.free) } : this.kind.machine ? { pipe: this.pipe } : this.kind.gate ? { gate: $state.snapshot(this.gate) } : {});
  /** Schieber einzeln: abgeleitete Maße (kleinster Wandabstand, Lochabstand, …) */
  gateLay = $derived(gateLayout(this.gate));

  /** Dateiname mit allen Abweichungen von den Standardeinstellungen, damit Testdrucke unterscheidbar bleiben */
  baseName = $derived(this.kind.fileName(this.params, this.buildOpts));
  fileName = $derived.by(() => {
    const i = this.input;
    const extra: string[] = [];
    if (this.kind.gate) {
      if (this.gate.pipeGap !== DEFAULT_GATE.pipeGap) extra.push(`Spiel ${fmt(this.gate.pipeGap, 2)}`);
      if (this.gate.plateGap !== DEFAULT_GATE.plateGap) extra.push(`Platte ${fmt(this.gate.plateGap, 2)}`);
      return [this.baseName, ...extra].join(' ');
    }
    if (i.maleFemaleGapSize !== START_INPUT.maleFemaleGapSize) extra.push(`Spalt ${fmt(i.maleFemaleGapSize, 2)}`);
    if (this.hasSwivel && i.slipRingGapSize !== START_INPUT.slipRingGapSize) extra.push(`Drehring ${fmt(i.slipRingGapSize, 2)}`);
    if (i.generalMaterialWidth !== START_INPUT.generalMaterialWidth) extra.push(`Wand ${i.generalMaterialWidth} mm`);
    if (this.kind.machine && this.machine.ribs) extra.push('Rippen');
    if (this.kind.machine && this.machine.slots && this.machine.mode === 'over') extra.push('Schlitze');
    return [this.baseName, ...extra].join(' ');
  });
  code = $derived.by(() => {
    const k = this.kind;
    if (k.freeform) return freeSummary(this.free).code;
    if (k.gate) return gateName(this.gate).code;
    if (k.machine) return `${k.ends.top === 'female' ? 'F' : 'M'}${fmt(k.ends.top === 'female' ? this.input.femaleDiameterInner : this.input.maleDiameterInner)}/${fmt(this.machine.dOpen)}`;
    return this.baseName.replace('osVAC neo ', '');
  });

  /**
   * Stutzen: wie weit das schräge Stück zwischen Anschluss und Rohrteil oben breiter ist als unten (mm, außen bzw. innen).
   * Gedruckt wird mit dem Rohrteil unten; ist das Stück steiler als 45°, hängt es in der Luft. Liefert die nötige
   * Übergangslänge (ganze mm) oder 0, wenn es passt.
   */
  machineSteep = $derived.by(() => {
    if (!this.kind.machine) return 0;
    const p = this.params, s = this.pipe;
    const rIn = this.kind.id === 'MACHINE_M' ? p.maleDiameterInner / 2 : p.femaleDiameterInner / 2;
    const rOut = this.kind.id === 'MACHINE_M' ? p.maleDiameterOuter / 2 : rIn + p.generalMaterialWidth;
    const r1i = s.d1Inner / 2, r1o = r1i + pipeWall(s);
    const wider = Math.max(rOut - r1o, rIn - r1i);
    return wider > s.transition + 0.05 ? Math.ceil(wider - 1e-9) : 0;
  });

  /** Plausibilität der Stutzen-Maße (wird schon im Schritt Größen angezeigt) */
  /** Hinweise zum Stutzen, mit Vorschlag „… auf … setzen“ (fields: Beschriftung der Zahlenfelder, die markiert werden) */
  machineWarnings = $derived.by(() => {
    const w: { text: string; fixes?: { label: string; fields: string[]; set: () => void }[] }[] = [];
    if (!this.kind.machine) return w;
    const m = this.machine, pipe = this.pipe;
    const f = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const depth = (v: number) => ({ label: `Tiefe auf ${v} mm setzen`, fields: ['Tiefe (Steckweg)'], set: () => void (this.machine.length = v) });
    if (m.mode === 'over' && m.dDepth < m.dOpen - 0.05)
      w.push({ text: 'Hinten ist der Stutzen dünner als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht drauf. Bitte nachmessen.' });
    if (m.mode === 'into' && m.dDepth > m.dOpen + 0.05)
      w.push({ text: 'Innen ist die Öffnung weiter als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht hinein. Bitte nachmessen.' });
    if (Math.abs(m.dOpen - m.dDepth) > 8) w.push({ text: 'Vorne und in der Tiefe unterscheiden sich um mehr als 8 mm. Bitte nachmessen.' });
    if (pipe.d1Inner < 8 || pipe.d2Inner < 8) {
      // eingesteckt: dünnere Wand lässt innen mehr Platz (Innen-Ø = Öffnung − Luft − 2 × Wand)
      const wMax = Math.floor(((Math.min(m.dOpen, m.dDepth) - m.allowance - 8) / 2) * 2) / 2;
      const fix = m.mode === 'into' && wMax >= 2 && wMax < m.wall ? [{ label: `Wandstärke auf ${f(wMax)} mm setzen`, fields: ['Wandstärke'], set: () => void (this.machine.wall = wMax) }] : undefined;
      w.push({ text: 'Innen bleiben weniger als 8 mm frei. Maße oder Wandstärke prüfen.', fixes: fix });
    } else if (Math.min(pipe.d1Inner, pipe.d2Inner) < 0.5 * (this.kind.ends.top === 'female' ? this.input.femaleDiameterInner : this.input.maleDiameterInner))
      w.push({ text: 'Das Rohrteil ist innen weniger als halb so weit wie der Anschluss. Das bremst die Absaugung stark.' });
    if (this.machineSteep) {
      const L = this.machineSteep, part = this.kind.id === 'MACHINE_M' ? 'Stecker' : 'Kupplung';
      w.push({
        text: `${part} und Rohrteil sind sehr verschieden weit: Das schräge Stück dazwischen ist steiler als 45° und hängt beim Drucken in der Luft. ${L <= 40 ? `Mit ${L} mm Übergangslänge (Feineinstellungen) geht es ohne Stützen.` : 'Selbst mit 40 mm Übergangslänge bleibt es zu steil; dann im Slicer Stützen einschalten.'}`,
        fixes: L <= 40 ? [{ label: `Übergangslänge auf ${L} mm setzen`, fields: ['Übergangslänge'], set: () => void (this.machine.transition = L) }] : undefined,
      });
    }
    if (m.length < 10) w.push({ text: `Unter 10 mm Tiefe hält der Adapter kaum ${m.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}. Ab 10 mm hält er besser.`, fixes: [depth(10)] });
    if (m.holes && m.length < 12)
      w.push({
        text: 'Für die Schraubenlöcher braucht es mindestens 12 mm Tiefe. Tiefe erhöhen oder die Löcher in den Feineinstellungen abwählen.',
        fixes: [depth(12), { label: 'Schraubenlöcher abwählen', fields: [], set: () => void (this.machine.holes = false) }],
      });
    return w;
  });

  /** Hinweise im Download; step: in welchem Schritt man es ändert (Link „Zu …“) */
  warnings = $derived.by(() => {
    const w: { text: string; step?: number }[] = [];
    const sizes = (text: string) => w.push({ text, step: 1 });
    for (const k of this.kind.diameters) {
      const v = this.input[k];
      if (!(v >= 15 && v <= 60)) sizes(`${LABELS[k].name}: ${fmt(v)} mm liegt außerhalb von 15 bis 60 mm.`);
      else if (!LABELS[k].presets.includes(v)) sizes(`${LABELS[k].name}: ${fmt(v)} mm ist kein Standardmaß von osVAC neo. Passt nur zu Teilen derselben Größe.`);
    }
    for (const x of this.machineWarnings) sizes(x.text);
    if (this.kind.nozzle) for (const x of this.nozzleIssues) sizes(x.text);
    if (this.kind.freeform) {
      for (const x of this.freeIssues) sizes(x.text);
      for (const t of this.buildNotes) sizes(t);
    }
    // übliche Druckbetten: 220–256 mm Kantenlänge, Bauhöhe ab 250 mm
    if (this.dims && (this.dims.width > 220 || this.dims.height > 250))
      sizes(`Der Adapter ist ${fmt(this.dims.width, 0)} mm breit und ${fmt(this.dims.height, 0)} mm hoch. Das passt nicht auf jeden Drucker (viele haben 220 bis 256 mm). Bitte mit deinem Druckbett vergleichen.`);
    if (this.kind.gate) {
      if (!(this.gate.d >= 15 && this.gate.d <= 60)) sizes(`Rohr: ${fmt(this.gate.d)} mm liegt außerhalb von 15 bis 60 mm.`);
      return w;
    }
    if (this.input.maleFemaleGapSize < 0.1 || this.input.maleFemaleGapSize > 0.5) w.push({ text: 'Das Spiel liegt außerhalb von 0,1 bis 0,5 mm. Stecker und Kupplung passen dann kaum zusammen.', step: 2 });
    return w;
  });

  /** PETG-Bedarf; Druckhilfe zählt mit, wenn sie gedruckt wird */
  filament = $derived.by(() => {
    const m = this.measures;
    if (!m) return null;
    const withHelper = this.supports && this.hasSupport;
    return estimateFilament(m.volume + (withHelper ? m.helperVolume : 0), m.area + (withHelper ? m.helperArea : 0));
  });
  gramsText = $derived.by(() => {
    const f = this.filament;
    if (!f) return '–';
    const a = Math.round(f.gramsMin), b = Math.round(f.gramsMax);
    return a === b ? `${a}` : `${a}–${b}`;
  });

  helpTexts: Record<string, string> = $derived({
    gap: 'Der Wert gilt für Stecker und Kupplung zusammen. Steckt ein neues Teil in einem älteren mit 0,2 mm, wirkt nur die Hälfte: eingestellte 0,4 mm wirken dann wie 0,3 mm.',
    swivel: `Der Drehring wird gleich mitgedruckt. Ist das Spiel zu klein, klebt er fest. Höchstens ${fmt(this.swivelMax, 2)} mm${this.kind.id === 'FH' ? ` bei ${this.input.generalMaterialWidth} mm Materialstärke, sonst berührt der äußere Ring den Schlauchteil` : ''}.`,
    refill: 'Setzt Platte und Löcher wieder auf Werte, die zur Öffnung passen, so wie beim ersten Umschalten auf „Rechteckig“ oder „Rund“. Deine eigenen Eingaben in diesen Feldern werden dabei ersetzt. Solange du dort nichts selbst änderst, passt das Programm die Werte von allein an, wenn sich die Öffnung ändert.',
    pipeGap: 'Die Muffe ist um das Doppelte dieses Werts weiter als das Rohr außen. Sitzt das Rohr zu stramm: größer. Rutscht es heraus: kleiner, oder das Rohr mit etwas Klebeband umwickeln.',
    plateGap: this.kind.gate || (!!this.kind.freeform && this.free.blocks.some((b) => b.type === 'gate'))
      ? 'Luft über und unter der Platte im Kanal, in Schritten von 0,1 mm (passend zu 0,2 mm Schichthöhe). Um die Bohrung drücken zwei Dichtlippen (0,4 mm hoch) auf die Platte, beim Standardwert 0,3 mm je Seite 0,1 mm: das dichtet und hält die Platte durch Reibung. Ab 0,4 mm liegen die Lippen nur noch an. Das gilt für 0,2 mm Schichthöhe; bei anderen Schichthöhen rundet der Slicer. Geht die Platte zu schwer: größer. Zieht der Schieber Falschluft oder rutscht die Platte von allein: kleiner.'
      : 'Luft über und unter der Platte im Schlitz. Klemmt die Platte: größer. Klappert sie oder zieht viel Falschluft: kleiner. Die Noppen zum Einrasten passen sich an.',
    wallDist: `Gemessen von der Wand bis zur Mitte des Rohrs. ${fmt(this.gateLay.minA)} mm ist der kleinste Wert, dann sitzt ${this.gate.mount === 'clip' ? 'der Wandhalter' : 'der Schieber'} direkt an der Wand. Mehr Abstand hilft z. B. über Fußleisten oder Kabelkanäle hinweg, höchstens ${WALL_MORE} mm mehr (${fmt(this.gateLay.maxA)} mm), sonst wird die Halterung wacklig.`,
    orient: 'Wie das Rohr an der Wand entlangläuft. Der Schlitz der Schlüssellöcher muss nach oben zeigen: bei senkrechtem Rohr zum oberen Ende, bei waagerechtem zur Seite.',
    bleedGap: 'Luft zwischen Drehring und Rohr, auch an den schrägen Flanken oben und unten. Der Ring wird gleich mitgedruckt: Ist das Spiel zu klein, klebt er fest; ist es groß, dreht er sehr leicht und zieht etwas mehr Nebenluft, auch wenn er zu ist. Für PETG eher 0,35–0,4 mm.',
    filament: 'Der kleinere Wert gilt für ein Teil mit 3 Wänden und 15 % Füllung, der größere für ein komplett gefülltes Teil. Die Füllung stellst du im Slicer ein.',
  });

  /** Nebenluft-Regler (eigene Verbindung oder Baustein in der Freiform): Spiel am Drehring in Passung */
  hasBleed = $derived(!!this.kind.freeform && this.free.blocks.some((b) => b.type === 'bleed'));
  get bleedGap(): number {
    return (this.kind.bleed ? this.bleed.bleedGap : this.freeState.bleedGap) ?? BLEED.gap;
  }
  set bleedGap(v: number) {
    if (this.kind.bleed) this.bleed.bleedGap = v;
    else this.freeState.bleedGap = v;
  }
  /** Freiform mit Schieber: Spiel der Platte einstellbar (in Passung) */
  freeHasGate = $derived(!!this.kind.freeform && this.free.blocks.some((b) => b.type === 'gate'));
  /** Druckhinweise zum Schieber einzeln */
  gateTips = $derived.by(() => {
    const s = this.gate, L = this.gateLay;
    const t = [
      'Der Schieber besteht aus Unterteil, Oberteil und Platte. Beide Gehäuseteile stehen mit der Muffe auf dem Druckbett, ohne Stützen. Die Platte liegt flach daneben.',
      `Zusammenbau: ${L.screwN === 2 ? 'zwei' : 'vier'} Muttern M3 von unten in die Sechskant-Taschen des Unterteils drücken. Die Platte mit den dicken Enden nach oben in den Kanal legen. Oberteil aufsetzen und mit ${L.screwN === 2 ? 'zwei' : 'vier'} Schrauben M3 × ${L.screwLen} (Zylinderkopf) gleichmäßig ${L.screwN === 2 ? 'abwechselnd' : 'über Kreuz'} anziehen, nur so fest, dass die Platte noch gleitet.`,
      'Herausziehen öffnet, hineinschieben schließt. Die dicken Enden schlagen bei „auf“ und „zu“ am Gehäuse an, so bleibt die Platte im Schieber. Die Dichtlippen um die Bohrung drücken leicht auf die Platte, dadurch zieht der Schieber kaum Falschluft und die Platte bleibt in jeder Stellung stehen. Zum Herausnehmen das Oberteil abschrauben.',
      'Mit 0,2 mm Schichthöhe drucken (auch die erste Schicht): Boden, Kanal und Dichtlippen sind genau auf dieses Raster ausgelegt. Bei anderen Schichthöhen rundet der Slicer, die Lippen drücken dann zu wenig oder zu stark.',
      `Das Rohr (außen Ø ${fmt(s.d)} mm) auf beiden Seiten bis zum Anschlag einstecken.`,
    ];
    const at = `Die Rohrmitte liegt ${fmt(L.A)} mm vor der Wand.`;
    if (s.mount === 'plate') t.push(`Vier Senklöcher für Senkkopfschrauben Ø 4 mm, ${this.gatePitch}. ${at}`);
    if (s.mount === 'keyhole')
      t.push(
        L.keyTurned
          ? `Zwei Schlüssellöcher, ${this.gatePitch}: zwei Schrauben (Ø 4 mm, Kopf bis 8 mm) waagerecht nebeneinander in die Wand drehen und etwa 4 mm herausstehen lassen. Den Schieber mit der Seite der Schlüssellöcher nach oben einhängen; das Rohr läuft dann waagerecht, die Platte gleitet senkrecht. ${at}`
          : `Zwei Schlüssellöcher, ${this.gatePitch}: zwei Schrauben (Ø 4 mm, Kopf bis 8 mm) waagerecht nebeneinander in die Wand drehen und etwa 4 mm herausstehen lassen. Den Schieber mit dem oberen Ende (wie gedruckt) nach oben einhängen; das Rohr läuft dann senkrecht. ${at}`,
      );
    if (s.mount === 'clip') t.push(`Der Wandhalter ist ein eigenes Teil für das Rohr neben dem Schieber. Mit zwei Senkkopfschrauben Ø 4 mm (${this.gatePitch}) an die Wand schrauben und das Rohr hineindrücken. ${at}`);
    if (s.mount === 'keyhole' && s.orient === 'turned') t.push('Bei waagerechtem Rohr gleitet die Platte senkrecht. Die Dichtlippen halten sie durch Reibung, auch gegen ihr Gewicht; rutscht sie doch, in „Passung“ das Spiel der Platte verkleinern.');
    return t;
  });

  /** Abstände der Schrauben in Worten (zum Anzeichnen an der Wand) */
  gatePitch = $derived.by(() => {
    const [q, l] = this.gateLay.pitch;
    if (q && l) return `Lochabstand ${fmt(q)} mm quer zum Rohr und ${fmt(l)} mm entlang dem Rohr`;
    return `Lochabstand ${fmt(q || l)} mm${this.gate.mount === 'keyhole' ? ' waagerecht' : ''}`;
  });

  /** Stützen nötig? (nur nach fertiger Berechnung bekannt; die Teile von osVAC neo sind ohne Stützen druckbar) */
  needsSupportMaterial = $derived((!!this.kind.freeform || !!this.kind.machine || !!this.kind.gate) && this.overhang > 40);
  /**
   * Freiform: Kupplung steht auf ihrer Öffnung (Ende auf dem Bett, mit Schieber beide Enden). Die Decke der Bajonett-Nut
   * hängt dann waagerecht in der Luft (etwa 2 mm breit); die Stützen-Prüfung zählt die Teile von osVAC neo nicht mit.
   */
  femaleOnBed = $derived.by((): string | null => {
    if (!this.kind.freeform) return null;
    const f = this.free;
    const ends = f.blocks.some((b) => b.type === 'gate') ? (['A', 'B'] as const) : [f.bed];
    const hit = ends.filter((e) => (e === 'A' ? f.a.type : f.b.type) === 'female');
    return hit.length ? hit.map((e) => (e === 'A' ? 'Anschluss A' : 'Ende B')).join(' und ') : null;
  });
  femaleOnBedText = $derived(
    this.femaleOnBed
      ? `Stützen nötig: Die Kupplung an ${this.femaleOnBed} steht beim Drucken auf ihrer Öffnung. Innen hängt dann die Decke der Bajonett-Nut (etwa 2 mm breit) waagerecht in der Luft und wird ohne Stützen unsauber; die Nasen des Steckers rasten dort ein. Im Slicer „Stützen nur auf dem Druckbett“ einschalten (die Stützen stehen in der Öffnung und lassen sich herausziehen) oder dort einen Stecker wählen.`
      : '',
  );

  /** Druckhinweise je Adaptertyp (die Dateien sind schon so ausgerichtet wie in der Vorschau) */
  printTips = $derived.by(() => {
    const t: string[] = ['Die Dateien liegen schon richtig herum, genau wie in der Vorschau. Im Slicer nicht drehen.'];
    if (this.hasSupport)
      t.push('Der Stecker steht mit der Spitze auf einer Druckhilfe (in der Vorschau weiß). Nach dem Druck die Druckhilfe mit einer Zange abbrechen.');
    if (this.machineSteep)
      t.push('Stützen nötig: Das schräge Stück zwischen Anschluss und Rohrteil ist steiler als 45°. Im Slicer „Stützen nur auf dem Druckbett“ einschalten, oder in „Größen“ die Übergangslänge erhöhen.');
    else if (this.needsSupportMaterial)
      t.push('Stützen nötig: Ein Teil des Adapters hängt schräg in der Luft, meist unter einem Bogen oder Übergang. Im Slicer „Stützen nur auf dem Druckbett“ einschalten. Ein längerer Übergang oder ein anderes Ende auf dem Druckbett kann das vermeiden.');
    else if (!this.femaleOnBed) t.push('Stützen werden nicht gebraucht, im Slicer ausschalten.');
    if (this.femaleOnBed) t.push(this.femaleOnBedText);
    if (this.hasSwivel)
      t.push(`Nach dem Druck den Schlauchteil einmal kräftig gegen ${this.kind.id === 'FH' ? 'die Kupplung' : 'das Gehäuse'} drehen, bis sich der Ring leicht bewegt. Klemmt er, beim nächsten Mal in „Passung“ das Spiel am Drehring erhöhen.`);
    if (this.kind.machine && this.machine.holes) t.push('Die drei kleinen Löcher sind für Senkkopfschrauben (Ø 4 mm), falls der Adapter zusätzlich halten soll.');
    if (this.kind.gate) t.push(...this.gateTips);
    if (this.kind.freeform && this.free.blocks.some((x) => x.type === 'gate'))
      t.push(
        `Mit Schieber wird der Adapter in zwei Teilen gedruckt: das Teil mit Anschluss A steht auf A, das Teil mit Ende B auf B, die Trennflächen oben. Die Schieberplatte liegt flach davor. Zusammenbau: ${this.freePlan?.split?.screwN === 2 ? 'zwei' : 'vier'} Muttern M3 von unten in die Sechskant-Taschen am Gehäuse des A-Teils drücken, die Platte mit den dicken Enden nach oben in den Kanal legen, das B-Teil aufsetzen und mit ${this.freePlan?.split?.screwN === 2 ? 'zwei' : 'vier'} Schrauben M3 × ${this.freePlan?.split?.screw ?? 14} (Zylinderkopf) gleichmäßig anziehen, nur so fest, dass die Platte noch gleitet. Herausziehen öffnet, hineinschieben schließt; die dicken Enden schlagen an. Die Dichtlippen um die Bohrung halten die Platte durch Reibung und dichten gegen Falschluft. Dafür mit 0,2 mm Schichthöhe drucken (auch die erste Schicht): Boden und Trennfläche liegen genau im 0,2-mm-Raster.`,
      );
    if (this.kind.freeform && this.free.b.type === 'nozzle') {
      const tp = this.free.b.tip;
      t.push('Die Düse steht mit dem Anschluss auf dem Druckbett, die Spitze zeigt nach oben. Für eine stabile Düse im Slicer mindestens 3 Wände einstellen; bei 2 mm Wand ist sie dann durchgehend massiv.');
      if (tp?.brush) t.push('In die Nut im Rand passt eine Streifenbürste mit etwa 2 mm breitem Rücken (Meterware, „Streifenbürste“ oder „Leistenbürste“). Mit Sekunden- oder Montagekleber einkleben, die Borsten etwa 5 mm über die Spitze stehen lassen.');
      else if (tp?.ring) t.push('Der Schutzring macht den Rand dicker und schont Möbel. Er ist zur Wand hin abgestuft und druckt ohne Stützen.');
    }
    if (this.hasBleed)
      t.push(`Der Drehring wird gleich mitgedruckt. Nach dem Druck den Ring ein paarmal kräftig hin und her drehen, bis er leicht läuft. Um 60° drehen: von ganz auf (Fenster übereinander) bis ganz zu. Dreht er zu schwer oder klebt fest: in „Passung“ mehr Spiel einstellen (jetzt ${fmt(this.bleedGap, 2)} mm). Die unterste Schicht des Rings hängt mit diesem Spiel über dem Bund; meldet der Slicer dort „schwebende Bereiche“, ist das gewollt (keine Stützen einschalten, sonst wächst der Ring fest).`);
    const c = this.free.c;
    if (this.kind.freeform && c && c.type !== 'device' && this.free.blocks.some((x) => x.type === 'branch'))
      t.push(`${c.type === 'female' ? 'Die Kupplung' : 'Der Stecker'} an Ende C (am Abzweig) steht schräg: im Slicer „Stützen nur auf dem Druckbett“ einschalten.`);
    const dv = this.free.b.device;
    if (this.kind.freeform && this.free.b.type === 'device' && dv.mode === 'flange') {
      const d = (dv.flangeLayout === 'auto' ? AUTO_HOLE_D : dv.holeD).toLocaleString('de-DE');
      t.push(`Der Flansch hat Löcher Ø ${d} mm mit Senkung für Senkkopfschrauben. Die Senkung liegt oben, auf der Seite zum Adapter.`);
      if (flangeExtent(dv, this.free.wall) >= BRIM_FROM)
        t.push('Große Flanschplatte: Im Slicer einen Brim (Rand, etwa 5 mm) einschalten, damit sich die Ecken beim Drucken nicht vom Bett lösen.');
      if (dv.seal) t.push(`Nach dem Druck selbstklebendes Moosgummi-Dichtband ${dv.sealW} mm breit in die Nut auf der Unterseite kleben.`);
    }
    return t;
  });

  // ---------------------------------------------------------------- Zurücksetzen
  /** Standardmaße je Befestigung: ein Stutzen wird zur Maschine hin dicker, eine Öffnung nach innen enger */
  machineDefault(key: keyof Machine, mode: MachineMode = this.machine.mode) {
    return mode === 'into' && (key === 'dOpen' || key === 'dDepth') ? (key === 'dOpen' ? 33 : 32) : MACHINE_DEFAULT[key];
  }
  setMode(mode: MachineMode) {
    const m = this.machine, old = m.mode;
    if (old === mode) return;
    // unveränderte Standardmaße mitwechseln
    if (m.dOpen === this.machineDefault('dOpen', old) && m.dDepth === this.machineDefault('dDepth', old)) {
      m.dOpen = this.machineDefault('dOpen', mode) as number;
      m.dDepth = this.machineDefault('dDepth', mode) as number;
    }
    m.mode = mode;
  }
  /** Stutzen-Maße inkl. Feineinstellungen; die Befestigungsart bleibt */
  machineIsDefault = $derived(MACHINE_KEYS.every((k) => this.machine[k] === this.machineDefault(k)));
  resetMachine() {
    for (const k of MACHINE_KEYS) (this.machine[k] as number | boolean) = this.machineDefault(k) as number | boolean;
  }
  /** Passung: Spaltmaße, Materialstärke, Beschriftung, Druckhilfe */
  fitDefault = $derived(
    this.kind.gate
      ? this.gate.pipeGap === DEFAULT_GATE.pipeGap && this.gate.plateGap === DEFAULT_GATE.plateGap
      : this.input.maleFemaleGapSize === START_INPUT.maleFemaleGapSize &&
      (!this.hasSwivel || this.input.slipRingGapSize === START_INPUT.slipRingGapSize) &&
      this.input.generalMaterialWidth === START_INPUT.generalMaterialWidth &&
      (!this.hasSupport || this.supports) &&
      (!this.freeHasGate || (this.free.gateGap ?? GATE_GAP) === GATE_GAP) &&
      (!this.hasBleed || this.bleedGap === BLEED.gap),
  );
  resetFit() {
    if (this.kind.gate) {
      this.gate.pipeGap = DEFAULT_GATE.pipeGap;
      this.gate.plateGap = DEFAULT_GATE.plateGap;
      return;
    }
    this.input.maleFemaleGapSize = START_INPUT.maleFemaleGapSize;
    if (this.hasSwivel) this.input.slipRingGapSize = START_INPUT.slipRingGapSize;
    this.input.generalMaterialWidth = START_INPUT.generalMaterialWidth;
    if (this.hasSupport) this.supports = true;
    if (this.freeHasGate) delete this.free.gateGap;
    if (this.hasBleed) this.bleedGap = BLEED.gap;
  }
  setDia(k: DiameterKey, v: number) {
    this.input[k] = Math.round(v * 10) / 10;
  }
  /** Schieber einzeln: Maße und Befestigung auf Standard (Passung bleibt) */
  gateIsDefault = $derived((['d', 'depth', 'mount', 'orient', 'wallDist'] as const).every((k) => this.gate[k] === DEFAULT_GATE[k]));
  resetGate() {
    for (const k of ['d', 'depth', 'mount', 'orient', 'wallDist'] as const) (this.gate[k] as number | GateMount | GateOrient) = DEFAULT_GATE[k];
  }
  /** Wandabstand eingeben: bis zum kleinsten Wert heißt „direkt an der Wand“ (wächst dann mit dem Rohr mit) */
  setWallDist(v: number) {
    this.gate.wallDist = v <= this.gateLay.minA + 0.05 ? 0 : Math.round(Math.min(v, this.gateLay.maxA) * 10) / 10;
  }

  // ---------------------------------------------------------------- Bauaufträge
  /** volle Berechnung mit Rändelung und Beschriftung */
  spec() {
    return makeBuild(this.kindId, $state.snapshot(this.input), { text: true, knurl: true, supports: true, ...$state.snapshot(this.buildOpts) });
  }
  /** schnelle Vorschau ohne Rändelung und Schrift */
  quickSpec() {
    const opts = $state.snapshot(this.buildOpts) as { free?: FreeSpec };
    // Freiform: Extras am Gerät erst in der vollen Berechnung (jeder Schnitt kostet Zeit)
    if (opts.free) opts.free.b.device = { ...opts.free.b.device, ribs: false, slots: false, holes: false, notch: false, preview: true };
    return makeBuild(this.kindId, $state.snapshot(this.input), { text: false, knurl: false, supports: true, ...opts });
  }
  /** alles, was eine neue Berechnung auslöst */
  buildKey = $derived(
    JSON.stringify([this.kindId, this.input, true, this.kind.machine ? this.pipe : null, this.kind.freeform ? this.free : null, this.kind.gate ? this.gate : null]),
  );

  // ---------------------------------------------------------------- Export und Druckbett
  async download(f: ExportFormat) {
    this.activeFormat = f;
    this.exporting = f;
    try {
      const withHelpers = this.supports && this.hasSupport;
      const r = await exportFile(this.spec(), f, this.fileName, withHelpers);
      const key = JSON.stringify(this.spec().input) + f + withHelpers;
      for (const old of this.files.filter((x) => x.fileName === r.fileName)) URL.revokeObjectURL(old.url);
      this.files = [{ ...r, key }, ...this.files.filter((x) => x.fileName !== r.fileName)];
    } catch (e) {
      this.errorMsg = userMessage(e);
    } finally {
      this.exporting = null;
    }
  }
  /** Liste der erzeugten Dateien leeren und den Speicher der Dateien freigeben */
  clearFiles() {
    for (const f of this.files) URL.revokeObjectURL(f.url);
    this.files = [];
  }
  plateKey() {
    return JSON.stringify([this.kindId, $state.snapshot(this.input), true, this.supports && this.hasSupport, this.kind.machine ? $state.snapshot(this.machine) : null, this.kind.freeform ? $state.snapshot(this.free) : null, this.kind.gate ? $state.snapshot(this.gate) : null]);
  }
  onPlate = $derived(this.plate.some((p) => p.key === this.plateKey()));
  addToPlate() {
    if (this.onPlate) return;
    this.plate = [...this.plate, { req: this.spec(), includeHelpers: this.supports && this.hasSupport, label: this.fileName, key: this.plateKey() }];
  }
  removeFromPlate(i: number) {
    this.plate = this.plate.filter((_, j) => j !== i);
  }
  async downloadPlate(f: ExportFormat) {
    this.plateBusy = f;
    try {
      const r = await exportPlate(this.plate.map(({ req, includeHelpers, label }) => ({ req, includeHelpers, label })), f, `osVAC neo Druckbett ${this.plate.length} Adapter`);
      this.files = [{ ...r, key: 'plate' + f }, ...this.files.filter((x) => x.fileName !== r.fileName)];
    } catch (e) {
      this.errorMsg = userMessage(e);
    } finally {
      this.plateBusy = null;
    }
  }

  // ---------------------------------------------------------------- Speichern im Browser
  /** zu speichernder Stand (ohne Berechnungsergebnisse und Dateien) */
  saved = $derived(
    JSON.stringify({
      step: this.step,
      kindId: this.kindId,
      input: this.input,
      supportsOff: this.supportsOff,
      machine: this.machine,
      free: this.freeState,
      freeTemplate: this.freeTemplate,
      fromNozzle: this.fromNozzle,
      nozzle: this.nozzle,
      bleed: this.bleed,
      gate: this.gate,
    }),
  );
  /** Stand beim ersten Start (zum Vergleich für „Neu anfangen“; ohne Schritt, Freiform ohne IDs) */
  private static strip(j: string) {
    const o = JSON.parse(j);
    delete o.step;
    if (o.free) o.free = specKey(o.free);
    return JSON.stringify(o);
  }
  private readonly startKey = AppState.strip(this.saved);
  /** Ist etwas anders als beim ersten Start der App? */
  changed = $derived(AppState.strip(this.saved) !== this.startKey);
  /** Alle Eingaben auf den Anfang; Druckbett und fertige Dateien bleiben */
  resetAll() {
    this.kindId = 'MF';
    this.input = { ...START_INPUT };
    this.supportsOff = {};
    this.machine = { ...MACHINE_DEFAULT };
    this.freeState = TEMPLATES[0].make();
    this.freeTemplate = TEMPLATES[0].id;
    this.nozzle = structuredClone(DEFAULT_NOZZLE);
    this.bleed = { m: 32, f: 32, bleedGap: BLEED.gap };
    this.fromNozzle = false;
    this.gate = { ...DEFAULT_GATE };
    this.freeOpen = null;
    this.helpOpen = {};
    this.errorMsg = '';
    this.step = 0;
  }
  save() {
    try {
      localStorage.setItem(STORE_KEY, this.saved);
      localStorage.setItem(PLATE_KEY, this.plateSaved);
    } catch {
      /* Speicher voll oder gesperrt: dann eben ohne */
    }
  }
  plateSaved = $derived(JSON.stringify(this.plate.map(({ req, includeHelpers, label, key }) => ({ kind: req.kind, input: req.input, options: req.options, includeHelpers, label, key }))));
  /** Druckbett vom letzten Mal; nur Einträge mit bekanntem Typ und vollständigen Angaben */
  private loadPlate() {
    try {
      const raw = localStorage.getItem(PLATE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      this.plate = list
        .filter((x) => x && typeof x.kind === 'string' && kindById(x.kind)?.available && x.input && typeof x.input === 'object' && x.options && typeof x.options === 'object' && typeof x.label === 'string' && typeof x.key === 'string')
        .map((x) => ({ req: makeBuild(x.kind, { ...START_INPUT, ...x.input }, x.options), includeHelpers: x.includeHelpers === true, label: x.label, key: x.key }));
    } catch {
      /* beschädigt: leeres Druckbett */
    }
  }
  /** Gespeicherten Stand übernehmen; unbekannte oder beschädigte Werte bleiben auf dem Standard. */
  load() {
    this.loadPlate();
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
      if (typeof s.kindId === 'string' && kindById(s.kindId)?.available) this.kindId = s.kindId;
      if (s.input && typeof s.input === 'object')
        for (const k of Object.keys(START_INPUT) as (keyof OsvacInput)[]) if (num(s.input[k])) (this.input[k] as number) = Math.min(INPUT_LIMITS[k][1], Math.max(INPUT_LIMITS[k][0], s.input[k]));
      if (this.input.generalMaterialWidth !== 7 && this.input.generalMaterialWidth !== 9) this.input.generalMaterialWidth = START_INPUT.generalMaterialWidth;
      // Beschriftung ist nicht mehr abwählbar: ein gespeichertes „ohne Text“ wird nicht übernommen
      if (s.supportsOff && typeof s.supportsOff === 'object') {
        for (const [k, v] of Object.entries(s.supportsOff)) if (v === true && kindById(k)) this.supportsOff = { ...this.supportsOff, [k]: true };
      } else if (s.supports === false) this.supports = false; // älterer Stand: eine Einstellung für alle, gilt jetzt nur für die zuletzt offene Verbindung
      if (s.machine && typeof s.machine === 'object') {
        for (const k of MACHINE_KEYS) if (MACHINE_FLAGS.includes(k) ? typeof s.machine[k] === 'boolean' : num(s.machine[k])) (this.machine[k] as number | boolean) = s.machine[k];
        if (s.machine.mode === 'over' || s.machine.mode === 'into') this.machine.mode = s.machine.mode;
      }
      if (s.free && typeof s.free === 'object' && Array.isArray(s.free.blocks) && s.free.a && s.free.b?.device) {
        const fresh = TEMPLATES[0].make();
        this.freeState = withFreshIds({ ...fresh, ...s.free, a: { ...fresh.a, ...s.free.a }, b: { ...fresh.b, ...s.free.b, device: { ...fresh.b.device, ...s.free.b.device } } });
        const fs = this.freeState;
        // Flansch liegt immer mit Ende B auf dem Bett, die Düse mit Anschluss A
        if (fs.b.type === 'device' && fs.b.device.mode === 'flange') fs.bed = 'B';
        if (fs.b.type === 'nozzle') fs.bed = 'A';
        if (typeof fs.gateGap === 'number') fs.gateGap = snapPlateGap(fs.gateGap);
      }
      if (s.gate && typeof s.gate === 'object') {
        // Werte auf die Bereiche der Eingabefelder begrenzen; das Spiel der Platte auf das Raster des Schiebers (ältere
        // Stände hatten 0,25 oder 0,3 ohne Raster)
        const lim: Record<'d' | 'depth' | 'wallDist' | 'pipeGap', [number, number]> = { d: [15, 60], depth: [10, 50], wallDist: [0, 500], pipeGap: [0.1, 1] };
        for (const k of ['d', 'depth', 'wallDist', 'pipeGap'] as const) if (num(s.gate[k])) this.gate[k] = Math.min(lim[k][1], Math.max(lim[k][0], s.gate[k]));
        if (num(s.gate.plateGap)) this.gate.plateGap = snapPlateGap(s.gate.plateGap);
        if (typeof s.gate.mount === 'string' && s.gate.mount in MOUNT_LABELS) this.gate.mount = s.gate.mount;
        if (typeof s.gate.orient === 'string' && s.gate.orient in ORIENT_LABELS) this.gate.orient = s.gate.orient;
      }
      if (typeof s.fromNozzle === 'boolean') this.fromNozzle = s.fromNozzle;
      if (s.bleed && typeof s.bleed === 'object') {
        const z = s.bleed;
        if (num(z.m)) this.bleed.m = Math.min(60, Math.max(15, z.m));
        if (num(z.f)) this.bleed.f = Math.min(60, Math.max(15, z.f));
        if (num(z.bleedGap)) this.bleed.bleedGap = Math.min(BLEED.gapMax, Math.max(BLEED.gapMin, Math.round(z.bleedGap * 100) / 100));
      }
      if (s.nozzle && typeof s.nozzle === 'object') {
        const n = this.nozzle, z = s.nozzle;
        if (NOZZLE_KINDS.some((k) => k.id === z.kind)) n.kind = z.kind;
        for (const k of ['d', 'w', 'h', 'length', 'bend', 'tip', 'wall'] as const) if (num(z[k])) n[k] = Math.min(NOZZLE_LIMITS[k][1], Math.max(NOZZLE_LIMITS[k][0], z[k]));
        for (const k of ['ring', 'brush'] as const) if (typeof z[k] === 'boolean') n[k] = z[k];
        if (z.a && (z.a.type === 'male' || z.a.type === 'female')) n.a.type = z.a.type;
        if (z.a && num(z.a.d)) n.a.d = Math.min(60, Math.max(15, z.a.d));
      }
      if (typeof s.freeTemplate === 'string' && TEMPLATES.some((t) => t.id === s.freeTemplate)) this.freeTemplate = s.freeTemplate;
      if (num(s.step)) this.step = Math.max(0, Math.min(3, Math.round(s.step)));
    } catch {
      /* beschädigt: Standard behalten */
    }
  }
}

export const app = new AppState();
