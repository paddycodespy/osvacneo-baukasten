<script lang="ts">
  /** Schritt 2 bei der Saugdüse: Düsenart, Anschluss, Maße, Spitze und Extras. Gebaut wird daraus eine Freiform-Kette. */
  import { setContext } from 'svelte';
  import { app, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import Field from '../Field.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { DEFAULT_NOZZLE, NOZZLE_KINDS, nozzleLayout, type NozzleIssue } from '../../lib/osvac/nozzle';
  import { NOZZLE } from '../../lib/osvac/freeform';

  let { printNote = null }: { printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const n = $derived(app.nozzle);
  const SIZES = [25, 32, 36, 40, 50];
  /** Umriss je Düsenart (Seitenansicht, Anschluss unten) */
  const ICONS: Record<string, string> = {
    round: 'M17 31 L17 24 L19 20 L19 4 L21 4 L21 20 L23 24 L23 31 Z',
    crevice: 'M15 31 L15 22 L17 16 L17 9 L23 3 L23 16 L25 22 L25 31 Z',
    bent: 'M15 31 L15 22 L17 16 L17 12 Q17 7 22 4 L26 2 L27 5 L23 8 Q22 9 22 12 L23 16 L25 22 L25 31 Z',
    wide: 'M15 31 L15 24 L4 8 L36 8 L25 24 L25 31 Z',
    upholstery: 'M15 31 L15 20 L6 14 L6 9 L34 9 L34 14 L25 20 L25 31 Z',
    free: 'M15 31 V20 Q15 12 23 10 L33 8 V14 L25 16 Q22 17 22 21 L25 25 V31 Z',
  };

  const issues = $derived(app.nozzleIssues);
  /** Meldungen aus der Prüfung des erzeugten Aufbaus (sollten nicht vorkommen) und aus der Berechnung */
  const more = $derived([...app.freeIssues.map((x) => ({ level: x.level, text: x.text })), ...app.buildNotes.map((text) => ({ level: 'warn' as const, text }))]);
  const flagged = $derived.by(() => {
    const m = new Map<string, 'error' | 'warn'>();
    for (const x of issues) for (const fx of x.fixes ?? []) for (const f of fx.fields) if (m.get(f) !== 'error') m.set(f, x.level);
    return m;
  });
  setContext('fieldFlag', (label: string) => flagged.get(label) ?? null);
  const apply = (fx: NonNullable<NozzleIssue['fixes']>[number]) => fx.set(app.nozzle);

  const lay = $derived(nozzleLayout(n));
  const isDefault = $derived(JSON.stringify(n) === JSON.stringify(DEFAULT_NOZZLE));
  function reset() {
    Object.assign(app.nozzle, structuredClone(DEFAULT_NOZZLE));
  }
  /** Vorhandenen eigenen Freiform-Aufbau nicht stillschweigend ersetzen */
  let confirmFree = $state(false);
  function toFree() {
    if (app.freeModified) confirmFree = true;
    else app.toFreeform();
  }
  /** Bürstennut braucht den dicken Rand: Schutzring mit anhaken */
  function setBrush(on: boolean) {
    n.brush = on;
    if (on) n.ring = true;
  }
</script>

<h2>Düse</h2>
<p class="lead">Wähle eine Düsenart und passe die Maße an. Gedruckt wird die Düse stehend, mit dem Anschluss unten.</p>

<div class="tpl-label">Düsenart</div>
<div class="tpl">
  <!-- Radiogruppe nur mit den Düsenarten; „Eigene Form“ ist ein Knopf (wechselt in die Freiform) -->
  <div class="tpl-group" role="radiogroup" aria-label="Düsenart">
  {#each NOZZLE_KINDS as k}
    <button type="button" role="radio" class="tpl-btn" class:sel={n.kind === k.id} aria-checked={n.kind === k.id} onclick={() => app.setNozzleKind(k.id)}>
      <svg viewBox="0 0 40 40" aria-hidden="true"><path d={ICONS[k.id]} class="ic" /><rect x="13" y="31" width="14" height="6" rx="1.5" class="ic-m" /></svg>
      <span><strong>{k.title}</strong><small>{k.hint}</small></span>
    </button>
  {/each}
  </div>
  <button type="button" class="tpl-btn" onclick={toFree} title="Übernimmt die Düse als Bausteine in die Freiform">
    <svg viewBox="0 0 40 40" aria-hidden="true"><path d={ICONS.free} class="ic" /><rect x="13" y="31" width="14" height="6" rx="1.5" class="ic-m" /></svg>
    <span><strong>Eigene Form</strong><small>Weiter in der Freiform</small></span>
  </button>
</div>

<h3 class="sub">Anschluss</h3>
<div class="seg wide" role="radiogroup" aria-label="Anschluss der Düse">
  <button type="button" role="radio" aria-checked={n.a.type === 'male'} class:sel={n.a.type === 'male'} onclick={() => (n.a.type = 'male')}>Stecker (M)</button>
  <button type="button" role="radio" aria-checked={n.a.type === 'female'} class:sel={n.a.type === 'female'} onclick={() => (n.a.type = 'female')}>Kupplung (F)</button>
</div>
<div class="dia-row">
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={n.a.d === v} onclick={() => (n.a.d = v)}>{v}</button>{/each}</div>
  <NumberField bind:value={n.a.d} min={15} max={60} step={0.1} label="Innendurchmesser des Anschlusses" />
</div>
<p class="hint">
  {n.a.type === 'male'
    ? 'Die Düse wird mit dem Stecker in den Saugschlauch oder ein Rohr mit Kupplung gesteckt.'
    : 'Mit Kupplung steckt die Düse auf einem Stecker. Beim Drucken steht sie dann auf der Öffnung der Kupplung und braucht dort Stützen.'}
</p>

<h3 class="sub">Maße</h3>
<div class="grid2">
  <Field label="Länge" help="Vom Anschluss bis zur Spitze (an der längsten Stelle), ohne Stecker bzw. Kupplung.">
    <NumberField bind:value={n.length} min={20} max={300} step={5} label="Länge der Düse" />
  </Field>
  <Field label="Biegung" help="Knick kurz vor der Spitze, für Ecken und schwer erreichbare Stellen. 0° ist gerade. Bis 45° druckt die Düse ohne Stützen. Flache Düsen biegen sich über die schmale Seite.">
    <NumberField bind:value={n.bend} min={0} max={45} step={5} unit="°" label="Biegung" />
  </Field>
  {#if n.kind === 'round'}
    <Field label="Ø Öffnung" help="Innendurchmesser an der Spitze.">
      <NumberField bind:value={n.d} min={6} max={60} step={1} label="Ø der Öffnung" />
    </Field>
  {:else}
    <Field label="Öffnung breit" help="Lichte Weite an der Spitze, die lange Seite.">
      <NumberField bind:value={n.w} min={6} max={150} step={1} label="Öffnung breit" />
    </Field>
    <Field label="Öffnung hoch" help="Lichte Weite an der Spitze, die kurze Seite.">
      <NumberField bind:value={n.h} min={4} max={60} step={0.5} label="Öffnung hoch" />
    </Field>
  {/if}
</div>

<h3 class="sub">Spitze</h3>
<div class="grid2">
  <Field label="Schräge" help={`Wie schräg die Spitze abgeschnitten ist. 0° ist gerade, 30 bis 45° sind üblich für Fugendüsen. Höchstens ${NOZZLE.maxAngle}°.`}>
    <NumberField bind:value={n.tip} min={0} max={NOZZLE.maxAngle} step={5} unit="°" label="Schräge an der Spitze" />
  </Field>
  <Field label="Wandstärke" help="2 mm sind stabil genug. Mit 3 Wänden im Slicer ist die Wand dann durchgehend massiv.">
    <NumberField bind:value={n.wall} min={1.6} max={4} step={0.1} label="Wandstärke der Düse" />
  </Field>
</div>

<div class="extras">
  <div class="x-item">
    <label class="inline-check"><input type="checkbox" checked={n.ring} disabled={n.brush} onchange={(e) => (n.ring = e.currentTarget.checked)} /> Schutzring an der Spitze</label>
    <p class="hint">Dickerer Rand ({fmt(NOZZLE.ringE)} mm mehr) an der Spitze. Schont Möbel und bricht nicht so leicht ab.</p>
  </div>
  <div class="x-item">
    <label class="inline-check"><input type="checkbox" checked={n.brush} onchange={(e) => setBrush(e.currentTarget.checked)} /> Nut für eine Bürstenleiste</label>
    <p class="hint">Rille rundum im Rand der Spitze ({fmt(NOZZLE.brushW)} mm breit, {fmt(NOZZLE.brushDepth)} mm tief) zum Einkleben einer Streifenbürste. Der Rand wird dafür dicker.</p>
  </div>
</div>

{#if issues.length || more.length}
  <ul class="issues">
    {#each issues as x}
      <li class={x.level}>
        {x.text}
        {#if x.fixes?.length}<span class="fixes">{#each x.fixes as fx}<button type="button" class="fix" onclick={() => apply(fx)}>{fx.label}</button>{/each}</span>{/if}
      </li>
    {/each}
    {#each more as x}<li class={x.level}>{x.text}</li>{/each}
  </ul>
{/if}

<p class="hint sum">
  {lay.trans ? `Übergang ${fmt(lay.trans)} mm, ` : ''}{n.bend > 0 ? `Bogen ${fmt(n.bend)}° mit Radius ${fmt(lay.radius)} mm, ` : ''}gerades Stück bis zur Spitze {fmt(lay.s2)} mm.
</p>
{#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}

<p class="to-free">
  <button type="button" class="link" onclick={toFree}>In der Freiform weiterbauen ›</button>
  <span class="hint">Übernimmt die Düse als Bausteine (Übergang, Gerade, Bogen, Spitze), z. B. für einen Versatz oder eine eigene Form. Das Formular hier bleibt, wie es ist.</span>
</p>
{#if confirmFree}
  <div class="confirm" role="alertdialog" aria-label="Freiform ersetzen?">
    <p>In der Freiform liegt schon ein eigener Aufbau. Er wird durch die Düse ersetzt.</p>
    <div class="confirm-btns">
      <button type="button" class="btn-sec" onclick={() => (confirmFree = false)}>Abbrechen</button>
      <button type="button" class="btn-pri" onclick={() => ((confirmFree = false), app.toFreeform())}>Ersetzen und weiterbauen</button>
    </div>
  </div>
{/if}

<ResetLink show={!isDefault} label="Düse auf Standard zurücksetzen" onclick={reset} />

<style>
  .tpl-group { display: contents; }
  .tpl-label { font-weight: 600; font-size: 14px; margin: 0 0 8px; }
  .tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 8px; }
  .tpl-btn { display: flex; align-items: center; gap: 10px; text-align: left; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; font: inherit; color: inherit; }
  .tpl-btn svg { width: 34px; height: 34px; flex: none; }
  .tpl-btn span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .tpl-btn strong { font-weight: 600; font-size: 14px; }
  .tpl-btn small { font-size: 12.5px; color: var(--slate-2); }
  .tpl-btn.sel { border-color: var(--sky); background: var(--sky-l); }
  .tpl-btn:not(.sel):hover { border-color: var(--sky); }
  .ic { fill: #fde0de; stroke: #ef453b; stroke-width: 1.6; stroke-linejoin: round; }
  .ic-m { fill: #d9dde1; stroke: #7a7a7a; stroke-width: 1.2; }
  .dia-row { margin-top: 10px; }
  .extras { display: flex; flex-direction: column; gap: 12px; margin: 16px 0 0; }
  .x-item :global(.inline-check) { margin: 0; }
  .x-item :global(.inline-check input) { margin: 0; flex: none; }
  .x-item > .hint { margin: 2px 0 0 28px; }
  .issues { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .issues li.error { border-left-color: #d93a2b; background: #fdecea; color: #b02a20; }
  .sum { margin-top: 16px; }
  .print-note { margin: 10px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: #fdf6dc; }
  .print-note.error { border-left-color: #c4362b; background: #fdecea; color: #8a1f17; }
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
</style>
