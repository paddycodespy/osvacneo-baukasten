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
  import ResetLink from './ResetLink.svelte';
  import EndEditor from './EndEditor.svelte';
  import IssueList from './IssueList.svelte';
  import { reveal } from '../lib/reveal';
  import { tubeGateDims, GATE_GAP } from '../lib/osvac/gate';
  import { TEMPLATES, planFree, BLOCK_LABELS, newBlock, sec, sectionText, lastSection, extrasLong, specKey, branchGeom, defaultC, SWEEP_FROM, SWEEP_ENTRY, type FreeSpec, type EndSpec, type Block, type BlockType, type Issue, type Section, type Fix } from '../lib/osvac/freeform';

  type Open = number | 'A' | 'B' | 'C' | null;
  let {
    spec = $bindable(),
    issues = [],
    open = $bindable(null),
    template = $bindable('elbow'),
    printNote = null,
  }: { spec: FreeSpec; issues?: Issue[]; open?: Open; template?: string; printNote?: { text: string; level: 'ok' | 'warn' | 'error' } | null } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });

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
    { type: 'branch', title: 'Abzweig: zweiter Abgang (Y oder T) mit eigenem Ende C' },
    { type: 'gate', title: 'Schieber: Platte zum Auf- und Zumachen (Absperrschieber)' },
  ];
  const hasBranch = $derived(spec.blocks.some((b) => b.type === 'branch'));
  /**
   * Gibt es an Ende B bzw. C einen Übergang? (Nur wenn der Baustein davor eine andere Form hat als das Ende; sonst
   * ändert die Übergangslänge nichts und das Feld bleibt weg.) Bei Fehlern im Plan lieber anzeigen.
   */
  const plan = $derived(planFree($state.snapshot(spec)));
  const hasTransition = (tag: 'B' | 'C') => {
    if (plan.issues.some((x) => x.level === 'error')) return true;
    const names = tag === 'B' ? ['Übergang zu Ende B', 'Übergang zum Gerät'] : ['Übergang zu Ende C', 'Übergang zum Gerät C'];
    return plan.bodies.some((b) => names.includes(b.name));
  };
  /** Schieber: Adapter wird in zwei Teilen gedruckt, jedes steht auf seinem Ende */
  const hasGate = $derived(spec.blocks.some((b) => b.type === 'gate'));
  function add(type: BlockType) {
    const cur = sectionBefore(spec.blocks.length);
    let v: Partial<Block> = {};
    if (type === 'step') v = { section: { ...cur, d: cur.d + 6, w: cur.w + 6, h: cur.h + 6 } };
    if (type === 'branch') {
      // Rohr gerade so lang, dass der Abzweig darauf passt; Ende C anlegen, falls noch keins da ist
      const d = cur.shape === 'circle' ? cur.d : 32;
      v = { length: Math.ceil(branchGeom(d, d, spec.wall, 45).minLen), branchD: d };
      if (!spec.c) spec.c = defaultC(d);
    }
    // Schieber: lang genug für das Gehäuse mit seinen Schrägen
    if (type === 'gate' && cur.shape === 'circle') v = { length: Math.max(40, Math.ceil(tubeGateDims(cur.d / 2, cur.d / 2 + spec.wall, spec.gateGap ?? GATE_GAP).minLen)) };
    const b = newBlock(type, v, cur);
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
  const toggle = (k: number | 'A' | 'B' | 'C') => (open = open === k ? null : k);
  const applyFix = (fx: Fix) => fx.set(spec);

  function summary(b: Block, i: number): string {
    const parts: string[] = [];
    if (b.type === 'straight') parts.push(`${fmt(b.length)} mm lang`);
    if (b.type === 'bend') {
      parts.push(`${fmt(b.angle)}°`, `Radius ${fmt(b.radius)}`);
      if (b.dir) parts.push(`Richtung ${fmt(b.dir)}°`);
    }
    if (b.type === 'branch') {
      parts.push(`${fmt(b.angle)}°${b.sweep && b.angle >= SWEEP_FROM ? ' gebogen' : ''}`, `Ø ${fmt(b.branchD)}`, `zu Ende C`);
      if (b.dir) parts.push(`Richtung ${fmt(b.dir)}°`);
    }
    if (b.type === 'gate') {
      parts.push(`${fmt(b.length)} mm lang`);
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
  const cIssues = $derived(issues.filter((x) => x.text.startsWith('Ende C')));
  const otherIssues = $derived(issues.filter((x) => !/\(Baustein \d+\)/.test(x.text) && !/^(Gerät|Ende B|Ende C)/.test(x.text)));
  /** Felder markieren, die eine Meldung der aufgeklappten Karte (oder des ganzen Aufbaus) betrifft */
  const flagged = $derived.by(() => {
    const idx = typeof open === 'number' ? spec.blocks.findIndex((b) => b.id === open) : -1;
    const list = [...otherIssues, ...(open === 'B' ? bIssues : open === 'C' ? cIssues : idx >= 0 ? blockIssues(idx) : [])];
    const m = new Map<string, 'error' | 'warn'>();
    for (const x of list) for (const fx of x.fixes ?? []) for (const f of fx.fields) if (m.get(f) !== 'error') m.set(f, x.level);
    return m;
  });
  setContext('fieldFlag', (label: string) => flagged.get(label) ?? null);

  const endName = (t: FreeSpec['b']['type']) => (t === 'device' ? 'Gerät' : t === 'female' ? 'Kupplung' : t === 'nozzle' ? 'Düse' : 'Stecker');
  const aText = $derived(`${spec.a.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.a.d)}`);
  const endText = (E: EndSpec) =>
    E.type === 'nozzle'
      ? [`${sectionText(lastSection(spec))}`, E.tip && E.tip.angle > 0 ? `schräg ${fmt(E.tip.angle)}°` : 'gerade', ...extrasLong(spec)].join(', ')
      : E.type === 'device' && E.device.mode === 'flange'
      ? `Öffnung ${sectionText(E.device.section)}, mit Flansch${E.device.seal ? ' und Dichtung' : ''}`
      : E.type === 'device'
      ? `${sectionText(E.device.section)}${E.device.section.shape === 'circle' && E.device.dDepth !== E.device.section.d ? `/${fmt(E.device.dDepth)}` : ''}, ${E.device.mode === 'over' ? 'über den Stutzen' : 'in die Öffnung'}, ${fmt(E.device.length)} mm tief`
      : `${E.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(E.d)}`;
  const bText = $derived(endText(spec.b));
  /** Flansch: Ende B liegt immer unten (flache Platte auf dem Bett) */
  const isFlange = $derived(spec.b.type === 'device' && spec.b.device.mode === 'flange');
  $effect(() => {
    if (isFlange && spec.bed !== 'B') spec.bed = 'B';
  });
  /** Düse: Anschluss A steht auf dem Bett, die Spitze zeigt nach oben */
  const isNozzle = $derived(spec.b.type === 'nozzle');
  $effect(() => {
    if (isNozzle && spec.bed !== 'A') spec.bed = 'A';
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

{#snippet chipsWithField(values: number[], get: () => number, set: (v: number) => void)}
  <div class="chips">
    {#each values as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}°</button>{/each}
  </div>
{/snippet}

{#snippet sizeChips(get: () => number, set: (v: number) => void)}
  <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={get() === v} onclick={() => set(v)}>{v}</button>{/each}</div>
{/snippet}

<p class="lead">Setze deinen Adapter aus Bausteinen zusammen, vom Anschluss A bis zum Ende B{hasBranch ? ', mit dem Abzweig zu Ende C' : ''}. {hasGate ? 'Mit Schieber wird er in zwei Teilen gedruckt, in der Vorschau stehen sie nebeneinander.' : `In der Vorschau liegt ${spec.bed === 'A' ? 'A' : 'B'} unten auf dem Druckbett.`} Jede Änderung ist sofort zu sehen.</p>

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
          {:else if b.type === 'branch'}
            <Field label="W · Winkel" help="Winkel zwischen Rohr und Abzweig. 45° ergibt ein Y-Stück, 90° ein T-Stück. Ein kleinerer Winkel bremst die Luft weniger und druckt sich leichter.">
              <div class="row">
                {@render chipsWithField([30, 45, 60, 90], () => b.angle, (v) => (b.angle = v))}
                <span class="num-sm"><NumberField bind:value={b.angle} min={30} max={90} step={5} unit="°" label="Winkel des Abzweigs" /></span>
              </div>
            </Field>
            {#if b.angle >= SWEEP_FROM}
              <label class="inline-check"><input type="checkbox" bind:checked={b.sweep} /> Gebogen: erst unter {SWEEP_ENTRY}° aus dem Rohr, dann im Bogen auf {fmt(b.angle)}°. Die Luft wird weniger gebremst.</label>
            {/if}
            <div class="grid2">
              <Field label="Ø · Abzweig" help="Innendurchmesser des Abzweigs, höchstens so weit wie das Rohr.">
                <NumberField bind:value={b.branchD} min={10} max={60} step={0.1} label="Innendurchmesser des Abzweigs" />
              </Field>
              <Field label="L · Länge" help="Länge des Rohrs, auf dem der Abzweig sitzt. Der Abzweig sitzt immer in der Mitte.">
                <NumberField bind:value={b.length} min={10} max={300} step={1} label="Länge am Abzweig" />
              </Field>
              <Field label="Länge des Abzweigs" help="Wie weit der Abzweig über das Rohr hinausragt, bevor Ende C beginnt. Beim gebogenen Abzweig: das gerade Stück nach dem Bogen.">
                <NumberField bind:value={b.branchLen} min={3} max={200} step={1} label="Länge des Abzweigs" />
              </Field>
            </div>
            <Field label="Richtung" help="In welche Richtung der Abzweig zeigt. Einfach ausprobieren und in der Vorschau ansehen.">
              <div class="row">
                {@render chipsWithField([0, 90, 180, 270], () => b.dir, (v) => (b.dir = v))}
                <span class="num-sm"><NumberField bind:value={b.dir} min={0} max={359} step={5} unit="°" label="Richtung des Abzweigs" /></span>
              </div>
            </Field>
            <p class="hint">Der Sauger gehört an Anschluss A. Nur dann biegt die Luft aus Ende C {b.sweep && b.angle >= SWEEP_FROM ? 'sanft im Bogen' : `um ${fmt(b.angle)}°`} in den Hauptstrom ein; hängt er an B, müsste sie fast umkehren. Die Kante an der Einmündung wird innen ausgerundet.</p>
            <p class="hint">Rohr und Abzweig sind rund. Den Anschluss am Abzweig stellst du unten bei „Ende C“ ein. Am besten druckt sich der Abzweig, wenn er beim Drucken nach oben zeigt.</p>
          {:else if b.type === 'gate'}
            <div class="grid2">
              <Field label="L · Länge" help="Länge des Rohrs mit dem Rahmen in der Mitte. Der Rahmen braucht je nach Ø eine Mindestlänge.">
                <NumberField bind:value={b.length} min={10} max={300} step={1} label="Länge des Schiebers" />
              </Field>
            </div>
            <Field label="Richtung" help="In welche Richtung die Platte herausgezogen wird. Die Platte passt von beiden Seiten, 0° und 180° sind also gleich.">
              <div class="row">
                {@render chipsWithField([0, 45, 90, 135], () => b.dir, (v) => (b.dir = v))}
                <span class="num-sm"><NumberField bind:value={b.dir} min={0} max={359} step={5} unit="°" label="Richtung der Schieberplatte" /></span>
              </div>
            </Field>
            <p class="hint">Die Platte wird flach neben dem Adapter gedruckt und danach in den Schlitz geschoben. Sie rastet bei „auf“ und „zu“ ein; der dicke Griff und eine federnde Nase verhindern, dass sie herausrutscht. Am besten druckt sich der Schieber, wenn das Rohr senkrecht steht. Vor dem Schieber muss das Rohr rund sein.</p>
          {:else}
            <p class="hint">Wechselt von {sectionText(sectionBefore(i))} auf kürzestem Weg in eine neue Form.</p>
            <SectionEditor bind:section={b.section} label="Form nach dem Absatz" />
          {/if}
          <IssueList list={bi} apply={applyFix} />
        </div>
      {/if}
    </li>
  {/each}

  <li class="add">
    <span class="add-label">Baustein hinzufügen</span>
    <div class="add-btns">
      {#each ADD as a}
        <button type="button" class="add-btn" title={a.type === 'branch' && hasBranch ? 'Es geht nur ein Abzweig je Adapter' : a.title} disabled={a.type === 'branch' && hasBranch} onclick={() => add(a.type)}>
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
        <EndEditor bind:end={spec.b} wall={spec.wall} tag="B" issues={bIssues} apply={applyFix} onflange={() => (spec.bed = 'B')} onnozzle={() => (spec.bed = 'A')} transition={hasTransition('B')} />
      </div>
    {/if}
  </li>

  <!-- Ende C am Abzweig -->
  {#if hasBranch && spec.c}
    <li class="card end" class:open={open === 'C'} class:has-error={cIssues.some((x) => x.level === 'error')}>
      <button type="button" class="card-head" aria-expanded={open === 'C'} onclick={() => toggle('C')}>
        <span class="badge b">C</span>
        <span class="card-title"><strong>Ende C · {endName(spec.c.type)}</strong><small>am Abzweig · {endText(spec.c)}</small></span>
        {#if cIssues.length}<span class="flag" class:err={cIssues.some((x) => x.level === 'error')} aria-label="Hinweis">!</span>{/if}
        <span class="chev" aria-hidden="true"></span>
      </button>
      {#if open === 'C'}
        <div class="card-body">
          <EndEditor bind:end={spec.c} wall={spec.wall} tag="C" issues={cIssues} apply={applyFix} transition={hasTransition('C')} />
        </div>
      {/if}
    </li>
  {/if}
</ol>

<fieldset class="opt fi-opt">
  <legend>Was liegt beim Drucken unten?</legend>
  {#if hasGate}
  <p class="hint">Mit Schieber wird der Adapter am Schieber geteilt und in zwei Teilen gedruckt: das Teil mit Anschluss A steht auf A, das Teil mit Ende B auf B. Die Trennflächen zeigen nach oben.</p>
  {:else if isFlange}
  <p class="hint">Der Flansch (Ende B) liegt flach auf dem Druckbett.</p>
  {:else if isNozzle}
  <p class="hint">Anschluss A ({spec.a.type === 'female' ? 'Kupplung' : 'Stecker'}) steht auf dem Druckbett, die Düsenspitze zeigt nach oben.</p>
  {:else}
  <div class="seg wide" role="radiogroup" aria-label="Was liegt beim Drucken unten">
    <button type="button" role="radio" aria-checked={spec.bed === 'B'} class:sel={spec.bed === 'B'} onclick={() => (spec.bed = 'B')}>Ende B ({endName(spec.b.type)})</button>
    <button type="button" role="radio" aria-checked={spec.bed === 'A'} class:sel={spec.bed === 'A'} onclick={() => (spec.bed = 'A')}>Anschluss A ({spec.a.type === 'female' ? 'Kupplung' : 'Stecker'})</button>
  </div>
  <p class="hint">Dieses Ende liegt flach auf dem Druckbett.</p>
  {/if}
  {#if printNote}<p class="print-note {printNote.level}" role="status">{printNote.text}</p>{/if}
</fieldset>

<IssueList list={otherIssues} apply={applyFix} />

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
  .add-btns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .add-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 6px; border: 1px solid var(--line); border-radius: 8px; background: #fff; cursor: pointer; font: inherit; font-size: 13.5px; font-weight: 600; }
  .add-btn svg { flex: none; width: 13px; height: 13px; stroke: var(--sky-d); stroke-width: 2; stroke-linecap: round; }
  .add-btn:hover:not(:disabled) { border-color: var(--sky); }
  .add-btn:disabled { opacity: 0.45; cursor: default; }

  .fi-opt { margin-top: 22px; }
  @media (max-width: 560px) {
    .add-btns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
