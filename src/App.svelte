<script lang="ts">
  /**
   * Gerüst der Anwendung: 3D-Vorschau links, Schritte rechts.
   * Die Eingaben liegen in `app` (lib/app.svelte.ts), die Schritte in components/steps.
   * Hier passiert nur, was die Vorschau betrifft: Berechnen, Anzeigen, Speichern des Stands.
   */
  import { onMount } from 'svelte';
  import { PartViewer } from './lib/viewer';
  import { build, partNames } from './lib/cad';
  import type { MeshBody } from './lib/worker/protocol';
  import { userMessage } from './lib/errors';
  import { freeSummary } from './lib/osvac/freeform';
  import { app, fmt } from './lib/app.svelte';
  import FreeformEditor from './components/FreeformEditor.svelte';
  import StepKind from './components/steps/StepKind.svelte';
  import StepSizes from './components/steps/StepSizes.svelte';
  import StepFit from './components/steps/StepFit.svelte';
  import StepDownload from './components/steps/StepDownload.svelte';

  // gespeicherten Stand übernehmen, bevor irgendetwas berechnet wird
  app.load();

  let host: HTMLDivElement;
  let viewer: PartViewer | null = null;
  let section = $state(false);
  /** Wurde schon einmal ein Modell angezeigt? (sonst bei Fehlern statt der Vorschau ein Hinweis) */
  let everShown = $state(false);

  // --- Bauen: erst schnelle Vorschau, dann Details ---
  let buildToken = 0;
  /** Adaptertyp, dessen Körper gerade angezeigt werden */
  let shownKind = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  }
  async function run() {
    if (!app.kind.available || !viewer) return;
    const v = viewer;
    const token = ++buildToken;
    const kindId = app.kindId;
    app.errorMsg = '';
    app.measures = null; // Filamentangabe gehört zur alten Konfiguration
    app.progress = null;
    try {
      app.status = 'preview';
      if (shownKind && shownKind !== kindId) {
        v.setDimmed(true);
        app.dims = null; // Maße gehören zum alten Typ
      }
      const quick = await build(app.quickSpec());
      if (token !== buildToken) return;
      app.dims = v.setBodies(quick.bodies);
      shownKind = kindId;
      everShown = true;
      app.status = 'detail';
      // Fertige Körper sofort zeigen; bis dahin bleiben die Körper der schnellen Vorschau stehen
      // (die volle Berechnung hat zusätzlich die Rändelung als eigene Körper, daher Zuordnung über den Namen)
      const req = app.spec();
      const quickByName = new Map(quick.bodies.map((b) => [b.name, b]));
      const names = partNames(req);
      const cur: (MeshBody | undefined)[] = names.map((n) => quickByName.get(n));
      let done = 0;
      app.progress = { done, total: names.length };
      let raf = 0;
      const full = await build(req, (i, b) => {
        if (token !== buildToken) return;
        cur[i] = b;
        app.progress = { done: ++done, total: names.length };
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (token === buildToken) v.setBodies(cur.filter((x): x is MeshBody => !!x));
        });
      });
      cancelAnimationFrame(raf);
      if (token !== buildToken) return;
      app.dims = v.setBodies(full.bodies);
      app.overhang = app.kind.freeform ? overhangArea(full.bodies) : 0;
      app.measures = { volume: full.volume, area: full.area, helperVolume: full.helperVolume, helperArea: full.helperArea };
      app.progress = null;
      app.status = 'ready';
    } catch (e) {
      if (token !== buildToken) return;
      app.progress = null;
      app.status = 'error';
      app.errorMsg = userMessage(e);
      // das zuletzt gezeigte Modell bleibt blass stehen: es gehört nicht mehr zu den Eingaben
      v.setDimmed(true);
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

  // neu berechnen, sobald sich etwas Relevantes ändert
  $effect(() => {
    void app.buildKey;
    if (viewer) schedule();
  });

  // Druckhilfe ein-/ausblenden ohne Neuberechnung
  $effect(() => {
    const on = app.supports; // zuerst lesen, damit Svelte die Abhängigkeit registriert
    viewer?.setHelpers(on);
  });

  // Drehring: Spaltmaß nicht über das zulässige Maß
  $effect(() => {
    if (app.hasSwivel && app.input.slipRingGapSize > app.swivelMax) app.input.slipRingGapSize = app.swivelMax;
  });

  // Download gesperrt: zurück zum vorletzten Schritt
  $effect(() => {
    if (app.blocked && app.step === app.lastStep) app.step = app.lastStep - 1;
  });

  // Stand im Browser speichern (kurz verzögert, damit nicht jeder Tastendruck schreibt)
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void app.saved;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => app.save(), 400);
  });

  /** Hinweis zum Drucken schon im Aufbau (erst sicher, wenn die Berechnung fertig ist) */
  const printNote = $derived.by((): { text: string; level: 'ok' | 'warn' } | null => {
    if (app.status !== 'ready') return null;
    if (app.needsSupportMaterial)
      return { level: 'warn', text: 'Ein Teil hängt beim Drucken schräg in der Luft. Im Slicer „Stützen nur auf dem Druckbett“ einschalten. Manchmal reicht es auch, das andere Ende nach unten zu legen.' };
    return { level: 'ok', text: `Druckt so ohne Stützen${app.hasSupport ? ' (nur die Druckhilfe unter dem Stecker wird mitgedruckt)' : ''}.` };
  });

  const busyText = $derived(app.progress && app.progress.total > 1 ? `Wird berechnet… ${app.progress.done} von ${app.progress.total} Teilen` : 'Wird berechnet…');

  onMount(() => {
    viewer = new PartViewer(host);
    viewer.setHelpers(app.supports);
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(saveTimer);
      app.save();
      viewer?.dispose();
    };
  });
</script>

<header class="topbar">
  <p class="wordmark"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span> <span class="wm-sub">Konfigurator</span></p>
  <a class="site-link" href="https://osvacneo.de" target="_blank" rel="noopener noreferrer">osvacneo.de <span aria-hidden="true">↗</span></a>
</header>

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>
    {#if app.status === 'error' && !everShown}
      <div class="stage-empty"><p>Noch keine Vorschau. Sobald die rot markierten Punkte behoben sind, erscheint hier der Adapter.</p></div>
    {/if}

    <header class="stage-head">
      <h1 class="code" class:free={app.kind.freeform} aria-live="polite">{app.code}</h1>
      <p class="kind-line">{app.kind.freeform ? freeSummary(app.free).sub : app.kind.title}</p>
      {#if app.status !== 'ready'}<p class="status status-m" data-s={app.status} aria-hidden="true">{app.status === 'error' ? 'Fehler beim Berechnen' : app.status === 'start' ? 'CAD-Kern wird geladen…' : busyText}</p>{/if}
    </header>

    <div class="stage-tools">
      <button class="tool" class:on={section} aria-pressed={section} onclick={() => { section = !section; viewer?.setSection(section); }}>Schnitt</button>
      {#if app.hasSupport}
        <button class="tool" class:on={app.supports} aria-pressed={app.supports} onclick={() => (app.supports = !app.supports)}>Druckhilfe</button>
      {/if}
      <button class="tool" onclick={() => viewer?.resetView()}>Ansicht zurücksetzen</button>
    </div>

    <footer class="stage-foot">
      <dl class="dims">
        <div><dt>Höhe</dt><dd>{app.dims ? fmt(app.dims.height) : '–'}<span>mm</span></dd></div>
        {#if app.kind.freeform}
          <div><dt>Breite</dt><dd>{app.dims ? fmt(app.dims.width) : '–'}<span>mm</span></dd></div>
        {:else}
          <div><dt>Größter Ø</dt><dd>{app.dims ? fmt(app.dims.diameter) : '–'}<span>mm</span></dd></div>
        {/if}
        <div><dt>PETG ca.</dt><dd>{app.gramsText}<span>g</span></dd></div>
      </dl>
      <p class="status" data-s={app.status} role="status">
        {#if app.status === 'start'}CAD-Kern wird geladen…
        {:else if app.status === 'preview' || app.status === 'detail'}{busyText}
        {:else if app.status === 'ready'}Bereit zum Download
        {:else}Fehler beim Berechnen, Hinweis rechts{/if}
      </p>
    </footer>
  </section>

  <aside class="panel">
    <ol class="steps">
      {#each app.steps as s, i}
        <li>
          <button
            class="step-tab"
            class:current={app.step === i}
            class:done={i < app.step}
            aria-current={app.step === i ? 'step' : undefined}
            disabled={i === app.lastStep && app.blocked}
            title={i === app.lastStep && app.blocked ? 'Erst die rot markierten Punkte beheben' : undefined}
            onclick={() => (app.step = i)}
          >
            <span class="num">{i + 1}</span><span class="label">{s}</span>
          </button>
        </li>
      {/each}
    </ol>

    <div class="step-body">
      {#if app.errorMsg}
        <p class="error" role="alert">{app.errorMsg}</p>
      {/if}
      {#if app.step === 0}
        <StepKind />
      {:else if app.step === 1 && app.kind.freeform}
        <h2>Aufbau</h2>
        <FreeformEditor bind:spec={app.free} bind:open={app.freeOpen} bind:template={app.freeTemplate} issues={app.freeIssues} {printNote} />
      {:else if app.step === 1}
        <StepSizes />
      {:else if app.step === 2}
        <StepFit />
      {:else}
        <StepDownload />
      {/if}
    </div>

    {#if app.blocked && app.step === app.lastStep - 1}
      <p class="nav-hint" role="status">Bitte zuerst die rot markierten Punkte beheben. Danach geht es zum Download.</p>
    {/if}
    <nav class="step-nav">
      <!-- Beschriftung = Ziel-Schritt mit Pfeil; im ersten Schritt bleibt der Platz des Zurück-Knopfs frei -->
      <button class="ghost" class:hidden={app.step === 0} disabled={app.step === 0} aria-label={app.step > 0 ? `Zurück zu ${app.steps[app.step - 1]}` : undefined} onclick={() => (app.step = Math.max(0, app.step - 1))}>
        <svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>{app.step > 0 ? app.steps[app.step - 1] : ''}
      </button>
      {#if app.step < app.lastStep}
        <button class="next" aria-label="Weiter zu {app.steps[app.step + 1]}" disabled={app.step + 1 === app.lastStep && app.blocked} onclick={() => (app.step = app.step + 1)}>
          {app.steps[app.step + 1]}<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      {/if}
    </nav>
  </aside>
</div>
