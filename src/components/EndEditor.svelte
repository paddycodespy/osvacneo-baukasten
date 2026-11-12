<script lang="ts">
  /**
   * Ende B bzw. Ende C des Freiform-Adapters: Gerät (Stutzen, Öffnung, Flansch) oder Anschluss von osVAC neo.
   * Gleiche Oberfläche für beide Enden; tag bestimmt Beschriftungen und Texte.
   */
  import NumberField from './NumberField.svelte';
  import Field from './Field.svelte';
  import SectionEditor from './SectionEditor.svelte';
  import MeasureFigure from './MeasureFigure.svelte';
  import FlangeFigure from './FlangeFigure.svelte';
  import HelpToggle from './HelpToggle.svelte';
  import HelpText from './HelpText.svelte';
  import ResetLink from './ResetLink.svelte';
  import NotchFigure from './NotchFigure.svelte';
  import IssueList from './IssueList.svelte';
  import { SLOT_SHAPES, SEAL, AUTO_HOLE_D, flangeGeom, flangeDefaults, flangeMinRim, flangeExtent, BRIM_FROM, type EndSpec, type Fix, type Issue, type FlangeLayout, type DeviceEnd } from '../lib/osvac/freeform';

  let {
    end = $bindable(),
    wall,
    tag,
    issues = [],
    apply,
    onflange,
  }: { end: EndSpec; wall: number; tag: 'B' | 'C'; issues?: Issue[]; apply: (fx: Fix) => void; onflange?: () => void } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });

  /** Extras am Gerät: anfangs offen, wenn schon welche gewählt sind; danach so, wie der Nutzer es aufklappt */
  const anyExtra = (d: DeviceEnd) => (d.mode === 'flange' ? d.seal : d.ribs || d.holes || (d.mode === 'over' && ((d.slots && SLOT_SHAPES.has(d.section.shape)) || d.notch)));
  let extrasOpen = $state(anyExtra(end.device));

  const isFlange = $derived(end.type === 'device' && end.device.mode === 'flange');
  function setDeviceMode(m: DeviceEnd['mode']) {
    end.device.mode = m;
    if (m === 'flange') onflange?.();
  }
  /** Werte des Lochbilds nach Maß (für den Vergleich mit der Vorbelegung) */
  const CUSTOM = ['plateW', 'plateH', 'holeX', 'holeY', 'holeNX', 'holeNY', 'plateD', 'holeCircle', 'holeN', 'triCircle', 'holeD'] as const;
  const customKey = (o: Partial<DeviceEnd>) => JSON.stringify(CUSTOM.map((k) => o[k]));
  /** zuletzt vorbelegte Werte: solange nichts von Hand geändert wurde, laufen sie mit der Öffnung mit */
  let prefilled: string | null = null;
  const freshDefaults = $derived(isFlange && end.device.flangeLayout !== 'auto' ? flangeDefaults(end.device, wall) : null);
  function refill() {
    if (!freshDefaults) return;
    Object.assign(end.device, freshDefaults);
    prefilled = customKey(freshDefaults);
  }
  $effect(() => {
    const d = freshDefaults;
    if (!d || prefilled === null) return;
    const cur = customKey(end.device);
    if (cur === prefilled && customKey(d) !== cur) refill();
  });
  /** Lochbild nach Maß passt nicht mehr zur Öffnung (von Hand geändert): Link zum neu Vorschlagen */
  const stale = $derived(!!freshDefaults && customKey(end.device) !== customKey(freshDefaults));
  /** Lochbild wechseln: Werte nach Maß aus dem automatischen Flansch vorbelegen */
  function setLayout(l: FlangeLayout) {
    const dv = end.device;
    if (l !== 'auto' && dv.flangeLayout === 'auto') {
      const d = flangeDefaults(dv, wall);
      Object.assign(dv, d);
      prefilled = customKey(d);
    }
    dv.flangeLayout = l;
  }
  /** Dichtung braucht etwas mehr Rand: beim Anhaken bzw. breiteren Band passend vergrößern */
  function setSeal(on: boolean, w = end.device.sealW) {
    const dv = end.device;
    dv.seal = on;
    dv.sealW = w;
    if (on && dv.flangeLayout === 'auto') dv.flangeRim = Math.max(dv.flangeRim, flangeMinRim(wall, true, w));
  }
  const flange = $derived(isFlange ? flangeGeom(end.device, wall, false) : null);
  /** Kreis am Gerät: „Ø in der Tiefe“ läuft mit „Ø vorne“ mit, solange beide gleich waren (neu ansetzen, wenn ein anderer Aufbau geladen wird) */
  let seenDev: DeviceEnd | null = null;
  let lastFront = 0;
  let lastShape = '';
  $effect(() => {
    const dv = end.device;
    const d = dv.section.d, shape = dv.section.shape;
    if (dv !== seenDev) {
      seenDev = dv;
      lastFront = d;
      lastShape = shape;
      return;
    }
    if (Math.abs(dv.dDepth - lastFront) < 1e-9) dv.dDepth = d;
    lastFront = d;
    /** Zugabe am Gerät: rund 0,2 mm, eckig 0,4 mm (eckige Formen schrumpfen in den Ecken stärker). Nur, solange der Standard drinsteht. */
    if (shape !== lastShape) {
      const want = (s: string) => (s === 'circle' ? 0.2 : 0.4);
      if (Math.abs(dv.allowance - want(lastShape)) < 1e-9) dv.allowance = want(shape);
      lastShape = shape;
    }
  });
</script>

{#snippet chipsWithField(values: number[], get: () => number, set: (v: number) => void)}
  <div class="chips">
    {#each values as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}°</button>{/each}
  </div>
{/snippet}

{#snippet sizeChips(get: () => number, set: (v: number) => void)}
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}</button>{/each}</div>
{/snippet}

<div class="seg wide" role="radiogroup" aria-label="Ende {tag}">
  <button type="button" role="radio" aria-checked={end.type === 'device'} class:sel={end.type === 'device'} onclick={() => (end.type = 'device')}>Gerät</button>
  <button type="button" role="radio" aria-checked={end.type === 'female'} class:sel={end.type === 'female'} onclick={() => (end.type = 'female')}>Kupplung (F)</button>
  <button type="button" role="radio" aria-checked={end.type === 'male'} class:sel={end.type === 'male'} onclick={() => (end.type = 'male')}>Stecker (M)</button>
</div>
{#if end.type === 'device'}
  <div class="seg wide" role="radiogroup" aria-label="Befestigung am Gerät">
    <button type="button" role="radio" aria-checked={end.device.mode === 'over'} class:sel={end.device.mode === 'over'} onclick={() => setDeviceMode('over')}>Über den Stutzen</button>
    <button type="button" role="radio" aria-checked={end.device.mode === 'into'} class:sel={end.device.mode === 'into'} onclick={() => setDeviceMode('into')}>In die Öffnung</button>
    <button type="button" role="radio" aria-checked={end.device.mode === 'flange'} class:sel={end.device.mode === 'flange'} onclick={() => setDeviceMode('flange')}>Mit Flansch</button>
  </div>
  {#if end.device.mode === 'flange'}
  {@const dv = end.device}
  <FlangeFigure seal={dv.seal} />
  <SectionEditor bind:section={dv.section} label="Form der Öffnung" measure="into" />
  <div class="grid2">
    {#if dv.flangeLayout === 'auto'}
      <Field label="Rand" help="So breit steht die Platte rund um die Öffnung über. Darin sitzen die Schraubenlöcher.">
        <NumberField bind:value={dv.flangeRim} min={10} max={80} step={1} label="Rand des Flanschs" />
      </Field>
    {/if}
    <Field label="Dicke" help="Dicke der Platte. 5 mm sind stabil, bei großen Platten eher 6 bis 8 mm.">
      <NumberField bind:value={dv.flangeT} min={3} max={15} step={0.5} label="Dicke des Flanschs" />
    </Field>
  </div>
  <p class="hint">
    {flange?.holes.length ? `${flange.holes.length} Löcher` : 'Löcher'} Ø {fmt(dv.flangeLayout === 'auto' ? AUTO_HOLE_D : dv.holeD)} mm mit Senkung für Senkkopfschrauben{dv.flangeLayout === 'auto' ? ' M4, automatisch verteilt' : ''}. {tag === 'B' ? 'Der Flansch liegt beim Drucken unten auf dem Bett, so geht es ohne Stützen.' : 'Der Flansch steht beim Drucken schräg in der Luft und braucht Stützen. Besser wäre er an Ende B.'}{#if flange && !flange.errors.length && flangeExtent(dv, wall) >= BRIM_FROM} Bei dieser Plattengröße im Slicer einen Brim einschalten, damit die Ecken flach bleiben.{/if}
  </p>
  <IssueList list={issues} {apply} />
  <details class="more" bind:open={extrasOpen}>
    <summary>Extras <small>Dichtung</small></summary>
    <div class="more-body extras">
      <div class="x-item">
        <label class="inline-check"><input type="checkbox" checked={dv.seal} onchange={(e) => setSeal(e.currentTarget.checked)} /> Nut für ein Dichtband</label>
        <p class="hint">Eine flache Nut rund um die Öffnung auf der Seite zum Gerät, {fmt(SEAL.depth)} mm tief, für selbstklebendes Moosgummi-Dichtband (etwa 3 mm dick). So zieht der Flansch keine Nebenluft.</p>
        {#if dv.seal}
          <Field label="Breite des Dichtbands">
            <div class="seg wide" role="radiogroup" aria-label="Breite des Dichtbands">
              {#each SEAL.widths as w}
                <button type="button" role="radio" aria-checked={dv.sealW === w} class:sel={dv.sealW === w} onclick={() => setSeal(true, w)}>{w} mm</button>
              {/each}
            </div>
          </Field>
        {/if}
      </div>
    </div>
  </details>
  <details class="more">
    <summary>Feineinstellungen <small>Lochbild nach Maß, Übergang</small></summary>
    <div class="more-body">
      <Field label="Lochbild" help="Automatisch: die Platte folgt der Öffnung, die Löcher setzt das Programm. Nach Maß: wenn am Gerät schon Gewindelöcher sind, Platte und Lochabstand selbst angeben.">
        <div class="seg wide" role="radiogroup" aria-label="Lochbild">
          <button type="button" role="radio" aria-checked={dv.flangeLayout === 'auto'} class:sel={dv.flangeLayout === 'auto'} onclick={() => setLayout('auto')}>Automatisch</button>
          <button type="button" role="radio" aria-checked={dv.flangeLayout === 'rect'} class:sel={dv.flangeLayout === 'rect'} onclick={() => setLayout('rect')}>Rechteckig</button>
          <button type="button" role="radio" aria-checked={dv.flangeLayout === 'round'} class:sel={dv.flangeLayout === 'round'} onclick={() => setLayout('round')}>Rund</button>
          <button type="button" role="radio" aria-checked={dv.flangeLayout === 'tri'} class:sel={dv.flangeLayout === 'tri'} onclick={() => setLayout('tri')}>Dreieck</button>
        </div>
      </Field>
      {#if dv.flangeLayout === 'rect'}
        <div class="grid2">
          <Field label="Breite der Platte"><NumberField bind:value={dv.plateW} min={20} max={300} step={1} label="Breite der Platte" /></Field>
          <Field label="Höhe der Platte"><NumberField bind:value={dv.plateH} min={20} max={300} step={1} label="Höhe der Platte" /></Field>
          <Field label="Lochabstand waagerecht" help="Abstand der Lochmitten, an der Breite gemessen."><NumberField bind:value={dv.holeX} min={0} max={290} step={0.5} label="Lochabstand waagerecht" /></Field>
          <Field label="Lochabstand senkrecht" help="Abstand der Lochmitten, an der Höhe gemessen."><NumberField bind:value={dv.holeY} min={0} max={290} step={0.5} label="Lochabstand senkrecht" /></Field>
          <Field label="Löcher waagerecht" help="Wie viele Löcher entlang der Breite sitzen, die Ecken mitgezählt."><NumberField bind:value={dv.holeNX} min={2} max={6} step={1} unit="" label="Löcher waagerecht" /></Field>
          <Field label="Löcher senkrecht" help="Wie viele Löcher entlang der Höhe sitzen, die Ecken mitgezählt."><NumberField bind:value={dv.holeNY} min={2} max={6} step={1} unit="" label="Löcher senkrecht" /></Field>
          <Field label="Loch-Ø" help="4,5 mm für M4, 5,5 mm für M5, 3,4 mm für M3. Die Senkung passt sich an."><NumberField bind:value={dv.holeD} min={2} max={10} step={0.1} label="Loch-Durchmesser" /></Field>
        </div>
        <p class="hint">{flange?.holes.length ?? 4} Löcher, gleichmäßig auf dem Rand des Lochbilds verteilt.</p>
      {:else if dv.flangeLayout === 'round'}
        <div class="grid2">
          <Field label="Platten-Ø"><NumberField bind:value={dv.plateD} min={20} max={300} step={1} label="Durchmesser der Platte" /></Field>
          <Field label="Lochkreis-Ø" help="Durchmesser des Kreises durch die Lochmitten."><NumberField bind:value={dv.holeCircle} min={5} max={290} step={0.5} label="Lochkreis-Durchmesser" /></Field>
          <Field label="Anzahl Löcher"><NumberField bind:value={dv.holeN} min={2} max={16} step={1} unit="" label="Anzahl der Löcher" /></Field>
          <Field label="Loch-Ø" help="4,5 mm für M4, 5,5 mm für M5, 3,4 mm für M3. Die Senkung passt sich an."><NumberField bind:value={dv.holeD} min={2} max={10} step={0.1} label="Loch-Durchmesser" /></Field>
        </div>
      {:else if dv.flangeLayout === 'tri'}
        <div class="grid2">
          <Field label="Lochkreis-Ø" help="Durchmesser des Kreises durch die drei Lochmitten. Die Platte wächst mit: um jedes Loch bleibt ein runder Rand."><NumberField bind:value={dv.triCircle} min={5} max={290} step={0.5} label="Lochkreis-Durchmesser" /></Field>
          <Field label="Loch-Ø" help="4,5 mm für M4, 5,5 mm für M5, 3,4 mm für M3. Die Senkung passt sich an."><NumberField bind:value={dv.holeD} min={2} max={10} step={0.1} label="Loch-Durchmesser" /></Field>
        </div>
        <p class="hint">Abgerundetes Dreieck mit einem Loch in jeder Ecke. Mit „Drehung“ zeigen die Ecken in die passende Richtung.</p>
      {/if}
      {#if dv.flangeLayout !== 'auto' && stale}
        <div class="refill-row">
          <ResetLink show label="Platte und Löcher neu vorschlagen" onclick={refill} />
          <HelpToggle id="refill" />
        </div>
        <HelpText id="refill" />
      {/if}
      <div class="grid2">
        <Field label="Übergangslänge" help="Strecke, auf der die Form der Bausteine in die Form der Öffnung übergeht. Länger ist flacher und lässt sich besser drucken.">
          <NumberField bind:value={end.transition} min={2} max={150} step={1} label="Übergangslänge zum Flansch" />
        </Field>
        {#if dv.section.shape !== 'circle' || dv.flangeLayout === 'rect' || dv.flangeLayout === 'tri'}
          <Field label="Drehung" help="Dreht Öffnung und Platte um die Mitte, falls sie schräg zum Rest des Adapters stehen.">
            <NumberField bind:value={dv.rot} min={-180} max={180} step={5} unit="°" label="Drehung des Flanschs" />
          </Field>
        {/if}
      </div>
    </div>
  </details>
  {:else}
  <MeasureFigure mode={end.device.mode} round={end.device.section.shape === 'circle'} />
  <SectionEditor
    bind:section={end.device.section}
    bind:depth={end.device.dDepth}
    label={end.device.mode === 'over' ? 'Form des Stutzens' : 'Form der Öffnung'}
    measure={end.device.mode}
  />
  <div class="grid2">
    <Field label="Tiefe" help={`Wie weit der Adapter ${end.device.mode === 'over' ? 'über den Stutzen geht' : 'in die Öffnung reicht'}. 20 bis 30 mm halten gut.`}>
      <NumberField bind:value={end.device.length} min={5} max={150} step={1} label="Steckweg" />
    </Field>
  </div>
  {#if end.device.mode === 'into'}
    <label class="inline-check"><input type="checkbox" bind:checked={end.device.collar} /> Rand außen, damit der Adapter nicht zu tief rutscht</label>
  {/if}
  <IssueList list={issues} {apply} />
  {@const dv = end.device}
  {@const over = dv.mode === 'over'}
  <details class="more" bind:open={extrasOpen}>
    <summary>Extras <small>{over ? (SLOT_SHAPES.has(dv.section.shape) ? 'Rippen, Schlitze, Schrauben, Aussparung' : 'Rippen, Schrauben, Aussparung') : 'Rippen, Schrauben'}</small></summary>
    <div class="more-body extras">
      <div class="x-item">
        <label class="inline-check"><input type="checkbox" bind:checked={dv.ribs} /> Klemmrippen für festen Sitz</label>
        <p class="hint">Schmale Rippen {over ? 'innen' : 'außen'}, die sich beim {over ? 'Aufstecken' : 'Einstecken'} etwas zusammendrücken. Hilft, wenn der {over ? 'Stutzen' : 'Rand der Öffnung'} nicht genau rund ist oder der Adapter sonst wackelt.</p>
      </div>
      {#if over && SLOT_SHAPES.has(dv.section.shape)}
        <div class="x-item">
          <label class="inline-check"><input type="checkbox" bind:checked={dv.slots} /> Schlitze für eine Schlauchschelle</label>
          <p class="hint">Schlitze vom offenen Rand her, Anzahl und Größe passend zum Adapter. Eine Schelle außen drückt den Adapter dann fest auf den Stutzen.</p>
        </div>
      {/if}
      <div class="x-item">
        <label class="inline-check"><input type="checkbox" bind:checked={dv.holes} /> Löcher für Schrauben</label>
        <p class="hint">{over ? 'Ø 4 mm mit Senkung, für kleine Senkkopfschrauben in den Stutzen.' : 'Ø 3,2 mm zum Vorbohren: Schrauben von außen durch das Gerät in den Adapter drehen.'} {dv.section.shape === 'circle' || dv.section.shape === 'ellipse' ? '3 Löcher, gleichmäßig verteilt.' : 'Je ein Loch mittig auf den geraden Seiten.'}</p>
      </div>
      {#if over}
        <div class="x-item">
          <label class="inline-check"><input type="checkbox" bind:checked={dv.notch} /> Aussparung am Rand</label>
          <p class="hint">Ein Ausschnitt am offenen Rand, zum Beispiel für einen Schalter oder eine Lasche am Gerät. Liegt dieses Ende beim Drucken unten, überbrückt der Drucker die Aussparung, bis etwa 25 mm Breite geht das ohne Stützen.</p>
          {#if dv.notch}
            <div class="grid2">
              <Field label="Breite"><NumberField bind:value={dv.notchW} min={3} max={150} step={1} label="Breite der Aussparung" /></Field>
              <Field label="Tiefe" help="Wie weit die Aussparung vom Rand in den Adapter reicht."><NumberField bind:value={dv.notchH} min={2} max={150} step={1} label="Tiefe der Aussparung" /></Field>
            </div>
            <Field label="Lage" help="Auf welcher Seite die Aussparung sitzt. Die Skizze zeigt die Öffnung des Adapters von außen, so wie du sie auf den Stutzen setzt. Rot ist die Aussparung. Auf die Skizze tippen oder einen Winkel wählen.">
              <NotchFigure section={dv.section} dir={dv.notchDir} width={dv.notchW} onpick={(v) => (dv.notchDir = v)} />
              <div class="row">
                {@render chipsWithField([0, 90, 180, 270], () => dv.notchDir, (v) => (dv.notchDir = v))}
                <span class="num-sm"><NumberField bind:value={dv.notchDir} min={0} max={359} step={5} unit="°" label="Lage der Aussparung" /></span>
              </div>
            </Field>
          {/if}
        </div>
      {/if}
    </div>
  </details>
  <details class="more">
    <summary>Feineinstellungen <small>meist nicht nötig</small></summary>
    <div class="more-body">
      <div class="grid2">
        <Field label="Luft (Zugabe)" help={`Etwas Spiel, damit der Adapter passt. Geht er nicht ${end.device.mode === 'over' ? 'drauf' : 'hinein'}: erhöhen. Sitzt er zu locker: verringern, bis 0. Bei eckigen Formen eher 0,3 bis 0,5 mm.`}>
          <NumberField bind:value={end.device.allowance} min={0} max={3} step={0.05} label="Zugabe für den Sitz" />
        </Field>
        <Field label="Übergangslänge" help="Strecke, auf der die Form der Bausteine in die Form am Gerät übergeht. Länger ist flacher und lässt sich besser drucken.">
          <NumberField bind:value={end.transition} min={2} max={150} step={1} label="Übergangslänge zum Geräteanschluss" />
        </Field>
        {#if end.device.section.shape !== 'circle'}
          <Field label="Drehung" help="Dreht die Form um die Mitte, falls sie schräg zum Rest des Adapters steht.">
            <NumberField bind:value={end.device.rot} min={-180} max={180} step={5} unit="°" label="Drehung des Geräteanschlusses" />
          </Field>
        {/if}
      </div>
      <label class="inline-check"><input type="checkbox" bind:checked={end.device.chamfer} /> Schräge Kante am Rand, erleichtert das {end.device.mode === 'over' ? 'Aufstecken' : 'Einstecken'}</label>
    </div>
  </details>
  {/if}
{:else}
  <div class="dia dia-{end.type === 'female' ? 'F' : 'M'}">
    <div class="dia-row">
      {@render sizeChips(() => end.d, (v) => (end.d = v))}
      <NumberField bind:value={end.d} min={15} max={60} step={0.1} label="Innendurchmesser Ende {tag}" />
    </div>
  </div>
  <p class="hint">Innendurchmesser in mm.</p>
  <IssueList list={issues} {apply} />
  <details class="more">
    <summary>Feineinstellungen <small>meist nicht nötig</small></summary>
    <div class="more-body">
      <div class="grid2">
        <Field label="Übergangslänge" help="Ist der Baustein davor nicht rund oder anders weit, geht er auf dieser Strecke in den Anschluss über.">
          <NumberField bind:value={end.transition} min={2} max={150} step={1} label="Übergangslänge zu Ende {tag}" />
        </Field>
      </div>
    </div>
  </details>
{/if}

<style>
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .num-sm { width: 130px; }
  .num-sm :global(.num-in) { width: 100%; }
  .extras { display: flex; flex-direction: column; gap: 12px; }
  /* Beschreibung und Felder beginnen dort, wo der Text neben dem Kästchen beginnt (18 px Kästchen + 10 px Abstand) */
  .x-item { --x-indent: 28px; }
  .x-item :global(.inline-check) { margin: 0; }
  .x-item :global(.inline-check input) { margin: 0; flex: none; }
  .x-item > .hint { margin: 2px 0 0 var(--x-indent); }
  .x-item > :global(.grid2), .x-item > :global(.field) { margin-left: var(--x-indent); }
</style>
