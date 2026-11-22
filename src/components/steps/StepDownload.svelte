<script lang="ts">
  import { isDesktop } from '../../lib/desktop';
  import { saveTarget, canPickWeb } from '../../lib/save.svelte';
  /** Schritt 4: Material, Download, Druckhinweise, mehrere Adapter auf ein Druckbett, Lizenz */
  import { app, FORMATS, LABELS, fmt, type FileEntry } from '../../lib/app.svelte';
  import { freeSummary } from '../../lib/osvac/freeform';
  import { gateName } from '../../lib/osvac/gate';
  import { magnetName } from '../../lib/osvac/magnet';
  import { CHANGES } from '../../lib/credits';
  import HelpToggle from '../HelpToggle.svelte';
  import HelpText from '../HelpText.svelte';
  import SealFigure from '../SealFigure.svelte';
  import { SEAL_RING, sealRing, type SealGroove } from '../../lib/osvac/seal';

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

  /** Maße der Dichtnut: mm mit Komma, Bereiche mit Halbgeviertstrich */
  const mm = (v: number, d = 2) => fmt(v, d);
  /** Größe der Kupplung, bei der Magnet-Platte mit Hinweis, wenn sie in der Kappe für einen Stecker steckt */
  const sealName = (s: SealGroove) => `F${fmt(s.d)}${s.cap ? ' (in der Kappe)' : ''}`;
  /** Kraft, mit der der Sog den Stecker hineinzieht (35 kPa auf die Fläche innerhalb der Dichtung) */
  const sogN = (s: SealGroove) => 0.035 * Math.PI * (s.centerD / 2) ** 2;
  /** O-Ring zum Kaufen: ganze Millimeter innen, Schnur 4 mm */
  const oring = (d: number) => (Number.isInteger(d) ? `O-Ring ${d} × 4` : `O-Ring ${Math.floor(d)} × 4 oder ${Math.ceil(d)} × 4`);
  const range = (a: number, b: number) => (Math.abs(a - b) < 0.05 ? mm(a, 1) : `${mm(a, 1)}–${mm(b, 1)}`);

  const lead = $derived.by(() => {
    const k = app.kind;
    if (k.freeform) {
      const s = freeSummary(app.free);
      return `Freiform: ${s.long}${app.free.blocks.length ? `, dazwischen ${s.blocks}` : ''}.`;
    }
    if (k.gate) return `Schieber einzeln: ${gateName(app.gate).long}.`;
    if (k.magnet) return `Magnet-Schnellkupplung Ø100: ${magnetName(app.magnet, !!k.magnetOsvac).long}.`;
    if (k.helper) return `Drehring-Lösehilfe ${[app.helper.forF ? `für Kupplungen F${fmt(app.input.femaleDiameterInner)}` : '', app.helper.forM ? `für Stecker M${fmt(app.input.maleDiameterInner)}` : ''].filter(Boolean).join(' und ')}.`;
    if (k.bleed) return `Nebenluft-Regler: oben ${app.bleed.top === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(app.input[app.bleed.top === 'female' ? 'femaleDiameterInner' : 'maleDiameterInner'])}, unten Schlauch H${fmt(app.input.hoseDiameterInner)}${app.hoseHand === 'right' ? ' mit Rechtsgewinde' : ''}, mit Drehring für den Schlauch.`;
    const sizes = k.diameters.map((d) => `${LABELS[d].name} ${fmt(app.input[d])} mm`).join(', ');
    const stutzen = k.machine ? `, Stutzen Ø${fmt(app.machine.dOpen)} / ${fmt(app.machine.dDepth)} mm, ${app.machine.length} mm tief` : '';
    return `${k.title}, ${sizes}${stutzen}${app.hasSwivel && app.hoseHand === 'right' ? ', Rechtsgewinde' : ''}.`;
  });
</script>

<h2>Download</h2>
<p class="lead">{lead}</p>

{#if app.filament}
  <div class="filament">
    <p>
      Material: ca. <strong>{app.gramsText} g PETG</strong>, rund {fmt(app.filament.metersMin)}{Math.round(app.filament.metersMin) !== Math.round(app.filament.metersMax) ? `–${fmt(app.filament.metersMax)}` : ''} m Filament
      <!-- letztes Wort und „?“ zusammenhalten, sonst steht das „?“ allein in der nächsten Zeile -->
      {#if app.supports && app.hasSupport}(1,75 mm), mit <span class="nw">Druckhilfe. <HelpToggle id="filament" /></span>{:else}<span class="nw">(1,75 mm). <HelpToggle id="filament" /></span>{/if}
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
          <span class="fixes"><button type="button" class="fix" onclick={() => (app.step = w.step!)}>{w.step === 2 ? 'Zur Passung' : app.kind.freeform ? 'Zum Aufbau' : app.kind.magnet ? 'Zu den Teilen' : 'Zu den Größen'}</button></span>
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
    <button type="button" class="ghost sm" onclick={() => saveTarget.pick()}>Ordner wählen&nbsp;…</button>
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

{#if app.seals.length && app.status !== 'error'}
  <details class="box seal" bind:open={app.sealOpen}>
    <summary>Dichtung in der Kupplung{app.seals.length === 1 ? ` ${sealName(app.seals[0])}` : ''}: Maße der Nut</summary>
    <p class="hint">
      Unten in der Kupplung läuft rundum eine Nut für eine Dichtung: Rundschnur, O-Ring oder die Lippendichtung aus TPU (siehe unten). Sie reicht unten
      {mm((app.seals[0].outer - app.seals[0].bore) / 2, 1)} mm weiter nach außen als die Bohrung darüber, so bleibt die Dichtung von selbst liegen.
    </p>
    <SealFigure s={app.seals[0]} ring={sealRing(app.seals[0], app.sealSqueeze)} />
    {#each app.seals as s (s.d + '/' + s.gap + '/' + !!s.cap)}
      {#if app.seals.length > 1}<p class="seal-h">Kupplung {sealName(s)}</p>{/if}
      <table class="seal-t">
        <tbody>
          <tr><th>A</th><td>Bohrung über der Nut</td><td>Ø{mm(s.bore)} mm</td></tr>
          <tr><th>B</th><td>Größter Ø der Nut, {mm(s.outerZ)} mm über dem Boden</td><td>Ø{mm(s.outer)} mm</td></tr>
          <tr><th>C</th><td>Rundung außen, Mittelpunkt auf Ø{mm(s.centerD)} mm</td><td>R{mm(s.radius)} mm</td></tr>
          <tr><th>D</th><td>Höhe der Nut an der Bohrung</td><td>{mm(s.heightAtBore)} mm</td></tr>
          <tr><th>E</th><td>Steckerspitze über dem Boden (Spielraum der Nasen in der Nut)</td><td>{range(s.tipMin, s.tipMax)} mm</td></tr>
          <tr><th></th><td>Durchgang (Innen-Ø der Kupplung)</td><td>Ø{mm(s.inner)} mm</td></tr>
          <tr><th></th><td>Ebene Fläche der Steckerspitze</td><td>Ø{mm(s.tipInner)}–{mm(s.tipOuter)} mm</td></tr>
        </tbody>
      </table>
      <p class="hint">
        Passt: Rundschnur Ø4 mm, als Ring <span class="nw">({oring(s.d)},</span> innen × Schnur). Die Dichtung drückt den Stecker hoch, bis seine Nasen oben in der Nut anliegen
        ({mm(s.tipMax, 1)} mm über dem Boden); dabei wird sie um etwa {mm(Math.max(0, 4 - s.tipMax), 1)} mm zusammengedrückt. Der Sog zieht den Stecker kaum tiefer: Bei 35 kPa
        zieht er mit nur etwa {fmt(sogN(s), 0)} N.
      </p>
    {/each}
    <p class="hint">
      Die Maße gelten{app.seals.every((s) => s.gap === app.seals[0].gap) ? ` bei ${fmt(app.seals[0].gap, 2)} mm Spiel zwischen Stecker und Kupplung` : ''} für einen Stecker mit demselben Spiel.
      Die Nut selbst ändert sich mit dem Spiel nicht, nur Bohrung und Stecker.
    </p>
    <p class="hint">
      Gedruckt weicht die Nut je nach Drucker um etwa 0,1–0,2 mm ab, weil der obere Rand der Rundung beim Druck überhängt. Bei einer selbst konstruierten Dichtung deshalb erst eine zur Probe drucken.
      Genau nachmessen und als Vorlage nehmen lässt sich die Nut im STEP-Modell.
    </p>
    <p class="seal-h">Lippendichtung aus TPU</p>
    <p class="hint">
      Sie passt genau in die Nut (in der Skizze blau): Der Fuß hält in der Hinterschneidung, die dünne Lippe steht schräg nach oben und legt sich von unten an
      die Steckerspitze. Die Außenluft kommt über den Spalt an der Bohrung unter die Lippe und drückt sie gegen den Stecker: Je stärker der Sog, desto dichter. Weil sich nur die Lippe
      biegt, lässt sich der Stecker leicht eindrehen. Sie liegt beim Drucken flach und braucht keine Stützen.
    </p>
    <fieldset class="field seal-sq">
      <legend class="field-label">Vorspannung der Lippe</legend>
      <div class="slider">
        <input type="range" min={SEAL_RING.min} max={SEAL_RING.max} step={SEAL_RING.step} bind:value={app.sealSqueeze} aria-label="Vorspannung der Lippe" />
        <output>{fmt(app.sealSqueeze, 2)} mm</output>
      </div>
      <p class="hint">So weit biegt der Stecker die Lippe nach unten, wenn er eingedreht ist. Zieht es noch Falschluft: größer. Geht der Stecker schwer: kleiner. Standard: {fmt(SEAL_RING.squeeze, 2)} mm.</p>
    </fieldset>
    <table class="seal-t">
      <tbody>
        {#each app.seals as s (s.d + '/' + s.gap + '/' + !!s.cap)}
          {@const r = sealRing(s, app.sealSqueeze)}
          <tr><td>Für {sealName(s)}: Ø{mm(2 * r.ri)}–{mm(r.outer)} mm, {mm(r.h)} mm hoch, Lippe {fmt(r.angle, 1)}° steil</td><td>ca. {mm(r.grams, 1)} g</td></tr>
        {/each}
      </tbody>
    </table>
    <div class="plate-dl">
      <span>Lippendichtung herunterladen:</span>
      {#each FORMATS as f (f.id)}
        <button class="ghost sm" disabled={!!app.sealBusy || !!app.exporting} onclick={() => app.downloadSeal(f.id)}>{app.sealBusy === f.id ? 'Wird erzeugt\u00a0…' : f.label}</button>
      {/each}
    </div>
    <p class="hint">
      Drucken: TPU, am besten 85A–95A, mit 0,2 mm Schichthöhe; die Lippe ist zwei Bahnen breit (0,4-mm-Düse). TPU druckt oft etwas dicker, deshalb hat die Lippendichtung außen 0,1 mm Luft.
      Einsetzen: Lippendichtung etwas oval drücken, schräg durch die Bohrung schieben und rundum in die Nut drücken, bis der Fuß flach auf dem Boden liegt, Lippe nach oben. Erst
      eine drucken und probieren, dann die Vorspannung anpassen.
    </p>
  </details>
{/if}

<details class="box" open={app.plate.length > 0}>
  <summary>Mehrere Adapter auf ein Druckbett{app.plate.length ? ` (${app.plate.length})` : ''}</summary>
  <p class="hint">Praktisch zum Testen: Adapter hinzufügen, dann etwas ändern (z. B. das Spiel) und wieder hinzufügen. Alle kommen nebeneinander in eine Datei.</p>
  <button class="ghost sm" disabled={app.onPlate || app.status !== 'ready'} onclick={() => app.addToPlate()}>{app.onPlate ? 'Adapter bereits auf Druckbett vorhanden' : 'Aktuellen Adapter hinzufügen'}</button>
  {#if app.plate.length}
    <ul class="plate">
      {#each app.plate as p, i (p.key)}
        <li><span>{p.label}{p.includeHelpers ? ' mit Druckhilfe' : ''}</span>{#if p.grams}<span class="g">{Math.round(p.grams[0]) === Math.round(p.grams[1]) ? Math.round(p.grams[0]) : `${Math.round(p.grams[0])}–${Math.round(p.grams[1])}`}&nbsp;g</span>{/if}<button class="x" aria-label="{p.label} entfernen" onclick={() => app.removeFromPlate(i)}>×</button></li>
      {/each}
    </ul>
    {#if app.plateGrams}<p class="plate-sum">Zusammen ca. <strong>{app.plateGrams} g PETG</strong>.</p>{/if}
    <div class="plate-dl">
      <span>Druckbett herunterladen:</span>
      {#each FORMATS as f (f.id)}
        <button class="ghost sm" disabled={!!app.plateBusy || !!app.exporting} onclick={() => app.downloadPlate(f.id)}>{app.plateBusy === f.id ? 'Wird erzeugt\u00a0…' : f.label}</button>
      {/each}
    </div>
  {/if}
</details>
<p class="status-line" role="status">
  {#if app.exporting}{app.exporting.toUpperCase()} wird erzeugt&nbsp;…{:else if app.status !== 'ready'}Die Downloads sind verfügbar, sobald die Berechnung fertig ist.{/if}
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
  <p class="credit">Basiert auf <a href="https://osvacneo.de" target="_blank" rel="noopener noreferrer" title="osvacneo.de öffnen">osVAC neo</a> von Ludo Kerz,<br />ursprünglich entstanden im Hobbyhimmel Stuttgart.</p>
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

<style>
  .seal-h { margin: 10px 0 2px; font-weight: 600; font-size: 14px; }
  .seal-t { border-collapse: collapse; font-size: 14px; color: var(--slate-2); width: 100%; }
  .seal-t th { width: 1.4em; text-align: left; color: var(--sky-d); font-weight: 700; vertical-align: top; padding: 2px 0; }
  .seal-t td { padding: 2px 6px 2px 0; vertical-align: top; }
  .seal-t td:last-child { text-align: right; white-space: nowrap; color: var(--graphite); font-weight: 600; }
  .seal-t tr + tr { border-top: 1px solid var(--line); }
  .seal-sq { margin: 8px 0 4px; border: 0; padding: 0; }
  .seal-sq .hint { font-weight: 400; }
</style>
