<script lang="ts">
  /**
   * Schritt „Aufbau“ des Freiform-Adapters: Vorlage, Anschluss A, Bausteine (von oben nach unten), Ende B, Druckbett.
   * Immer nur ein Baustein ist aufgeklappt; zugeklappt zeigt jeder Baustein eine Kurzfassung seiner Maße.
   */
  import NumberField from './NumberField.svelte';
  import SectionEditor from './SectionEditor.svelte';
  import BlockFigure from './BlockFigure.svelte';
  import MeasureFigure from './MeasureFigure.svelte';
  import { TEMPLATES, BLOCK_LABELS, newBlock, sec, sectionText, type FreeSpec, type Block, type BlockType, type Issue, type Section } from '../lib/osvac/freeform';

  let { spec = $bindable(), issues = [] }: { spec: FreeSpec; issues?: Issue[] } = $props();

  const SIZES = [25, 32, 36, 40, 50];
  const fmt = (v: number, d = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: d });

  /** aufgeklappter Bereich: Baustein-ID, 'A', 'B' oder nichts */
  let open = $state<number | 'A' | 'B' | null>(null);
  let template = $state('elbow');

  function loadTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    spec = t.make();
    lastFront = spec.b.device.section.d;
    template = id;
    open = null;
  }

  /** Querschnitt vor Baustein i (für neue Bausteine und Kurztexte) */
  function sectionBefore(i: number): Section {
    let s: Section = sec('circle', { d: spec.a.d });
    for (let k = 0; k < i; k++) if (spec.blocks[k].type === 'transition' || spec.blocks[k].type === 'step') s = spec.blocks[k].section;
    return s;
  }

  const ADD: { type: BlockType; hint: string }[] = [
    { type: 'straight', hint: 'verlängert' },
    { type: 'bend', hint: 'biegt um' },
    { type: 'transition', hint: 'ändert Form, Versatz' },
    { type: 'step', hint: 'Form wechseln, kurz' },
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
    if (b.type === 'straight') parts.push(`${fmt(b.length)} mm`);
    if (b.type === 'bend') {
      parts.push(`${fmt(b.angle)}°`, `R ${fmt(b.radius)}`);
      if (b.dir) parts.push(`Richtung ${fmt(b.dir)}°`);
    }
    if (b.type === 'transition' || b.type === 'step') {
      const from = sectionText(sectionBefore(i));
      parts.push(`${from} → ${sectionText(b.section)}`);
    }
    if (b.type === 'transition') {
      parts.push(`${fmt(b.length)} mm`);
      if (b.offset) parts.push(`Versatz ${fmt(b.offset)}`);
      if (b.tilt) parts.push(`Knick ${fmt(b.tilt)}°`);
      if (b.twist) parts.push(`verdreht ${fmt(b.twist)}°`);
    }
    return parts.join(' · ');
  }

  const blockIssues = (i: number) => issues.filter((x) => x.text.includes(`(Baustein ${i + 1})`));
  const bIssues = $derived(issues.filter((x) => x.text.startsWith('Gerät') || x.text.startsWith('Ende B')));
  const otherIssues = $derived(issues.filter((x) => !/\(Baustein \d+\)/.test(x.text) && !x.text.startsWith('Gerät') && !x.text.startsWith('Ende B')));
  const strip = (t: string) => t.replace(/^[^:]*\(Baustein \d+\): /, '').replace(/^(Gerät|Ende B): /, '');

  const endName = (t: FreeSpec['b']['type']) => (t === 'device' ? 'Geräteanschluss' : t === 'female' ? 'Kupplung' : 'Stecker');
  const aText = $derived(`${spec.a.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.a.d)}`);
  const bText = $derived(
    spec.b.type === 'device'
      ? `${spec.b.device.mode === 'over' ? 'aufgesteckt' : 'eingesteckt'}, ${sectionText(spec.b.device.section)}${spec.b.device.section.shape === 'circle' && spec.b.device.dDepth !== spec.b.device.section.d ? `/${fmt(spec.b.device.dDepth)}` : ''}, ${fmt(spec.b.device.length)} mm tief`
      : `${spec.b.type === 'female' ? 'Kupplung F' : 'Stecker M'}${fmt(spec.b.d)}`,
  );
  /** Kreis am Gerät: „Ø in der Tiefe“ bleibt beim Ändern von „Ø vorne“ gleich, solange beide gleich waren */
  let lastFront = spec.b.device.section.d;
  $effect(() => {
    const d = spec.b.device.section.d;
    if (Math.abs(spec.b.device.dDepth - lastFront) < 1e-9) spec.b.device.dDepth = d;
    lastFront = d;
  });
</script>

{#snippet issueList(list: Issue[])}
  {#if list.length}
    <ul class="fi-issues">
      {#each list as x}<li class={x.level}>{strip(x.text)}</li>{/each}
    </ul>
  {/if}
{/snippet}

{#snippet dirField(b: Block, label: string)}
  <div class="field">
    <span class="field-label">{label}</span>
    <div class="dir-row">
      <div class="chips">
        {#each [0, 90, 180, 270] as v}<button type="button" class="chip" class:sel={b.dir === v} onclick={() => (b.dir = v)}>{v}°</button>{/each}
      </div>
      <NumberField bind:value={b.dir} min={0} max={359} step={5} unit="°" label={label} />
    </div>
  </div>
{/snippet}

<p class="lead">Den Adapter von oben nach unten zusammenstecken: <strong>Anschluss A</strong>, dann beliebig viele <strong>Bausteine</strong>, zum Schluss <strong>Ende B</strong>. Die Vorschau zeigt jede Änderung.</p>

<details class="box fi-help">
  <summary>So geht's</summary>
  <ol class="tips">
    <li>Eine Vorlage wählen, die dem Ziel am nächsten kommt. Alles lässt sich danach ändern.</li>
    <li>Einen Baustein anklicken, um seine Maße zu sehen. Mit den Pfeilen ändert sich die Reihenfolge, mit × fällt er weg.</li>
    <li>Am Ende B das Gerät eintragen: Form des Stutzens oder der Öffnung wählen und mit dem Messschieber messen.</li>
    <li>In der Vorschau prüfen. „Schnitt“ zeigt den Luftweg innen. Hinweise in Gelb sind Empfehlungen, rote müssen behoben werden.</li>
  </ol>
</details>

<div class="tpl" role="radiogroup" aria-label="Vorlage">
  {#each TEMPLATES as t}
    <button type="button" class="tpl-btn" class:sel={template === t.id} role="radio" aria-checked={template === t.id} onclick={() => loadTemplate(t.id)}>
      <strong>{t.title}</strong><small>{t.hint}</small>
    </button>
  {/each}
</div>

<ol class="chain">
  <!-- Anschluss A -->
  <li class="card end" class:open={open === 'A'}>
    <button type="button" class="card-head" aria-expanded={open === 'A'} onclick={() => toggle('A')}>
      <span class="badge a">A</span>
      <span class="card-title"><strong>Anschluss A</strong><small>{aText}, oben</small></span>
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
            <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={spec.a.d === v} onclick={() => (spec.a.d = v)}>{v}</button>{/each}</div>
            <NumberField bind:value={spec.a.d} min={15} max={60} step={0.1} label="Innendurchmesser Anschluss A" />
          </div>
        </div>
        <p class="hint">Der Anschluss von osVAC neo wie bei den anderen Adaptern. Die Formstücke beginnen mit demselben Innendurchmesser; ein kurzer Konus (8 mm) führt außen auf die Wandstärke darunter.</p>
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
          <button type="button" class="icon" disabled={i === 0} aria-label="{BLOCK_LABELS[b.type]} nach oben" onclick={() => move(i, -1)}><svg viewBox="0 0 16 16"><path d="M3.5 10 8 5.5 12.5 10" /></svg></button>
          <button type="button" class="icon" disabled={i === spec.blocks.length - 1} aria-label="{BLOCK_LABELS[b.type]} nach unten" onclick={() => move(i, 1)}><svg viewBox="0 0 16 16"><path d="M3.5 6 8 10.5 12.5 6" /></svg></button>
          <button type="button" class="icon x" aria-label="{BLOCK_LABELS[b.type]} entfernen" onclick={() => remove(i)}>×</button>
        </span>
      </div>
      {#if open === b.id}
        <div class="card-body">
          <BlockFigure type={b.type} />
          {#if b.type === 'straight'}
            <div class="grid2">
              <div class="field"><span class="field-label">Länge</span><NumberField bind:value={b.length} min={1} max={300} step={1} label="Länge der Geraden" /></div>
            </div>
            <p class="hint">Verlängert den Adapter. Der Querschnitt bleibt gleich.</p>
          {:else if b.type === 'bend'}
            <div class="field">
              <span class="field-label">Winkel</span>
              <div class="dir-row">
                <div class="chips">{#each [30, 45, 60, 90] as v}<button type="button" class="chip" class:sel={b.angle === v} onclick={() => (b.angle = v)}>{v}°</button>{/each}</div>
                <NumberField bind:value={b.angle} min={1} max={180} step={5} unit="°" label="Winkel des Bogens" />
              </div>
            </div>
            <div class="grid2">
              <div class="field"><span class="field-label">Radius</span><NumberField bind:value={b.radius} min={5} max={500} step={1} label="Radius des Bogens" /></div>
            </div>
            {@render dirField(b, 'Richtung')}
            <p class="hint"><strong>Radius:</strong> von der Mittellinie bis zum Drehpunkt. Größer ist sanfter für den Luftstrom und druckt sich besser; zu klein schneidet sich der Bogen innen selbst.</p>
            <p class="hint"><strong>Richtung:</strong> dreht die Biegung um die Mittellinie. 0° und 180° biegen in entgegengesetzte Richtungen. Am einfachsten ausprobieren und in der Vorschau ansehen.</p>
          {:else if b.type === 'transition'}
            <SectionEditor bind:section={b.section} label="Querschnitt am Ende" />
            <div class="grid2">
              <div class="field"><span class="field-label">Länge</span><NumberField bind:value={b.length} min={2} max={300} step={1} label="Länge des Übergangs" /></div>
              <div class="field"><span class="field-label">Verdrehung</span><NumberField bind:value={b.twist} min={-180} max={180} step={5} unit="°" label="Verdrehung des Querschnitts" /></div>
              <div class="field"><span class="field-label">Versatz</span><NumberField bind:value={b.offset} min={-200} max={200} step={1} label="Versatz des Endes" /></div>
              <div class="field"><span class="field-label">Knick</span><NumberField bind:value={b.tilt} min={-90} max={90} step={5} unit="°" label="Knick des Endes" /></div>
            </div>
            {#if b.offset || b.tilt}{@render dirField(b, 'Richtung von Versatz und Knick')}{/if}
            <p class="hint">Geht auf der angegebenen Länge fließend vom bisherigen Querschnitt <strong>{sectionText(sectionBefore(i))}</strong> in den neuen über.</p>
            <p class="hint"><strong>Versatz</strong> schiebt das Ende seitlich, <strong>Knick</strong> neigt es; zusammen ergibt sich eine geschwungene Form wie ein S. <strong>Verdrehung</strong> dreht den Querschnitt um die Mittellinie, z. B. um eine Haube auszurichten.</p>
          {:else}
            <SectionEditor bind:section={b.section} label="Querschnitt nach dem Absatz" />
            <p class="hint">Wechselt den Querschnitt von <strong>{sectionText(sectionBefore(i))}</strong> auf kürzestem Weg. Die Schräge hat 45° und druckt sich damit ohne Stützen.</p>
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
        <button type="button" class="add-btn" onclick={() => add(a.type)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
          <span><strong>{BLOCK_LABELS[a.type]}</strong><small>{a.hint}</small></span>
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
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'over'} class:sel={spec.b.device.mode === 'over'} onclick={() => (spec.b.device.mode = 'over')}>Adapter wird aufgesteckt</button>
            <button type="button" role="radio" aria-checked={spec.b.device.mode === 'into'} class:sel={spec.b.device.mode === 'into'} onclick={() => (spec.b.device.mode = 'into')}>Adapter wird eingesteckt</button>
          </div>
          <MeasureFigure mode={spec.b.device.mode} round={spec.b.device.section.shape === 'circle'} />
          <SectionEditor
            bind:section={spec.b.device.section}
            bind:depth={spec.b.device.dDepth}
            label={spec.b.device.mode === 'over' ? 'Stutzen am Gerät' : 'Öffnung am Gerät'}
            measure={spec.b.device.mode}
          />
          <div class="grid2">
            <div class="field"><span class="field-label">Tiefe (Steckweg)</span><NumberField bind:value={spec.b.device.length} min={5} max={150} step={1} label="Steckweg" /></div>
            <div class="field"><span class="field-label">Zugabe (Sitz)</span><NumberField bind:value={spec.b.device.allowance} min={0} max={3} step={0.05} label="Zugabe für den Sitz" /></div>
            <div class="field"><span class="field-label">Übergangslänge</span><NumberField bind:value={spec.b.transition} min={2} max={150} step={1} label="Übergangslänge zum Geräteanschluss" /></div>
            {#if spec.b.device.section.shape !== 'circle'}
              <div class="field"><span class="field-label">Drehung</span><NumberField bind:value={spec.b.device.rot} min={-180} max={180} step={5} unit="°" label="Drehung des Geräteanschlusses" /></div>
            {/if}
          </div>
          <label class="inline-check"><input type="checkbox" bind:checked={spec.b.device.chamfer} /> Einführfase am Rand (erleichtert das {spec.b.device.mode === 'over' ? 'Aufstecken' : 'Einstecken'})</label>
          {#if spec.b.device.mode === 'into'}
            <label class="inline-check"><input type="checkbox" bind:checked={spec.b.device.collar} /> Anschlagring außen (3 mm breit, verhindert zu tiefes Einstecken)</label>
          {/if}
          <p class="hint"><strong>Zugabe:</strong> Luft zwischen Adapter und {spec.b.device.mode === 'over' ? 'Stutzen' : 'Öffnung'}. Größer, wenn der Adapter nicht {spec.b.device.mode === 'over' ? 'draufpasst' : 'hineinpasst'}, kleiner (bis 0), wenn er zu locker sitzt. Bei eckigen Formen eher 0,3–0,5 mm.</p>
          <p class="hint"><strong>Übergangslänge:</strong> Strecke, auf der der Querschnitt der Bausteine in den Geräteanschluss übergeht. Länger ist flacher und druckt sich besser.</p>
        {:else}
          <div class="dia dia-{spec.b.type === 'female' ? 'F' : 'M'}">
            <div class="dia-row">
              <div class="chips">{#each SIZES as v}<button type="button" class="chip" class:sel={spec.b.d === v} onclick={() => (spec.b.d = v)}>{v}</button>{/each}</div>
              <NumberField bind:value={spec.b.d} min={15} max={60} step={0.1} label="Innendurchmesser Ende B" />
            </div>
          </div>
          <div class="grid2">
            <div class="field"><span class="field-label">Übergangslänge</span><NumberField bind:value={spec.b.transition} min={2} max={150} step={1} label="Übergangslänge zu Ende B" /></div>
          </div>
          <p class="hint">Ist der Querschnitt davor nicht rund mit {fmt(spec.b.d)} mm, geht er auf der Übergangslänge in den Anschluss über.</p>
        {/if}
        {@render issueList(bIssues)}
      </div>
    {/if}
  </li>
</ol>

<fieldset class="opt fi-opt">
  <legend>Wandstärke</legend>
  <div class="dia-row">
    <NumberField bind:value={spec.wall} min={1.6} max={8} step={0.1} label="Wandstärke der Bausteine" />
  </div>
  <p class="hint">Gilt für alle Bausteine und den Geräteanschluss. 2,5–3 mm sind stabil, dünner spart Material, dicker macht den Adapter schwerer.</p>
</fieldset>

<fieldset class="opt fi-opt">
  <legend>Auf dem Druckbett liegt</legend>
  <div class="seg wide" role="radiogroup" aria-label="Auf dem Druckbett liegt">
    <button type="button" role="radio" aria-checked={spec.bed === 'B'} class:sel={spec.bed === 'B'} onclick={() => (spec.bed = 'B')}>Ende B ({endName(spec.b.type)})</button>
    <button type="button" role="radio" aria-checked={spec.bed === 'A'} class:sel={spec.bed === 'A'} onclick={() => (spec.bed = 'A')}>Anschluss A ({spec.a.type === 'female' ? 'Kupplung' : 'Stecker'})</button>
  </div>
  <p class="hint">Dieses Ende wird flach auf das Druckbett gelegt. Ein Stecker unten bekommt wie bei den anderen Adaptern eine Druckhilfe. Eine Kupplung sollte mit der Öffnung nach oben zeigen.</p>
</fieldset>

{@render issueList(otherIssues)}

<style>
  .fi-help { margin-top: 0; }
  .fi-help ol { padding-left: 20px; }
  .tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0 18px; }
  .tpl-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; }
  .tpl-btn strong { font-weight: 600; font-size: 14px; }
  .tpl-btn small { font-size: 12.5px; color: var(--slate-2); line-height: 1.3; }
  .tpl-btn.sel { border-color: var(--sky); background: var(--sky-l); }
  .tpl-btn:not(.sel):hover { border-color: var(--sky); }

  .chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; position: relative; }
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
  .card-body { padding: 4px 14px 14px; border-top: 1px solid var(--line); }
  .card-body :global(.seg.wide) { margin-top: 12px; }
  .dir-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .card-body .field { margin-top: 10px; }
  .card-body .grid2 { margin-top: 4px; }

  .add { position: relative; margin: 2px 0 10px; padding: 10px 12px; border: 1px dashed #c6d0d5; border-radius: 10px; background: var(--mist); }
  .add-label { display: block; font-size: 13px; font-weight: 600; color: var(--slate-2); margin-bottom: 6px; }
  .add-btns { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .add-btn { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; cursor: pointer; text-align: left; font: inherit; }
  .add-btn svg { flex: none; width: 14px; height: 14px; stroke: var(--sky-d); stroke-width: 2; stroke-linecap: round; }
  .add-btn span { display: flex; flex-direction: column; min-width: 0; }
  .add-btn strong { font-size: 13px; font-weight: 600; }
  .add-btn small { font-size: 11px; color: var(--slate-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .add-btn:hover { border-color: var(--sky); }

  .fi-opt { margin-top: 18px; }
  .fi-issues { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .fi-issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: #fdf6dc; }
  .fi-issues li.error { border-left-color: #d93a2b; background: #fdecea; color: #b02a20; }
  @media (max-width: 560px) {
    .add-btns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tpl { grid-template-columns: minmax(0, 1fr); }
  }
</style>
