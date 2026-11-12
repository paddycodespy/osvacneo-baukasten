<script lang="ts">
  /** Schritt 3: Passung (Spiel, Materialstärke, Extras) */
  import { app, fmt } from '../../lib/app.svelte';
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
    <input type="range" min="0.15" max="0.5" step="0.05" bind:value={app.gate.plateGap} aria-describedby="plate-hint" />
    <output>{fmt(app.gate.plateGap, 2)} mm</output>
  </div>
  <HelpText id="plateGap" />
  <p class="hint" id="plate-hint">Klemmt die Platte im Schlitz: größer. Wackelt sie: kleiner. Standard: 0,3 mm.</p>
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
    <p class="hint" id="swivel-hint">Lässt sich der Ring nach dem Druck nicht drehen: größer (bei PETG oft 0,35–0,5 mm). Standard: 0,3 mm.</p>
  </fieldset>
{/if}

<fieldset class="opt">
  <legend>Materialstärke</legend>
  <div class="seg" role="radiogroup">
    {#each [7, 9] as v}
      <button role="radio" aria-checked={app.input.generalMaterialWidth === v} class:sel={app.input.generalMaterialWidth === v} onclick={() => (app.input.generalMaterialWidth = v)}>{v} mm</button>
    {/each}
  </div>
  <p class="hint">9 mm macht die Kupplung stabiler. Sie wird dann außen 4 mm dicker.</p>
</fieldset>

<!-- Beschriftung ist immer dabei; ohne Stecker gibt es hier nichts zu wählen, dann auch keine Überschrift -->
{#if app.hasSupport}
  <fieldset class="opt checks">
    <legend>Extras</legend>
    <label><input type="checkbox" bind:checked={app.supports} /> Druckhilfe unter dem Stecker (wird nach dem Druck abgebrochen)</label>
  </fieldset>
{/if}
{/if}
<ResetLink show={!app.fitDefault} label="Passung auf Standard zurücksetzen" onclick={() => app.resetFit()} />
