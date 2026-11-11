/**
 * Zustand der Anwendung: Eingaben aller Schritte, daraus abgeleitete Werte, Export und Druckbett.
 * Die Schritt-Komponenten lesen und ändern diesen Zustand direkt; App.svelte kümmert sich um Vorschau und Berechnung.
 * Der Stand wird im Browser gespeichert und beim nächsten Start wiederhergestellt.
 */
import { exportFile, exportPlate, makeBuild, type PlateItem } from './cad';
import { kindById, type DiameterKey } from './osvac/catalog';
import { DEFAULT_INPUT, deriveParams, type OsvacInput } from './osvac/params';
import type { ExportFormat } from './worker/protocol';
import type { PipeSpec } from './osvac/machine';
import type { Dimensions } from './viewer';
import { slipRingGapMax } from './osvac/hose';
import { estimateFilament } from './filament';
import { userMessage } from './errors';
import { TEMPLATES, planFree, freeSummary, withFreshIds, type FreeSpec } from './osvac/freeform';
import { freeMaleOnBed } from './osvac/assemblies';

export const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: '3mf', label: '3MF', hint: 'Empfohlen für Bambu Studio, PrusaSlicer, Orca, Cura' },
  { id: 'stl', label: 'STL', hint: 'Funktioniert mit jedem Slicer' },
  { id: 'step', label: 'STEP', hint: 'Exaktes CAD-Modell zum Weiterkonstruieren' },
];

/** Startwerte (auf diese setzt „Zurücksetzen“ zurück) */
export const START_INPUT: OsvacInput = { ...DEFAULT_INPUT, maleDiameterInner: 32, femaleDiameterInner: 32, hoseDiameterInner: 36 };

export type MachineMode = 'over' | 'into';
export const MACHINE_DEFAULT = { mode: 'over' as MachineMode, dOpen: 32, dDepth: 33, length: 30, wall: 3, allowance: 0.2, holes: true, transition: 8 };
export type Machine = typeof MACHINE_DEFAULT;
const MACHINE_KEYS = ['dOpen', 'dDepth', 'length', 'wall', 'allowance', 'holes', 'transition'] as const;

export const LABELS: Record<DiameterKey, { name: string; word: string; letter: 'F' | 'M' | 'H'; hint: string; presets: number[] }> = {
  femaleDiameterInner: { name: 'Kupplung (F)', word: 'Kupplung', letter: 'F', hint: 'Innendurchmesser der Bajonett-Kupplung', presets: [25, 32, 36, 40, 50] },
  maleDiameterInner: { name: 'Stecker (M)', word: 'Stecker', letter: 'M', hint: 'Innendurchmesser des Steckers', presets: [25, 32, 36, 40, 50] },
  hoseDiameterInner: { name: 'Schlauch (H)', word: 'Schlauch', letter: 'H', hint: 'Innendurchmesser des Schlauchs', presets: [27, 32, 36, 40, 50] },
};

export type Status = 'start' | 'preview' | 'detail' | 'ready' | 'error';
export type FileEntry = { fileName: string; url: string; size: number; key: string };

export const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
const round2 = (v: number) => Math.round(v * 100) / 100;

const STORE_KEY = 'osvacneo-konfigurator:stand:v1';

class AppState {
  // ---------------------------------------------------------------- Eingaben
  step = $state(0);
  kindId = $state('MF');
  input = $state<OsvacInput>({ ...START_INPUT });
  text = $state(true);
  /** Eine Einstellung für Anzeige und Export der Druckhilfe (wird immer mitberechnet) */
  supports = $state(true);
  machine = $state<Machine>({ ...MACHINE_DEFAULT });
  /** Freiform: Aufbau, zuletzt gewählte Vorlage, aufgeklappte Karte */
  free = $state<FreeSpec>(TEMPLATES[0].make());
  freeTemplate = $state(TEMPLATES[0].id);
  freeOpen = $state<number | 'A' | 'B' | null>(null);
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

  // ---------------------------------------------------------------- Export
  activeFormat = $state<ExportFormat>('3mf');
  exporting = $state<ExportFormat | null>(null);
  files = $state<FileEntry[]>([]);
  // $state.raw: die Einträge gehen per postMessage an die Worker, Proxys ließen sich nicht übertragen
  plate = $state.raw<(PlateItem & { key: string })[]>([]);
  plateBusy = $state<ExportFormat | null>(null);

  // ---------------------------------------------------------------- abgeleitet
  kind = $derived(kindById(this.kindId));
  steps = $derived(this.kind.freeform ? (['Verbindung', 'Aufbau', 'Passung', 'Download'] as const) : (['Verbindung', 'Größen', 'Passung', 'Download'] as const));
  lastStep = $derived(this.steps.length - 1);
  /** Prüfung des Freiform-Aufbaus (reine Rechnung, ohne CAD-Kern) */
  freePlan = $derived(this.kind.freeform ? planFree($state.snapshot(this.free)) : null);
  freeIssues = $derived(this.freePlan?.issues ?? []);
  /** Download gesperrt, solange der Adapter einen Fehler hat (Berechnung gescheitert oder Aufbau fehlerhaft) */
  blocked = $derived(this.status === 'error' || this.freeIssues.some((x) => x.level === 'error'));
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
    return { d1Inner: round2(toInner(m.dOpen)), d2Inner: round2(toInner(m.dDepth)), length: m.length, wall: w, transition: Math.max(2, m.transition), screwHoles: m.holes };
  });
  pipeRows = $derived([
    { label: 'innen Ø', a: this.pipe.d1Inner, b: this.pipe.d2Inner },
    { label: 'außen Ø', a: this.pipe.d1Inner + 2 * this.pipe.wall, b: this.pipe.d2Inner + 2 * this.pipe.wall },
  ]);
  buildOpts = $derived(this.kind.freeform ? { free: $state.snapshot(this.free) } : this.kind.machine ? { pipe: this.pipe } : {});

  /** Dateiname mit allen Abweichungen von den Standardeinstellungen, damit Testdrucke unterscheidbar bleiben */
  baseName = $derived(this.kind.fileName(this.params, this.buildOpts));
  fileName = $derived.by(() => {
    const i = this.input;
    const extra: string[] = [];
    if (i.maleFemaleGapSize !== START_INPUT.maleFemaleGapSize) extra.push(`Spalt ${fmt(i.maleFemaleGapSize, 2)}`);
    if (this.hasSwivel && i.slipRingGapSize !== START_INPUT.slipRingGapSize) extra.push(`Drehring ${fmt(i.slipRingGapSize, 2)}`);
    if (i.generalMaterialWidth !== START_INPUT.generalMaterialWidth) extra.push(`Wand ${i.generalMaterialWidth} mm`);
    if (!this.text) extra.push('ohne Text');
    return [this.baseName, ...extra].join(' ');
  });
  code = $derived.by(() => {
    const k = this.kind;
    if (k.freeform) return freeSummary(this.free).code;
    if (k.machine) return `${k.ends.top === 'female' ? 'F' : 'M'}${fmt(k.ends.top === 'female' ? this.input.femaleDiameterInner : this.input.maleDiameterInner)}/${fmt(this.machine.dOpen)}`;
    return this.baseName.replace('osVAC neo ', '');
  });

  /** Plausibilität der Stutzen-Maße (wird schon im Schritt Größen angezeigt) */
  machineWarnings = $derived.by(() => {
    const w: string[] = [];
    if (!this.kind.machine) return w;
    const m = this.machine, pipe = this.pipe;
    if (m.mode === 'over' && m.dDepth < m.dOpen - 0.05)
      w.push('Hinten ist der Stutzen dünner als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht drauf. Bitte nachmessen.');
    if (m.mode === 'into' && m.dDepth > m.dOpen + 0.05)
      w.push('Innen ist die Öffnung weiter als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht hinein. Bitte nachmessen.');
    if (Math.abs(m.dOpen - m.dDepth) > 8) w.push('Vorne und in der Tiefe unterscheiden sich um mehr als 8 mm. Bitte nachmessen.');
    if (pipe.d1Inner < 8 || pipe.d2Inner < 8) w.push('Innen bleiben weniger als 8 mm frei. Maße oder Wandstärke prüfen.');
    else if (Math.min(pipe.d1Inner, pipe.d2Inner) < 0.5 * (this.kind.ends.top === 'female' ? this.input.femaleDiameterInner : this.input.maleDiameterInner))
      w.push('Das Rohrteil ist innen weniger als halb so weit wie der Anschluss. Das bremst die Absaugung stark.');
    if (m.length < 10) w.push(`Unter 10 mm Tiefe hält der Adapter kaum ${m.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}.`);
    if (m.holes && m.length < 12) w.push('Für die Schraubenlöcher braucht es mindestens 12 mm Tiefe. Tiefe erhöhen oder die Löcher in den Feineinstellungen abwählen.');
    return w;
  });

  warnings = $derived.by(() => {
    const w: string[] = [];
    for (const k of this.kind.diameters) {
      const v = this.input[k];
      if (!(v >= 15 && v <= 60)) w.push(`${LABELS[k].name}: ${fmt(v)} mm liegt außerhalb von 15 bis 60 mm.`);
      else if (!LABELS[k].presets.includes(v)) w.push(`${LABELS[k].name}: ${fmt(v)} mm ist kein Standardmaß von osVAC neo. Passt nur zu Teilen derselben Größe.`);
    }
    w.push(...this.machineWarnings);
    if (this.kind.freeform) w.push(...this.freeIssues.map((x) => x.text));
    if (this.input.maleFemaleGapSize < 0.1 || this.input.maleFemaleGapSize > 0.5) w.push('Das Spiel liegt außerhalb von 0,1 bis 0,5 mm. Stecker und Kupplung passen dann kaum zusammen.');
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
    filament: 'Der kleinere Wert gilt für ein Teil mit 3 Wänden und 15 % Füllung, der größere für ein komplett gefülltes Teil. Die Füllung stellst du im Slicer ein.',
  });

  /** Freiform: Stützen nötig? (nur nach fertiger Berechnung bekannt) */
  needsSupportMaterial = $derived(!!this.kind.freeform && this.overhang > 40);

  /** Druckhinweise je Adaptertyp (die Dateien sind schon so ausgerichtet wie in der Vorschau) */
  printTips = $derived.by(() => {
    const t: string[] = ['Die Dateien liegen schon richtig herum, genau wie in der Vorschau. Im Slicer nicht drehen.'];
    if (this.hasSupport)
      t.push('Der Stecker steht mit der Spitze auf einer Druckhilfe (in der Vorschau weiß). Nach dem Druck die Druckhilfe mit einer Zange abbrechen.');
    if (this.needsSupportMaterial)
      t.push('Stützen nötig: Ein Teil des Adapters hängt schräg in der Luft, meist unter einem Bogen oder Übergang. Im Slicer „Stützen nur auf dem Druckbett“ einschalten. Ein längerer Übergang oder ein anderes Ende auf dem Druckbett kann das vermeiden.');
    else t.push('Stützen werden nicht gebraucht, im Slicer ausschalten.');
    if (this.hasSwivel)
      t.push(`Nach dem Druck den Schlauchteil einmal kräftig gegen ${this.kind.id === 'FH' ? 'die Kupplung' : 'das Gehäuse'} drehen, bis sich der Ring leicht bewegt. Klemmt er, beim nächsten Mal in „Passung“ das Spiel am Drehring erhöhen.`);
    if (this.kind.machine && this.machine.holes) t.push('Die drei kleinen Löcher sind für Senkkopfschrauben (Ø 4 mm), falls der Adapter zusätzlich halten soll.');
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
    this.input.maleFemaleGapSize === START_INPUT.maleFemaleGapSize &&
      (!this.hasSwivel || this.input.slipRingGapSize === START_INPUT.slipRingGapSize) &&
      this.input.generalMaterialWidth === START_INPUT.generalMaterialWidth &&
      this.text &&
      (!this.hasSupport || this.supports),
  );
  resetFit() {
    this.input.maleFemaleGapSize = START_INPUT.maleFemaleGapSize;
    if (this.hasSwivel) this.input.slipRingGapSize = START_INPUT.slipRingGapSize;
    this.input.generalMaterialWidth = START_INPUT.generalMaterialWidth;
    this.text = true;
    if (this.hasSupport) this.supports = true;
  }
  setDia(k: DiameterKey, v: number) {
    this.input[k] = Math.round(v * 10) / 10;
  }

  // ---------------------------------------------------------------- Bauaufträge
  /** volle Berechnung mit Rändelung und Beschriftung */
  spec() {
    return makeBuild(this.kindId, $state.snapshot(this.input), { text: this.text, knurl: true, supports: true, ...$state.snapshot(this.buildOpts) });
  }
  /** schnelle Vorschau ohne Rändelung und Schrift */
  quickSpec() {
    return makeBuild(this.kindId, $state.snapshot(this.input), { text: false, knurl: false, supports: true, ...$state.snapshot(this.buildOpts) });
  }
  /** alles, was eine neue Berechnung auslöst */
  buildKey = $derived(
    JSON.stringify([this.kindId, this.input, this.text, this.kind.machine ? this.pipe : null, this.kind.freeform ? this.free : null]),
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
    return JSON.stringify([this.kindId, $state.snapshot(this.input), this.text, this.supports && this.hasSupport, this.kind.machine ? $state.snapshot(this.machine) : null, this.kind.freeform ? $state.snapshot(this.free) : null]);
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
      text: this.text,
      supports: this.supports,
      machine: this.machine,
      free: this.free,
      freeTemplate: this.freeTemplate,
    }),
  );
  save() {
    try {
      localStorage.setItem(STORE_KEY, this.saved);
    } catch {
      /* Speicher voll oder gesperrt: dann eben ohne */
    }
  }
  /** Gespeicherten Stand übernehmen; unbekannte oder beschädigte Werte bleiben auf dem Standard. */
  load() {
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
        for (const k of Object.keys(START_INPUT) as (keyof OsvacInput)[]) if (num(s.input[k])) (this.input[k] as number) = s.input[k];
      if (typeof s.text === 'boolean') this.text = s.text;
      if (typeof s.supports === 'boolean') this.supports = s.supports;
      if (s.machine && typeof s.machine === 'object') {
        for (const k of MACHINE_KEYS) if (k === 'holes' ? typeof s.machine[k] === 'boolean' : num(s.machine[k])) (this.machine[k] as number | boolean) = s.machine[k];
        if (s.machine.mode === 'over' || s.machine.mode === 'into') this.machine.mode = s.machine.mode;
      }
      if (s.free && typeof s.free === 'object' && Array.isArray(s.free.blocks) && s.free.a && s.free.b?.device) {
        const fresh = TEMPLATES[0].make();
        this.free = withFreshIds({ ...fresh, ...s.free, a: { ...fresh.a, ...s.free.a }, b: { ...fresh.b, ...s.free.b, device: { ...fresh.b.device, ...s.free.b.device } } });
      }
      if (typeof s.freeTemplate === 'string' && TEMPLATES.some((t) => t.id === s.freeTemplate)) this.freeTemplate = s.freeTemplate;
      if (num(s.step)) this.step = Math.max(0, Math.min(3, Math.round(s.step)));
    } catch {
      /* beschädigt: Standard behalten */
    }
  }
}

export const app = new AppState();
