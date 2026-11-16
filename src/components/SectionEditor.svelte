<script lang="ts">
  /**
   * Querschnitt wählen und bemaßen: Formen als Knöpfe mit Symbol, darunter die Maße der gewählten Form
   * und eine Skizze, die zeigt, welches Maß wo gemessen wird.
   */
  import NumberField from './NumberField.svelte';
  import Field from './Field.svelte';
  import ContourPanel from './ContourPanel.svelte';
  import { SECTION_FIELDS, SECTION_LABELS, samplePoints, type Section, type SectionShape, type SecNum } from '../lib/osvac/freeform';

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

  const SHAPES: SectionShape[] = ['circle', 'ellipse', 'slot', 'rect', 'dshape', 'trapezoid', 'contour'];
  type Key = SecNum;

  type Name = { name: string; letter: string; help?: string };
  const CORNER = 'Wie stark die Ecke gerundet ist. Klein = fast eckig, groß = stark gerundet. Mit einer Münze oder einem Radiuslehrensatz abschätzen; ungefähr genügt.';
  const NAMES: Record<SectionShape, Partial<Record<Key, Name>>> = {
    circle: { d: { name: 'Durchmesser', letter: 'Ø' } },
    ellipse: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H' } },
    slot: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H', help: 'Die Höhe ist auch die Breite der runden Enden.' } },
    rect: { w: { name: 'Breite', letter: 'B' }, h: { name: 'Höhe', letter: 'H' }, r: { name: 'Ecken oben', letter: 'R', help: CORNER }, r2: { name: 'Ecken unten', letter: 'r', help: CORNER + ' Unten kann die Rundung anders sein als oben.' } },
    dshape: { d: { name: 'Durchmesser', letter: 'Ø', help: 'Durchmesser des runden Teils.' }, h: { name: 'Höhe', letter: 'H', help: 'Von der flachen Seite bis zur gegenüberliegenden Rundung messen. Kleiner als der Durchmesser.' }, r: { name: 'Ecken an der flachen Seite', letter: 'R', help: CORNER } },
    trapezoid: { w: { name: 'Breite unten', letter: 'B' }, w2: { name: 'Breite oben', letter: 'b' }, h: { name: 'Höhe', letter: 'H' }, r: { name: 'Ecken', letter: 'R', help: CORNER } },
    // nur intern (Flanschplatte), nicht wählbar
    tri: {},
    contour: {},
  };
  const LIMITS: Record<Key, { min: number; max: number; step: number }> = {
    d: { min: 6, max: 200, step: 0.1 },
    w: { min: 6, max: 250, step: 0.1 },
    w2: { min: 4, max: 250, step: 0.1 },
    h: { min: 4, max: 250, step: 0.1 },
    r: { min: 0.5, max: 60, step: 0.5 },
    r2: { min: 0.5, max: 60, step: 0.5 },
  };

  /** kurze Erklärung, welches Maß gemeint ist */
  const what = $derived(
    measure === 'inner' ? 'Maße innen. Die Wand kommt außen dazu.' : measure === 'over' ? 'Den Stutzen außen messen.' : 'Die Öffnung innen messen.',
  );

  /** Formwechsel: sinnvolle Maße aus der bisherigen Form übernehmen */
  function setShape(shape: SectionShape) {
    if (shape === section.shape) return;
    const s = section;
    // eigene Kontur: Punkte bleiben erhalten (zurückwechseln ohne neu laden); Maße kommen aus der Kontur
    if (shape === 'contour') {
      s.shape = shape;
      return;
    }
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

  // --- Skizze: Form in einem festen Rahmen, alle Beschriftungen außerhalb der Form ---
  // links Höhe (H), unten Breite (B/Ø), oben Breite oben (b, Trapez), rechts Eckradien mit Hinweislinie
  const VW = 260, VH = 132, ML = 46, MR = 60, MT = 30, MB = 38;
  const fig = $derived.by(() => {
    const pts = samplePoints(section, 160);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((VW - ML - MR) / (x1 - x0 || 1), (VH - MT - MB) / (y1 - y0 || 1));
    const cx = ML + (VW - ML - MR) / 2 - ((x0 + x1) / 2) * k, cy = MT + (VH - MT - MB) / 2 + ((y0 + y1) / 2) * k;
    const X = (x: number) => cx + x * k, Y = (y: number) => cy - y * k;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ') + 'Z';
    const L = X(x0), R = X(x1), T = Y(y1), B = Y(y0);
    // Punkt auf einer Eckrundung (Mitte des Bogens) für die Hinweislinie
    const corner = (vx: number, vy: number, r: number, sx: number, sy: number) => {
      const c = [vx - sx * r, vy - sy * r];
      return [X(c[0] + sx * r * Math.SQRT1_2), Y(c[1] + sy * r * Math.SQRT1_2)];
    };
    const s = section;
    let rTop: number[] | null = null, rBot: number[] | null = null;
    if (s.shape === 'rect') {
      const m = Math.min(s.w, s.h) / 2;
      rTop = corner(s.w / 2, s.h / 2, Math.min(s.r, m), 1, 1);
      rBot = corner(s.w / 2, -s.h / 2, Math.min(s.r2, m), 1, -1);
    } else if (s.shape === 'trapezoid') {
      rTop = [X(s.w2 / 2) - 1, T + 1];
    } else if (s.shape === 'dshape') {
      // Ecke an der Abflachung (unten rechts): letzter Punkt der Abflachung
      const flat = pts.filter((p) => Math.abs(p[1] - y0) < 1e-6 && p[0] > 0);
      const fx = flat.length ? Math.max(...flat.map((p) => p[0])) : x1 * 0.6;
      rBot = [X(fx) + 1, B - 1];
    }
    // Beschriftungen rechts: R oben, r unten, mit Mindestabstand
    const mid = (T + B) / 2;
    const yR = rTop ? Math.min(rTop[1], mid - 9) : 0;
    const yr = rBot ? Math.max(rBot[1], rTop ? yR + 18 : mid + 9) : 0;
    return { d, X, Y, L, R, T, B, rTop, rBot, yR, yr };
  });
</script>

<div class="sec">
  <div class="sec-head">
    <span class="sec-label">{label}</span>
    <span class="sec-what">{what}</span>
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
          {:else if sh === 'trapezoid'}<path d="M3 18.5 H29 L24 3.5 H8 Z" stroke-linejoin="round" />
          {:else}<path d="M5 18.5 H27 Q28.5 18.5 28.5 17 V13 L30.5 12.5 V9.5 L28.5 9 V7 Q28.5 5.5 26 5 Q16 1 6 5 Q3.5 5.5 3.5 7 V17 Q3.5 18.5 5 18.5 Z" stroke-linejoin="round" />{/if}
        </svg>
        <span>{SECTION_LABELS[sh]}</span>
      </button>
    {/each}
  </div>

  {#if section.shape === 'contour'}
  <div class="sec-body">
    <ContourPanel bind:section {label} {measure} />
  </div>
  {:else}
  <div class="sec-body">
    <svg class="fig" viewBox="0 0 {VW} {VH}" role="img" aria-label="Skizze {SECTION_LABELS[section.shape]} mit Maßen">
      <path d={fig.d} class="outline" />
      <!-- Breite bzw. Durchmesser unten -->
      <line x1={fig.L} y1={fig.B + 10} x2={fig.R} y2={fig.B + 10} class="dim" />
      <line x1={fig.L} y1={fig.B + 6} x2={fig.L} y2={fig.B + 14} class="dim" />
      <line x1={fig.R} y1={fig.B + 6} x2={fig.R} y2={fig.B + 14} class="dim" />
      <text x={(fig.L + fig.R) / 2} y={fig.B + 27} class="lt" text-anchor="middle">{section.shape === 'circle' || section.shape === 'dshape' ? 'Ø' : 'B'}</text>
      {#if section.shape !== 'circle'}
        <!-- Höhe links -->
        <line x1={fig.L - 12} y1={fig.T} x2={fig.L - 12} y2={fig.B} class="dim" />
        <line x1={fig.L - 16} y1={fig.T} x2={fig.L - 8} y2={fig.T} class="dim" />
        <line x1={fig.L - 16} y1={fig.B} x2={fig.L - 8} y2={fig.B} class="dim" />
        <text x={fig.L - 20} y={(fig.T + fig.B) / 2 + 4} class="lt" text-anchor="end">H</text>
      {/if}
      {#if section.shape === 'trapezoid'}
        <!-- Breite oben -->
        <line x1={fig.X(-section.w2 / 2)} y1={fig.T - 9} x2={fig.X(section.w2 / 2)} y2={fig.T - 9} class="dim" />
        <line x1={fig.X(-section.w2 / 2)} y1={fig.T - 13} x2={fig.X(-section.w2 / 2)} y2={fig.T - 5} class="dim" />
        <line x1={fig.X(section.w2 / 2)} y1={fig.T - 13} x2={fig.X(section.w2 / 2)} y2={fig.T - 5} class="dim" />
        <text x={fig.X(0)} y={fig.T - 15} class="lt" text-anchor="middle">b</text>
      {/if}
      {#if fig.rTop}
        <polyline points="{fig.rTop[0]},{fig.rTop[1]} {fig.R + 10},{fig.yR} {fig.R + 16},{fig.yR}" class="lead" />
        <text x={fig.R + 20} y={fig.yR + 4} class="lt">R</text>
      {/if}
      {#if fig.rBot}
        <polyline points="{fig.rBot[0]},{fig.rBot[1]} {fig.R + 10},{fig.yr} {fig.R + 16},{fig.yr}" class="lead" />
        <text x={fig.R + 20} y={fig.yr + 4} class="lt">{section.shape === 'dshape' ? 'R' : 'r'}</text>
      {/if}
    </svg>

    <div class="sec-fields">
      {#if section.shape === 'circle' && depth !== undefined}
        <Field label={frontLabel} help="Durchmesser vorne an der Kante.">
          <NumberField bind:value={section.d} {...LIMITS.d} label="{label}: {frontLabel}" />
        </Field>
        <Field label={depthLabel} help="Durchmesser dort, wo der Adapter enden soll. Meist etwas anders als vorne, weil Stutzen und Öffnungen leicht konisch sind. Ist er gleich, einfach denselben Wert eintragen.">
          <NumberField bind:value={depth} {...LIMITS.d} label="{label}: {depthLabel}" />
        </Field>
      {:else}
        {#each SECTION_FIELDS[section.shape] as f}
          {@const nm = NAMES[section.shape][f]!}
          <Field label="{nm.letter} · {nm.name}" help={nm.help}>
            <NumberField bind:value={section[f]} {...LIMITS[f]} label="{label}: {nm.name}" />
          </Field>
        {/each}
      {/if}
    </div>
  </div>
  {/if}
</div>

<style>
  .sec { margin: 10px 0 4px; }
  .sec-label { font-weight: 600; font-size: 14px; }
  .shapes { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; margin: 8px 0 10px; }
  .shape {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 2px 5px; border: 1px solid var(--line); border-radius: 8px; background: var(--card);
    font-size: 11.5px; color: var(--slate); cursor: pointer;
  }
  .shape svg { width: 30px; height: 21px; fill: var(--soft); stroke: var(--graphite); stroke-width: 1.4; }
  .shape.sel { border-color: var(--sky); background: var(--sky-l); }
  .shape.sel svg { fill: var(--sky-m); stroke: var(--sky-d); }
  .shape:not(.sel):hover { border-color: var(--sky); }
  .sec-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .sec-what { font-size: 13px; color: var(--slate-2); }
  .sec-body { display: flex; flex-direction: column; gap: 10px; }
  .fig { width: 100%; max-width: 300px; height: auto; align-self: center; background: var(--mist); border-radius: 8px; }
  .outline { fill: var(--red-l); stroke: var(--red); stroke-width: 1.6; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .lt { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
  .lead { fill: none; stroke: var(--sky-d); stroke-width: 1; }
  .sec-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 14px; align-items: end; }
  @media (max-width: 520px) {
    .shapes { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>
