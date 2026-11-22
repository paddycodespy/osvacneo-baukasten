<script lang="ts">
  /**
   * Gerüst der Anwendung: 3D-Vorschau links, Schritte rechts.
   * Die Eingaben liegen in `app` (lib/app.svelte.ts), die Schritte in components/steps.
   * Hier passiert nur, was die Vorschau betrifft: Berechnen, Anzeigen, Speichern des Stands.
   */
  import { onMount } from 'svelte';
  import { PartViewer } from './lib/viewer';
  import { build, partNames, measureBodies, sealGroovesOf } from './lib/cad';
  import type { MeshBody } from './lib/worker/protocol';
  import { userMessage } from './lib/errors';
  import { theme } from './lib/theme.svelte';
  import { overhangArea, belowBedEnd, COUNTED, COUNTED_MACHINE, COUNTED_GATE } from './lib/overhang';
  import { freeSummary, sectionPlanes, inPart2, tiltedEnds } from './lib/osvac/freeform';
  import { gateBed } from './lib/osvac/gate';
  import { app, fmt } from './lib/app.svelte';
  import FreeformEditor from './components/FreeformEditor.svelte';
  import StepKind from './components/steps/StepKind.svelte';
  import StepSizes from './components/steps/StepSizes.svelte';
  import StepNozzle from './components/steps/StepNozzle.svelte';
  import StepBleed from './components/steps/StepBleed.svelte';
  import StepMagnet from './components/steps/StepMagnet.svelte';
  import StepFit from './components/steps/StepFit.svelte';
  import StepDownload from './components/steps/StepDownload.svelte';

  // gespeicherten Stand übernehmen, bevor irgendetwas berechnet wird
  app.load();

  let host: HTMLDivElement;
  let stepBody: HTMLDivElement | undefined = $state();
  // neuer Schritt beginnt oben (sonst bliebe die Bildlaufposition des vorigen Schritts stehen)
  $effect(() => {
    void app.step;
    if (stepBody) stepBody.scrollTop = 0;
  });
  let viewer: PartViewer | null = null;
  let section = $state(false);
  /** Vorschau steht (für Effekte, die den Viewer brauchen) */
  let viewerOn = $state(false);
  /** Wurde schon einmal ein Modell angezeigt? (sonst bei Fehlern statt der Vorschau ein Hinweis) */
  let everShown = $state(false);

  // --- Bauen: erst schnelle Vorschau, dann Details ---
  let buildToken = 0;
  /** Adaptertyp, dessen Körper gerade angezeigt werden */
  let shownKind = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    app.measures = null; // sofort: sonst gälte die alte Filamentangabe noch bis zum Start (z. B. beim Druckbett)
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
    app.buildNotes = [];
    app.layoutError = '';
    // es fehlt noch eine Eingabe (z. B. Kontur): nicht rechnen, kein Fehler zeigen
    if (app.waiting) {
      app.seals = [];
      app.status = 'todo';
      v.setDimmed(true);
      return;
    }
    try {
      app.status = 'preview';
      // voller Bauauftrag gleich zu Beginn: Maße der Dichtnut sofort zum neuen Adapter (nicht erst nach der Vorschau,
      // sonst kurz die Werte des vorigen); die Teileliste rechnet cad.ts dafür nur einmal
      const req = app.spec();
      app.seals = sealGroovesOf(req);
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
      // Überhang: Freiform alle Formstücke; Stutzen und Schieber nur die eigenen Teile, kleine Stellen (Lochdecken, Schrift) zählen nicht
      // Freiform: alle Formstücke, dazu Anschlüsse von osVAC neo, die schräg stehen
      const fp = app.kind.freeform ? app.freePlan : null;
      app.overhang = app.kind.freeform
        ? overhangArea(full.bodies, fp && !fp.issues.some((x) => x.level === 'error') ? ((t) => (n: string) => COUNTED.test(n) || t(n))(tiltedEnds($state.snapshot(app.free), fp)) : COUNTED)
        : app.kind.machine
        ? overhangArea(full.bodies, COUNTED_MACHINE, 25)
        : app.kind.gate
        ? overhangArea(full.bodies, COUNTED_GATE, 25)
        : 0;
      app.buildNotes = full.notes;
      const plan = app.kind.freeform ? app.freePlan : null;
      const split = !!plan?.split;
      const below = app.kind.freeform ? belowBedEnd(full.bodies, app.free.bed, split && plan ? inPart2(plan) : undefined) : 0;
      app.layoutError =
        below > 0.3
          ? split
            ? `Ein Teil des Adapters liegt ${fmt(below, 0)} mm tiefer als das Ende, auf dem es steht (mit Schieber steht das Teil mit A auf Anschluss A, das Teil mit B auf Ende B). So lässt es sich nicht drucken. Bitte einen Bogen oder Abzweig in eine andere Richtung zeigen lassen.`
            : `Ein Teil des Adapters liegt ${fmt(below, 0)} mm tiefer als ${app.free.bed === 'B' ? 'Ende B' : 'Anschluss A'}. So liegt das Ende nicht auf dem Druckbett und der Adapter lässt sich nicht drucken. Bitte das andere Ende nach unten legen oder einen Bogen oder Abzweig in eine andere Richtung zeigen lassen.`
          : '';
      // Filament: alle Körper vereinigt messen (Stoßflächen innen zählen nicht als Außenwand); kommt kurz danach,
      // geht das nicht (z. B. offenes Netz), gilt die Summe der Körper
      const sums = { volume: full.volume, area: full.area, helperVolume: full.helperVolume, helperArea: full.helperArea };
      void measureBodies(full.bodies).then((u) => {
        if (token !== buildToken) return;
        app.measures = u ?? sums;
        app.fillPlateGrams();
      });
      app.progress = null;
      app.status = 'ready';
    } catch (e) {
      if (token !== buildToken) return;
      app.progress = null;
      app.status = 'error';
      // Fehler aus der Prüfung des Aufbaus stehen schon rot an ihrem Baustein bzw. Ende: nicht noch einmal oben zeigen
      app.errorMsg = app.freeIssues.some((x) => x.level === 'error') ? '' : userMessage(e);
      // das zuletzt gezeigte Modell bleibt blass stehen: es gehört nicht mehr zu den Eingaben
      v.setDimmed(true);
    }
  }

  // neu berechnen, sobald sich etwas Relevantes ändert
  $effect(() => {
    void app.buildKey;
    if (viewer) schedule();
  });

  // Freiform: Schnitt je Baustein entlang der Mittellinie (eine einzige Ebene träfe bei räumlichen Ketten nur einen Teil)
  $effect(() => {
    void viewerOn;
    const plan = app.freePlan;
    // Schieber einzeln: Unterteil, Oberteil und Wandhalter durch die Achse, Platte längs durch ihre Mitte (die gemeinsame Ebene läge
    // sonst in der Mitte aller Teile und schnitte nur die Platte weg)
    const bed = app.kind.gate ? gateBed($state.snapshot(app.gate)) : null;
    const gateFn = bed
      ? (name: string) => ({ p: (name === 'Schieberplatte' ? bed.plate : name === 'Wandhalter' ? bed.clip : name === 'Schieber-Oberteil' ? bed.upper : [0, 0, 0]) as [number, number, number], n: [0, 1, 0] as [number, number, number] })
      : null;
    const fn = app.kind.freeform && plan ? sectionPlanes($state.snapshot(app.free), plan) : gateFn;
    viewer?.setSectionPlanes(fn);
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
    void app.plateSaved;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => app.save(), 400);
  });
  // beim Neuladen oder Schließen sofort speichern: sonst ginge eine Änderung der letzten 400 ms verloren
  // (fiel im Test „Neu anfangen“ auf dem langsamen GitHub-Rechner auf)
  $effect(() => {
    const flush = () => {
      clearTimeout(saveTimer);
      app.save();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });

  /** Hinweis zum Drucken schon im Aufbau (erst sicher, wenn die Berechnung fertig ist) */
  const printNote = $derived.by((): { text: string; level: 'ok' | 'warn' | 'error' } | null => {
    if (app.layoutError) return { level: 'error', text: app.layoutError };
    if (app.status !== 'ready') return null;
    // Kupplung oder Stecker am Abzweig: Bajonett und Nasen stehen schräg
    const c = app.free.c;
    const atC = app.kind.freeform && c && c.type !== 'device' && app.free.blocks.some((b) => b.type === 'branch') ? ` Dazu gehört ${c.type === 'female' ? 'die Kupplung' : 'der Stecker'} an Ende C (am Abzweig).` : '';
    if (app.needsSupportMaterial)
      return { level: 'warn', text: `Ein Teil hängt beim Drucken schräg in der Luft. Im Slicer „Stützen nur auf dem Druckbett“ einschalten. Manchmal reicht es auch, das andere Ende nach unten zu legen.${atC}${app.femaleOnBed ? ` Auch die Kupplung an ${app.femaleOnBed} steht auf ihrer Öffnung (Decke der Bajonett-Nut hängt in der Luft).` : ''}` };
    if (app.femaleOnBed) return { level: 'warn', text: app.femaleOnBedText };
    if (app.kind.freeform && c && c.type !== 'device' && app.free.blocks.some((b) => b.type === 'branch'))
      return { level: 'warn', text: `${c.type === 'female' ? 'Die Kupplung' : 'Der Stecker'} an Ende C steht beim Drucken schräg. Im Slicer „Stützen nur auf dem Druckbett“ einschalten.` };
    return { level: 'ok', text: `Druckt so ohne Stützen${app.hasSupport ? ' (nur die Druckhilfe unter dem Stecker wird mitgedruckt)' : ''}.` };
  });

  // Zähler erst, wenn das erste Teil fertig ist („0 von 9“ sähe nach Stillstand aus)
  const busyText = $derived(app.progress && app.progress.total > 1 && app.progress.done > 0 ? `Wird berechnet\u00a0… ${app.progress.done} von ${app.progress.total} Teilen` : 'Wird berechnet\u00a0…');

  onMount(() => {
    viewer = new PartViewer(host);
    viewerOn = true;
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
  <p class="wordmark"><img class="wm-logo" src="./favicon.svg" alt="" width="34" height="34"><span class="wm-text"><span class="wm-os"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span></span><span class="wm-sub">BAUKASTEN</span></span></p>
  <a class="doc-btn" href="./anleitung.html" target="_blank" rel="noopener" title="Anleitung öffnen">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10.5 5.2 8 4.5 4 4.5v13c4 0 6.5.7 8 2 1.5-1.3 4-2 8-2v-13c-4 0-6.5.7-8 2Z" /><path d="M12 6.5v13" /></svg>
    <span>Anleitung</span>
  </a>
  <button class="theme-btn" type="button" data-testid="theme-toggle" onclick={() => theme.toggle()}
    title={theme.current === 'dark' ? 'Helle Ansicht' : 'Dunkle Ansicht'}
    aria-label={theme.current === 'dark' ? 'Helle Ansicht' : 'Dunkle Ansicht'}>
    {#if theme.current === 'dark'}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z"/></svg>
    {/if}
  </button>
</header>

<div class="app">
  <section class="stage" aria-label="3D-Vorschau">
    <div class="viewport" bind:this={host}></div>
    {#if app.status === 'todo' && !everShown}
      <div class="stage-empty"><p>Noch keine Vorschau. Sobald die Kontur angelegt ist, erscheint hier der Adapter.</p></div>
    {:else if app.status === 'error' && !everShown}
      <div class="stage-empty"><p>Noch keine Vorschau. Sobald die rot markierten Punkte behoben sind, erscheint hier der Adapter.</p></div>
    {:else if !everShown}
      <div class="stage-empty"><p>{app.status === 'start' ? 'CAD-Kern wird geladen\u00a0…' : 'Vorschau wird berechnet\u00a0…'}</p></div>
    {/if}

    <header class="stage-head">
      <h1 class="code" class:free={app.kind.freeform || app.kind.gate || app.kind.magnet} aria-live="polite">{app.code}</h1>
      <p class="kind-line">{app.kind.magnet ? `Magnet-Schnellkupplung Ø100 · ${app.kind.title}` : app.kind.bleed ? app.kind.title : app.kind.nozzle ? freeSummary(app.free).sub.replace(/^Freiform/, 'Saugdüse') : app.kind.freeform ? freeSummary(app.free).sub : app.kind.title}</p>
      {#if app.status !== 'ready'}<p class="status status-m" data-s={app.status} aria-hidden="true">{app.status === 'todo' ? 'Kontur fehlt noch' : app.status === 'error' ? 'Fehler beim Berechnen' : app.status === 'start' ? 'CAD-Kern wird geladen\u00a0…' : busyText}</p>{/if}
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
        {#if app.kind.freeform || app.kind.gate || (app.kind.magnet && app.magnet.adapter && app.magnet.coupling)}
          <div><dt>Breite</dt><dd>{app.dims ? fmt(app.dims.width) : '–'}<span>mm</span></dd></div>
        {:else}
          <div><dt>Größter Ø</dt><dd>{app.dims ? fmt(app.dims.diameter) : '–'}<span>mm</span></dd></div>
        {/if}
        <div><dt>PETG ca.</dt><dd>{app.gramsText}<span>g</span></dd></div>
      </dl>
      <p class="status" data-s={app.layoutError ? 'error' : app.status} role="status">
        {#if app.status === 'start'}CAD-Kern wird geladen&nbsp;…
        {:else if app.status === 'preview' || app.status === 'detail'}{busyText}
        {:else if app.status === 'ready' && app.layoutError}So nicht druckbar, Hinweis rechts
        {:else if app.status === 'ready'}Bereit zum Download
        {:else if app.status === 'todo'}Kontur fehlt noch, Hinweis rechts
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
            title={i === app.lastStep && app.blocked ? (app.waiting ? 'Erst die Kontur anlegen' : 'Erst die rot markierten Punkte beheben') : undefined}
            onclick={() => (app.step = i)}
          >
            <span class="num">{i + 1}</span><span class="label">{s}</span>
          </button>
        </li>
      {/each}
    </ol>

    <div class="step-body" bind:this={stepBody}>
      {#if app.errorMsg}
        <p class="error" role="alert">{app.errorMsg}</p>
      {/if}
      {#if app.step === 0}
        <StepKind />
      {:else if app.step === 1 && app.kind.magnet}
        <StepMagnet {printNote} />
      {:else if app.step === 1 && app.kind.bleed}
        <StepBleed {printNote} />
      {:else if app.step === 1 && app.kind.nozzle}
        <StepNozzle {printNote} />
      {:else if app.step === 1 && app.kind.freeform}
        <h2>Aufbau</h2>
        <FreeformEditor bind:spec={app.free} bind:open={app.freeOpen} bind:template={app.freeTemplate} issues={[...app.freeIssues, ...app.buildNotes.map((text) => ({ level: 'warn' as const, text }))]} {printNote} />
      {:else if app.step === 1}
        <StepSizes />
      {:else if app.step === 2}
        <StepFit />
      {:else}
        <StepDownload />
      {/if}
    </div>

    {#if app.blocked && app.step === app.lastStep - 1}
      <p class="nav-hint" role="status">{app.waiting ? 'Bitte zuerst die Kontur anlegen.' : 'Bitte zuerst die rot markierten Punkte beheben.'} Danach geht es zum Download.</p>
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
