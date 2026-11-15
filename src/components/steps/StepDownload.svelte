<script lang="ts">
  import { isDesktop } from '../../lib/desktop';
  import { saveTarget, canPickWeb } from '../../lib/save.svelte';
  /** Schritt 4: Material, Download, Druckhinweise, mehrere Adapter auf ein Druckbett, Lizenz */
  import { app, FORMATS, LABELS, fmt, type FileEntry } from '../../lib/app.svelte';
  import { freeSummary } from '../../lib/osvac/freeform';
  import { gateName } from '../../lib/osvac/gate';
  import { CHANGES } from '../../lib/credits';
  import HelpToggle from '../HelpToggle.svelte';
  import HelpText from '../HelpText.svelte';

  const canPick = isDesktop || canPickWeb;
  /** Datei noch einmal speichern (in den jetzt gewählten Ordner; im Browser ohne Ordner: normaler Download) */
  async function resave(f: FileEntry) {
    try {
      await saveTarget.prepare();
      const where = await saveTarget.save(await (await fetch(f.url)).blob(), f.fileName, f.url);
      app.files = app.files.map((x) => (x === f ? { ...x, where } : x));
    } catch (e) {
      app.errorMsg = e instanceof Error ? e.message : String(e);
    }
  }
  /** Ordner, in dem die Dateien liegen (alle im selben Ordner: Name, sonst leer) */
  const savedIn = $derived.by(() => {
    const dirs = new Set(app.files.map((f) => f.where.replace(/[\\/][^\\/]*$/, '')));
    if (dirs.size !== 1) return '';
    const d = [...dirs][0];
    return d.split(/[\\/]/).pop() || d;
  });

  const lead = $derived.by(() => {
    const k = app.kind;
    if (k.freeform) {
      const s = freeSummary(app.free);
      return `Freiform: ${s.long}${app.free.blocks.length ? `, dazwischen ${s.blocks}` : ''}.`;
    }
    if (k.gate) return `Schieber einzeln: ${gateName(app.gate).long}.`;
    if (k.helper) return `Drehring-Lösehilfe ${[app.helper.forF ? `für Kupplungen F${fmt(app.input.femaleDiameterInner)}` : '', app.helper.forM ? `für Stecker M${fmt(app.input.maleDiameterInner)}` : ''].filter(Boolean).join(' und ')}.`;
    const sizes = k.diameters.map((d) => `${LABELS[d].name} ${fmt(app.input[d])} mm`).join(', ');
    const stutzen = k.machine ? `, Stutzen Ø ${fmt(app.machine.dOpen)} / ${fmt(app.machine.dDepth)} mm, ${app.machine.length} mm tief` : '';
    return `${k.title}, ${sizes}${stutzen}.`;
  });
</script>

<h2>Download</h2>
<p class="lead">{lead}</p>

{#if app.filament}
  <div class="filament">
    <p>
      Material: ca. <strong>{app.gramsText} g PETG</strong>, rund {fmt(app.filament.metersMax)} m Filament (1,75 mm){app.supports && app.hasSupport ? ', mit Druckhilfe' : ''}.
      {#if Math.round(app.filament.gramsMin) !== Math.round(app.filament.gramsMax)}<HelpToggle id="filament" />{/if}
    </p>
    <HelpText id="filament" />
  </div>
{/if}

{#if app.warnings.length}
  <ul class="warn">
    {#each app.warnings as w}
      <li>
        {w.text}
        {#if w.step !== undefined}
          <span class="fixes"><button type="button" class="fix" onclick={() => (app.step = w.step!)}>{w.step === 2 ? 'Zur Passung' : app.kind.freeform ? 'Zum Aufbau' : 'Zu den Größen'}</button></span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<div class="target">
  <span class="t-label">Speichern in</span>
  <span class="t-dir" title={saveTarget.path || undefined}>
    <svg viewBox="0 0 20 16" aria-hidden="true"><path d="M1.5 3.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5Z" /></svg>
    <strong>{saveTarget.name}</strong>{#if canPick && !saveTarget.custom}<span class="t-std">(Standard)</span>{/if}
  </span>
  {#if canPick}
    <button type="button" class="ghost sm" onclick={() => saveTarget.pick()}>Ordner wählen…</button>
    {#if saveTarget.custom}<button type="button" class="t-reset" onclick={() => saveTarget.reset()}>Standard</button>{/if}
  {/if}
  {#if isDesktop && saveTarget.path}<span class="t-path">{saveTarget.path}</span>{/if}
  {#if !canPick}<span class="t-path">Den Ordner legt der Browser fest. In seinen Einstellungen lässt sich einschalten, dass er jedes Mal fragt, wo gespeichert werden soll.</span>{/if}
  {#if !isDesktop && saveTarget.custom && saveTarget.denied}<span class="t-path">Kein Zugriff auf den Ordner erlaubt, deshalb normaler Download. Beim nächsten Download fragt der Browser wieder.</span>{/if}
</div>

<div class="downloads">
  {#each FORMATS as f (f.id)}
    <button class="dl" class:active={app.activeFormat === f.id} disabled={app.status !== 'ready' || !!app.exporting} onclick={() => app.download(f.id)}>
      <strong>{f.label} herunterladen</strong><small>{f.hint}</small>
    </button>
  {/each}
</div>

<details class="box" open>
  <summary>Druckhinweise</summary>
  <ul class="tips">
    {#each app.printTips as t}<li>{t}</li>{/each}
  </ul>
</details>

<details class="box" open={app.plate.length > 0}>
  <summary>Mehrere Adapter auf ein Druckbett{app.plate.length ? ` (${app.plate.length})` : ''}</summary>
  <p class="hint">Praktisch zum Testen: Adapter hinzufügen, dann etwas ändern (z. B. das Spiel) und wieder hinzufügen. Alle kommen nebeneinander in eine Datei.</p>
  <button class="ghost sm" disabled={app.onPlate || app.status !== 'ready'} onclick={() => app.addToPlate()}>{app.onPlate ? 'Adapter bereits auf Druckbett vorhanden' : 'Aktuellen Adapter hinzufügen'}</button>
  {#if app.plate.length}
    <ul class="plate">
      {#each app.plate as p, i (p.key)}
        <li><span>{p.label}{p.includeHelpers ? ' mit Druckhilfe' : ''}</span><button class="x" aria-label="{p.label} entfernen" onclick={() => app.removeFromPlate(i)}>×</button></li>
      {/each}
    </ul>
    <div class="plate-dl">
      <span>Druckbett herunterladen:</span>
      {#each FORMATS as f (f.id)}
        <button class="ghost sm" disabled={!!app.plateBusy || !!app.exporting} onclick={() => app.downloadPlate(f.id)}>{app.plateBusy === f.id ? 'Wird erzeugt…' : f.label}</button>
      {/each}
    </div>
  {/if}
</details>
<p class="status-line" role="status">
  {#if app.exporting}{app.exporting.toUpperCase()} wird erzeugt…{:else if app.status !== 'ready'}Die Downloads sind verfügbar, sobald die Berechnung fertig ist.{/if}
</p>
{#if app.files.length}
  <div class="files">
    {#if isDesktop}
      <p>{savedIn ? `Gespeichert im Ordner „${savedIn}“.` : 'Gespeichert.'} Mit „Speichern“ noch einmal in den gewählten Ordner:</p>
      <ul>
        {#each app.files as f (f.fileName)}
          <li>
            <span class="f-name" title={f.where}>{f.fileName}</span> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span>
            {#if f.where}<button type="button" class="f-act" onclick={() => saveTarget.reveal(f.where)}>Im Ordner zeigen</button>{/if}
            <button type="button" class="f-act" onclick={() => resave(f)}>Speichern</button>
          </li>
        {/each}
      </ul>
    {:else if saveTarget.custom}
      <!-- Browser mit gewähltem Ordner: noch einmal dorthin speichern statt in den Download-Ordner des Browsers -->
      <p>{app.files.every((f) => f.where) && savedIn ? `Gespeichert im Ordner „${savedIn}“.` : 'Fertige Dateien.'} Mit „Speichern“ noch einmal in den gewählten Ordner:</p>
      <ul>
        {#each app.files as f (f.fileName)}
          <li>
            <span class="f-name">{f.fileName}</span> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span>
            <button type="button" class="f-act" onclick={() => resave(f)}>Speichern</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p>Fertige Dateien. Falls der Download nicht von selbst startet, hier klicken:</p>
      <ul>
        {#each app.files as f (f.fileName)}
          <li><a href={f.url} download={f.fileName}>{f.fileName}</a> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span></li>
        {/each}
      </ul>
    {/if}
    <button type="button" class="ghost sm" onclick={() => app.clearFiles()}>Liste leeren</button>
  </div>
{/if}
<div class="license">
  <p class="credit">Basiert auf <strong>osVAC neo</strong> von Ludo Kerz,<br />ursprünglich entstanden im Hobbyhimmel Stuttgart.</p>
  <p>{CHANGES}</p>
  <p>
    Lizenz: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a><br />
    Weitergabe mit Namensnennung, nicht kommerziell, unter gleichen Bedingungen. Das gilt auch für die erzeugten Dateien.
  </p>
  <p class="author">
    osVAC neo Baukasten von
    <a class="gh" href="https://github.com/paddycodespy" target="_blank" rel="noopener noreferrer"
      >paddycodespy<svg viewBox="0 0 16 16" aria-label="auf GitHub"><path d="M8 0a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 0Z" /></svg></a
    >
  </p>
  <p class="version">Baukasten-Version {__APP_VERSION__}</p>
  <p class="lic"><a class="lic-link" href="./lizenzen.html" target="_blank" rel="noopener">Verwendete Bausteine und ihre Lizenzen<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg></a></p>
</div>
