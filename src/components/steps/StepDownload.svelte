<script lang="ts">
  /** Schritt 4: Material, Download, Druckhinweise, mehrere Adapter auf ein Druckbett, Lizenz */
  import { app, FORMATS, LABELS, fmt } from '../../lib/app.svelte';
  import { freeSummary } from '../../lib/osvac/freeform';
  import { CHANGES } from '../../lib/credits';
  import HelpToggle from '../HelpToggle.svelte';
  import HelpText from '../HelpText.svelte';

  const lead = $derived.by(() => {
    const k = app.kind;
    if (k.freeform) {
      const s = freeSummary(app.free);
      return `Freiform: ${s.long}${app.free.blocks.length ? `, dazwischen ${s.blocks}` : ''}.`;
    }
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
    {#each app.warnings as w}<li>{w}</li>{/each}
  </ul>
{/if}

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
    <p>Fertige Dateien. Falls der Download nicht von selbst startet, hier klicken:</p>
    <ul>
      {#each app.files as f (f.fileName)}
        <li><a href={f.url} download={f.fileName}>{f.fileName}</a> <span>{fmt(f.size / 1024 / 1024, 1)} MB</span></li>
      {/each}
    </ul>
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
  <p class="version">Konfigurator-Version {__APP_VERSION__}</p>
  <p><a class="more" href="./lizenzen.html" target="_blank" rel="noopener">Verwendete Bausteine und ihre Lizenzen<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg></a></p>
</div>
