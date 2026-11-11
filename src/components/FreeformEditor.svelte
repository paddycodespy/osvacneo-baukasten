<script lang="ts">
  /**
   * Schritt „Aufbau“ des Freiform-Adapters: Vorlage, Anschluss A, Bausteine (von oben nach unten), Ende B, Druckbett.
   * Immer nur ein Baustein ist aufgeklappt; zugeklappt zeigt jeder Baustein eine Kurzfassung seiner Maße.
   * Erklärungen stehen hinter dem „?“ am Feld, selten gebrauchte Werte in den Feineinstellungen.
   */
  import NumberField from './NumberField.svelte';
  import Field from './Field.svelte';
  import SectionEditor from './SectionEditor.svelte';
  import BlockFigure from './BlockFigure.svelte';
  import MeasureFigure from './MeasureFigure.svelte';
  import { TEMPLATES, BLOCK_LABELS, newBlock, sec, sectionText, specKey, type FreeSpec, type Block, type BlockType, type Issue, type Section } from '../lib/osvac/freeform';

  type Open = number | 'A' | 'B' | null;
  let {
    spec = $bindable(),
    issues = [],
    open = $bindable(null),
    template = $bindable('elbow'),
    printNote = null,
  }: { spec: FreeSpec; issues?: Issue[]; open?: Open; template?: string; printNote?: { text: string; level: 'ok' | 'warn' } | null } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });

  /** Vorlage, die nach Rückfrage geladen werden soll (der eigene Aufbau ginge sonst verloren) */
  let pending = $state<string | null>(null);
  /** Aufbau gegenüber der gewählten Vorlage verändert? */
  const modified = $derived.by(() => {
    const t = TEMPLATES.find((x) => x.id === template);
    return !t || specKey(spec) !== specKey(t.make());
  });
  function pickTemplate(id: string) {
    if (id === template && !modified) return;
    if (modified) pending = id;
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
  const strip = (t: string) => t.replace(/^[^:]*\(Baustein \d+\): /, '').replace(/^(Gerät|Ende B): /, '');

  const endName = (t: FreeSpec['b']['type']) => (t === 'device' ? 'Gerät' : t === 'female' ? 'Kupplung' : 'Stecker');
  const aText = $derived(`${spec.a.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.a.d)}`);
  const bText = $derived(
    spec.b.type === 'device'
      ? `${sectionText(spec.b.device.section)}${spec.b.device.section.shape === 'circle' && spec.b.device.dDepth !== spec.b.device.section.d ? `/${fmt(spec.b.device.dDepth)}` : ''}, ${spec.b.device.mode === 'over' ? 'über den Stutzen' : 'in die Öffnung'}, ${fmt(spec.b.device.length)} mm tief`
      : `${spec.b.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.b.d)}`,
  );
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

{#snippet issueList(list: Issue[])}
  {#if list.length}
    <ul class="fi-issues">
      {#each list as x}<li class={x.level}>{strip(x.text)}</li>{/each}
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

<p class="lead">Setze deinen Adapter aus Bausteinen zusammen, von oben (A) nach unten (B). Die Vorschau zeigt jede Änderung sofort.</p>

<div class="tpl-label">Vorlage als Startpunkt</div>
<div class="tpl" role="radiogroup" aria-label="Vorlage">
  {#each TEMPLATES as t}
    <button type="button" class="tpl-btn" class:sel={template === t.id} role="radio" aria-checked={template === t.id} onclick={() => pickTemplate(t.id)}>
      <strong>{t.title}</strong><small>{t.hint}</small>
    </button>
  {/each}
</div>
{#if pending}
  {@const t = TEMPLATES.find((x) => x.id === pending)}
  <div class="confirm" role="alertdialog" aria-label="Vorlage laden">
    <p>Deine Änderungen am Aufbau gehen verloren, wenn du {pending === template ? 'die Vorlage neu lädst' : `„${t?.title}“ lädst`}.</p>
    <div class="confirm-btns">
      <button type="button" class="ghost sm" onclick={() => (pending = null)}>Behalten</button>
      <button type="button" class="next sm" onclick={() => loadTemplate(pending!)}>Vorlage laden</button>
    </div>
  </div>
{:else if modified}
  <p class="tpl-note">Aufbau geändert. Ein Klick auf eine Vorlage fragt vorher nach.</p>
{/if}

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
          <button type="button" class="icon" disabled={i === 0} title="Nach oben" aria-label="{BLOCK_LABELS[b.type]} nach oben" onclick={() => move(i, -1)}><svg viewBox="0 0 16 16"><path d="M3.5 10 8 5.5 12.5 10" /></svg></button>
          <button type="button" class="icon" disabled={i === spec.blocks.length - 1} title="Nach unten" aria-label="{BLOCK_LABELS[b.type]} nach unten" onclick={() => move(i, 1)}><svg viewBox="0 0 16 16"><path d="M3.5 6 8 10.5 12.5 6" /></svg></button>
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
            <Field label="Richtung" help="In welche Richtung der Bogen abbiegt. Der blaue Pfeil in der Vorschau zeigt die Richtung an.">
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
            <details class="more" open={!!(b.offset || b.tilt || b.twist)}>
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
                  <Field label="Richtung" help="In welche Richtung Versatz und Knick zeigen. Der blaue Pfeil in der Vorschau zeigt die Richtung an.">
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
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'over'} class:sel={spec.b.device.mode === 'over'} onclick={() => (spec.b.device.mode = 'over')}>Über den Stutzen</button>
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'into'} class:sel={spec.b.device.mode === 'into'} onclick={() => (spec.b.device.mode = 'into')}>In die Öffnung</button>
          </div>
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
  <div class="seg wide" role="radiogroup" aria-label="Was liegt beim Drucken unten">
    <button type="button" role="radio" aria-checked={spec.bed === 'B'} class:sel={spec.bed === 'B'} onclick={() => (spec.bed = 'B')}>Ende B ({endName(spec.b.type)})</button>
    <button type="button" role="radio" aria-checked={spec.bed === 'A'} class:sel={spec.bed === 'A'} onclick={() => (spec.bed = 'A')}>Anschluss A ({spec.a.type === 'female' ? 'Kupplung' : 'Stecker'})</button>
  </div>
  <p class="hint">Dieses Ende liegt flach auf dem Druckbett.</p>
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

<style>
  .tpl-label { font-weight: 600; font-size: 14px; margin: 0 0 8px; }
  .tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 22px; }
  .tpl-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; }
  .tpl-btn strong { font-weight: 600; font-size: 14px; }
  .tpl-btn small { font-size: 12.5px; color: var(--slate-2); }
  .tpl-btn.sel { border-color: var(--sky); background: var(--sky-l); }
  .tpl-btn:not(.sel):hover { border-color: var(--sky); }
  .tpl-note { margin: -14px 0 22px; font-size: 13px; color: var(--slate-2); }
  .confirm { margin: -12px 0 22px; padding: 10px 12px; border-radius: 8px; border-left: 4px solid var(--signal); background: #fdf6dc; font-size: 14px; }
  .confirm p { margin: 0 0 8px; }
  .confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .print-note { margin: 10px 0 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; border-left: 4px solid var(--sky); background: var(--sky-l); }
  .print-note.warn { border-left-color: var(--signal); background: #fdf6dc; }

  .chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; position: relative; }
  /* Verbindungslinie zwischen den Karten: zeigt die Reihenfolge von oben nach unten */
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

  .fi-opt { margin-top: 22px; }
  .fi-issues { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .fi-issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .fi-issues li.error { border-left-color: #d93a2b; background: #fdecea; color: #b02a20; }
  @media (max-width: 560px) {
    .add-btns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
