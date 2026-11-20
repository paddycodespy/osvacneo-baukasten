<script lang="ts">
  /** Schritt 2 bei der Magnet-Schnellkupplung Ø100: welche Teile, Magnetgröße, Stutzen am Gerät, Schlauchgewinde */
  import { app, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import Field from '../Field.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { MAGNET_SIZES, MAGNET_LIMITS, MAG, type MagnetSize } from '../../lib/osvac/magnet';

  let { printNote = null }: { printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const g = $derived(app.magnet);
  const lim = MAGNET_LIMITS;
</script>

<h2>Teile</h2>
<p class="lead">
  Am Gerät sitzt der Adapter, am Schlauch die Kupplung. Beide halten über je {MAG.n} Neodym-Magnete zusammen, die beim Drucken eingelegt und überdruckt werden. Ein Bund in der Mitte zentriert die Teile. Zum Umstecken die Kupplung einfach abziehen und am nächsten Gerät ansetzen.
</p>

<div class="checks helper-parts">
  <label><input type="checkbox" checked={g.adapter} disabled={g.adapter && !g.coupling} onchange={() => app.toggleMagnetPart('adapter')} /> Maschinenadapter: kommt auf den Stutzen am Gerät, mit Schraubklemme</label>
  <label><input type="checkbox" checked={g.coupling} disabled={g.coupling && !g.adapter} onchange={() => app.toggleMagnetPart('coupling')} /> Schlauchkupplung: wird auf den Schlauch gedreht</label>
</div>
<p class="hint">Für jedes Gerät einen Adapter, für jeden Schlauch eine Kupplung.</p>

<div class="mag-size">
<Field label="Magnete" help={app.helpTexts.magnetSize}>
  <div class="seg wide" role="radiogroup" aria-label="Magnetgröße">
    {#each Object.entries(MAGNET_SIZES) as [id, m]}
      <button type="button" role="radio" aria-checked={g.magnet === id} class:sel={g.magnet === id} onclick={() => (app.magnet.magnet = id as MagnetSize)}>{m.label}</button>
    {/each}
  </div>
</Field>
</div>
<p class="hint">Scheibenmagnete Ø × Höhe, {MAG.n} je Teil. Adapter und Kupplung immer mit derselben Größe drucken.</p>

{#if g.adapter}
  <h3 class="sub">Stutzen am Gerät</h3>
  <div class="grid2">
    <Field label="Stutzen außen Ø" help="Mit dem Messschieber außen am Stutzen messen. Die Muffe des Adapters wird etwas weiter (Spiel in „Passung“), die Schraubklemme zieht sie fest.">
      <NumberField bind:value={app.magnet.stutzen} min={lim.stutzen[0]} max={lim.stutzen[1]} step={0.1} label="Außendurchmesser des Stutzens" />
    </Field>
    <Field label="Tiefe" help="So weit steckt der Stutzen im Adapter, bis zum Anschlag innen. 30 bis 40 mm halten gut.">
      <NumberField bind:value={app.magnet.depth} min={lim.depth[0]} max={lim.depth[1]} step={1} label="Tiefe der Muffe" />
    </Field>
  </div>
{/if}

{#if g.coupling}
  <h3 class="sub">Schlauch</h3>
  <div class="grid2">
    <Field label="Schlauch innen Ø" help="Innendurchmesser des Schlauchs. Das Gewinde der Kupplung hat unten genau diesen Durchmesser, die Rippen greifen zwischen die Drahtspirale.">
      <NumberField bind:value={app.magnet.hose} min={lim.hose[0]} max={lim.hose[1]} step={0.5} label="Innendurchmesser des Schlauchs" />
    </Field>
    <Field label="Steigung" help={app.helpTexts.magnetPitch}>
      <NumberField bind:value={app.magnet.pitch} min={lim.pitch[0]} max={lim.pitch[1]} step={0.5} label="Steigung des Schlauchgewindes" />
    </Field>
  </div>
  <div class="seg wide" role="radiogroup" aria-label="Drehrichtung des Gewindes">
    <button type="button" role="radio" aria-checked={g.hand === 'left'} class:sel={g.hand === 'left'} onclick={() => (app.magnet.hand = 'left')}>Linksgewinde</button>
    <button type="button" role="radio" aria-checked={g.hand === 'right'} class:sel={g.hand === 'right'} onclick={() => (app.magnet.hand = 'right')}>Rechtsgewinde</button>
  </div>
  <p class="hint">Je nach Hersteller ist die Drahtspirale im Schlauch links- oder rechtsherum gewickelt. Den Schlauch senkrecht halten und von außen auf die Spirale schauen: Steigt sie nach links an, ist es ein Linksgewinde, nach rechts ein Rechtsgewinde.</p>
{/if}

<p class="hint sum">
  {g.adapter ? `Adapter ${fmt(app.magnetLay.heightA)} mm hoch` : ''}{g.adapter && g.coupling ? ', ' : ''}{g.coupling ? `Kupplung ${fmt(app.magnetLay.zC)} mm hoch` : ''}, Flansch Ø{fmt(2 * app.magnetLay.lugOut, 0)} mm über die Nasen. Druckpause zum Einlegen der Magnete, Höhen im Download.
</p>

{#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}

<ResetLink show={!app.magnetIsDefault} label="Teile auf Standard zurücksetzen" onclick={() => app.resetMagnet()} />

<style>
  .mag-size { margin-top: 18px; }
  .seg { margin-top: 8px; }
  .sum { margin-top: 18px; }
  .print-note { margin: 14px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: var(--warn-bg); }
  .print-note.error { border-left-color: var(--err); background: var(--err-bg); color: var(--err-fg); }
</style>
