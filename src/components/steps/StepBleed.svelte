<script lang="ts">
  /** Schritt 2 beim Nebenluft-Regler: Größe von Stecker (unten) und Kupplung (oben). Gebaut als Freiform-Kette. */
  import { app, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { bleedDims, BLEED } from '../../lib/osvac/bleed';

  let { printNote = null }: { printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const b = $derived(app.bleed);
  const D = $derived(bleedDims(b.m / 2, b.m / 2 + 3, b.bleedGap));
  /** Fläche der drei Fenster im Verhältnis zum Rohrquerschnitt */
  const ratio = $derived((BLEED.windows * (BLEED.winDeg / 360) * 2 * Math.PI * (b.m / 2) * D.hw) / (Math.PI * (b.m / 2) ** 2));
  const isDefault = $derived(b.m === 32 && b.f === 32);
  /** Vorhandenen eigenen Freiform-Aufbau nicht stillschweigend ersetzen */
  let confirmFree = $state(false);
  function toFree() {
    if (app.freeModified) confirmFree = true;
    else app.toFreeform();
  }
  const issues = $derived([...app.freeIssues.map((x) => ({ level: x.level, text: x.text })), ...app.buildNotes.map((text) => ({ level: 'warn' as const, text }))]);
</script>

<h2>Größen</h2>
<p class="lead">
  Der Nebenluft-Regler kommt zwischen Schlauch und Düse oder ein anderes Werkzeug. Am Drehring regelst du, wie viel Luft seitlich mit angesaugt wird: weniger Sog an der Düse, z. B. für Vorhänge, Polster oder lose Teile.
</p>

<h3 class="sub">Stecker (unten)</h3>
<div class="dia-row">
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={b.m === v} onclick={() => (b.m = v)}>{v}</button>{/each}</div>
  <NumberField bind:value={b.m} min={15} max={60} step={0.1} label="Innendurchmesser des Steckers" />
</div>
<p class="hint">Kommt in die Kupplung am Schlauch oder am Schlauchadapter.</p>

<h3 class="sub">Kupplung (oben)</h3>
<div class="dia-row">
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={b.f === v} onclick={() => (b.f = v)}>{v}</button>{/each}</div>
  <NumberField bind:value={b.f} min={15} max={60} step={0.1} label="Innendurchmesser der Kupplung" />
</div>
<p class="hint">Hier steckst du die Düse oder das Werkzeug ein.</p>

<p class="hint sum">
  Drei Fenster mit zusammen etwa {Math.round(ratio * 100)} % des Rohrquerschnitts. Drehring um 60° drehen: von ganz auf bis ganz zu, dazwischen stufenlos. Eine kleine Raste hält ihn bei „auf“ und „zu“; die Kerben am oberen Bund zeigen, wo die Fenster im Rohr sind. Ganz dicht ist er auch zu nicht, durch das Spiel am Ring ({fmt(b.bleedGap, 2)} mm, in „Passung“) zieht immer etwas Luft.
</p>

{#if issues.length}
  <ul class="issues">{#each issues as x}<li class={x.level}>{x.text}</li>{/each}</ul>
{/if}
{#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}

<p class="to-free">
  <button type="button" class="link" onclick={toFree}>In der Freiform weiterbauen ›</button>
  <span class="hint">Übernimmt den Regler als Bausteine, z. B. um davor oder dahinter einen Bogen, einen Übergang oder eine Düse anzusetzen. Die Größen hier bleiben, wie sie sind.</span>
</p>
{#if confirmFree}
  <div class="confirm" role="alertdialog" aria-label="Freiform ersetzen?">
    <p>In der Freiform liegt schon ein eigener Aufbau. Er wird durch den Nebenluft-Regler ersetzt.</p>
    <div class="confirm-btns">
      <button type="button" class="btn-sec" onclick={() => (confirmFree = false)}>Abbrechen</button>
      <button type="button" class="btn-pri" onclick={() => ((confirmFree = false), app.toFreeform())}>Ersetzen und weiterbauen</button>
    </div>
  </div>
{/if}

<ResetLink show={!isDefault} label="Größen auf Standard zurücksetzen" onclick={() => ((b.m = 32), (b.f = 32))} />

<style>
  .dia-row { margin-top: 6px; }
  .sum { margin-top: 18px; }
  .issues { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .issues li.error { border-left-color: #d93a2b; background: #fdecea; color: #b02a20; }
  .print-note { margin: 14px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: #fdf6dc; }
  .to-free { margin: 20px 0 8px; display: flex; flex-direction: column; gap: 2px; }
  .to-free .hint { margin: 0; }
  .link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--sky); font: inherit; font-weight: 600; cursor: pointer; }
  .link:hover { color: var(--red, #ff4136); }
  .confirm { margin: 10px 0 0; padding: 12px 14px; border: 1px solid var(--signal); border-radius: 8px; background: #fdf6dc; font-size: 14px; }
  .confirm p { margin: 0 0 10px; }
  .confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-sec, .btn-pri { padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 14px; cursor: pointer; }
  .btn-sec { border: 1px solid var(--line); background: #fff; }
  .btn-pri { border: 1px solid var(--sky); background: var(--sky); color: #fff; font-weight: 600; }
  .print-note.error { border-left-color: #c4362b; background: #fdecea; color: #8a1f17; }
</style>
