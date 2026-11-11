<script lang="ts">
  import { onMount } from 'svelte';
  import { PartViewer, type Dimensions } from './lib/viewer';
  import { build, exportFile, exportPlate, makeBuild, partNames, type PlateItem } from './lib/cad';
  import { KINDS, kindById, type DiameterKey } from './lib/osvac/catalog';
  import { DEFAULT_INPUT, deriveParams, type OsvacInput } from './lib/osvac/params';
  import type { ExportFormat, MeshBody } from './lib/worker/protocol';
  import KindIcon from './components/KindIcon.svelte';
  import MeasureFigure from './components/MeasureFigure.svelte';
  import NumberField from './components/NumberField.svelte';
  import Field from './components/Field.svelte';
  import type { PipeSpec } from './lib/osvac/machine';
  import { slipRingGapMax } from './lib/osvac/hose';
  import { estimateFilament } from './lib/filament';
  import { CHANGES } from './lib/credits';
  import FreeformEditor from './components/FreeformEditor.svelte';
  import { userMessage } from './lib/errors';
  import { TEMPLATES, planFree, freeSummary, type FreeSpec } from './lib/osvac/freeform';
  import { freeMaleOnBed } from './lib/osvac/assemblies';

  const STEPS_STD = ['Verbindung', 'Größen', 'Passung', 'Download'] as const;
  const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
    { id: '3mf', label: '3MF', hint: 'Empfohlen für Bambu Studio, PrusaSlicer, Orca, Cura' },
    { id: 'stl', label: 'STL', hint: 'Funktioniert mit jedem Slicer' },
    { id: 'step', label: 'STEP', hint: 'Exaktes CAD-Modell zum Weiterkonstruieren' },
  ];
  /** Hervorgehobenes Format: anfangs die Empfehlung, danach das zuletzt geladene */
  let activeFormat = $state<ExportFormat>('3mf');
  let step = $state(0);
  let kindId = $state('MF');
  /** Startwerte (auf diese setzt „Zurücksetzen“ zurück) */
  const START_INPUT: OsvacInput = { ...DEFAULT_INPUT, maleDiameterInner: 32, femaleDiameterInner: 32, hoseDiameterInner: 36 };
  let input = $state<OsvacInput>({ ...START_INPUT });
  let text = $state(true);
  /** Eine Einstellung für Anzeige und Export der Druckhilfe (wird immer mitberechnet) */
  let supports = $state(true);
  type MachineMode = 'over' | 'into';
  const MACHINE_DEFAULT = { mode: 'over' as MachineMode, dOpen: 32, dDepth: 33, length: 30, wall: 3, allowance: 0.2, holes: true, transition: 8 };
  /** Standardmaße je Befestigung: ein Stutzen wird zur Maschine hin dicker, eine Öffnung nach innen enger */
  const machineDefault = (key: keyof typeof MACHINE_DEFAULT, mode: MachineMode = machine.mode) =>
    mode === 'into' && (key === 'dOpen' || key === 'dDepth') ? (key === 'dOpen' ? 33 : 32) : MACHINE_DEFAULT[key];
  let machine = $state({ ...MACHINE_DEFAULT });
  function setMode(mode: MachineMode) {
    const old = machine.mode;
    if (old === mode) return;
    // unveränderte Standardmaße mitwechseln
    if (machine.dOpen === machineDefault('dOpen', old) && machine.dDepth === machineDefault('dDepth', old)) {
      machine.dOpen = machineDefault('dOpen', mode) as number;
      machine.dDepth = machineDefault('dDepth', mode) as number;
    }
    machine.mode = mode;
  }
  /** aufgeklappte Erklärungen (Schritt Passung) */
  let helpOpen = $state<Record<string, boolean>>({});
  let measures = $state<{ volume: number; area: number; helperVolume: number; helperArea: number } | null>(null);
  /** Freiform: Aufbau aus Bausteinen (Startpunkt: erste Vorlage) */
  let free = $state<FreeSpec>(TEMPLATES[0].make());
  /** Freiform: Fläche, die beim Druck frei nach unten hängt (mm², aus dem Vorschaunetz) */
  let overhang = $state(0);

  let host: HTMLDivElement;
  let viewer: PartViewer | null = null;
  let dims = $state<Dimensions | null>(null);
  let status = $state<'start' | 'preview' | 'detail' | 'ready' | 'error'>('start');
  let errorMsg = $state('');
  let section = $state(false);
  let exporting = $state<ExportFormat | null>(null);
  let files = $state<{ fileName: string; url: string; size: number; key: string }[]>([]);
  /** Liste der erzeugten Dateien leeren und den Speicher der Dateien freigeben */
  function clearFiles() {
    for (const f of files) URL.revokeObjectURL(f.url);
    files = [];
  }

  const kind = $derived(kindById(kindId));
  const STEPS = $derived(kind.freeform ? (['Verbindung', 'Aufbau', 'Passung', 'Download'] as const) : STEPS_STD);
  /** Prüfung des Freiform-Aufbaus (reine Rechnung, ohne CAD-Kern) */
  const freePlan = $derived(kind.freeform ? planFree($state.snapshot(free)) : null);
  const freeIssues = $derived(freePlan?.issues ?? []);
  /** Download gesperrt, solange der Adapter einen Fehler hat (Berechnung gescheitert oder Aufbau fehlerhaft) */
  const blocked = $derived(status === 'error' || freeIssues.some((x) => x.level === 'error'));
  const lastStep = $derived(STEPS.length - 1);
  $effect(() => {
    if (blocked && step === lastStep) step = lastStep - 1;
  });
  const params = $derived(deriveParams(input));
  /** PETG-Bedarf; Druckhilfe zählt mit, wenn sie gedruckt wird */
  const filament = $derived.by(() => {
    if (!measures) return null;
    const withHelper = supports && hasSupport;
    return estimateFilament(
      measures.volume + (withHelper ? measures.helperVolume : 0),
      measures.area + (withHelper ? measures.helperArea : 0),
    );
  });
  const gramsText = $derived.by(() => {
    if (!filament) return '–';
    const a = Math.round(filament.gramsMin);
    const b = Math.round(filament.gramsMax);
    return a === b ? `${a}` : `${a}–${b}`;
  });
  /** Druckhilfe gibt es nur, wenn der Stecker mit der Spitze nach unten gedruckt wird */
  const hasSupport = $derived(kind.id === 'M' || kind.id === 'MF' || (!!kind.freeform && freeMaleOnBed(free)));
  const hasSwivel = $derived(kind.id === 'FH' || kind.id === 'MH');
  /** Beim Drehring an der Kupplung (FxxHyy) begrenzt die Geometrie des Originals das Spaltmaß (7 mm: 0,5, 9 mm: 0,35) */
  const swivelMax = $derived(slipRingGapMax(input.generalMaterialWidth, kind.id === 'MH'));
  const helpTexts: Record<string, string> = $derived({
    gap: 'Der Wert gilt für Stecker und Kupplung zusammen. Steckt ein neues Teil in einem älteren mit 0,2 mm, wirkt nur die Hälfte: eingestellte 0,4 mm wirken dann wie 0,3 mm.',
    swivel: `Der Drehring wird gleich mitgedruckt. Ist das Spiel zu klein, klebt er fest. Höchstens ${fmt(swivelMax, 2)} mm${kind.id === 'FH' ? ` bei ${input.generalMaterialWidth} mm Materialstärke, sonst berührt der äußere Ring den Schlauchteil` : ''}.`,
    filament: 'Der kleinere Wert gilt für ein Teil mit 3 Wänden und 15 % Füllung, der größere für ein komplett gefülltes Teil. Die Füllung stellst du im Slicer ein.',
  });
  $effect(() => {
    if (hasSwivel && input.slipRingGapSize > swivelMax) input.slipRingGapSize = swivelMax;
  });
  const pipe = $derived.by((): PipeSpec => {
    const m = machine;
    const w = Math.max(2, m.wall);
    const toInner = (d: number) => (m.mode === 'over' ? d + m.allowance : d - m.allowance - 2 * w);
    // D1 (am Übergang, tief im Adapter) ↔ Stutzen vorne; D2 (Öffnung des Adapters) ↔ Stutzen in der Tiefe
    return { d1Inner: round1(toInner(m.dOpen)), d2Inner: round1(toInner(m.dDepth)), length: m.length, wall: w, transition: Math.max(2, m.transition), screwHoles: m.holes };
  });
  const pipeRows = $derived([
    { label: 'innen Ø', a: pipe.d1Inner, b: pipe.d2Inner },
    { label: 'außen Ø', a: pipe.d1Inner + 2 * pipe.wall, b: pipe.d2Inner + 2 * pipe.wall },
  ]);
  const buildOpts = $derived(kind.freeform ? { free: $state.snapshot(free) } : kind.machine ? { pipe } : {});
  /** Dateiname mit allen Abweichungen von den Standardeinstellungen, damit Testdrucke unterscheidbar bleiben */
  const baseName = $derived(kind.fileName(params, buildOpts));
  const fileName = $derived.by(() => {
    const extra: string[] = [];
    if (input.maleFemaleGapSize !== START_INPUT.maleFemaleGapSize) extra.push(`Spalt ${fmt(input.maleFemaleGapSize, 2)}`);
    if (hasSwivel && input.slipRingGapSize !== START_INPUT.slipRingGapSize) extra.push(`Drehring ${fmt(input.slipRingGapSize, 2)}`);
    if (input.generalMaterialWidth !== START_INPUT.generalMaterialWidth) extra.push(`Wand ${input.generalMaterialWidth} mm`);
    if (!text) extra.push('ohne Text');
    return [baseName, ...extra].join(' ');
  });
  const code = $derived(
    kind.freeform
      ? freeSummary(free).code
      : kind.machine
      ? `${kind.ends.top === 'female' ? 'F' : 'M'}${fmt(kind.ends.top === 'female' ? input.femaleDiameterInner : input.maleDiameterInner)}/${fmt(machine.dOpen)}`
      : baseName.replace('osVAC neo ', ''),
  );

  const LABELS: Record<DiameterKey, { name: string; word: string; letter: 'F' | 'M' | 'H'; hint: string; presets: number[] }> = {
    femaleDiameterInner: { name: 'Kupplung (F)', word: 'Kupplung', letter: 'F', hint: 'Innendurchmesser der Bajonett-Kupplung', presets: [25, 32, 36, 40, 50] },
    maleDiameterInner: { name: 'Stecker (M)', word: 'Stecker', letter: 'M', hint: 'Innendurchmesser des Steckers', presets: [25, 32, 36, 40, 50] },
    hoseDiameterInner: { name: 'Schlauch (H)', word: 'Schlauch', letter: 'H', hint: 'Innendurchmesser des Schlauchs', presets: [27, 32, 36, 40, 50] },
  };

  /** Plausibilität der Stutzen-Maße (wird schon im Schritt Größen angezeigt) */
  const machineWarnings = $derived.by(() => {
    const w: string[] = [];
    if (!kind.machine) return w;
    const m = machine;
    if (m.mode === 'over' && m.dDepth < m.dOpen - 0.05)
      w.push('Hinten ist der Stutzen dünner als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht drauf. Bitte nachmessen.');
    if (m.mode === 'into' && m.dDepth > m.dOpen + 0.05)
      w.push('Innen ist die Öffnung weiter als vorne. Das ist ungewöhnlich, so ginge der Adapter nicht hinein. Bitte nachmessen.');
    if (Math.abs(m.dOpen - m.dDepth) > 8) w.push('Vorne und in der Tiefe unterscheiden sich um mehr als 8 mm. Bitte nachmessen.');
    if (pipe.d1Inner < 8 || pipe.d2Inner < 8) w.push('Innen bleiben weniger als 8 mm frei. Maße oder Wandstärke prüfen.');
    else if (Math.min(pipe.d1Inner, pipe.d2Inner) < 0.5 * (kind.ends.top === 'female' ? input.femaleDiameterInner : input.maleDiameterInner))
      w.push('Das Rohrteil ist innen weniger als halb so weit wie der Anschluss. Das bremst die Absaugung stark.');
    if (m.length < 10) w.push(`Unter 10 mm Tiefe hält der Adapter kaum ${m.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}.`);
    if (m.holes && m.length < 12) w.push('Für die Schraubenlöcher braucht es mindestens 12 mm Tiefe. Tiefe erhöhen oder die Löcher in den Feineinstellungen abwählen.');
    return w;
  });

  const warnings = $derived.by(() => {
    const w: string[] = [];
    for (const k of kind.diameters) {
      const v = input[k];
      if (!(v >= 15 && v <= 60)) w.push(`${LABELS[k].name}: ${fmt(v)} mm liegt außerhalb von 15 bis 60 mm.`);
      else if (!LABELS[k].presets.includes(v)) w.push(`${LABELS[k].name}: ${fmt(v)} mm ist kein Standardmaß von osVAC neo. Passt nur zu Teilen derselben Größe.`);
    }
    w.push(...machineWarnings);
    if (kind.freeform) w.push(...freeIssues.map((x) => x.text));
    if (input.maleFemaleGapSize < 0.1 || input.maleFemaleGapSize > 0.5) w.push('Das Spiel liegt außerhalb von 0,1 bis 0,5 mm. Stecker und Kupplung passen dann kaum zusammen.');
    return w;
  });

  /** Zerlegt "MxxFyy" in hervorgehobene Kennbuchstaben (M, F, H) und Platzhalter */
  function codeParts(code: string) {
    return code.split(/([MFH](?=[xy]{2}|$|-))/).filter(Boolean).map((t) => ({ t, key: /^[MFH]$/.test(t) }));
  }

  function round1(v: number) {
    return Math.round(v * 100) / 100;
  }
  function fmt(v: number, d = 1) {
    return v.toLocaleString('de-DE', { maximumFractionDigits: d });
  }

  // --- Bauen: erst schnelle Vorschau, dann Details ---
  let buildToken = 0;
  /** Adaptertyp, dessen Körper gerade angezeigt werden */
  let shownKind = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  function spec() {
    return makeBuild(kindId, $state.snapshot(input), { text, knurl: true, supports: true, ...$state.snapshot(buildOpts) });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  }
  async function run() {
    if (!kind.available) return;
    const token = ++buildToken;
    errorMsg = '';
    measures = null; // Filamentangabe gehört zur alten Konfiguration
    try {
      status = 'preview';
      if (shownKind && shownKind !== kindId) {
        viewer!.setDimmed(true);
        dims = null; // Maße gehören zum alten Typ
      }
      const quick = await build(makeBuild(kindId, $state.snapshot(input), { text: false, knurl: false, supports: true, ...$state.snapshot(buildOpts) }));
      if (token !== buildToken) return;
      dims = viewer!.setBodies(quick.bodies);
      shownKind = kindId;
      status = 'detail';
      // Fertige Körper sofort zeigen; bis dahin bleiben die Körper der schnellen Vorschau stehen
      // (die volle Berechnung hat zusätzlich die Rändelung als eigene Körper, daher Zuordnung über den Namen)
      const req = spec();
      const quickByName = new Map(quick.bodies.map((b) => [b.name, b]));
      const names = partNames(req);
      const cur: (MeshBody | undefined)[] = names.map((n) => quickByName.get(n));
      let raf = 0;
      const full = await build(req, (i, b) => {
        if (token !== buildToken) return;
        cur[i] = b;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (token === buildToken) viewer!.setBodies(cur.filter((x): x is MeshBody => !!x));
        });
      });
      cancelAnimationFrame(raf);
      if (token !== buildToken) return;
      dims = viewer!.setBodies(full.bodies);
      overhang = kind.freeform ? overhangArea(full.bodies) : 0;
      measures = { volume: full.volume, area: full.area, helperVolume: full.helperVolume, helperArea: full.helperArea };
      status = 'ready';
    } catch (e) {
      if (token !== buildToken) return;
      status = 'error';
      errorMsg = userMessage(e);
    }
  }

  /**
   * Fläche der Formstücke, die beim Druck steiler als 45° nach unten zeigt und nicht auf dem Druckbett liegt.
   * Die Anschlüsse von osVAC neo zählen nicht mit: sie sind für den Druck ohne Stützen gebaut.
   */
  function overhangArea(bodies: MeshBody[]): number {
    let zMin = Infinity;
    for (const b of bodies) for (let i = 2; i < b.positions.length; i += 3) zMin = Math.min(zMin, b.positions[i]);
    let area = 0;
    for (const b of bodies) {
      if (b.helper || !/^(Formstück|Übergang zu|Geräteanschluss|Anschlagring)/.test(b.name)) continue;
      const p = b.positions, nr = b.normals, ix = b.indices;
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t] * 3, c = ix[t + 1] * 3, d = ix[t + 2] * 3;
        const nz = (nr[a + 2] + nr[c + 2] + nr[d + 2]) / 3;
        if (nz > -0.72) continue;
        if (Math.min(p[a + 2], p[c + 2], p[d + 2]) < zMin + 0.4) continue;
        const ux = p[c] - p[a], uy = p[c + 1] - p[a + 1], uz = p[c + 2] - p[a + 2];
        const vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
        area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
    }
    return area;
  }

  $effect(() => {
    // Abhängigkeiten registrieren
    void [kindId, input.maleDiameterInner, input.femaleDiameterInner, input.hoseDiameterInner, input.generalMaterialWidth,
      input.maleFemaleGapSize, input.slipRingGapSize, input.supportStructureGapSize, text, JSON.stringify(pipe), kind.freeform ? JSON.stringify(free) : ''];
    if (viewer) schedule();
  });

  // Druckhilfe ein-/ausblenden ohne Neuberechnung
  $effect(() => {
    const on = supports; // zuerst lesen, damit Svelte die Abhängigkeit registriert
    viewer?.setHelpers(on);
  });

  onMount(() => {
    viewer = new PartViewer(host);
    viewer.setHelpers(supports);
    schedule();
    return () => viewer?.dispose();
  });

  async function download(f: ExportFormat) {
    exporting = f;
    try {
      const withHelpers = supports && hasSupport;
      const r = await exportFile(spec(), f, fileName, withHelpers);
      const key = JSON.stringify(spec().input) + f + withHelpers;
      for (const old of files.filter((x) => x.fileName === r.fileName)) URL.revokeObjectURL(old.url);
      files = [{ ...r, key }, ...files.filter((x) => x.fileName !== r.fileName)];
    } catch (e) {
      errorMsg = userMessage(e);
    } finally {
      exporting = null;
    }
  }

  /** Druckhinweise je Adaptertyp (die Dateien sind schon so ausgerichtet wie in der Vorschau) */
  const printTips = $derived.by(() => {
    const t: string[] = ['Die Dateien liegen schon richtig herum, genau wie in der Vorschau. Im Slicer nicht drehen.'];
    if (hasSupport)
      t.push('Der Stecker steht mit der Spitze auf einer Druckhilfe (in der Vorschau weiß). Stützen im Slicer ausschalten. Nach dem Druck die Druckhilfe mit einer Zange abbrechen.');
    else t.push('Stützen werden nicht gebraucht, im Slicer ausschalten.');
    if (hasSwivel)
      t.push(`Nach dem Druck den Schlauchteil einmal kräftig gegen ${kind.id === 'FH' ? 'die Kupplung' : 'das Gehäuse'} drehen, bis sich der Ring leicht bewegt. Klemmt er, beim nächsten Mal in „Passung“ das Spiel am Drehring erhöhen.`);
    if (kind.machine && machine.holes) t.push('Die drei kleinen Löcher sind für Senkkopfschrauben (Ø 4 mm), falls der Adapter zusätzlich halten soll.');
    if (kind.freeform) {
      // bei Freiform zählt, was frei in der Luft hängt
      if (!hasSupport) t.splice(1, 1);
      if (overhang > 40)
        t.push('Stützen nötig: Ein Teil des Adapters hängt schräg in der Luft, meist unter einem Bogen oder Übergang. Im Slicer „Stützen nur auf dem Druckbett“ einschalten. Ein längerer Übergang oder ein anderes Ende auf dem Druckbett kann das vermeiden.');
      else if (!hasSupport) t.push('Stützen werden nicht gebraucht, im Slicer ausschalten.');
    }
    return t;
  });

  // --- Druckbett: mehrere Adapter in einer Datei ---
  // $state.raw: die Einträge gehen per postMessage an die Worker, Proxys ließen sich nicht übertragen
  let plate = $state.raw<(PlateItem & { key: string })[]>([]);
  let plateBusy = $state<ExportFormat | null>(null);
  const plateKey = () => JSON.stringify([kindId, $state.snapshot(input), text, supports && hasSupport, kind.machine ? $state.snapshot(machine) : null, kind.freeform ? $state.snapshot(free) : null]);
  const onPlate = $derived(plate.some((p) => p.key === plateKey()));
  function addToPlate() {
    if (onPlate) return;
    plate = [...plate, { req: spec(), includeHelpers: supports && hasSupport, label: fileName, key: plateKey() }];
  }
  async function downloadPlate(f: ExportFormat) {
    plateBusy = f;
    try {
      const r = await exportPlate(plate.map(({ req, includeHelpers, label }) => ({ req, includeHelpers, label })), f, `osVAC neo Druckbett ${plate.length} Adapter`);
      files = [{ ...r, key: 'plate' + f }, ...files.filter((x) => x.fileName !== r.fileName)];
    } catch (e) {
      errorMsg = userMessage(e);
    } finally {
      plateBusy = null;
    }
  }

  // --- Zurücksetzen: nur beim Stutzen (gemessene Werte, teils eingeklappt) und in „Passung“ (Schieber) ---
  const MACHINE_KEYS = ['dOpen', 'dDepth', 'length', 'wall', 'allowance', 'holes', 'transition'] as const;
  /** Stutzen-Maße inkl. Feineinstellungen; die Befestigungsart bleibt */
  const machineIsDefault = $derived(MACHINE_KEYS.every((k) => machine[k] === machineDefault(k)));
  function resetMachine() {
    for (const k of MACHINE_KEYS) (machine[k] as number | boolean) = machineDefault(k) as number | boolean;
  }
  /** Passung: Spaltmaße, Materialstärke, Beschriftung, Druckhilfe */
  const fitDefault = $derived(
    input.maleFemaleGapSize === START_INPUT.maleFemaleGapSize &&
      (!hasSwivel || input.slipRingGapSize === START_INPUT.slipRingGapSize) &&
      input.generalMaterialWidth === START_INPUT.generalMaterialWidth &&
      text &&
      (!hasSupport || supports),
  );
  function resetFit() {
    input.maleFemaleGapSize = START_INPUT.maleFemaleGapSize;
    if (hasSwivel) input.slipRingGapSize = START_INPUT.slipRingGapSize;
    input.generalMaterialWidth = START_INPUT.generalMaterialWidth;
    text = true;
    if (hasSupport) supports = true;
  }

  function setDia(k: DiameterKey, v: number) {
    input[k] = Math.round(v * 10) / 10;
  }
</script>

{#snippet help(id: string)}
  <button type="button" class="help-btn" class:on={helpOpen[id]} aria-expanded={!!helpOpen[id]} aria-label="Erklärung" onclick={() => (helpOpen[id] = !helpOpen[id])}>?</button>
{/snippet}

{#snippet helpText(id: string)}
  {#if helpOpen[id]}<p class="help-text">{helpTexts[id]}</p>{/if}
{/snippet}

{#snippet resetStepBtn(isDefault: boolean, label: string, apply: () => void)}
  {#if !isDefault}
    <button type="button" class="reset-all" onclick={apply}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" /><path d="M4 5v4.5h4.5" /></svg>{label}
    </button>
  {/if}
{/snippet}

<header class="topbar">
  <p class="wordmark"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span> <span class="wm-sub">Konfigurator</span></p>
  <a class="site-link" href="https://osvacneo.de" target="_blank" rel="noopener noreferrer">osvacneo.de <span aria-hidden="true">↗</span></a>
</header>

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>

    <header class="stage-head">
      <h1 class="code" class:free={kind.freeform} aria-live="polite">{code}</h1>
      <p class="kind-line">{kind.freeform ? freeSummary(free).sub : kind.title}</p>
      {#if status !== 'ready'}<p class="status status-m" data-s={status} aria-hidden="true">{status === 'error' ? 'Fehler beim Berechnen' : status === 'start' ? 'CAD-Kern wird geladen…' : 'Wird berechnet…'}</p>{/if}
    </header>

    <div class="stage-tools">
      <button class="tool" class:on={section} aria-pressed={section} onclick={() => { section = !section; viewer?.setSection(section); }}>Schnitt</button>
      {#if hasSupport}
        <button class="tool" class:on={supports} aria-pressed={supports} onclick={() => (supports = !supports)}>Druckhilfe</button>
      {/if}
      <button class="tool" onclick={() => viewer?.resetView()}>Ansicht zurücksetzen</button>
    </div>

    <footer class="stage-foot">
      <dl class="dims">
        <div><dt>Höhe</dt><dd>{dims ? fmt(dims.height) : '–'}<span>mm</span></dd></div>
        {#if kind.freeform}
          <div><dt>Breite</dt><dd>{dims ? fmt(dims.width) : '–'}<span>mm</span></dd></div>
        {:else}
          <div><dt>Größter Ø</dt><dd>{dims ? fmt(dims.diameter) : '–'}<span>mm</span></dd></div>
        {/if}
        <div><dt>PETG ca.</dt><dd>{gramsText}<span>g</span></dd></div>
      </dl>
      <p class="status" data-s={status} role="status">
        {#if status === 'start'}CAD-Kern wird geladen…
        {:else if status === 'preview' || status === 'detail'}Wird berechnet…
        {:else if status === 'ready'}Bereit zum Download
        {:else}Fehler beim Berechnen, Hinweis rechts{/if}
      </p>
    </footer>
  </section>

  <aside class="panel">
    <ol class="steps">
      {#each STEPS as s, i}
        <li>
          <button
            class="step-tab"
            class:current={step === i}
            class:done={i < step}
            aria-current={step === i ? 'step' : undefined}
            disabled={i === lastStep && blocked}
            title={i === lastStep && blocked ? 'Erst die rot markierten Punkte beheben' : undefined}
            onclick={() => (step = i)}
          >
            <span class="num">{i + 1}</span><span class="label">{s}</span>
          </button>
        </li>
      {/each}
    </ol>

    <div class="step-body">
      {#if errorMsg}
        <p class="error" role="alert">{errorMsg}</p>
      {/if}
      {#if step === 0}
        <h2>Verbindung</h2>
        <div class="kinds" role="radiogroup" aria-label="Adaptertyp">
          {#each KINDS as k}
            <button
              class="kind"
              class:sel={k.id === kindId}
              role="radio"
              aria-checked={k.id === kindId}
              disabled={!k.available}
              onclick={() => (kindId = k.id)}
            >
              <KindIcon top={k.ends.top} bottom={k.ends.bottom} />
              <span class="kind-text">
                <strong>{k.title}</strong>
                <small>{k.available ? k.description : 'Folgt in der nächsten Version.'}</small>
              </span>
              {#if !k.freeform}
              <span class="kind-code" aria-label={k.code}>
                {#each codeParts(k.code) as part}
                  {#if part.key}<b class="ck">{part.t}</b>{:else}<span class="cx">{part.t}</span>{/if}
                {/each}
              </span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if step === 1 && kind.freeform}
        <h2>Aufbau</h2>
        <FreeformEditor bind:spec={free} issues={freeIssues} />
      {:else if step === 1}
        <h2>Größen</h2>
        <p class="lead">Die Zahl ist der Innendurchmesser in Millimetern. Die meisten Geräte und Schläuche nutzen 32.</p>
        {#each kind.diameters as k}
          <fieldset class="dia dia-{LABELS[k].letter}">
            <legend>{LABELS[k].word} ({LABELS[k].letter})</legend>
            <div class="dia-row">
              <div class="chips">
                {#each LABELS[k].presets as v}
                  <button class="chip" class:sel={input[k] === v} onclick={() => setDia(k, v)}>{v}</button>
                {/each}
              </div>
              <!-- Zahlenfeld und Zurücksetzen bleiben zusammen, auch wenn die Zeile umbricht -->

                <NumberField value={input[k]} min={15} max={60} step={0.1} label={LABELS[k].hint} oncommit={(v) => setDia(k, v)} />

            </div>
          </fieldset>
        {/each}
        {#if kind.machine}
          <h3 class="sub">Stutzen am Gerät</h3>
          <div class="seg wide" role="radiogroup" aria-label="Befestigung">
            <button role="radio" aria-checked={machine.mode === 'over'} class:sel={machine.mode === 'over'} onclick={() => setMode('over')}>Adapter kommt über den Stutzen</button>
            <button role="radio" aria-checked={machine.mode === 'into'} class:sel={machine.mode === 'into'} onclick={() => setMode('into')}>Adapter kommt in die Öffnung</button>
          </div>
          <MeasureFigure mode={machine.mode} />
          <p class="hint">
            {machine.mode === 'over'
              ? 'Mit dem Messschieber außen messen: einmal vorne und einmal dort, wo der Adapter enden soll.'
              : 'Mit dem Messschieber innen messen: einmal vorne an der Kante und einmal dort, wo der Adapter enden soll.'}
          </p>
          <div class="grid2">
            <Field label="Ø vorne"><NumberField bind:value={machine.dOpen} step={0.1} min={8} max={120} label="Ø vorne" /></Field>
            <Field label="Ø in der Tiefe" help="Stutzen und Öffnungen sind oft leicht konisch. Sind beide Maße gleich, einfach denselben Wert eintragen."><NumberField bind:value={machine.dDepth} step={0.1} min={8} max={120} label="Ø in der Tiefe" /></Field>
            <Field label="Tiefe" help={`Wie weit der Adapter ${machine.mode === 'over' ? 'über den Stutzen geht' : 'in die Öffnung reicht'}. 20 bis 30 mm halten gut.`}><NumberField bind:value={machine.length} step={1} min={5} max={100} label="Tiefe (Steckweg)" /></Field>
          </div>
          {#if machineWarnings.length}
            <ul class="warn">
              {#each machineWarnings as w}<li>{w}</li>{/each}
            </ul>
          {/if}
          <details class="more">
            <summary>Feineinstellungen <small>meist nicht nötig</small></summary>
            <div class="more-body">
              <div class="grid2">
                <Field label="Luft (Zugabe)" help={`Etwas Spiel, damit der Adapter passt. Geht er nicht ${machine.mode === 'over' ? 'drauf' : 'hinein'}: Wert erhöhen. Sitzt er zu locker: verringern, bis 0.`}><NumberField bind:value={machine.allowance} step={0.05} min={0} max={2} label="Zugabe für den Sitz" /></Field>
                <Field label="Wandstärke" help="Dicke der Wand am Rohrteil. 3 mm sind stabil."><NumberField bind:value={machine.wall} step={0.5} min={2} max={8} label="Wandstärke" /></Field>
                <Field label="Übergangslänge" help={`Länge des schrägen Stücks zwischen ${kind.id === 'MACHINE_M' ? 'Stecker' : 'Kupplung'} und Rohrteil. Länger ist flacher und lässt sich besser drucken, der Adapter wird dafür länger. Standard: 8 mm.`}><NumberField bind:value={machine.transition} step={1} min={2} max={40} label="Übergangslänge" /></Field>
              </div>
              <label class="inline-check"><input type="checkbox" bind:checked={machine.holes} /> 3 Löcher für Schrauben (Ø 4 mm)</label>
              <p class="hint">Mit kleinen Senkkopfschrauben hält der Adapter zusätzlich am Stutzen.</p>
              <div class="pipe-sum">
                <table>
                  <caption>So wird das Rohrteil des Adapters</caption>
                  <thead><tr><th></th><th>vorne</th><th>in der Tiefe</th></tr></thead>
                  <tbody>
                    <!-- das Maß, auf das es ankommt, zuerst: aufgesteckt innen, eingesteckt außen -->
                    {#each machine.mode === 'over' ? pipeRows : [...pipeRows].reverse() as r}
                      <tr><th>{r.label}</th><td>{fmt(r.a, 2)}</td><td>{fmt(r.b, 2)}</td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          {@render resetStepBtn(machineIsDefault, 'Stutzen-Maße auf Standard zurücksetzen', resetMachine)}
        {/if}
      {:else if step === 2}
        <h2>Passung</h2>
        <p class="lead">Die Standardwerte passen meistens. Ändern lohnt sich erst, wenn ein Testdruck nicht gut sitzt.</p>

        <fieldset class="opt">
          <legend class="field-label">Spiel zwischen Stecker und Kupplung {@render help('gap')}</legend>
          <div class="slider">
            <input type="range" min="0.1" max="0.5" step="0.05" bind:value={input.maleFemaleGapSize} aria-describedby="gap-hint" />
            <output>{fmt(input.maleFemaleGapSize, 2)} mm</output>
          </div>
          {@render helpText('gap')}
          <p class="hint" id="gap-hint">Sitzt der Stecker zu stramm: größer. Wackelt er: kleiner. Standard: 0,2 mm.</p>
        </fieldset>

        {#if hasSwivel}
          <fieldset class="opt">
            <legend class="field-label">Spiel am Drehring {@render help('swivel')}</legend>
            <div class="slider">
              <input type="range" min="0.2" max={swivelMax} step="0.05" bind:value={input.slipRingGapSize} aria-describedby="swivel-hint" />
              <output>{fmt(input.slipRingGapSize, 2)} mm</output>
            </div>
            {@render helpText('swivel')}
            <p class="hint" id="swivel-hint">Lässt sich der Ring nach dem Druck nicht drehen: größer (bei PETG oft 0,35–0,5 mm). Standard: 0,3 mm.</p>
          </fieldset>
        {/if}

        <fieldset class="opt">
          <legend>Materialstärke</legend>
          <div class="seg" role="radiogroup">
            {#each [7, 9] as v}
              <button role="radio" aria-checked={input.generalMaterialWidth === v} class:sel={input.generalMaterialWidth === v} onclick={() => (input.generalMaterialWidth = v)}>{v} mm</button>
            {/each}
          </div>
          <p class="hint">9 mm macht die Kupplung stabiler. Sie wird dann außen 4 mm dicker.</p>
        </fieldset>

        <fieldset class="opt checks">
          <legend>Extras</legend>
          <label><input type="checkbox" bind:checked={text} /> Beschriftung (Größe und „osVAC neo“)</label>
          {#if hasSupport}
            <label><input type="checkbox" bind:checked={supports} /> Druckhilfe unter dem Stecker (wird nach dem Druck abgebrochen)</label>
          {/if}
        </fieldset>
        {@render resetStepBtn(fitDefault, 'Passung auf Standard zurücksetzen', resetFit)}
      {:else}
        <h2>Download</h2>
        <p class="lead">
          {#if kind.freeform}
            Freiform: {freeSummary(free).long}{free.blocks.length ? `, dazwischen ${freeSummary(free).blocks}` : ''}.
          {:else}
          {kind.title}, {kind.diameters.map((k) => `${LABELS[k].name} ${fmt(input[k])} mm`).join(', ')}{#if kind.machine}, Stutzen Ø {fmt(machine.dOpen)} / {fmt(machine.dDepth)} mm, {machine.length} mm tief{/if}.
          {/if}
        </p>

        {#if filament}
          <div class="filament">
            <p>
              Material: ca. <strong>{gramsText} g PETG</strong>, rund {fmt(filament.metersMax)} m Filament (1,75 mm){supports && hasSupport ? ', mit Druckhilfe' : ''}.
              {#if Math.round(filament.gramsMin) !== Math.round(filament.gramsMax)}{@render help('filament')}{/if}
            </p>
            {@render helpText('filament')}
          </div>
        {/if}

        {#if warnings.length}
          <ul class="warn">
            {#each warnings as w}<li>{w}</li>{/each}
          </ul>
        {/if}

        <div class="downloads">
          {#each FORMATS as f (f.id)}
            <button
              class="dl"
              class:active={activeFormat === f.id}
              disabled={status !== 'ready' || !!exporting}
              onclick={() => { activeFormat = f.id; download(f.id); }}
            >
              <strong>{f.label} herunterladen</strong><small>{f.hint}</small>
            </button>
          {/each}
        </div>

        <details class="box" open>
          <summary>Druckhinweise</summary>
          <ul class="tips">
            {#each printTips as t}<li>{t}</li>{/each}
          </ul>
        </details>

        <details class="box" open={plate.length > 0}>
          <summary>Mehrere Adapter auf ein Druckbett{plate.length ? ` (${plate.length})` : ''}</summary>
          <p class="hint">Praktisch zum Testen: Adapter hinzufügen, dann etwas ändern (z. B. das Spiel) und wieder hinzufügen. Alle kommen nebeneinander in eine Datei.</p>
          <button class="ghost sm" disabled={onPlate || status !== 'ready'} onclick={addToPlate}>{onPlate ? 'Adapter bereits auf Druckbett vorhanden' : 'Aktuellen Adapter hinzufügen'}</button>
          {#if plate.length}
            <ul class="plate">
              {#each plate as p, i (p.key)}
                <li><span>{p.label}{p.includeHelpers ? ' mit Druckhilfe' : ''}</span><button class="x" aria-label="{p.label} entfernen" onclick={() => (plate = plate.filter((_, j) => j !== i))}>×</button></li>
              {/each}
            </ul>
            <div class="plate-dl">
              <span>Druckbett herunterladen:</span>
              {#each FORMATS as f (f.id)}
                <button class="ghost sm" disabled={!!plateBusy || !!exporting} onclick={() => downloadPlate(f.id)}>{plateBusy === f.id ? 'Wird erzeugt…' : f.label}</button>
              {/each}
            </div>
          {/if}
        </details>
        <p class="status-line" role="status">
          {#if exporting}{exporting.toUpperCase()} wird erzeugt…{:else if status !== 'ready'}Die Downloads sind verfügbar, sobald die Berechnung fertig ist.{/if}
        </p>
        {#if files.length}
          <div class="files">
            <p>Fertige Dateien. Falls der Download nicht von selbst startet, hier klicken:</p>
            <ul>
              {#each files as f (f.fileName)}
                <li><a href={f.url} download={f.fileName}>{f.fileName}</a> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span></li>
              {/each}
            </ul>
            <button type="button" class="ghost sm" onclick={clearFiles}>Liste leeren</button>
          </div>
        {/if}
        <div class="license">
          <p class="credit">Basiert auf <strong>osVAC neo</strong> von Ludo Kerz,<br />ursprünglich entstanden im Hobbyhimmel Stuttgart.</p>
          <p>{CHANGES}</p>
          <p>
            Lizenz: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a><br />
            Weitergabe mit Namensnennung, nicht kommerziell, unter gleichen Bedingungen. Das gilt auch für die erzeugten Dateien.
          </p>
          <p><a class="more" href="./lizenzen.html" target="_blank" rel="noopener">Verwendete Bausteine und ihre Lizenzen<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg></a></p>
        </div>
      {/if}

    </div>

    {#if blocked && step === lastStep - 1}
      <p class="nav-hint" role="status">Bitte zuerst die rot markierten Punkte beheben. Danach geht es zum Download.</p>
    {/if}
    <nav class="step-nav">
      <!-- Beschriftung = Ziel-Schritt mit Pfeil; im ersten Schritt bleibt der Platz des Zurück-Knopfs frei -->
      <button class="ghost" class:hidden={step === 0} disabled={step === 0} aria-label={step > 0 ? `Zurück zu ${STEPS[step - 1]}` : undefined} onclick={() => (step = Math.max(0, step - 1))}>
        <svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>{step > 0 ? STEPS[step - 1] : ''}
      </button>
      {#if step < STEPS.length - 1}
        <button class="next" aria-label="Weiter zu {STEPS[step + 1]}" disabled={step + 1 === lastStep && blocked} onclick={() => (step = step + 1)}>
          {STEPS[step + 1]}<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      {/if}
    </nav>
  </aside>
</div>
