<script lang="ts">
  /**
   * Querschnitt wählen und bemaßen: Formen als Knöpfe mit Symbol, darunter die Maße der gewählten Form
   * und eine Skizze, die zeigt, welches Maß wo gemessen wird.
   */
  import NumberField from './NumberField.svelte';
  import { SECTION_FIELDS, SECTION_LABELS, samplePoints, type Section, type SectionShape } from '../lib/osvac/freeform';

  let {
    section = $bindable(),
    label,
    measure = 'inner',
    depth = $bindable(),
    depthLabel = 'Ø in der Tiefe',
    frontLabel = 'Ø vorne',
  }: {
    section: Section;
    label: string;
    /** inner: lichte Weite des Adapters; over: Außenmaß des Stutzens; into: Innenmaß der Öffnung */
    measure?: 'inner' | 'over' | 'into';
    /** nur Kreis am Gerät: Ø in der Tiefe */
    depth?: number;
    depthLabel?: string;
    frontLabel?: string;
  } = $props();

  const SHAPES: SectionShape[] = ['circle', 'ellipse', 'slot', 'rect', 'dshape', 'trapezoid'];
  type Field = keyof Omit<Section, 'shape'>;

  const NAMES: Record<SectionShape, Partial<Record<Field, { name: string; letter: string }>>> = {
    circle: { d: { name: 'Durchmesser', letter: 'Ø' } },
    ellipse: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H' } },
    slot: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H' } },
    rect: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H' }, r: { name: 'Eckradius oben', letter: 'R' }, r2: { name: 'Eckradius unten', letter: 'r' } },
    dshape: { d: { name: 'Durchmesser', letter: 'Ø' }, h: { name: 'Höhe bis zur Abflachung', letter: 'H' }, r: { name: 'Radius an der Abflachung', letter: 'R' } },
    trapezoid: { w: { name: 'Breite unten', letter: 'B' }, w2: { name: 'Breite oben', letter: 'b' }, h: { name: 'Höhe', letter: 'H' }, r: { name: 'Eckradius', letter: 'R' } },
  };
  const LIMITS: Record<Field, { min: number; max: number; step: number }> = {
    d: { min: 6, max: 200, step: 0.1 },
    w: { min: 6, max: 250, step: 0.1 },
    w2: { min: 4, max: 250, step: 0.1 },
    h: { min: 4, max: 250, step: 0.1 },
    r: { min: 0.5, max: 60, step: 0.5 },
    r2: { min: 0.5, max: 60, step: 0.5 },
  };

  const what = $derived(
    measure === 'inner' ? 'Lichte Weite (innen). Die Wand kommt außen dazu.' : measure === 'over' ? 'Außenmaß des Stutzens am Gerät, mit dem Messschieber gemessen.' : 'Innenmaß der Öffnung am Gerät, mit dem Messschieber gemessen.',
  );

  /** Formwechsel: sinnvolle Maße aus der bisherigen Form übernehmen */
  function setShape(shape: SectionShape) {
    if (shape === section.shape) return;
    const s = section;
    const big = s.shape === 'circle' || s.shape === 'dshape' ? s.d : Math.max(s.w, s.h);
    const small = s.shape === 'circle' ? s.d : s.shape === 'dshape' ? s.h : Math.min(s.w, s.h);
    if (shape === 'circle') s.d = big;
    else if (shape === 'dshape') {
      s.d = big;
      s.h = Math.round(big * 0.8 * 10) / 10;
      s.r = Math.min(s.r, 2);
    } else {
      s.w = s.shape === 'circle' ? Math.round(big * 1.4) : big;
      s.h = s.shape === 'circle' ? Math.round(big * 0.8) : small;
      if (shape === 'trapezoid') s.w2 = Math.round(s.w * 0.7);
    }
    s.shape = shape;
  }

  // --- Skizze ---
  const VW = 200, VH = 130, PAD = 26;
  const fig = $derived.by(() => {
    const pts = samplePoints(section, 160);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((VW - 2 * PAD - 20) / (x1 - x0 || 1), (VH - 2 * PAD) / (y1 - y0 || 1));
    const cx = VW / 2 - 10 - ((x0 + x1) / 2) * k, cy = VH / 2 + ((y0 + y1) / 2) * k;
    const X = (x: number) => cx + x * k, Y = (y: number) => cy - y * k;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ') + 'Z';
    return { d, X, Y, x0, x1, y0, y1, k };
  });
</script>

<div class="sec">
  <div class="sec-head">
    <span class="sec-label">{label}</span>
  </div>
  <div class="shapes" role="radiogroup" aria-label="{label}: Form">
    {#each SHAPES as sh}
      <button type="button" class="shape" class:sel={section.shape === sh} role="radio" aria-checked={section.shape === sh} title={SECTION_LABELS[sh]} onclick={() => setShape(sh)}>
        <svg viewBox="0 0 32 22" aria-hidden="true">
          {#if sh === 'circle'}<circle cx="16" cy="11" r="8.5" />
          {:else if sh === 'ellipse'}<ellipse cx="16" cy="11" rx="13" ry="7.5" />
          {:else if sh === 'slot'}<rect x="3" y="4" width="26" height="14" rx="7" />
          {:else if sh === 'rect'}<rect x="3" y="3" width="26" height="16" rx="3" />
          {:else if sh === 'dshape'}<path d="M8.5 17.5 H23.5 A9.2 9.2 0 1 0 8.5 17.5 Z" />
          {:else}<path d="M3 18.5 H29 L24 3.5 H8 Z" stroke-linejoin="round" />{/if}
        </svg>
        <span>{SECTION_LABELS[sh]}</span>
      </button>
    {/each}
  </div>

  <div class="sec-body">
    <svg class="fig" viewBox="0 0 {VW} {VH}" role="img" aria-label="Skizze {SECTION_LABELS[section.shape]} mit Maßen">
      <path d={fig.d} class="outline" />
      {#if section.shape === 'circle'}
        <line x1={fig.X(fig.x0)} y1={fig.Y(0)} x2={fig.X(fig.x1)} y2={fig.Y(0)} class="dim" />
        <text x={fig.X(0)} y={fig.Y(0) - 6} class="lt" text-anchor="middle">Ø</text>
      {:else}
        {#if SECTION_FIELDS[section.shape].includes('w') || section.shape === 'dshape'}
          <line x1={fig.X(fig.x0)} y1={fig.Y(fig.y0) + 12} x2={fig.X(fig.x1)} y2={fig.Y(fig.y0) + 12} class="dim" />
          <text x={fig.X((fig.x0 + fig.x1) / 2)} y={fig.Y(fig.y0) + 25} class="lt" text-anchor="middle">{section.shape === 'dshape' ? 'Ø' : 'B'}</text>
        {/if}
        <line x1={fig.X(fig.x1) + 12} y1={fig.Y(fig.y0)} x2={fig.X(fig.x1) + 12} y2={fig.Y(fig.y1)} class="dim" />
        <text x={fig.X(fig.x1) + 22} y={fig.Y((fig.y0 + fig.y1) / 2) + 4} class="lt" text-anchor="start">H</text>
        {#if section.shape === 'trapezoid'}
          <line x1={fig.X(-section.w2 / 2)} y1={fig.Y(fig.y1) - 8} x2={fig.X(section.w2 / 2)} y2={fig.Y(fig.y1) - 8} class="dim" />
          <text x={fig.X(0)} y={fig.Y(fig.y1) - 13} class="lt" text-anchor="middle">b</text>
        {/if}
        {#if section.shape === 'rect'}
          <text x={fig.X(fig.x1) - 9} y={fig.Y(fig.y1) + 17} class="lt sm" text-anchor="end">R</text>
          <text x={fig.X(fig.x1) - 9} y={fig.Y(fig.y0) - 9} class="lt sm" text-anchor="end">r</text>
        {:else if section.shape === 'trapezoid'}
          <text x={fig.X(section.w2 / 2) - 4} y={fig.Y(fig.y1) + 14} class="lt sm" text-anchor="end">R</text>
        {:else if section.shape === 'dshape'}
          <text x={fig.X(fig.x1 * 0.62)} y={fig.Y(fig.y0) - 6} class="lt sm" text-anchor="end">R</text>
        {/if}
      {/if}
    </svg>

    <div class="sec-fields">
      {#if section.shape === 'circle' && depth !== undefined}
        <div class="field">
          <span class="field-label"><b class="ltr">Ø</b>{frontLabel}</span>
          <NumberField bind:value={section.d} {...LIMITS.d} label="{label}: {frontLabel}" />
        </div>
        <div class="field">
          <span class="field-label"><b class="ltr">Ø</b>{depthLabel}</span>
          <NumberField bind:value={depth} {...LIMITS.d} label="{label}: {depthLabel}" />
        </div>
      {:else}
        {#each SECTION_FIELDS[section.shape] as f}
          {@const nm = NAMES[section.shape][f]!}
          <div class="field">
            <span class="field-label"><b class="ltr">{nm.letter}</b>{nm.name}</span>
            <NumberField bind:value={section[f]} {...LIMITS[f]} label="{label}: {nm.name}" />
          </div>
        {/each}
      {/if}
    </div>
  </div>
  <p class="hint">{what}{#if section.shape === 'dshape'}{' H misst von der Abflachung bis zur gegenüberliegenden Rundung.'}{/if}{#if section.shape === 'trapezoid' || section.shape === 'rect'}{' „Oben“ und „unten“ beziehen sich auf die Skizze. Mit „Drehung“ bzw. „Verdrehung“ lässt sich der Querschnitt um die Mittellinie drehen.'}{/if}</p>
</div>

<style>
  .sec { margin: 10px 0 4px; }
  .sec-label { font-weight: 600; font-size: 14px; }
  .shapes { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin: 8px 0 10px; }
  .shape {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 2px 5px; border: 1px solid var(--line); border-radius: 8px; background: #fff;
    font-size: 11.5px; color: var(--slate); cursor: pointer;
  }
  .shape svg { width: 30px; height: 21px; fill: #e9eef1; stroke: var(--graphite); stroke-width: 1.4; }
  .shape.sel { border-color: var(--sky); background: var(--sky-l); }
  .shape.sel svg { fill: #9fd5f3; stroke: var(--sky-d); }
  .shape:not(.sel):hover { border-color: var(--sky); }
  .sec-body { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 12px; align-items: start; }
  .fig { width: 100%; height: auto; background: var(--mist); border-radius: 8px; }
  .outline { fill: #ffd9d6; stroke: var(--red); stroke-width: 1.6; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .lt { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
  .lt.sm { font-size: 11px; }
  .sec-fields { display: flex; flex-direction: column; gap: 8px; }
  .ltr { display: inline-grid; place-items: center; min-width: 18px; height: 18px; border-radius: 4px; background: var(--sky-l); color: var(--sky-d); font-size: 11.5px; }
  @media (max-width: 520px) {
    .sec-body { grid-template-columns: minmax(0, 1fr); }
    .shapes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
