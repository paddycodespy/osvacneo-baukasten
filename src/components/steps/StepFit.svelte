<script lang="ts">
  /** Schritt 3: Passung (Spiel, Materialstärke, Extras) */
  import { app, fmt } from '../../lib/app.svelte';
  import { BLEED } from '../../lib/osvac/bleed';
  import HelpToggle from '../HelpToggle.svelte';
  import HelpText from '../HelpText.svelte';
  import ResetLink from '../ResetLink.svelte';
</script>

<h2>Passung</h2>
<p class="lead">Die Standardwerte passen meistens. Ändern lohnt sich erst, wenn ein Testdruck nicht gut sitzt.</p>

{#if app.kind.gate}
<fieldset class="opt">
  <legend class="field-label">Spiel am Rohr <HelpToggle id="pipeGap" /></legend>
  <div class="slider">
    <input type="range" min="0.1" max="1" step="0.05" bind:value={app.gate.pipeGap} aria-describedby="pipe-hint" />
    <output>{fmt(app.gate.pipeGap, 2)} mm</output>
  </div>
  <HelpText id="pipeGap" />
  <p class="hint" id="pipe-hint">Geht das Rohr schwer hinein: größer. Sitzt es zu locker: kleiner. Standard: 0,4 mm.</p>
</fieldset>
<fieldset class="opt">
  <legend class="field-label">Spiel der Platte <HelpToggle id="plateGap" /></legend>
  <div class="slider">
    <input type="range" min="0.2" max="0.5" step="0.1" bind:value={app.gate.plateGap} aria-describedby="plate-hint" />
    <output>{fmt(app.gate.plateGap, 2)} mm</output>
  </div>
  <HelpText id="plateGap" />
  <p class="hint" id="plate-hint">Geht die Platte zu schwer: größer. Zieht der Schieber Falschluft: kleiner. Standard: 0,3 mm.</p>
</fieldset>
{:else}
<fieldset class="opt">
  <legend class="field-label">Spiel zwischen Stecker und Kupplung <HelpToggle id="gap" /></legend>
  <div class="slider">
    <input type="range" min="0.1" max="0.5" step="0.05" bind:value={app.input.maleFemaleGapSize} aria-describedby="gap-hint" />
    <output>{fmt(app.input.maleFemaleGapSize, 2)} mm</output>
  </div>
  <HelpText id="gap" />
  <p class="hint" id="gap-hint">Sitzt der Stecker zu stramm: größer. Wackelt er: kleiner. Standard: 0,2 mm.</p>
</fieldset>

{#if app.hasSwivel}
  <fieldset class="opt">
    <legend class="field-label">Spiel am Drehring <HelpToggle id="swivel" /></legend>
    <div class="slider">
      <input type="range" min="0.2" max={app.swivelMax} step="0.05" bind:value={app.input.slipRingGapSize} aria-describedby="swivel-hint" />
      <output>{fmt(app.input.slipRingGapSize, 2)} mm</output>
    </div>
    <HelpText id="swivel" />
    <p class="hint" id="swivel-hint">Standard: 0,3 mm wie im Original. <strong>Für PETG 0,35–0,5 mm einstellen</strong>, mit 0,3 mm kann der Ring festsitzen. Lässt er sich nach dem Druck nicht drehen: größer.</p>
  </fieldset>
{/if}

<fieldset class="opt">
  <legend>Materialstärke</legend>
  <div class="seg" role="radiogroup">
    {#each [7, 9] as v}
      <button role="radio" aria-checked={app.input.generalMaterialWidth === v} class:sel={app.input.generalMaterialWidth === v} onclick={() => (app.input.generalMaterialWidth = v)}>{v} mm</button>
    {/each}
  </div>
  <p class="hint">{app.kind.helper ? 'Bei der Lösehilfe ändert das nur die Größe des Blocks (9 mm: 4 mm breiter, wie die Kupplung).' : '9 mm macht die Kupplung stabiler. Sie wird dann außen 4 mm dicker.'}</p>
</fieldset>

{#if app.hasBleed}
  <fieldset class="opt">
    <legend class="field-label">Spiel am Drehring (Nebenluft) <HelpToggle id="bleedGap" /></legend>
    <div class="slider">
      <input type="range" min={BLEED.gapMin} max={BLEED.gapMax} step="0.05" value={app.bleedGap} oninput={(e) => (app.bleedGap = Number(e.currentTarget.value))} aria-label="Spiel am Drehring" aria-describedby="bleed-hint" />
      <output>{fmt(app.bleedGap, 2)} mm</output>
    </div>
    <HelpText id="bleedGap" />
    <p class="hint" id="bleed-hint">Klebt der Ring fest oder dreht schwer: größer. Standard: {fmt(BLEED.gap, 2)} mm.</p>
  </fieldset>
{/if}

{#if app.freeHasGate}
  <fieldset class="opt">
    <legend class="field-label">Spiel der Schieberplatte <HelpToggle id="plateGap" /></legend>
    <div class="slider">
      <input type="range" min="0.2" max="0.5" step="0.1" value={app.free.gateGap ?? 0.3} oninput={(e) => (app.free.gateGap = Number(e.currentTarget.value))} aria-describedby="fplate-hint" />
      <output>{fmt(app.free.gateGap ?? 0.3, 2)} mm</output>
    </div>
    <HelpText id="plateGap" />
    <p class="hint" id="fplate-hint">Geht die Platte zu schwer: größer. Zieht der Schieber Falschluft: kleiner. Standard: 0,3 mm.</p>
  </fieldset>
{/if}

<!-- Beschriftung ist immer dabei; ohne Stecker gibt es hier nichts zu wählen, dann auch keine Überschrift -->
{#if app.hasSupport}
  <fieldset class="opt checks">
    <legend>Extras</legend>
    <label><input type="checkbox" bind:checked={app.supports} /> Druckhilfe unter dem Stecker (wird nach dem Druck abgebrochen)</label>
  </fieldset>
{/if}
{/if}
<ResetLink show={!app.fitDefault} label="Passung auf Standard zurücksetzen" onclick={() => app.resetFit()} />
