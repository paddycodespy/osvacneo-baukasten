<script lang="ts">
  /** Schritt 2: Durchmesser, bei den Stutzen-Adaptern zusätzlich die Maße am Gerät */
  import { app, LABELS, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import Field from '../Field.svelte';
  import MeasureFigure from '../MeasureFigure.svelte';
  import GateFigure from '../GateFigure.svelte';
  import ResetLink from '../ResetLink.svelte';
  import HelpToggle from '../HelpToggle.svelte';
  import HelpText from '../HelpText.svelte';
  import { setContext } from 'svelte';
  import { MOUNT_LABELS, ORIENT_LABELS, type GateMount, type GateOrient } from '../../lib/osvac/gate';

  // Felder markieren, die ein Hinweis zum Stutzen betrifft
  setContext('fieldFlag', (label: string) => (app.machineWarnings.some((w) => w.fixes?.some((fx) => fx.fields.includes(label))) ? 'warn' : null));
</script>

<h2>Größen</h2>
{#if app.kind.gate}
  {@const g = app.gate}
  <p class="lead">Das Rohr wird auf beiden Seiten in eine Muffe gesteckt. Die Zahl ist der Außendurchmesser des Rohrs in Millimetern.</p>
  <GateFigure mount={g.mount !== 'none'} />
  <fieldset class="dia">
    <legend>Rohr (außen)</legend>
    <div class="dia-row">
      <div class="chips">
        {#each [32, 40, 50] as v}
          <button class="chip" class:sel={g.d === v} onclick={() => (app.gate.d = v)}>{v}</button>
        {/each}
      </div>
      <NumberField bind:value={app.gate.d} min={15} max={60} step={0.1} label="Außendurchmesser des Rohrs" />
    </div>
  </fieldset>
  <div class="grid2">
    <Field label="Tiefe der Muffen" help="So weit steckt das Rohr auf jeder Seite im Schieber. 20 mm halten gut, kürzer spart Material.">
      <NumberField bind:value={app.gate.depth} min={10} max={50} step={1} label="Tiefe der Muffen" />
    </Field>
  </div>
  <h3 class="sub">Befestigung</h3>
  <div class="seg wide" role="radiogroup" aria-label="Befestigung">
    {#each Object.entries(MOUNT_LABELS) as [m, label]}
      <button role="radio" aria-checked={g.mount === m} class:sel={g.mount === m} onclick={() => (app.gate.mount = m as GateMount)}>{label}</button>
    {/each}
  </div>
  <p class="hint">
    {g.mount === 'none'
      ? 'Der Schieber hängt nur am Rohr.'
      : g.mount === 'plate'
      ? 'Platte hinten am Schieber mit vier Löchern für Senkkopfschrauben (Ø 4 mm), je Seite unten und oben. Hält am festesten.'
      : g.mount === 'keyhole'
      ? 'Zwei Schlüssellöcher: Schrauben in die Wand drehen, Schieber einhängen. Schnell wieder abzunehmen.'
      : 'Eigenes kleines Teil, das an die Wand geschraubt wird. Das Rohr neben dem Schieber wird hineingedrückt.'}
  </p>
  {#if g.mount === 'keyhole'}
    <Field label="Lage an der Wand" help={app.helpTexts.orient}>
      <div class="seg wide" role="radiogroup" aria-label="Lage an der Wand">
        {#each Object.entries(ORIENT_LABELS) as [o, label]}
          <button role="radio" aria-checked={g.orient === o} class:sel={g.orient === o} onclick={() => (app.gate.orient = o as GateOrient)}>{label}</button>
        {/each}
      </div>
    </Field>
  {/if}
  {#if g.mount === 'plate' || g.mount === 'clip'}
    <p class="hint">Passt für senkrechtes und waagerechtes Rohr: einfach entsprechend gedreht anschrauben.</p>
  {/if}
  {#if g.mount !== 'none'}
    <div class="grid2">
      <Field label="Wand bis Rohrmitte" help={app.helpTexts.wallDist}>
        <NumberField value={app.gateLay.A} min={Math.ceil(app.gateLay.minA * 10) / 10} max={Math.floor(app.gateLay.maxA * 10) / 10} step={0.5} label="Abstand Wand bis Rohrmitte" oncommit={(v) => app.setWallDist(v)} />
      </Field>
    </div>
    <p class="hint">Die Rohrmitte liegt {fmt(app.gateLay.A)} mm vor der Wand{g.wallDist ? '' : `, ${g.mount === 'clip' ? 'der Wandhalter sitzt' : 'der Schieber sitzt'} direkt an der Wand`}. {app.gatePitch}.</p>
  {/if}
  <ResetLink show={!app.gateIsDefault} label="Schieber auf Standard zurücksetzen" onclick={() => app.resetGate()} />
{:else if app.kind.helper}
  <p class="lead">Die Lösehilfe hält die Kupplung oder den Stecker eines Schlauchadapters fest, damit man den Schlauchteil kräftig drehen kann. Die Zahl ist der Innendurchmesser in Millimetern. <HelpToggle id="helperLabel" /></p>
  <HelpText id="helperLabel" />
  <div class="checks helper-parts">
    <label><input type="checkbox" checked={app.helper.forF} disabled={app.helper.forF && !app.helper.forM} onchange={() => app.toggleHelper('forF')} /> Für Kupplungen (FxxHyy): Block mit Stutzen</label>
    <label><input type="checkbox" checked={app.helper.forM} disabled={app.helper.forM && !app.helper.forF} onchange={() => app.toggleHelper('forM')} /> Für Stecker (MxxHyy): Block mit Bohrung</label>
  </div>
{:else}
<p class="lead">Die Zahl ist der Innendurchmesser in Millimetern. Die meisten Geräte und Schläuche nutzen 32.</p>
{/if}
{#each app.kind.diameters.filter((k) => !app.kind.helper || (k === 'femaleDiameterInner' ? app.helper.forF : app.helper.forM)) as k}
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
      {#each app.machineWarnings as w}
        <li>
          {w.text}
          {#if w.fixes?.length}
            <span class="fixes">{#each w.fixes as fx}<button type="button" class="fix" onclick={fx.set}>{fx.label}</button>{/each}</span>
          {/if}
        </li>
      {/each}
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
      <div class="x-list">
        <div class="x-item">
          <label class="inline-check"><input type="checkbox" bind:checked={app.machine.holes} /> 3 Löcher für Schrauben (Ø 4 mm)</label>
          <p class="hint">Mit kleinen Senkkopfschrauben hält der Adapter zusätzlich am Stutzen.</p>
        </div>
        <div class="x-item">
          <label class="inline-check"><input type="checkbox" bind:checked={app.machine.ribs} /> Klemmrippen für festen Sitz</label>
          <p class="hint">Schmale Rippen {m.mode === 'over' ? 'innen' : 'außen'}, die sich beim {m.mode === 'over' ? 'Aufstecken' : 'Einstecken'} etwas zusammendrücken. Hilft, wenn der {m.mode === 'over' ? 'Stutzen' : 'Rand der Öffnung'} nicht genau rund ist oder der Adapter sonst wackelt.</p>
        </div>
        {#if m.mode === 'over'}
          <div class="x-item">
            <label class="inline-check"><input type="checkbox" bind:checked={app.machine.slots} /> Schlitze für eine Schlauchschelle</label>
            <p class="hint">Zwei Schlitze vom offenen Rand her, Größe passend zum Adapter. Eine Schelle außen drückt den Adapter dann fest auf den Stutzen.</p>
          </div>
        {/if}
      </div>
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
