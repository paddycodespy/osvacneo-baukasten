<script lang="ts">
  import { setContext } from 'svelte';
  /**
   * Schritt „Aufbau“ des Freiform-Adapters: Vorlage, Anschluss A, Bausteine (in der Reihenfolge von A nach B), Ende B, Druckbett.
   * Immer nur ein Baustein ist aufgeklappt; zugeklappt zeigt jeder Baustein eine Kurzfassung seiner Maße.
   * Erklärungen stehen hinter dem „?“ am Feld, selten gebrauchte Werte in den Feineinstellungen.
   */
  import NumberField from './NumberField.svelte';
  import Field from './Field.svelte';
  import SectionEditor from './SectionEditor.svelte';
  import BlockFigure from './BlockFigure.svelte';
  import MeasureFigure from './MeasureFigure.svelte';
  import FlangeFigure from './FlangeFigure.svelte';
  import HelpToggle from './HelpToggle.svelte';
  import HelpText from './HelpText.svelte';
  import ResetLink from './ResetLink.svelte';
  import NotchFigure from './NotchFigure.svelte';
  import { reveal } from '../lib/reveal';
  import { TEMPLATES, SLOT_SHAPES, BLOCK_LABELS, SEAL, AUTO_HOLE_D, newBlock, sec, sectionText, specKey, flangeGeom, flangeDefaults, flangeMinRim, flangeExtent, BRIM_FROM, type FreeSpec, type Block, type BlockType, type Issue, type Section, type FlangeLayout } from '../lib/osvac/freeform';

  type Open = number | 'A' | 'B' | null;
  let {
    spec = $bindable(),
    issues = [],
    open = $bindable(null),
    template = $bindable('elbow'),
    printNote = null,
  }: { spec: FreeSpec; issues?: Issue[]; open?: Open; template?: string; printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });

  /** Extras am Gerät: anfangs offen, wenn schon welche gewählt sind; danach so, wie der Nutzer es aufklappt */
  const anyExtra = (d: FreeSpec['b']['device']) => (d.mode === 'flange' ? d.seal : d.ribs || d.holes || (d.mode === 'over' && ((d.slots && SLOT_SHAPES.has(d.section.shape)) || d.notch)));
  let extrasOpen = $state(anyExtra(spec.b.device));
  /** „Versetzen, knicken, drehen“: anfangs offen, wenn Werte gesetzt sind; danach so, wie der Nutzer es aufklappt (nicht zuklappen, nur weil alles 0 ist) */
  const openMore = new Map<number, boolean>();
  function moreOpen(b: Block) {
    if (!openMore.has(b.id)) openMore.set(b.id, !!(b.type === 'transition' && (b.offset || b.tilt || b.twist)));
    return openMore.get(b.id)!;
  }
  /** Vorlage, die nach Rückfrage geladen werden soll (der eigene Aufbau ginge sonst verloren) */
  let pending = $state<string | null>(null);
  /** Rückfrage oben bei den Vorlagen oder unten beim Zurücksetzen anzeigen (dort, wo geklickt wurde) */
  let pendingAt = $state<'top' | 'bottom'>('top');
  /** Aufbau gegenüber der gewählten Vorlage verändert? */
  const modified = $derived.by(() => {
    const t = TEMPLATES.find((x) => x.id === template);
    return !t || specKey(spec) !== specKey(t.make());
  });
  function pickTemplate(id: string) {
    if (id === template && !modified) return;
    if (modified) {
      pending = id;
      pendingAt = 'top';
    }
    else loadTemplate(id);
  }
  function loadTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    spec = t.make();
    lastFront = spec.b.device.section.d;
    lastShape = spec.b.device.section.shape;
    template = id;
    open = null;
    pending = null;
  }

  /** Querschnitt vor Baustein i (für neue Bausteine und Kurztexte) */
  function sectionBefore(i: number): Section {
    let s: Section = sec('circle', { d: spec.a.d });
    for (let k = 0; k < i; k++) if (spec.blocks[k].type === 'transition' || spec.blocks[k].type === 'step') s = spec.blocks[k].section;
    return s;
  }

  const ADD: { type: BlockType; title: string }[] = [
    { type: 'straight', title: 'Gerades Stück: macht den Adapter länger' },
    { type: 'bend', title: 'Bogen: lenkt um, z. B. um 90°' },
    { type: 'transition', title: 'Übergang: ändert die Form fließend, auch versetzt oder geknickt' },
    { type: 'step', title: 'Absatz: wechselt die Form auf kurzem Weg' },
  ];
  function add(type: BlockType) {
    const cur = sectionBefore(spec.blocks.length);
    const b = newBlock(type, type === 'step' ? { section: { ...cur, d: cur.d + 6, w: cur.w + 6, h: cur.h + 6 } } : {}, cur);
    spec.blocks = [...spec.blocks, b];
    open = b.id;
  }
  function move(i: number, d: number) {
    const a = [...spec.blocks];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    spec.blocks = a;
  }
  function remove(i: number) {
    spec.blocks = spec.blocks.filter((_, k) => k !== i);
  }
  const toggle = (k: number | 'A' | 'B') => (open = open === k ? null : k);

  function summary(b: Block, i: number): string {
    const parts: string[] = [];
    if (b.type === 'straight') parts.push(`${fmt(b.length)} mm lang`);
    if (b.type === 'bend') {
      parts.push(`${fmt(b.angle)}°`, `Radius ${fmt(b.radius)}`);
      if (b.dir) parts.push(`Richtung ${fmt(b.dir)}°`);
    }
    if (b.type === 'transition' || b.type === 'step') parts.push(`${sectionText(sectionBefore(i))} → ${sectionText(b.section)}`);
    if (b.type === 'transition') {
      parts.push(`${fmt(b.length)} mm`);
      if (b.offset) parts.push(`versetzt ${fmt(b.offset)}`);
      if (b.tilt) parts.push(`geknickt ${fmt(b.tilt)}°`);
      if (b.twist) parts.push(`verdreht ${fmt(b.twist)}°`);
    }
    return parts.join(' · ');
  }

  const blockIssues = (i: number) => issues.filter((x) => x.text.includes(`(Baustein ${i + 1})`));
  const bIssues = $derived(issues.filter((x) => x.text.startsWith('Gerät') || x.text.startsWith('Ende B')));
  const otherIssues = $derived(issues.filter((x) => !/\(Baustein \d+\)/.test(x.text) && !x.text.startsWith('Gerät') && !x.text.startsWith('Ende B')));
  /** Felder markieren, die eine Meldung der aufgeklappten Karte (oder des ganzen Aufbaus) betrifft */
  const flagged = $derived.by(() => {
    const idx = typeof open === 'number' ? spec.blocks.findIndex((b) => b.id === open) : -1;
    const list = [...otherIssues, ...(open === 'B' ? bIssues : idx >= 0 ? blockIssues(idx) : [])];
    const m = new Map<string, 'error' | 'warn'>();
    for (const x of list) for (const fx of x.fixes ?? []) for (const f of fx.fields) if (m.get(f) !== 'error') m.set(f, x.level);
    return m;
  });
  setContext('fieldFlag', (label: string) => flagged.get(label) ?? null);
  const strip = (t: string) => t.replace(/^[^:]*\(Baustein \d+\): /, '').replace(/^(Gerät|Ende B): /, '');

  const endName = (t: FreeSpec['b']['type']) => (t === 'device' ? 'Gerät' : t === 'female' ? 'Kupplung' : 'Stecker');
  const aText = $derived(`${spec.a.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.a.d)}`);
  const bText = $derived(
    spec.b.type === 'device' && spec.b.device.mode === 'flange'
      ? `Öffnung ${sectionText(spec.b.device.section)}, mit Flansch${spec.b.device.seal ? ' und Dichtung' : ''}`
      : spec.b.type === 'device'
      ? `${sectionText(spec.b.device.section)}${spec.b.device.section.shape === 'circle' && spec.b.device.dDepth !== spec.b.device.section.d ? `/${fmt(spec.b.device.dDepth)}` : ''}, ${spec.b.device.mode === 'over' ? 'über den Stutzen' : 'in die Öffnung'}, ${fmt(spec.b.device.length)} mm tief`
      : `${spec.b.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.b.d)}`,
  );
  /** Flansch: Ende B liegt immer unten (flache Platte auf dem Bett) */
  const isFlange = $derived(spec.b.type === 'device' && spec.b.device.mode === 'flange');
  function setDeviceMode(m: FreeSpec['b']['device']['mode']) {
    spec.b.device.mode = m;
    if (m === 'flange') spec.bed = 'B';
  }
  /** Werte des Lochbilds nach Maß (für den Vergleich mit der Vorbelegung) */
  const CUSTOM = ['plateW', 'plateH', 'holeX', 'holeY', 'holeNX', 'holeNY', 'plateD', 'holeCircle', 'holeN', 'holeD'] as const;
  const customKey = (o: Partial<FreeSpec['b']['device']>) => JSON.stringify(CUSTOM.map((k) => o[k]));
  /** zuletzt vorbelegte Werte: solange nichts von Hand geändert wurde, laufen sie mit der Öffnung mit */
  let prefilled: string | null = null;
  const freshDefaults = $derived(isFlange && spec.b.device.flangeLayout !== 'auto' ? flangeDefaults(spec.b.device, spec.wall) : null);
  function refill() {
    if (!freshDefaults) return;
    Object.assign(spec.b.device, freshDefaults);
    prefilled = customKey(freshDefaults);
  }
  $effect(() => {
    const d = freshDefaults;
    if (!d || prefilled === null) return;
    const cur = customKey(spec.b.device);
    if (cur === prefilled && customKey(d) !== cur) refill();
  });
  /** Lochbild nach Maß passt nicht mehr zur Öffnung (von Hand geändert): Link zum neu Vorbelegen */
  const stale = $derived(!!freshDefaults && customKey(spec.b.device) !== customKey(freshDefaults));
  /** Lochbild wechseln: Werte nach Maß aus dem automatischen Flansch vorbelegen */
  function setLayout(l: FlangeLayout) {
    const dv = spec.b.device;
    if (l !== 'auto' && dv.flangeLayout === 'auto') {
      const d = flangeDefaults(dv, spec.wall);
      Object.assign(dv, d);
      prefilled = customKey(d);
    }
    dv.flangeLayout = l;
  }
  /** Dichtung braucht etwas mehr Rand: beim Anhaken bzw. breiteren Band passend vergrößern */
  function setSeal(on: boolean, w = spec.b.device.sealW) {
    const dv = spec.b.device;
    dv.seal = on;
    dv.sealW = w;
    if (on && dv.flangeLayout === 'auto') dv.flangeRim = Math.max(dv.flangeRim, flangeMinRim(spec.wall, true, w));
  }
  const flange = $derived(isFlange ? flangeGeom(spec.b.device, spec.wall, false) : null);
  $effect(() => {
    if (isFlange && spec.bed !== 'B') spec.bed = 'B';
  });
  /** Kreis am Gerät: „Ø in der Tiefe“ läuft mit „Ø vorne“ mit, solange beide gleich waren */
  let lastFront = spec.b.device.section.d;
  $effect(() => {
    const d = spec.b.device.section.d;
    if (Math.abs(spec.b.device.dDepth - lastFront) < 1e-9) spec.b.device.dDepth = d;
    lastFront = d;
  });
  /** Zugabe am Gerät: rund 0,2 mm, eckig 0,4 mm (eckige Formen schrumpfen in den Ecken stärker). Nur, solange der Standard drinsteht. */
  let lastShape = spec.b.device.section.shape;
  $effect(() => {
    const shape = spec.b.device.section.shape;
    if (shape === lastShape) return;
    const dv = spec.b.device;
    const want = (s: string) => (s === 'circle' ? 0.2 : 0.4);
    if (Math.abs(dv.allowance - want(lastShape)) < 1e-9) dv.allowance = want(shape);
    lastShape = shape;
  });
</script>

{#snippet confirmBox()}
  {@const t = TEMPLATES.find((x) => x.id === pending)}
  <div class="confirm" class:bottom={pendingAt === 'bottom'} role="alertdialog" aria-label="Vorlage laden" use:reveal>
    <p>Deine Änderungen am Aufbau gehen verloren, wenn du {pending === template ? `auf „${t?.title}“ zurücksetzt` : `„${t?.title}“ lädst`}.</p>
    <div class="confirm-btns">
      <button type="button" class="ghost sm" onclick={() => (pending = null)}>Behalten</button>
      <button type="button" class="next sm" onclick={() => loadTemplate(pending!)}>{pending === template ? 'Zurücksetzen' : 'Vorlage laden'}</button>
    </div>
  </div>
{/snippet}

{#snippet issueList(list: Issue[])}
  {#if list.length}
    <ul class="fi-issues">
      {#each list as x}
        <li class={x.level}>
          {strip(x.text)}
          {#if x.fixes?.length}
            <span class="fixes">{#each x.fixes as fx}<button type="button" class="fix" onclick={() => fx.set(spec)}>{fx.label}</button>{/each}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet chipsWithField(values: number[], get: () => number, set: (v: number) => void)}
  <div class="chips">
    {#each values as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}°</button>{/each}
  </div>
{/snippet}

{#snippet sizeChips(get: () => number, set: (v: number) => void)}
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}</button>{/each}</div>
{/snippet}

<p class="lead">Setze deinen Adapter aus Bausteinen zusammen, vom Anschluss A bis zum Ende B. In der Vorschau liegt {spec.bed === 'A' ? 'A' : 'B'} unten auf dem Druckbett. Jede Änderung ist sofort zu sehen.</p>

<div class="tpl-label">Vorlage als Startpunkt</div>
<div class="tpl" role="radiogroup" aria-label="Vorlage">
  {#each TEMPLATES as t}
    <button type="button" class="tpl-btn" class:sel={template === t.id} role="radio" aria-checked={template === t.id} onclick={() => pickTemplate(t.id)}>
      <strong>{t.title}</strong><small>{t.hint}</small>
    </button>
  {/each}
</div>
{#if pending && pendingAt === 'top'}{@render confirmBox()}{/if}

<ol class="chain">
  <!-- Anschluss A -->
  <li class="card end" class:open={open === 'A'}>
    <button type="button" class="card-head" aria-expanded={open === 'A'} onclick={() => toggle('A')}>
      <span class="badge a">A</span>
      <span class="card-title"><strong>Anschluss A</strong><small>{aText}</small></span>
      <span class="chev" aria-hidden="true"></span>
    </button>
    {#if open === 'A'}
      <div class="card-body">
        <div class="seg wide" role="radiogroup" aria-label="Anschluss A">
          <button type="button" role="radio" aria-checked={spec.a.type === 'female'} class:sel={spec.a.type === 'female'} onclick={() => (spec.a.type = 'female')}>Kupplung (F)</button>
          <button type="button" role="radio" aria-checked={spec.a.type === 'male'} class:sel={spec.a.type === 'male'} onclick={() => (spec.a.type = 'male')}>Stecker (M)</button>
        </div>
        <div class="dia dia-{spec.a.type === 'female' ? 'F' : 'M'}">
          <div class="dia-row">
            {@render sizeChips(() => spec.a.d, (v) => (spec.a.d = v))}
            <NumberField bind:value={spec.a.d} min={15} max={60} step={0.1} label="Innendurchmesser Anschluss A" />
          </div>
        </div>
        <p class="hint">Innendurchmesser in mm. Die Bausteine darunter sind innen genauso weit.</p>
      </div>
    {/if}
  </li>

  <!-- Bausteine -->
  {#each spec.blocks as b, i (b.id)}
    {@const bi = blockIssues(i)}
    <li class="card" class:open={open === b.id} class:has-error={bi.some((x) => x.level === 'error')}>
      <div class="card-head-row">
        <button type="button" class="card-head" aria-expanded={open === b.id} onclick={() => toggle(b.id)}>
          <span class="badge">{i + 1}</span>
          <span class="card-title"><strong>{BLOCK_LABELS[b.type]}</strong><small>{summary(b, i)}</small></span>
          {#if bi.length}<span class="flag" class:err={bi.some((x) => x.level === 'error')} aria-label="Hinweis">!</span>{/if}
          <span class="chev" aria-hidden="true"></span>
        </button>
        <span class="card-tools">
          <button type="button" class="icon" disabled={i === 0} title="Näher zu A" aria-label="{BLOCK_LABELS[b.type]} näher zu Anschluss A" onclick={() => move(i, -1)}><svg viewBox="0 0 16 16"><path d="M3.5 10 8 5.5 12.5 10" /></svg></button>
          <button type="button" class="icon" disabled={i === spec.blocks.length - 1} title="Näher zu B" aria-label="{BLOCK_LABELS[b.type]} näher zu Ende B" onclick={() => move(i, 1)}><svg viewBox="0 0 16 16"><path d="M3.5 6 8 10.5 12.5 6" /></svg></button>
          <button type="button" class="icon x" title="Entfernen" aria-label="{BLOCK_LABELS[b.type]} entfernen" onclick={() => remove(i)}>×</button>
        </span>
      </div>
      {#if open === b.id}
        <div class="card-body">
          <BlockFigure type={b.type} />
          {#if b.type === 'straight'}
            <div class="grid2">
              <Field label="L · Länge"><NumberField bind:value={b.length} min={1} max={300} step={1} label="Länge der Geraden" /></Field>
            </div>
          {:else if b.type === 'bend'}
            <Field label="W · Winkel">
              <div class="row">
                {@render chipsWithField([30, 45, 60, 90], () => b.angle, (v) => (b.angle = v))}
                <span class="num-sm"><NumberField bind:value={b.angle} min={1} max={180} step={5} unit="°" label="Winkel des Bogens" /></span>
              </div>
            </Field>
            <div class="grid2">
              <Field label="R · Radius" help="Abstand vom Drehpunkt bis zur Mitte des Rohrs. Größer ergibt einen sanfteren Bogen: besser für den Luftstrom und leichter zu drucken.">
                <NumberField bind:value={b.radius} min={5} max={500} step={1} label="Radius des Bogens" />
              </Field>
            </div>
            <Field label="Richtung" help="In welche Richtung der Bogen abbiegt. Einfach ausprobieren und in der Vorschau ansehen.">
              <div class="row">
                {@render chipsWithField([0, 90, 180, 270], () => b.dir, (v) => (b.dir = v))}
                <span class="num-sm"><NumberField bind:value={b.dir} min={0} max={359} step={5} unit="°" label="Richtung des Bogens" /></span>
              </div>
            </Field>
          {:else if b.type === 'transition'}
            <p class="hint">Geht fließend von {sectionText(sectionBefore(i))} in eine neue Form über.</p>
            <SectionEditor bind:section={b.section} label="Form am Ende" />
            <div class="grid2">
              <Field label="L · Länge" help="Länger ergibt eine flachere Schräge. Die lässt sich ohne Stützen drucken und bremst die Luft weniger.">
                <NumberField bind:value={b.length} min={2} max={300} step={1} label="Länge des Übergangs" />
              </Field>
            </div>
            <details class="more" open={moreOpen(b)} ontoggle={(e) => openMore.set(b.id, e.currentTarget.open)}>
              <summary>Versetzen, knicken, drehen <small>für geschwungene Formen</small></summary>
              <div class="more-body">
                <div class="grid2">
                  <Field label="V · Versatz" help="Schiebt das Ende zur Seite, zum Beispiel um an einem Hindernis vorbeizukommen.">
                    <NumberField bind:value={b.offset} min={-200} max={200} step={1} label="Versatz des Endes" />
                  </Field>
                  <Field label="K · Knick" help="Neigt das Ende. Zusammen mit dem Versatz ergibt das eine geschwungene Form.">
                    <NumberField bind:value={b.tilt} min={-90} max={90} step={5} unit="°" label="Knick des Endes" />
                  </Field>
                  <Field label="Verdrehung" help="Dreht die Form um die Mitte, zum Beispiel damit eine eckige Haube gerade zum Gerät steht.">
                    <NumberField bind:value={b.twist} min={-180} max={180} step={5} unit="°" label="Verdrehung des Querschnitts" />
                  </Field>
                </div>
                {#if b.offset || b.tilt}
                  <Field label="Richtung" help="In welche Richtung Versatz und Knick zeigen. Einfach ausprobieren und in der Vorschau ansehen.">
                    <div class="row">
                      {@render chipsWithField([0, 90, 180, 270], () => b.dir, (v) => (b.dir = v))}
                      <span class="num-sm"><NumberField bind:value={b.dir} min={0} max={359} step={5} unit="°" label="Richtung von Versatz und Knick" /></span>
                    </div>
                  </Field>
                {/if}
              </div>
            </details>
          {:else}
            <p class="hint">Wechselt von {sectionText(sectionBefore(i))} auf kürzestem Weg in eine neue Form.</p>
            <SectionEditor bind:section={b.section} label="Form nach dem Absatz" />
          {/if}
          {@render issueList(bi)}
        </div>
      {/if}
    </li>
  {/each}

  <li class="add">
    <span class="add-label">Baustein hinzufügen</span>
    <div class="add-btns">
      {#each ADD as a}
        <button type="button" class="add-btn" title={a.title} onclick={() => add(a.type)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>{BLOCK_LABELS[a.type]}
        </button>
      {/each}
    </div>
  </li>

  <!-- Ende B -->
  <li class="card end" class:open={open === 'B'} class:has-error={bIssues.some((x) => x.level === 'error')}>
    <button type="button" class="card-head" aria-expanded={open === 'B'} onclick={() => toggle('B')}>
      <span class="badge b">B</span>
      <span class="card-title"><strong>Ende B · {endName(spec.b.type)}</strong><small>{bText}</small></span>
      {#if bIssues.length}<span class="flag" class:err={bIssues.some((x) => x.level === 'error')} aria-label="Hinweis">!</span>{/if}
      <span class="chev" aria-hidden="true"></span>
    </button>
    {#if open === 'B'}
      <div class="card-body">
        <div class="seg wide" role="radiogroup" aria-label="Ende B">
          <button type="button" role="radio" aria-checked={spec.b.type === 'device'} class:sel={spec.b.type === 'device'} onclick={() => (spec.b.type = 'device')}>Gerät</button>
          <button type="button" role="radio" aria-checked={spec.b.type === 'female'} class:sel={spec.b.type === 'female'} onclick={() => (spec.b.type = 'female')}>Kupplung (F)</button>
          <button type="button" role="radio" aria-checked={spec.b.type === 'male'} class:sel={spec.b.type === 'male'} onclick={() => (spec.b.type = 'male')}>Stecker (M)</button>
        </div>
        {#if spec.b.type === 'device'}
          <div class="seg wide" role="radiogroup" aria-label="Befestigung am Gerät">
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'over'} class:sel={spec.b.device.mode === 'over'} onclick={() => setDeviceMode('over')}>Über den Stutzen</button>
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'into'} class:sel={spec.b.device.mode === 'into'} onclick={() => setDeviceMode('into')}>In die Öffnung</button>
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'flange'} class:sel={spec.b.device.mode === 'flange'} onclick={() => setDeviceMode('flange')}>Mit Flansch</button>
          </div>
          {#if spec.b.device.mode === 'flange'}
          {@const dv = spec.b.device}
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
            {flange?.holes.length ? `${flange.holes.length} Löcher` : 'Löcher'} Ø {fmt(dv.flangeLayout === 'auto' ? AUTO_HOLE_D : dv.holeD)} mm mit Senkung für Senkkopfschrauben{dv.flangeLayout === 'auto' ? ' M4, automatisch verteilt' : ''}. Der Flansch liegt beim Drucken unten auf dem Bett, so geht es ohne Stützen.{#if flange && !flange.errors.length && flangeExtent(dv, spec.wall) >= BRIM_FROM} Bei dieser Plattengröße im Slicer einen Brim einschalten, damit die Ecken flach bleiben.{/if}
          </p>
          {@render issueList(bIssues)}
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
                  <NumberField bind:value={spec.b.transition} min={2} max={150} step={1} label="Übergangslänge zum Flansch" />
                </Field>
                {#if dv.section.shape !== 'circle' || dv.flangeLayout === 'rect'}
                  <Field label="Drehung" help="Dreht Öffnung und Platte um die Mitte, falls sie schräg zum Rest des Adapters stehen.">
                    <NumberField bind:value={dv.rot} min={-180} max={180} step={5} unit="°" label="Drehung des Flanschs" />
                  </Field>
                {/if}
              </div>
            </div>
          </details>
          {:else}
          <MeasureFigure mode={spec.b.device.mode} round={spec.b.device.section.shape === 'circle'} />
          <SectionEditor
            bind:section={spec.b.device.section}
            bind:depth={spec.b.device.dDepth}
            label={spec.b.device.mode === 'over' ? 'Form des Stutzens' : 'Form der Öffnung'}
            measure={spec.b.device.mode}
          />
          <div class="grid2">
            <Field label="Tiefe" help={`Wie weit der Adapter ${spec.b.device.mode === 'over' ? 'über den Stutzen geht' : 'in die Öffnung reicht'}. 20 bis 30 mm halten gut.`}>
              <NumberField bind:value={spec.b.device.length} min={5} max={150} step={1} label="Steckweg" />
            </Field>
          </div>
          {#if spec.b.device.mode === 'into'}
            <label class="inline-check"><input type="checkbox" bind:checked={spec.b.device.collar} /> Rand außen, damit der Adapter nicht zu tief rutscht</label>
          {/if}
          {@render issueList(bIssues)}
          {@const dv = spec.b.device}
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
                <Field label="Luft (Zugabe)" help={`Etwas Spiel, damit der Adapter passt. Geht er nicht ${spec.b.device.mode === 'over' ? 'drauf' : 'hinein'}: erhöhen. Sitzt er zu locker: verringern, bis 0. Bei eckigen Formen eher 0,3 bis 0,5 mm.`}>
                  <NumberField bind:value={spec.b.device.allowance} min={0} max={3} step={0.05} label="Zugabe für den Sitz" />
                </Field>
                <Field label="Übergangslänge" help="Strecke, auf der die Form der Bausteine in die Form am Gerät übergeht. Länger ist flacher und lässt sich besser drucken.">
                  <NumberField bind:value={spec.b.transition} min={2} max={150} step={1} label="Übergangslänge zum Geräteanschluss" />
                </Field>
                {#if spec.b.device.section.shape !== 'circle'}
                  <Field label="Drehung" help="Dreht die Form um die Mitte, falls sie schräg zum Rest des Adapters steht.">
                    <NumberField bind:value={spec.b.device.rot} min={-180} max={180} step={5} unit="°" label="Drehung des Geräteanschlusses" />
                  </Field>
                {/if}
              </div>
              <label class="inline-check"><input type="checkbox" bind:checked={spec.b.device.chamfer} /> Schräge Kante am Rand, erleichtert das {spec.b.device.mode === 'over' ? 'Aufstecken' : 'Einstecken'}</label>
            </div>
          </details>
          {/if}
        {:else}
          <div class="dia dia-{spec.b.type === 'female' ? 'F' : 'M'}">
            <div class="dia-row">
              {@render sizeChips(() => spec.b.d, (v) => (spec.b.d = v))}
              <NumberField bind:value={spec.b.d} min={15} max={60} step={0.1} label="Innendurchmesser Ende B" />
            </div>
          </div>
          <p class="hint">Innendurchmesser in mm.</p>
          {@render issueList(bIssues)}
          <details class="more">
            <summary>Feineinstellungen <small>meist nicht nötig</small></summary>
            <div class="more-body">
              <div class="grid2">
                <Field label="Übergangslänge" help="Ist der Baustein davor nicht rund oder anders weit, geht er auf dieser Strecke in den Anschluss über.">
                  <NumberField bind:value={spec.b.transition} min={2} max={150} step={1} label="Übergangslänge zu Ende B" />
                </Field>
              </div>
            </div>
          </details>
        {/if}
      </div>
    {/if}
  </li>
</ol>

<fieldset class="opt fi-opt">
  <legend>Was liegt beim Drucken unten?</legend>
  {#if isFlange}
  <p class="hint">Der Flansch (Ende B) liegt flach auf dem Druckbett.</p>
  {:else}
  <div class="seg wide" role="radiogroup" aria-label="Was liegt beim Drucken unten">
    <button type="button" role="radio" aria-checked={spec.bed === 'B'} class:sel={spec.bed === 'B'} onclick={() => (spec.bed = 'B')}>Ende B ({endName(spec.b.type)})</button>
    <button type="button" role="radio" aria-checked={spec.bed === 'A'} class:sel={spec.bed === 'A'} onclick={() => (spec.bed = 'A')}>Anschluss A ({spec.a.type === 'female' ? 'Kupplung' : 'Stecker'})</button>
  </div>
  <p class="hint">Dieses Ende liegt flach auf dem Druckbett.</p>
  {/if}
  {#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}
</fieldset>

{@render issueList(otherIssues)}

<details class="more">
  <summary>Wandstärke <small>{fmt(spec.wall)} mm, meist passend</small></summary>
  <div class="more-body">
    <div class="grid2">
      <Field label="Wandstärke" help="Dicke der Wand aller Bausteine. 2,5 bis 3 mm sind stabil. Dünner spart Material, dicker macht den Adapter schwerer.">
        <NumberField bind:value={spec.wall} min={1.6} max={8} step={0.1} label="Wandstärke der Bausteine" />
      </Field>
    </div>
  </div>
</details>

{#if pending && pendingAt === 'bottom'}
  {@render confirmBox()}
{:else}
  <ResetLink
    show={modified}
    label={`Aufbau auf Vorlage „${TEMPLATES.find((x) => x.id === template)?.title ?? TEMPLATES[0].title}“ zurücksetzen`}
    onclick={() => {
      pending = TEMPLATES.some((x) => x.id === template) ? template : TEMPLATES[0].id;
      pendingAt = 'bottom';
    }}
  />
{/if}

<style>
  .tpl-label { font-weight: 600; font-size: 14px; margin: 0 0 8px; }
  .tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 22px; }
  .tpl-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; }
  .tpl-btn strong { font-weight: 600; font-size: 14px; }
  .tpl-btn small { font-size: 12.5px; color: var(--slate-2); }
  .tpl-btn.sel { border-color: var(--sky); background: var(--sky-l); }
  .tpl-btn:not(.sel):hover { border-color: var(--sky); }
  .confirm.bottom { margin: 18px 0 4px; }
  .confirm { margin: -12px 0 22px; padding: 10px 12px; border-radius: 8px; border-left: 4px solid var(--signal); background: #fdf6dc; font-size: 14px; }
  .confirm p { margin: 0 0 8px; }
  .confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .print-note { margin: 10px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: #fdf6dc; }
  .print-note.error { border-left-color: #c4362b; background: #fdecea; color: #8a1f17; }

  .chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; position: relative; }
  /* Verbindungslinie zwischen den Karten: zeigt die Reihenfolge von A nach B */
  .chain::before { content: ''; position: absolute; left: 25px; top: 20px; bottom: 20px; width: 2px; background: var(--line); }
  .card { position: relative; border: 1px solid var(--line); border-radius: 10px; background: #fff; margin: 0 0 8px; }
  .card.open { border-color: var(--sky); }
  .card.has-error { border-color: #d93a2b; }
  .card-head-row { display: flex; align-items: stretch; }
  .card-head { flex: 1; width: 100%; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 0; background: none; text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .card-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .card-title strong { font-weight: 600; font-size: 14.5px; }
  .card-title small { font-size: 12.5px; color: var(--slate-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--mist); border: 1px solid var(--line); font-weight: 600; font-size: 13px; color: var(--slate); }
  .badge.a, .badge.b { background: var(--graphite); border-color: var(--graphite); color: #fff; }
  .chev { flex: none; width: 7px; height: 7px; border-right: 1.8px solid var(--grey); border-bottom: 1.8px solid var(--grey); transform: rotate(45deg); margin: 0 4px 3px; transition: transform 0.15s; }
  .open > .card-head .chev, .open .card-head-row .chev { transform: rotate(-135deg); margin-bottom: -3px; }
  .flag { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--signal); color: #fff; font-weight: 700; font-size: 12px; }
  .flag.err { background: #d93a2b; }
  .card-tools { display: flex; align-items: center; gap: 2px; padding-right: 6px; }
  .icon { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--grey); cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
  .icon svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .icon:hover:not(:disabled) { background: var(--sky-l); color: var(--sky-d); }
  .icon.x:hover { background: #fdecea; color: var(--red); }
  .icon:disabled { opacity: 0.3; cursor: default; }
  .card-body { padding: 4px 16px 16px; border-top: 1px solid var(--line); }
  .card-body :global(.seg.wide) { margin-top: 12px; }
  .card-body > :global(.field), .card-body :global(.more-body > .field) { margin-top: 14px; }
  .card-body :global(.grid2) { margin-top: 14px; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .num-sm { width: 130px; }
  .num-sm :global(.num-in) { width: 100%; }

  .add { position: relative; margin: 2px 0 10px; padding: 10px 12px; border: 1px dashed #c6d0d5; border-radius: 10px; background: var(--mist); }
  .add-label { display: block; font-size: 13px; font-weight: 600; color: var(--slate-2); margin-bottom: 6px; }
  .add-btns { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .add-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 6px; border: 1px solid var(--line); border-radius: 8px; background: #fff; cursor: pointer; font: inherit; font-size: 13.5px; font-weight: 600; }
  .add-btn svg { flex: none; width: 13px; height: 13px; stroke: var(--sky-d); stroke-width: 2; stroke-linecap: round; }
  .add-btn:hover { border-color: var(--sky); }

  .extras { display: flex; flex-direction: column; gap: 12px; }
  /* Beschreibung und Felder beginnen dort, wo der Text neben dem Kästchen beginnt (18 px Kästchen + 10 px Abstand) */
  .x-item { --x-indent: 28px; }
  .x-item :global(.inline-check) { margin: 0; }
  .x-item :global(.inline-check input) { margin: 0; flex: none; }
  .x-item > .hint { margin: 2px 0 0 var(--x-indent); }
  .x-item > :global(.grid2), .x-item > :global(.field) { margin-left: var(--x-indent); }
  .fi-opt { margin-top: 22px; }
  .fi-issues { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .fi-issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .fi-issues li.error { border-left-color: #d93a2b; background: #fdecea; color: #b02a20; }
  @media (max-width: 560px) {
    .add-btns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
