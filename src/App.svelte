<script lang="ts">
  import { onMount } from 'svelte';
  import { PartViewer, type Dimensions } from './lib/viewer';
  import { build, exportFile, makeBuild, cadReady } from './lib/cad';
  import { KINDS, kindById, type DiameterKey } from './lib/osvac/catalog';
  import { DEFAULT_INPUT, deriveParams, type OsvacInput } from './lib/osvac/params';
  import type { ExportFormat } from './lib/worker/protocol';
  import KindIcon from './components/KindIcon.svelte';
  import MeasureFigure from './components/MeasureFigure.svelte';
  import NumberField from './components/NumberField.svelte';
  import type { PipeSpec } from './lib/osvac/machine';
  import { estimateFilament } from './lib/filament';

  const STEPS = ['Verbindung', 'Größen', 'Passung', 'Download'] as const;
  let step = $state(0);
  let kindId = $state('MF');
  let input = $state<OsvacInput>({ ...DEFAULT_INPUT, maleDiameterInner: 25, femaleDiameterInner: 32 });
  let text = $state(true);
  /** Eine Einstellung für Anzeige und Export der Druckhilfe (wird immer mitberechnet) */
  let supports = $state(true);
  let machine = $state({ mode: 'over' as 'over' | 'into', dOpen: 32, dDepth: 33, length: 30, wall: 3, allowance: 0.2, holes: true });
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
  const pipe = $derived.by((): PipeSpec => {
    const m = machine;
    const w = Math.max(2, m.wall);
    const toInner = (d: number) => (m.mode === 'over' ? d + m.allowance : d - m.allowance - 2 * w);
    // D1 (am Übergang, tief im Adapter) ↔ Stutzen vorne; D2 (Öffnung des Adapters) ↔ Stutzen in der Tiefe
    return { d1Inner: round1(toInner(m.dOpen)), d2Inner: round1(toInner(m.dDepth)), length: m.length, wall: w, transition: 8, screwHoles: m.holes };
  });
  const buildOpts = $derived(kind.machine ? { pipe } : {});
  const fileName = $derived(kind.fileName(params, buildOpts));
  const code = $derived(
    kind.machine
      ? `${kind.ends.top === 'female' ? 'F' : 'M'}${fmt(kind.ends.top === 'female' ? input.femaleDiameterInner : input.maleDiameterInner)}/${fmt(machine.dOpen)}`
      : fileName.replace('osVAC neo ', ''),
  );

  const LABELS: Record<DiameterKey, { name: string; word: string; letter: 'F' | 'M' | 'H'; hint: string; presets: number[] }> = {
    femaleDiameterInner: { name: 'Kupplung (F)', word: 'Kupplung', letter: 'F', hint: 'Innendurchmesser der Bajonett-Kupplung', presets: [25, 32] },
    maleDiameterInner: { name: 'Stecker (M)', word: 'Stecker', letter: 'M', hint: 'Innendurchmesser des Steckers', presets: [25, 32] },
    hoseDiameterInner: { name: 'Schlauch (H)', word: 'Schlauch', letter: 'H', hint: 'Innendurchmesser des Schlauchs', presets: [25, 27, 32, 36, 38, 40, 50] },
  };

  const warnings = $derived.by(() => {
    const w: string[] = [];
    for (const k of kind.diameters) {
      const v = input[k];
      if (!(v >= 15 && v <= 60)) w.push(`${LABELS[k].name}: ${fmt(v)} mm liegt außerhalb von 15 bis 60 mm.`);
      else if (!LABELS[k].presets.includes(v)) w.push(`${LABELS[k].name}: ${fmt(v)} mm ist kein Standardmaß von osVAC neo. Passt nur zu Teilen derselben Größe.`);
    }
    if (kind.machine) {
      if (pipe.d1Inner < 8 || pipe.d2Inner < 8) w.push('Der Innendurchmesser des Rohrs wird kleiner als 8 mm. Maße oder Wandstärke prüfen.');
      if (Math.abs(machine.dOpen - machine.dDepth) > 8) w.push('Öffnung und Tiefe unterscheiden sich um mehr als 8 mm. Bitte die Messung prüfen.');
      if (machine.length < 10) w.push('Unter 10 mm Steckweg hält der Adapter kaum auf dem Stutzen.');
    }
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
    try {
      status = 'preview';
      const quick = await build(makeBuild(kindId, $state.snapshot(input), { text: false, knurl: false, supports: true, ...$state.snapshot(buildOpts) }));
      if (token !== buildToken) return;
      dims = viewer!.setBodies(quick.bodies);
      status = 'detail';
      const full = await build(spec());
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

  function setDia(k: DiameterKey, v: number) {
    input[k] = Math.round(v * 10) / 10;
  }
</script>

<header class="topbar">
  <p class="wordmark"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span> <span class="wm-sub">Konfigurator</span></p>
</header>

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>

    <header class="stage-head">
      <h1 class="code" aria-live="polite">{code}</h1>
      <p class="kind-line">{kind.title}</p>
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
        {#if status === 'start'}CAD-Kern wird geladen …
        {:else if status === 'preview'}Vorschau wird berechnet …
        {:else if status === 'detail'}Rändelung und Beschriftung werden berechnet …
        {:else if status === 'ready'}Bereit zum Download
        {:else}Fehler beim Berechnen{/if}
      </p>
    </footer>
  </section>

  <aside class="panel">
    <ol class="steps">
      {#each STEPS as s, i}
        <li>
          <button class="step-tab" class:current={step === i} class:done={i < step} aria-current={step === i ? 'step' : undefined} onclick={() => (step = i)}>
            <span class="num">{i + 1}</span>{s}
          </button>
        </li>
      {/each}
    </ol>

    <div class="step-body">
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
        <p class="lead">Innendurchmesser in Millimetern. <strong>25</strong> und <strong>32</strong> sind die Standardgrößen von osVAC neo.</p>
        {#each kind.diameters as k}
          <fieldset class="dia dia-{LABELS[k].letter}">
            <legend>{LABELS[k].word} (<b class="ck-{LABELS[k].letter}">{LABELS[k].letter}</b>)</legend>
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
            <button role="radio" aria-checked={machine.mode === 'over'} class:sel={machine.mode === 'over'} onclick={() => (machine.mode = 'over')}>Adapter wird aufgesteckt</button>
            <button role="radio" aria-checked={machine.mode === 'into'} class:sel={machine.mode === 'into'} onclick={() => (machine.mode = 'into')}>Adapter wird eingesteckt</button>
          </div>
          <MeasureFigure mode={machine.mode} />
          <p class="hint">
            {machine.mode === 'over'
              ? 'Außendurchmesser des Stutzens mit dem Messschieber messen: vorne an der Öffnung und in der Tiefe, bis zu der der Adapter reichen soll.'
              : 'Innendurchmesser der Absaugöffnung messen: vorne an der Kante und in der Tiefe, bis zu der der Adapter hineinreichen soll.'}
          </p>
          <div class="grid2">
            <div class="field"><span>Ø vorne</span><NumberField bind:value={machine.dOpen} step={0.1} min={8} max={120} label="Ø vorne" /></div>
            <div class="field"><span>Ø in der Tiefe</span><NumberField bind:value={machine.dDepth} step={0.1} min={8} max={120} label="Ø in der Tiefe" /></div>
            <div class="field"><span>Tiefe (Steckweg)</span><NumberField bind:value={machine.length} step={1} min={5} max={100} label="Tiefe (Steckweg)" /></div>
            <div class="field"><span>Wandstärke</span><NumberField bind:value={machine.wall} step={0.5} min={2} max={8} label="Wandstärke" /></div>
            <div class="field"><span>Zugabe für den Sitz</span><NumberField bind:value={machine.allowance} step={0.05} min={0} max={2} label="Zugabe für den Sitz" /></div>
            <label class="field check"><input type="checkbox" bind:checked={machine.holes} /> 3 Schraubenlöcher Ø 4</label>
          </div>
          <p class="hint">Rohr innen: Ø {fmt(pipe.d2Inner, 2)} an der Öffnung, Ø {fmt(pipe.d1Inner, 2)} am Übergang, Wand {fmt(pipe.wall)} mm.</p>
        {/if}
      {:else if step === 2}
        <h2>Passung</h2>
        <p class="lead">Die Standardwerte passen für die meisten gut kalibrierten Drucker.</p>

        <fieldset class="opt">
          <legend>Spaltmaß Stecker / Kupplung</legend>
          <div class="slider">
            <input type="range" min="0.1" max="0.5" step="0.05" bind:value={input.maleFemaleGapSize} aria-describedby="gap-hint" />
            <output>{fmt(input.maleFemaleGapSize, 2)} mm</output>
          </div>
          <p class="hint" id="gap-hint">Größer, wenn der Stecker zu stramm sitzt. Kleiner, wenn er wackelt. Original: 0,2 mm.</p>
        </fieldset>

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
          <button class="dl primary" disabled={status !== 'ready' || !!exporting} onclick={() => download('3mf')}>
            <strong>3MF herunterladen</strong><small>Empfohlen für Bambu Studio, PrusaSlicer, Orca, Cura</small>
          </button>
          <button class="dl" disabled={status !== 'ready' || !!exporting} onclick={() => download('stl')}>
            <strong>STL herunterladen</strong><small>Funktioniert mit jedem Slicer</small>
          </button>
          <button class="dl" disabled={status !== 'ready' || !!exporting} onclick={() => download('step')}>
            <strong>STEP herunterladen</strong><small>Exaktes CAD-Modell zum Weiterkonstruieren</small>
          </button>
        </div>
        {#if hasSupport}
          <label class="inline-check"><input type="checkbox" bind:checked={supports} /> Druckhilfe mit exportieren</label>
        {/if}
        <p class="status-line" role="status">
          {#if exporting}{exporting.toUpperCase()} wird erzeugt …{:else if status !== 'ready'}Die Downloads sind verfügbar, sobald die Berechnung fertig ist.{/if}
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
        <p class="license">
          osVAC neo steht unter CC BY-NC-SA 4.0: Weitergabe mit Namensnennung, nicht kommerziell, unter gleichen Bedingungen.
        </p>
      {/if}

      {#if errorMsg}
        <p class="error" role="alert">{errorMsg}</p>
      {/if}
    </div>

    <nav class="step-nav">
      <button class="ghost" disabled={step === 0} onclick={() => (step = Math.max(0, step - 1))}>Zurück</button>
      {#if step < STEPS.length - 1}
        <button class="next" onclick={() => (step = step + 1)}>Weiter zu {STEPS[step + 1]}</button>
      {/if}
    </nav>
  </aside>
</div>
