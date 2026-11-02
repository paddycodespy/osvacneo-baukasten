<script lang="ts">
  import { onMount } from 'svelte';
  import { PartViewer, type Dimensions } from './lib/viewer';
  import { build, exportFile, makeBuild, cadReady } from './lib/cad';
  import { KINDS, kindById, type DiameterKey } from './lib/osvac/catalog';
  import { DEFAULT_INPUT, deriveParams, type OsvacInput } from './lib/osvac/params';
  import type { ExportFormat } from './lib/worker/protocol';
  import KindIcon from './components/KindIcon.svelte';

  const STEPS = ['Verbindung', 'Größen', 'Passung', 'Download'] as const;
  let step = $state(0);
  let kindId = $state('MF');
  let input = $state<OsvacInput>({ ...DEFAULT_INPUT, maleDiameterInner: 25, femaleDiameterInner: 32 });
  let text = $state(true);
  let supports = $state(true);
  let exportHelpers = $state(true);

  let host: HTMLDivElement;
  let viewer: PartViewer | null = null;
  let dims = $state<Dimensions | null>(null);
  let status = $state<'start' | 'preview' | 'detail' | 'ready' | 'error'>('start');
  let errorMsg = $state('');
  let section = $state(false);
  let showHelpers = $state(true);
  let exporting = $state<ExportFormat | null>(null);
  let files = $state<{ fileName: string; url: string; size: number; key: string }[]>([]);

  const kind = $derived(kindById(kindId));
  const params = $derived(deriveParams(input));
  const fileName = $derived(kind.fileName(params));
  const code = $derived(fileName.replace('osVACneo-', ''));

  const LABELS: Record<DiameterKey, { name: string; hint: string; presets: number[] }> = {
    femaleDiameterInner: { name: 'Kupplung (F)', hint: 'Innendurchmesser der Bajonett-Kupplung', presets: [25, 32] },
    maleDiameterInner: { name: 'Stecker (M)', hint: 'Innendurchmesser des Steckers', presets: [25, 32] },
    hoseDiameterInner: { name: 'Schlauch (H)', hint: 'Innendurchmesser des Schlauchs', presets: [25, 27, 32, 36, 38, 40, 50] },
  };

  const warnings = $derived.by(() => {
    const w: string[] = [];
    for (const k of kind.diameters) {
      const v = input[k];
      if (!(v >= 15 && v <= 60)) w.push(`${LABELS[k].name}: ${fmt(v)} mm liegt außerhalb von 15 bis 60 mm.`);
      else if (!LABELS[k].presets.includes(v)) w.push(`${LABELS[k].name}: ${fmt(v)} mm ist kein osVACneo-Standardmaß. Passt nur zu Teilen derselben Größe.`);
    }
    if (input.maleFemaleGapSize < 0.1 || input.maleFemaleGapSize > 0.5) w.push('Spaltmaß außerhalb von 0,1 bis 0,5 mm – Stecker und Kupplung passen dann kaum zusammen.');
    return w;
  });

  function fmt(v: number, d = 1) {
    return v.toLocaleString('de-DE', { maximumFractionDigits: d });
  }

  // --- Bauen: erst schnelle Vorschau, dann Details ---
  let buildToken = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function spec() {
    return makeBuild(kindId, $state.snapshot(input), { text, knurl: true, supports });
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
      const quick = await build(makeBuild(kindId, $state.snapshot(input), { text: false, knurl: false, supports }));
      if (token !== buildToken) return;
      dims = viewer!.setBodies(quick.bodies);
      status = 'detail';
      const full = await build(spec());
      if (token !== buildToken) return;
      dims = viewer!.setBodies(full.bodies);
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
      input.maleFemaleGapSize, input.slipRingGapSize, input.supportStructureGapSize, text, supports];
    if (viewer) schedule();
  });

  onMount(() => {
    viewer = new PartViewer(host);
    schedule();
    return () => viewer?.dispose();
  });

  async function download(f: ExportFormat) {
    exporting = f;
    try {
      const r = await exportFile(spec(), f, fileName, exportHelpers);
      const key = JSON.stringify(spec().input) + f + exportHelpers;
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

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>

    <header class="stage-head">
      <p class="brand">osVACneo Konfigurator</p>
      <h1 class="code" aria-live="polite">{code}</h1>
      <p class="kind-line">{kind.title}</p>
    </header>

    <div class="stage-tools">
      <button class="tool" class:on={section} aria-pressed={section} onclick={() => { section = !section; viewer?.setSection(section); }}>Schnitt</button>
      {#if supports}
        <button class="tool" class:on={showHelpers} aria-pressed={showHelpers} onclick={() => { showHelpers = !showHelpers; viewer?.setHelpers(showHelpers); }}>Druckhilfe</button>
      {/if}
      <button class="tool" onclick={() => viewer?.resetView()}>Ansicht zurücksetzen</button>
    </div>

    <footer class="stage-foot">
      <dl class="dims">
        <div><dt>Höhe</dt><dd>{dims ? fmt(dims.height) : '–'}<span>mm</span></dd></div>
        <div><dt>Größter Ø</dt><dd>{dims ? fmt(dims.diameter) : '–'}<span>mm</span></dd></div>
        <div><dt>Kupplung außen</dt><dd>{fmt(params.femaleDiameterOuter)}<span>mm</span></dd></div>
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
        <h2>Was soll verbunden werden?</h2>
        <p class="lead">Alle Teile sind original osVACneo: Bajonett, Toleranzen und Maße kommen aus dem Fusion-Master v366.</p>
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
              <span class="kind-code">{k.code}</span>
            </button>
          {/each}
        </div>
      {:else if step === 1}
        <h2>Welche Größen?</h2>
        <p class="lead">Innendurchmesser in Millimetern. 25 und 32 sind die osVACneo-Standardgrößen.</p>
        {#each kind.diameters as k}
          <fieldset class="dia">
            <legend>{LABELS[k].name}</legend>
            <div class="dia-row">
              <div class="chips">
                {#each LABELS[k].presets as v}
                  <button class="chip" class:sel={input[k] === v} onclick={() => setDia(k, v)}>{v}</button>
                {/each}
              </div>
              <label class="num-in">
                <span class="sr">{LABELS[k].hint}</span>
                <input type="number" min="15" max="60" step="0.1" value={input[k]} onchange={(e) => setDia(k, +(e.currentTarget as HTMLInputElement).value)} />
                <span class="unit">mm</span>
              </label>
            </div>
          </fieldset>
        {/each}
      {:else if step === 2}
        <h2>Passung und Druck</h2>
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
          {#if kind.ends.top === 'male' || kind.ends.bottom === 'male'}
            <label><input type="checkbox" bind:checked={supports} /> Druckhilfe unter dem Stecker</label>
          {/if}
        </fieldset>
      {:else}
        <h2>Herunterladen</h2>
        <p class="lead">
          {kind.title}, {kind.diameters.map((k) => `${LABELS[k].name} ${fmt(input[k])} mm`).join(', ')}.
        </p>

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
        {#if supports && (kind.ends.top === 'male' || kind.ends.bottom === 'male')}
          <label class="inline-check"><input type="checkbox" bind:checked={exportHelpers} /> Druckhilfe mit exportieren</label>
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
          osVACneo steht unter CC BY-NC-SA 4.0: Weitergabe mit Namensnennung, nicht kommerziell, unter gleichen Bedingungen.
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
