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
  import type { PipeSpec } from './lib/osvac/machine';
  import { slipRingGapMax } from './lib/osvac/hose';
  import { estimateFilament } from './lib/filament';
  import { loadSettings, saveSettings, type Settings } from './lib/settings';

  const STEPS = ['Verbindung', 'Größen', 'Passung', 'Download'] as const;
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
  // Link (#…) oder zuletzt benutzte Einstellung übernehmen
  const DEFAULT_SETTINGS: Settings = { kindId: 'MF', input: START_INPUT, machine: MACHINE_DEFAULT, text: true, supports: true };
  {
    const saved = loadSettings(DEFAULT_SETTINGS);
    if (saved) {
      kindId = saved.kindId;
      input = saved.input;
      machine = saved.machine;
      text = saved.text;
      supports = saved.supports;
    }
  }
  $effect(() => {
    saveSettings({ kindId, input: $state.snapshot(input), machine: $state.snapshot(machine), text, supports }, DEFAULT_SETTINGS);
  });
  let linkCopied = $state(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      linkCopied = true;
      setTimeout(() => (linkCopied = false), 2500);
    } catch {
      prompt('Link zum Kopieren:', location.href);
    }
  }
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
  let measures = $state<{ volume: number; area: number; helperVolume: number; helperArea: number } | null>(null);

  let host: HTMLDivElement;
  let viewer: PartViewer | null = null;
  let dims = $state<Dimensions | null>(null);
  let status = $state<'start' | 'preview' | 'detail' | 'ready' | 'error'>('start');
  let errorMsg = $state('');
  let section = $state(false);
  let exporting = $state<ExportFormat | null>(null);
  let files = $state<{ fileName: string; url: string; size: number; key: string }[]>([]);

  const kind = $derived(kindById(kindId));
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
  const hasSupport = $derived(kind.id === 'M' || kind.id === 'MF');
  const hasSwivel = $derived(kind.id === 'FH' || kind.id === 'MH');
  /** Beim Drehring an der Kupplung (FxxHyy) begrenzt die Geometrie des Originals das Spaltmaß (7 mm: 0,5, 9 mm: 0,35) */
  const swivelMax = $derived(slipRingGapMax(input.generalMaterialWidth, kind.id === 'MH'));
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
  const buildOpts = $derived(kind.machine ? { pipe } : {});
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
    kind.machine
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
      w.push('Ø in der Tiefe ist kleiner als Ø vorne. Ein Stutzen wird zur Maschine hin meist dicker; so ließe sich der Adapter nicht aufschieben. Bitte die Messung prüfen.');
    if (m.mode === 'into' && m.dDepth > m.dOpen + 0.05)
      w.push('Ø in der Tiefe ist größer als Ø vorne. Eine Öffnung wird nach innen meist enger; so ließe sich der Adapter nicht hineinstecken. Bitte die Messung prüfen.');
    if (Math.abs(m.dOpen - m.dDepth) > 8) w.push('Ø vorne und Ø in der Tiefe unterscheiden sich um mehr als 8 mm. Bitte die Messung prüfen.');
    if (pipe.d1Inner < 8 || pipe.d2Inner < 8) w.push('Der Innendurchmesser des Rohrteils wird kleiner als 8 mm. Maße oder Wandstärke prüfen.');
    else if (Math.min(pipe.d1Inner, pipe.d2Inner) < 0.5 * (kind.ends.top === 'female' ? input.femaleDiameterInner : input.maleDiameterInner))
      w.push('Das Rohrteil ist innen weniger als halb so weit wie der Anschluss. Das bremst die Absaugung deutlich.');
    if (m.length < 10) w.push(`Unter 10 mm Steckweg hält der Adapter kaum ${m.mode === 'over' ? 'auf dem Stutzen' : 'in der Öffnung'}.`);
    if (m.holes && m.length < 12) w.push('Die Schraubenlöcher sitzen 8 mm über dem Rohrende und brauchen mindestens 12 mm Steckweg. Steckweg erhöhen oder Schraubenlöcher abwählen.');
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
    if (input.maleFemaleGapSize < 0.1 || input.maleFemaleGapSize > 0.5) w.push('Spaltmaß außerhalb von 0,1 bis 0,5 mm – Stecker und Kupplung passen dann kaum zusammen.');
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
      measures = { volume: full.volume, area: full.area, helperVolume: full.helperVolume, helperArea: full.helperArea };
      status = 'ready';
    } catch (e) {
      if (token !== buildToken) return;
      status = 'error';
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    // Abhängigkeiten registrieren
    void [kindId, input.maleDiameterInner, input.femaleDiameterInner, input.hoseDiameterInner, input.generalMaterialWidth,
      input.maleFemaleGapSize, input.slipRingGapSize, input.supportStructureGapSize, text, JSON.stringify(pipe)];
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
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = null;
    }
  }

  /** Druckhinweise je Adaptertyp (die Dateien sind schon so ausgerichtet wie in der Vorschau) */
  const printTips = $derived.by(() => {
    const t: string[] = ['So drucken, wie das Teil in der Vorschau auf dem Druckbett steht. Die Dateien sind bereits so ausgerichtet.'];
    if (hasSupport)
      t.push('Der Stecker steht mit der Spitze nach unten auf der Druckhilfe. Stützmaterial im Slicer ausschalten. Nach dem Druck die Druckhilfe abbrechen: Die Rippen sind an den Auflagen auf 0,4 mm verjüngt und lösen sich mit einer Zange.');
    else t.push('Stützmaterial ist nicht nötig, im Slicer ausschalten.');
    if (hasSwivel)
      t.push(`Der Drehring wird in einem Stück mitgedruckt. Nach dem Druck den Schlauchteil gegen ${kind.id === 'FH' ? 'die Kupplung' : 'das Gehäuse'} kräftig drehen, bis sich der Ring frei bewegt. Sitzt er fest, beim nächsten Druck das Spaltmaß Drehring erhöhen.`);
    if (kind.machine && machine.holes) t.push('Die drei Löcher Ø 4 mm mit Senkung nehmen Senkkopfschrauben auf, mit denen sich der Adapter zusätzlich sichern lässt.');
    t.push('Die Filamentangabe oben gilt für PETG.');
    return t;
  });

  // --- Druckbett: mehrere Adapter in einer Datei ---
  // $state.raw: die Einträge gehen per postMessage an die Worker, Proxys ließen sich nicht übertragen
  let plate = $state.raw<(PlateItem & { key: string })[]>([]);
  let plateBusy = $state<ExportFormat | null>(null);
  const plateKey = () => JSON.stringify([kindId, $state.snapshot(input), text, supports && hasSupport, kind.machine ? $state.snapshot(machine) : null]);
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
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      plateBusy = null;
    }
  }

  // --- Zurücksetzen je Schritt: nur die Werte, die im jeweiligen Schritt zu sehen sind ---
  const MACHINE_KEYS = ['dOpen', 'dDepth', 'length', 'wall', 'allowance', 'holes', 'transition'] as const;
  /** Größen: Durchmesser des gewählten Typs und beim Stutzen dessen Maße (die Befestigungsart bleibt) */
  const sizesDefault = $derived(
    kind.diameters.every((k) => input[k] === START_INPUT[k]) && (!kind.machine || MACHINE_KEYS.every((k) => machine[k] === machineDefault(k))),
  );
  function resetSizes() {
    for (const k of kind.diameters) input[k] = START_INPUT[k];
    if (kind.machine) for (const k of MACHINE_KEYS) (machine[k] as number | boolean) = machineDefault(k);
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

{#snippet resetBtn(isDefault: boolean, def: number, label: string, apply: () => void, small = false)}
  <button
    type="button"
    class="reset"
    class:sm={small}
    class:hidden={isDefault}
    aria-label="{label} auf den Standardwert {fmt(def, 2)} mm zurücksetzen"
    onclick={apply}
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" /><path d="M4 5v4.5h4.5" /></svg><span>{fmt(def, 2)}</span>
  </button>
{/snippet}

{#snippet reset(key: 'maleFemaleGapSize' | 'slipRingGapSize' | DiameterKey, label: string)}
  {@render resetBtn(input[key] === START_INPUT[key], START_INPUT[key], label, () => (input[key] = START_INPUT[key]))}
{/snippet}

{#snippet resetStepBtn(isDefault: boolean, label: string, apply: () => void)}
  {#if !isDefault}
    <button type="button" class="reset-all" onclick={apply}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" /><path d="M4 5v4.5h4.5" /></svg>{label}
    </button>
  {/if}
{/snippet}

{#snippet resetSm(key: DiameterKey, label: string)}
  {@render resetBtn(input[key] === START_INPUT[key], START_INPUT[key], label, () => (input[key] = START_INPUT[key]), true)}
{/snippet}

{#snippet machineReset(key: 'dOpen' | 'dDepth' | 'length' | 'wall' | 'allowance' | 'transition', label: string)}
  {@render resetBtn(machine[key] === machineDefault(key), machineDefault(key) as number, label, () => ((machine[key] as number) = machineDefault(key) as number), true)}
{/snippet}

<header class="topbar">
  <p class="wordmark"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span> <span class="wm-sub">Konfigurator</span></p>
  <a class="site-link" href="https://osvacneo.de" target="_blank" rel="noopener noreferrer">osvacneo.de <span aria-hidden="true">↗</span></a>
</header>

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>

    <header class="stage-head">
      <h1 class="code" aria-live="polite">{code}</h1>
      <p class="kind-line">{kind.title}</p>
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
        <div><dt>Größter Ø</dt><dd>{dims ? fmt(dims.diameter) : '–'}<span>mm</span></dd></div>
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
          <button class="step-tab" class:current={step === i} class:done={i < step} aria-current={step === i ? 'step' : undefined} onclick={() => (step = i)}>
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
              <span class="kind-code" aria-label={k.code}>
                {#each codeParts(k.code) as part}
                  {#if part.key}<b class="ck ck-{part.t}">{part.t}</b>{:else}<span class="cx">{part.t}</span>{/if}
                {/each}
              </span>
            </button>
          {/each}
        </div>
      {:else if step === 1}
        <h2>Größen</h2>
        <p class="lead">Innendurchmesser in Millimetern.</p>
        {#each kind.diameters as k}
          <fieldset class="dia dia-{LABELS[k].letter}">
            <legend class="field-label"><span>{LABELS[k].word} (<b class="ck-{LABELS[k].letter}">{LABELS[k].letter}</b>)</span>{@render resetSm(k, LABELS[k].name)}</legend>
            <div class="dia-row">
              <div class="chips">
                {#each LABELS[k].presets as v}
                  <button class="chip" class:sel={input[k] === v} onclick={() => setDia(k, v)}>{v}</button>
                {/each}
              </div>
              <NumberField value={input[k]} min={15} max={60} step={0.1} label={LABELS[k].hint} oncommit={(v) => setDia(k, v)} />
            </div>
          </fieldset>
        {/each}
        {#if kind.machine}
          <h3 class="sub">Stutzen</h3>
          <div class="seg wide" role="radiogroup" aria-label="Befestigung">
            <button role="radio" aria-checked={machine.mode === 'over'} class:sel={machine.mode === 'over'} onclick={() => setMode('over')}>Adapter wird aufgesteckt</button>
            <button role="radio" aria-checked={machine.mode === 'into'} class:sel={machine.mode === 'into'} onclick={() => setMode('into')}>Adapter wird eingesteckt</button>
          </div>
          <MeasureFigure mode={machine.mode} />
          <p class="hint">
            {machine.mode === 'over'
              ? 'Außendurchmesser des Stutzens mit dem Messschieber messen: vorne an der Öffnung und in der Tiefe, bis zu der der Adapter reichen soll.'
              : 'Innendurchmesser der Absaugöffnung messen: vorne an der Kante und in der Tiefe, bis zu der der Adapter hineinreichen soll.'}
          </p>
          <div class="grid2">
            <div class="field"><span class="field-label">Ø vorne{@render machineReset('dOpen', 'Ø vorne')}</span><NumberField bind:value={machine.dOpen} step={0.1} min={8} max={120} label="Ø vorne" /></div>
            <div class="field"><span class="field-label">Ø in der Tiefe{@render machineReset('dDepth', 'Ø in der Tiefe')}</span><NumberField bind:value={machine.dDepth} step={0.1} min={8} max={120} label="Ø in der Tiefe" /></div>
            <div class="field"><span class="field-label">Tiefe (Steckweg){@render machineReset('length', 'Tiefe (Steckweg)')}</span><NumberField bind:value={machine.length} step={1} min={5} max={100} label="Tiefe (Steckweg)" /></div>
            <div class="field"><span class="field-label">Wandstärke{@render machineReset('wall', 'Wandstärke')}</span><NumberField bind:value={machine.wall} step={0.5} min={2} max={8} label="Wandstärke" /></div>
            <div class="field"><span class="field-label">Zugabe (Sitz){@render machineReset('allowance', 'Zugabe für den Sitz')}</span><NumberField bind:value={machine.allowance} step={0.05} min={0} max={2} label="Zugabe für den Sitz" /></div>
            <div class="field"><span class="field-label">Übergangslänge{@render machineReset('transition', 'Übergangslänge')}</span><NumberField bind:value={machine.transition} step={1} min={2} max={40} label="Übergangslänge" /></div>
            <label class="field check"><input type="checkbox" bind:checked={machine.holes} /> 3 Schraubenlöcher Ø 4</label>
          </div>
          <p class="hint"><strong>Zugabe:</strong> Luft zwischen Adapter und {machine.mode === 'over' ? 'Stutzen' : 'Öffnung'}. Größer, wenn der Adapter nicht {machine.mode === 'over' ? 'draufpasst' : 'hineinpasst'}, kleiner (bis 0), wenn er zu locker sitzt.</p>
          <p class="hint"><strong>Übergangslänge:</strong> Länge des Konus zwischen {kind.id === 'MACHINE_M' ? 'Stecker' : 'Kupplung'} und Rohrteil. Länger ergibt eine flachere Schräge, die sich besser druckt; der Adapter wird dafür länger. Original: 8 mm.</p>
          <p class="hint pipe-sum">
            Rohrteil des Adapters:
            {#if machine.mode === 'over'}
              innen Ø {fmt(pipe.d1Inner, 2)} vorne / {fmt(pipe.d2Inner, 2)} in der Tiefe, außen Ø {fmt(pipe.d1Inner + 2 * pipe.wall, 2)} / {fmt(pipe.d2Inner + 2 * pipe.wall, 2)},
            {:else}
              außen Ø {fmt(pipe.d1Inner + 2 * pipe.wall, 2)} vorne / {fmt(pipe.d2Inner + 2 * pipe.wall, 2)} in der Tiefe, innen Ø {fmt(pipe.d1Inner, 2)} / {fmt(pipe.d2Inner, 2)},
            {/if}
            Wand {fmt(pipe.wall)} mm.
          </p>
          {#if machineWarnings.length}
            <ul class="warn">
              {#each machineWarnings as w}<li>{w}</li>{/each}
            </ul>
          {/if}
        {/if}
        {@render resetStepBtn(sizesDefault, kind.machine ? 'Größen und Stutzen-Maße auf Standard zurücksetzen' : 'Größen auf Standard zurücksetzen', resetSizes)}
      {:else if step === 2}
        <h2>Passung</h2>
        <p class="lead">Die Standardwerte passen für die meisten gut kalibrierten Drucker.</p>

        <fieldset class="opt">
          <legend>Spaltmaß Stecker / Kupplung</legend>
          <div class="slider">
            <input type="range" min="0.1" max="0.5" step="0.05" bind:value={input.maleFemaleGapSize} aria-describedby="gap-hint" />
            <output>{fmt(input.maleFemaleGapSize, 2)} mm</output>
            {@render reset('maleFemaleGapSize', 'Spaltmaß Stecker / Kupplung')}
          </div>
          <p class="hint" id="gap-hint">Größer, wenn der Stecker zu stramm sitzt. Kleiner, wenn er wackelt. Original: 0,2 mm. Der Wert wirkt auf beide Teile. Steckt ein neu gedrucktes Teil in einem Original-Teil (0,2 mm), ergibt sich der Mittelwert: eingestellte 0,4 mm wirken dann wie 0,3 mm.</p>
        </fieldset>

        {#if hasSwivel}
          <fieldset class="opt">
            <legend>Spaltmaß Drehring</legend>
            <div class="slider">
              <input type="range" min="0.2" max={swivelMax} step="0.05" bind:value={input.slipRingGapSize} aria-describedby="swivel-hint" />
              <output>{fmt(input.slipRingGapSize, 2)} mm</output>
              {@render reset('slipRingGapSize', 'Spaltmaß Drehring')}
            </div>
            <p class="hint" id="swivel-hint">Größer, wenn der Drehring nach dem Druck festsitzt (bei PETG oft 0,35–0,5 mm). Kleiner, wenn er zu viel Spiel hat. Original: 0,3 mm. Höchstens {fmt(swivelMax, 2)} mm{kind.id === 'FH' ? ` bei ${input.generalMaterialWidth} mm Materialstärke, sonst berührt der Außenring den Schlauchteil` : ''}.</p>
          </fieldset>
        {/if}

        <fieldset class="opt">
          <legend>Materialstärke</legend>
          <div class="seg" role="radiogroup">
            {#each [7, 9] as v}
              <button role="radio" aria-checked={input.generalMaterialWidth === v} class:sel={input.generalMaterialWidth === v} onclick={() => (input.generalMaterialWidth = v)}>{v} mm</button>
            {/each}
          </div>
          <p class="hint">9 mm macht die Kupplung stabiler und außen {fmt(4)} mm dicker.</p>
        </fieldset>

        <fieldset class="opt checks">
          <legend>Extras</legend>
          <label><input type="checkbox" bind:checked={text} /> Beschriftung ({code}, osVAC neo)</label>
          {#if hasSupport}
            <label><input type="checkbox" bind:checked={supports} /> Druckhilfe unter dem Stecker</label>
          {/if}
        </fieldset>
        {@render resetStepBtn(fitDefault, 'Passung auf Standard zurücksetzen', resetFit)}
      {:else}
        <h2>Download</h2>
        <p class="lead">
          {kind.title}, {kind.diameters.map((k) => `${LABELS[k].name} ${fmt(input[k])} mm`).join(', ')}{#if kind.machine}, Stutzen Ø {fmt(machine.dOpen)} / {fmt(machine.dDepth)} mm, {machine.length} mm tief{/if}.
        </p>

        {#if filament}
          <p class="filament">
            Filament PETG: ca. {gramsText} g, das sind {Math.round(filament.gramsMin) === Math.round(filament.gramsMax) ? 'etwa' : 'bis zu'} {fmt(filament.metersMax)} m bei 1,75 mm{supports && hasSupport ? ' inklusive Druckhilfe' : ''}.
            {#if Math.round(filament.gramsMin) === Math.round(filament.gramsMax)}
              Die Wände sind so dünn, dass der Slicer sie mit 3 Perimetern praktisch massiv druckt.
            {:else}
              Der kleinere Wert gilt für 3 Wände und 15 % Infill, der größere für massiven Druck.
            {/if}
          </p>
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
        {#if hasSupport}
          <label class="inline-check"><input type="checkbox" bind:checked={supports} /> Druckhilfe mit exportieren</label>
        {/if}

        <details class="box" open>
          <summary>Druckhinweise</summary>
          <ul class="tips">
            {#each printTips as t}<li>{t}</li>{/each}
          </ul>
        </details>

        <details class="box" open={plate.length > 0}>
          <summary>Mehrere Adapter auf ein Druckbett{plate.length ? ` (${plate.length})` : ''}</summary>
          <p class="hint">Den aktuellen Adapter hinzufügen, danach Typ oder Maße ändern und den nächsten hinzufügen, zum Beispiel zwei Spaltmaße zum Testen. Alle landen nebeneinander in einer Datei.</p>
          <button class="ghost sm" disabled={onPlate || status !== 'ready'} onclick={addToPlate}>{onPlate ? 'Ist schon auf dem Druckbett' : 'Aktuellen Adapter hinzufügen'}</button>
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

        <details class="box">
          <summary>Einstellung merken</summary>
          <p class="hint">Der Konfigurator merkt sich die letzte Einstellung in diesem Browser. Zum Weitergeben oder als Lesezeichen gibt es den Link, er enthält alle Maße und Einstellungen.</p>
          <button class="ghost sm" onclick={copyLink}>{linkCopied ? 'Link kopiert' : 'Link kopieren'}</button>
        </details>
        <p class="status-line" role="status">
          {#if exporting}{exporting.toUpperCase()} wird erzeugt…{:else if status !== 'ready'}Die Downloads sind verfügbar, sobald die Berechnung fertig ist.{/if}
        </p>
        {#if files.length}
          <div class="files">
            <p>Erzeugte Dateien. Falls ein Download nicht gestartet ist, hier klicken:</p>
            <ul>
              {#each files as f (f.fileName)}
                <li><a href={f.url} download={f.fileName}>{f.fileName}</a> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span></li>
              {/each}
            </ul>
          </div>
        {/if}
        <div class="license">
          <p class="credit">Basiert auf <strong>osVAC neo</strong> von Ludo Kerz,<br />ursprünglich entstanden im Hobbyhimmel Stuttgart.</p>
          <p>
            Lizenz: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a><br />
            Weitergabe mit Namensnennung, nicht kommerziell, unter gleichen Bedingungen. Das gilt auch für die erzeugten Dateien.
          </p>
          <p><a class="more" href="./lizenzen.html" target="_blank" rel="noopener">Verwendete Bausteine und ihre Lizenzen<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg></a></p>
        </div>
      {/if}

    </div>

    <nav class="step-nav">
      <!-- Beschriftung = Ziel-Schritt mit Pfeil; im ersten Schritt bleibt der Platz des Zurück-Knopfs frei -->
      <button class="ghost" class:hidden={step === 0} disabled={step === 0} aria-label={step > 0 ? `Zurück zu ${STEPS[step - 1]}` : undefined} onclick={() => (step = Math.max(0, step - 1))}>
        <svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>{step > 0 ? STEPS[step - 1] : ''}
      </button>
      {#if step < STEPS.length - 1}
        <button class="next" aria-label="Weiter zu {STEPS[step + 1]}" onclick={() => (step = step + 1)}>
          {STEPS[step + 1]}<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      {/if}
    </nav>
  </aside>
</div>
