<script lang="ts">
  /** Schritt 2 beim Nebenluft-Regler: unten Schlauch (H), oben Kupplung oder Stecker (Wahl, Standard Kupplung) */
  import { app, fmt, LABELS, START_INPUT } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { BLEED, bleedLayout } from '../../lib/osvac/bleed';
  import { deriveParams } from '../../lib/osvac/params';

  let { printNote = null }: { printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const b = $derived(app.bleed);
  const topKey = $derived(b.top === 'female' ? 'femaleDiameterInner' : 'maleDiameterInner');
  const lay = $derived(bleedLayout(deriveParams($state.snapshot(app.input)), b.top, b.bleedGap));
  /** Fläche der drei Fenster im Verhältnis zum Rohrquerschnitt */
  const ratio = $derived((BLEED.windows * (BLEED.winDeg / 360) * 2 * Math.PI * lay.rH * lay.D.hw) / (Math.PI * lay.rH ** 2));
  const isDefault = $derived(b.top === 'female' && app.input[topKey] === START_INPUT[topKey] && app.input.hoseDiameterInner === START_INPUT.hoseDiameterInner);
  function reset() {
    b.top = 'female';
    app.input.femaleDiameterInner = START_INPUT.femaleDiameterInner;
    app.input.maleDiameterInner = START_INPUT.maleDiameterInner;
    app.input.hoseDiameterInner = START_INPUT.hoseDiameterInner;
  }
</script>

<h2>Größen</h2>
<p class="lead">
  Der Nebenluft-Regler kommt direkt auf den Schlauch, oben steckst du die Düse oder das Werkzeug an. Am oberen Drehring (Nebenluft-Ring) regelst du, wie viel Luft seitlich mit angesaugt wird: weniger Sog an der Düse, z. B. für Vorhänge, Polster oder lose Teile.
</p>

<h3 class="sub">Oben</h3>
<div class="seg wide" role="radiogroup" aria-label="Anschluss oben">
  <button type="button" role="radio" aria-checked={b.top === 'female'} class:sel={b.top === 'female'} onclick={() => (b.top = 'female')}>Kupplung (F)</button>
  <button type="button" role="radio" aria-checked={b.top === 'male'} class:sel={b.top === 'male'} onclick={() => (b.top = 'male')}>Stecker (M)</button>
</div>
<div class="dia-row">
  <div class="chips">{#each LABELS[topKey].presets as v}<button type="button" class="chip" class:sel={app.input[topKey] === v} onclick={() => app.setDia(topKey, v)}>{v}</button>{/each}</div>
  <NumberField value={app.input[topKey]} min={15} max={60} step={0.1} label={LABELS[topKey].hint} oncommit={(v) => app.setDia(topKey, v)} />
</div>
<p class="hint">{b.top === 'female' ? 'Hier steckst du die Düse oder das Werkzeug mit Stecker ein.' : 'Kommt in die Kupplung der Düse oder des Werkzeugs.'}</p>

<h3 class="sub">Unten: Schlauch (H)</h3>
<div class="dia-row">
  <div class="chips">{#each LABELS.hoseDiameterInner.presets as v}<button type="button" class="chip" class:sel={app.input.hoseDiameterInner === v} onclick={() => app.setDia('hoseDiameterInner', v)}>{v}</button>{/each}</div>
  <NumberField value={app.input.hoseDiameterInner} min={15} max={60} step={0.1} label={LABELS.hoseDiameterInner.hint} oncommit={(v) => app.setDia('hoseDiameterInner', v)} />
</div>
<p class="hint">Wie beim Schlauchadapter: Der Schlauch wird unten eingedreht und kann sich mit dem Drehring drehen.</p>

<p class="hint sum">
  Drei Fenster mit zusammen etwa {Math.round(ratio * 100)} % des Schlauchquerschnitts. Nebenluft-Ring um 60° drehen: von ganz auf bis ganz zu, dazwischen stufenlos. Eine kleine Raste hält ihn bei „auf“ und „zu“; die Kerben am oberen Bund zeigen, wo die Fenster im Rohr sind. Ganz dicht ist er auch zu nicht, durch das Spiel am Nebenluft-Ring ({fmt(b.bleedGap, 2)} mm, in „Passung“) zieht immer etwas Luft.
</p>

{#if app.sizeWarnings.length || app.buildNotes.length}
  <ul class="issues">{#each [...app.sizeWarnings, ...app.buildNotes] as x}<li class="warn">{x}</li>{/each}</ul>
{/if}
{#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}

<ResetLink show={!isDefault} label="Größen auf Standard zurücksetzen" onclick={reset} />

<style>
  .dia-row { margin-top: 6px; }
  .sum { margin-top: 18px; }
  .issues { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .print-note { margin: 14px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: #fdf6dc; }
  .link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--sky); font: inherit; font-weight: 600; cursor: pointer; }
  .link:hover { color: var(--red, #ff4136); }
  .btn-sec, .btn-pri { padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 14px; cursor: pointer; }
  .btn-sec { border: 1px solid var(--line); background: #fff; }
  .btn-pri { border: 1px solid var(--sky); background: var(--sky); color: #fff; font-weight: 600; }
  .print-note.error { border-left-color: #c4362b; background: #fdecea; color: #8a1f17; }
</style>
