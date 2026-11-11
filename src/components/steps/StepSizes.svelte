<script lang="ts">
  /** Schritt 2: Durchmesser, bei den Stutzen-Adaptern zusätzlich die Maße am Gerät */
  import { app, LABELS, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import Field from '../Field.svelte';
  import MeasureFigure from '../MeasureFigure.svelte';
  import ResetLink from '../ResetLink.svelte';
</script>

<h2>Größen</h2>
<p class="lead">Die Zahl ist der Innendurchmesser in Millimetern. Die meisten Geräte und Schläuche nutzen 32.</p>
{#each app.kind.diameters as k}
  <fieldset class="dia">
    <legend>{LABELS[k].word} ({LABELS[k].letter})</legend>
    <div class="dia-row">
      <div class="chips">
        {#each LABELS[k].presets as v}
          <button class="chip" class:sel={app.input[k] === v} onclick={() => app.setDia(k, v)}>{v}</button>
        {/each}
      </div>
      <NumberField value={app.input[k]} min={15} max={60} step={0.1} label={LABELS[k].hint} oncommit={(v) => app.setDia(k, v)} />
    </div>
  </fieldset>
{/each}

{#if app.kind.machine}
  {@const m = app.machine}
  <h3 class="sub">Stutzen am Gerät</h3>
  <div class="seg wide" role="radiogroup" aria-label="Befestigung">
    <button role="radio" aria-checked={m.mode === 'over'} class:sel={m.mode === 'over'} onclick={() => app.setMode('over')}>Adapter kommt über den Stutzen</button>
    <button role="radio" aria-checked={m.mode === 'into'} class:sel={m.mode === 'into'} onclick={() => app.setMode('into')}>Adapter kommt in die Öffnung</button>
  </div>
  <MeasureFigure mode={m.mode} />
  <p class="hint">
    {m.mode === 'over'
      ? 'Mit dem Messschieber außen messen: einmal vorne und einmal dort, wo der Adapter enden soll.'
      : 'Mit dem Messschieber innen messen: einmal vorne an der Kante und einmal dort, wo der Adapter enden soll.'}
  </p>
  <div class="grid2">
    <Field label="Ø vorne"><NumberField bind:value={app.machine.dOpen} step={0.1} min={8} max={120} label="Ø vorne" /></Field>
    <Field label="Ø in der Tiefe" help="Stutzen und Öffnungen sind oft leicht konisch. Sind beide Maße gleich, einfach denselben Wert eintragen.">
      <NumberField bind:value={app.machine.dDepth} step={0.1} min={8} max={120} label="Ø in der Tiefe" />
    </Field>
    <Field label="Tiefe" help={`Wie weit der Adapter ${m.mode === 'over' ? 'über den Stutzen geht' : 'in die Öffnung reicht'}. 20 bis 30 mm halten gut.`}>
      <NumberField bind:value={app.machine.length} step={1} min={5} max={100} label="Tiefe (Steckweg)" />
    </Field>
  </div>
  {#if app.machineWarnings.length}
    <ul class="warn">
      {#each app.machineWarnings as w}<li>{w}</li>{/each}
    </ul>
  {/if}
  <details class="more">
    <summary>Feineinstellungen <small>meist nicht nötig</small></summary>
    <div class="more-body">
      <div class="grid2">
        <Field label="Luft (Zugabe)" help={`Etwas Spiel, damit der Adapter passt. Geht er nicht ${m.mode === 'over' ? 'drauf' : 'hinein'}: Wert erhöhen. Sitzt er zu locker: verringern, bis 0.`}>
          <NumberField bind:value={app.machine.allowance} step={0.05} min={0} max={2} label="Zugabe für den Sitz" />
        </Field>
        <Field label="Wandstärke" help="Dicke der Wand am Rohrteil. 3 mm sind stabil.">
          <NumberField bind:value={app.machine.wall} step={0.5} min={2} max={8} label="Wandstärke" />
        </Field>
        <Field label="Übergangslänge" help={`Länge des schrägen Stücks zwischen ${app.kind.id === 'MACHINE_M' ? 'Stecker' : 'Kupplung'} und Rohrteil. Länger ist flacher und lässt sich besser drucken, der Adapter wird dafür länger. Standard: 8 mm.`}>
          <NumberField bind:value={app.machine.transition} step={1} min={2} max={40} label="Übergangslänge" />
        </Field>
      </div>
      <label class="inline-check"><input type="checkbox" bind:checked={app.machine.holes} /> 3 Löcher für Schrauben (Ø 4 mm)</label>
      <p class="hint">Mit kleinen Senkkopfschrauben hält der Adapter zusätzlich am Stutzen.</p>
      <div class="pipe-sum">
        <table>
          <caption>So wird das Rohrteil des Adapters</caption>
          <thead><tr><th></th><th>vorne</th><th>in der Tiefe</th></tr></thead>
          <tbody>
            <!-- das Maß, auf das es ankommt, zuerst: aufgesteckt innen, eingesteckt außen -->
            {#each m.mode === 'over' ? app.pipeRows : [...app.pipeRows].reverse() as r}
              <tr><th>{r.label}</th><td>{fmt(r.a, 2)}</td><td>{fmt(r.b, 2)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </details>
  <ResetLink show={!app.machineIsDefault} label="Stutzen-Maße auf Standard zurücksetzen" onclick={() => app.resetMachine()} />
{/if}
