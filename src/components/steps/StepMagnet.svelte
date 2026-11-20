<script lang="ts">
  /** Schritt 2 bei der Magnet-Schnellkupplung Ø100: welche Teile, Magnetgröße, Stutzen am Gerät, Schlauchgewinde */
  import { app, fmt } from '../../lib/app.svelte';
  import NumberField from '../NumberField.svelte';
  import Field from '../Field.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { MAGNET_SIZES, MAGNET_LIMITS, MAG, PORT_D, PLATE, type MagnetSize } from '../../lib/osvac/magnet';
  import ThreadInfo from '../ThreadInfo.svelte';

  let { printNote = null }: { printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const g = $derived(app.magnet);
  const lim = MAGNET_LIMITS;
  const osvac = $derived(!!app.kind.magnetOsvac);
  const P = $derived(app.magnetPlateInfo);
  /** Schnellauswahl wie in „Größen“ */
  const PORT_PRESETS = [25, 32, 36, 40, 50];
  const HOSE_PRESETS = [27, 32, 36, 40, 50];
  const clampD = (v: number) => Math.min(PORT_D[1], Math.max(PORT_D[0], Math.round(v * 10) / 10));
</script>

<h2>Teile</h2>
<p class="lead">
  {#if osvac}
    Am Gerät sitzt der Adapter, darauf eine Platte mit einem oder zwei Anschlüssen von osVAC neo. Beide halten über je {MAG.n} Neodym-Magnete zusammen, die beim Drucken eingelegt und überdruckt werden. Ein Bund in der Mitte zentriert die Teile.
  {:else}
    Am Gerät sitzt der Adapter, am Schlauch die Kupplung. Beide halten über je {MAG.n} Neodym-Magnete zusammen, die beim Drucken eingelegt und überdruckt werden. Ein Bund in der Mitte zentriert die Teile. Zum Umstecken die Kupplung einfach abziehen und am nächsten Gerät ansetzen.
  {/if}
</p>

<div class="checks helper-parts">
  <label><input type="checkbox" checked={g.adapter} disabled={g.adapter && !g.coupling} onchange={() => app.toggleMagnetPart('adapter')} /> Maschinenadapter: kommt auf den Stutzen am Gerät, mit Schraubklemme</label>
  <label><input type="checkbox" checked={g.coupling} disabled={g.coupling && !g.adapter} onchange={() => app.toggleMagnetPart('coupling')} />
    {#if osvac}Anschlussplatte: mit Kupplung oder Stecker von osVAC neo{:else if g.hoseMode === 'small'}Schlauchplatte: ein oder zwei Schläuche mit Drehring{:else}Schlauchkupplung: wird auf den Schlauch gedreht{/if}</label>
</div>
<p class="hint">{osvac ? 'Für jedes Gerät einen Adapter; die Anschlussplatte passt auf jeden Adapter mit derselben Magnetgröße.' : 'Für jedes Gerät einen Adapter, für jeden Schlauch eine Kupplung.'}</p>

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

{#if g.coupling && osvac}
  <h3 class="sub">Anschlüsse</h3>
  <div class="seg wide" role="radiogroup" aria-label="Zahl der Anschlüsse">
    <button type="button" role="radio" aria-checked={g.ports.length === 1} class:sel={g.ports.length === 1} onclick={() => app.setMagnetCount(1)}>Ein Anschluss</button>
    <button type="button" role="radio" aria-checked={g.ports.length === 2} class:sel={g.ports.length === 2} onclick={() => app.setMagnetCount(2)}>Zwei Anschlüsse</button>
  </div>
  {#each g.ports as q, i}
    <fieldset class="dia port">
      <legend>{g.ports.length > 1 ? `Anschluss ${i + 1}` : 'Anschluss'}</legend>
      <div class="seg wide" role="radiogroup" aria-label="Art von Anschluss {i + 1}">
        <button type="button" role="radio" aria-checked={q.t === 'F'} class:sel={q.t === 'F'} onclick={() => (q.t = 'F')}>Kupplung (F)</button>
        <button type="button" role="radio" aria-checked={q.t === 'M'} class:sel={q.t === 'M'} onclick={() => (q.t = 'M')}>Stecker (M)</button>
      </div>
      <div class="dia-row">
        <div class="chips">
          {#each PORT_PRESETS as v}
            <button class="chip" class:sel={q.d === v} onclick={() => (q.d = v)}>{v}</button>
          {/each}
        </div>
        <NumberField value={q.d} min={PORT_D[0]} max={PORT_D[1]} step={0.1} label="Innendurchmesser von Anschluss {i + 1}" oncommit={(v) => (q.d = clampD(v))} />
      </div>
      <label class="cap"><input type="checkbox" bind:checked={q.cap} /> Verschlusskappe dazu ({q.t === 'F' ? `Stopfen für die Kupplung F${fmt(q.d)}` : `Kappe für den Stecker M${fmt(q.d)}`})</label>
    </fieldset>
  {/each}
  <p class="hint">Fest auf der Platte, ohne Drehring: Die Schläuche drehen sich in ihren eigenen Schlauchadaptern von osVAC neo. Zwei Anschlüsse brauchen {PLATE.gapBayonet} mm Luft zwischen den aufgesteckten Teilen, damit man sie greifen und drehen kann; zu große Kombinationen gehen nicht.</p>
{:else if g.coupling}
  <h3 class="sub">Schlauch</h3>
  <div class="seg wide" role="radiogroup" aria-label="Art der Schlauchkupplung">
    <button type="button" role="radio" aria-checked={g.hoseMode === 'large'} class:sel={g.hoseMode === 'large'} onclick={() => (app.magnet.hoseMode = 'large')}>Ø100, Gewinde außen</button>
    <button type="button" role="radio" aria-checked={g.hoseMode === 'small'} class:sel={g.hoseMode === 'small'} onclick={() => (app.magnet.hoseMode = 'small')}>Kleiner, mit Drehring</button>
  </div>
  {#if g.hoseMode === 'small'}
    <p class="hint">Der Schlauch wird in einen Becher mit dem Gewinde von osVAC neo gedreht. Der Becher dreht sich auf einem Drehring, so verdreht sich der Schlauch nicht.</p>
    <div class="seg wide" role="radiogroup" aria-label="Zahl der Schläuche">
      <button type="button" role="radio" aria-checked={g.hoses.length === 1} class:sel={g.hoses.length === 1} onclick={() => app.setMagnetCount(1)}>Ein Schlauch</button>
      <button type="button" role="radio" aria-checked={g.hoses.length === 2} class:sel={g.hoses.length === 2} onclick={() => app.setMagnetCount(2)}>Zwei Schläuche</button>
    </div>
    {#each g.hoses as h, i}
      <fieldset class="dia port">
        <legend>{g.hoses.length > 1 ? `Schlauch ${i + 1} (H)` : 'Schlauch (H)'}</legend>
        <div class="dia-row">
          <div class="chips">
            {#each HOSE_PRESETS as v}
              <button class="chip" class:sel={h.d === v} onclick={() => (h.d = v)}>{v}</button>
            {/each}
          </div>
          <NumberField value={h.d} min={PORT_D[0]} max={PORT_D[1]} step={0.1} label="Innendurchmesser von Schlauch {i + 1}" oncommit={(v) => (h.d = clampD(v))} />
        </div>
        <div class="seg wide hand" role="radiogroup" aria-label="Drehrichtung von Schlauch {i + 1}">
          <button type="button" role="radio" aria-checked={h.hand === 'left'} class:sel={h.hand === 'left'} onclick={() => (h.hand = 'left')}>Linksgewinde</button>
          <button type="button" role="radio" aria-checked={h.hand === 'right'} class:sel={h.hand === 'right'} onclick={() => (h.hand = 'right')}>Rechtsgewinde</button>
        </div>
        <ThreadInfo hose={h.d} hand={false} />
      </fieldset>
    {/each}
    <p class="hint">Je nach Hersteller ist die Drahtspirale im Schlauch links- oder rechtsherum gewickelt. Den Schlauch senkrecht halten und von außen auf die Spirale schauen: Steigt sie nach links an, ist es ein Linksgewinde, nach rechts ein Rechtsgewinde.</p>
  {:else}
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
{/if}

{#if g.coupling && app.magnetIssue}<p class="print-note error" role="alert">{app.magnetIssue}</p>{/if}

<p class="hint sum">
  {g.adapter ? `Adapter ${fmt(app.magnetLay.heightA)} mm hoch` : ''}{g.adapter && g.coupling ? ', ' : ''}{g.coupling ? (P ? `${osvac ? 'Anschlussplatte' : 'Schlauchplatte'} ${fmt(P.height, 0)} mm hoch` : `Kupplung ${fmt(app.magnetLay.zC)} mm hoch`) : ''}, Flansch Ø{fmt(2 * app.magnetLay.lugOut, 0)} mm über die Nasen. Druckpause zum Einlegen der Magnete, Höhen im Download.
</p>

{#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}

<ResetLink show={!app.magnetIsDefault} label="Teile auf Standard zurücksetzen" onclick={() => app.resetMagnet()} />

<style>
  .mag-size { margin-top: 18px; }
  .seg { margin-top: 8px; }
  .sum { margin-top: 18px; }
  .port { margin-top: 14px; }
  .port .seg { margin-top: 4px; }
  .cap { display: block; margin-top: 10px; font-size: 15px; }
  .hand { margin-top: 10px; }
  .print-note { margin: 14px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: var(--warn-bg); }
  .print-note.error { border-left-color: var(--err); background: var(--err-bg); color: var(--err-fg); }
</style>
