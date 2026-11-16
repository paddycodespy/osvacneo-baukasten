<script lang="ts">
  /**
   * Eigene Kontur: laden (SVG/DXF), am Foto nachzeichnen oder selbst zeichnen; danach Skizze mit Maßen, drehen,
   * spiegeln, auf ein gemessenes Maß bringen und eine kurze Prüfliste.
   */
  import { isDesktop } from '../lib/desktop';
  import { readContourFile, type Found } from '../lib/contour-import';
  import { prepare, transform, bbox, selfIntersects, straightSides, svgPath, fromVertices, CONTOUR_MIN, CONTOUR_MAX, type P2 } from '../lib/osvac/contour';
  import type { Section } from '../lib/osvac/freeform';
  import NumberField from './NumberField.svelte';
  import Field from './Field.svelte';
  import ContourDraw from './ContourDraw.svelte';

  let {
    section = $bindable(),
    label,
    measure = 'inner',
  }: { section: Section; label: string; measure?: 'inner' | 'over' | 'into' } = $props();

  let found = $state<Found[] | null>(null);
  let fileName = $state('');
  let notes = $state<string[]>([]);
  let busy = $state(false);
  let draw = $state<null | 'photo' | 'grid'>(null);
  let input: HTMLInputElement | undefined = $state();

  const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
  const what = $derived(measure === 'over' ? 'das Außenmaß des Stutzens' : measure === 'into' ? 'das Innenmaß der Öffnung' : 'die lichte Weite (innen)');

  /** Kontur übernehmen (aufbereiten, Maße setzen) */
  function apply(raw: P2[], src: string, drawn?: [number, number, number][]) {
    const p = prepare(raw);
    const b = bbox(p.pts);
    section.pts = p.pts;
    section.w = Math.round(b.w * 100) / 100;
    section.h = Math.round(b.h * 100) / 100;
    section.d = Math.max(section.w, section.h);
    section.src = src;
    section.rounded = p.rounded;
    if (drawn) section.draw = drawn;
    else delete section.draw;
    found = null;
  }

  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!f) return;
    busy = true;
    try {
      const r = await readContourFile(f);
      fileName = f.name;
      notes = r.notes;
      if (r.loops.length === 1) apply(r.loops[0].pts, f.name);
      else if (r.loops.length > 1) found = r.loops.slice(0, 8);
    } catch {
      notes = ['Die Datei ließ sich nicht lesen.'];
    } finally {
      busy = false;
    }
  }

  // ---- Skizze
  const pts = $derived(section.pts ?? []);
  const VW = 300, VH = 170, M = 34;
  const fig = $derived.by(() => {
    if (pts.length < 3) return null;
    const b = bbox(pts);
    const k = Math.min((VW - 2 * M) / (b.w || 1), (VH - 2 * M) / (b.h || 1));
    const ox = VW / 2 - ((b.x0 + b.x1) / 2) * k, oy = VH / 2 + ((b.y0 + b.y1) / 2) * k;
    return { d: svgPath(pts, k, ox, oy), L: ox + b.x0 * k, R: ox + b.x1 * k, T: oy - b.y1 * k, B: oy - b.y0 * k, cx: ox, cy: oy };
  });
  const thumb = (p: P2[]) => {
    const b = bbox(p);
    const k = Math.min(54 / (b.w || 1), 34 / (b.h || 1));
    return svgPath(p, k, 32 - ((b.x0 + b.x1) / 2) * k, 21 + ((b.y0 + b.y1) / 2) * k);
  };

  // ---- Prüfliste
  const checks = $derived.by(() => {
    if (pts.length < 3) return [];
    const b = bbox(pts);
    const out: { ok: boolean | 'warn'; text: string }[] = [];
    const cross = selfIntersects(pts);
    out.push({ ok: !cross, text: cross ? 'Die Kontur überschneidet sich selbst' : 'Kontur ist geschlossen und überschneidet sich nicht' });
    const size = Math.min(b.w, b.h) >= CONTOUR_MIN && Math.max(b.w, b.h) <= CONTOUR_MAX;
    out.push({ ok: size, text: size ? `Größe passt (${CONTOUR_MIN} bis ${CONTOUR_MAX} mm)` : `Größe muss zwischen ${CONTOUR_MIN} und ${CONTOUR_MAX} mm liegen` });
    if (section.rounded) out.push({ ok: 'warn', text: `${section.rounded} spitze Ecke${section.rounded > 1 ? 'n' : ''} auf R 0,5 gerundet` });
    const n = straightSides(pts);
    out.push({ ok: true, text: n ? `${n} gerade Seite${n > 1 ? 'n' : ''} ab 14 mm: Schraubenlöcher sitzen dort mittig` : 'Keine langen geraden Seiten: Schraubenlöcher werden gleichmäßig verteilt' });
    return out;
  });

  function turn() {
    section.pts = transform(pts, { rot: 90 });
    [section.w, section.h] = [section.h, section.w];
    if (section.draw) section.draw = section.draw.map(([x, y, r]) => [-y, x, r]);
  }
  function mirror() {
    section.pts = transform(pts, { mirror: true });
    if (section.draw) section.draw = section.draw.map(([x, y, r]) => [-x, y, r]);
  }
  /** auf Breite bzw. Höhe skalieren (gleichmäßig) */
  function scaleTo(k: 'w' | 'h', v: number) {
    const cur = k === 'w' ? section.w : section.h;
    if (!(v > 0) || !(cur > 0)) return;
    const f = v / cur;
    section.pts = transform(pts, { scale: f });
    const b = bbox(section.pts);
    section.w = Math.round(b.w * 100) / 100;
    section.h = Math.round(b.h * 100) / 100;
    section.d = Math.max(section.w, section.h);
    if (section.draw) section.draw = section.draw.map(([x, y, r]) => [x * f, y * f, r]);
  }
  function fromDraw(v: [number, number, number][], src: string) {
    apply(fromVertices(v), src, v);
    draw = null;
  }
</script>

<!-- Im Browser ohne Dateifilter: manche Browser unter Linux öffnen mit „.dxf“ im Filter gar kein Fenster.
     Die Endung wird beim Lesen geprüft (readContourFile). -->
<input bind:this={input} type="file" accept={isDesktop ? '.svg,.dxf,image/svg+xml' : undefined} class="hidden-file" onchange={onFile} aria-label="{label}: Kontur-Datei" />

{#if found}
  <div class="pick">
    <p><span class="chip2">📄 {fileName}</span> {found.length} geschlossene Umrisse gefunden. Welcher ist {what}?</p>
    <div class="thumbs">
      {#each found as l, i}
        {@const b = bbox(l.pts)}
        <button type="button" class="th" onclick={() => apply(l.pts, fileName)} aria-label="Umriss {i + 1}: {fmt(b.w)} × {fmt(b.h)} mm">
          <svg viewBox="0 0 64 42" aria-hidden="true"><path d={thumb(l.pts)} /></svg>
          <span>{fmt(b.w)} × {fmt(b.h)}</span>
        </button>
      {/each}
    </div>
    <button type="button" class="link" onclick={() => (found = null)}>Abbrechen</button>
  </div>
{:else if !fig}
  <div class="three">
    <div class="src">
      <svg viewBox="0 0 44 34" aria-hidden="true"><path d="M8 3h20l8 8v20H8z" class="doc" /><path d="M28 3v8h8" class="docl" /><path d="M13 24c3-9 14-9 18 0" class="red" /></svg>
      <b>Datei laden</b>
      <span>SVG oder DXF, z. B. aus Inkscape, Fusion oder FreeCAD. Maße in mm.</span>
      <button type="button" class="ghost sm" disabled={busy} onclick={() => input?.click()}>{busy ? 'Wird gelesen\u00a0…' : 'Datei wählen\u00a0…'}</button>
    </div>
    <div class="src">
      <svg viewBox="0 0 44 34" aria-hidden="true"><rect x="3" y="7" width="38" height="24" rx="4" class="doc" /><circle cx="22" cy="19" r="7" class="docl" /><rect x="15" y="3" width="14" height="5" rx="1.5" class="cam" /></svg>
      <b>Am Foto nachzeichnen</b>
      <span>Stutzen von oben fotografieren, Lineal daneben, Umriss anklicken.</span>
      <button type="button" class="ghost sm" onclick={() => (draw = 'photo')}>Foto wählen&nbsp;…</button>
    </div>
    <div class="src">
      <svg viewBox="0 0 44 34" aria-hidden="true"><path d="M3 9h38M3 17h38M3 25h38M11 3v28M22 3v28M33 3v28" class="grd" /><path d="M8 27 14 8l18 3 4 15z" class="red" /></svg>
      <b>Selbst zeichnen</b>
      <span>Punkte auf ein Millimeterraster setzen, z. B. nach Messschieber.</span>
      <button type="button" class="ghost sm" onclick={() => (draw = 'grid')}>Zeichnen&nbsp;…</button>
    </div>
  </div>
  <p class="note">
    Die Kontur ist hier <b>{what}</b>, gesehen mit Blick auf den Stutzen (von vorne), wie bei den anderen Formen. {measure === 'inner' ? 'Die Wand kommt außen dazu.' : 'Zugabe und Wand rechnet der Baukasten selbst dazu.'}
  </p>
{:else}
  <div class="row">
    {#if section.src}<span class="chip2" title={section.src}>{section.draw ? '✏️' : '📄'} {section.src}</span>{/if}
    <button type="button" class="link" onclick={() => input?.click()}>Andere Datei&nbsp;…</button>
    <button type="button" class="link" onclick={() => (draw = section.draw ? 'grid' : 'photo')}>{section.draw ? 'Bearbeiten' : 'Nachzeichnen\u00a0…'}</button>
    {#if !section.draw}<button type="button" class="link" onclick={() => (draw = 'grid')}>Selbst zeichnen</button>{/if}
  </div>
  <svg class="fig" viewBox="0 0 {VW} {VH}" role="img" aria-label="Skizze der Kontur mit Maßen">
    <path d={fig.d} class="outline" />
    <line x1={fig.L} y1={fig.B + 12} x2={fig.R} y2={fig.B + 12} class="dim" />
    <line x1={fig.L} y1={fig.B + 7} x2={fig.L} y2={fig.B + 17} class="dim" />
    <line x1={fig.R} y1={fig.B + 7} x2={fig.R} y2={fig.B + 17} class="dim" />
    <text x={(fig.L + fig.R) / 2} y={fig.B + 28} class="lt" text-anchor="middle">B {fmt(section.w)}</text>
    <line x1={fig.L - 12} y1={fig.T} x2={fig.L - 12} y2={fig.B} class="dim" />
    <line x1={fig.L - 17} y1={fig.T} x2={fig.L - 7} y2={fig.T} class="dim" />
    <line x1={fig.L - 17} y1={fig.B} x2={fig.L - 7} y2={fig.B} class="dim" />
    <text x={fig.L - 16} y={(fig.T + fig.B) / 2 - 3} class="lt" text-anchor="end">H</text>
    <text x={fig.L - 16} y={(fig.T + fig.B) / 2 + 11} class="lt" text-anchor="end">{fmt(section.h)}</text>
    <circle cx={fig.cx} cy={fig.cy} r="2.5" class="mid" />
  </svg>
  <div class="row">
    <button type="button" class="ghost sm" onclick={turn}>↻ 90° drehen</button>
    <button type="button" class="ghost sm" onclick={mirror} title="Seitenverkehrt? Zum Beispiel, wenn die Zeichnung von der anderen Seite gesehen ist.">⇋ Spiegeln</button>
  </div>
  <div class="grid2">
    <Field label="B · Breite" help="Mit dem Messschieber nachmessen. Weicht das Maß ab (z. B. Datei in Zoll oder Foto ungenau), hier eintragen: die Kontur wird gleichmäßig vergrößert oder verkleinert.">
      <NumberField value={section.w} min={CONTOUR_MIN} max={CONTOUR_MAX} step={0.1} label="{label}: Breite" oncommit={(v) => scaleTo('w', v)} />
    </Field>
    <Field label="H · Höhe" help="Ändert die Größe gleichmäßig, wie bei der Breite.">
      <NumberField value={section.h} min={CONTOUR_MIN} max={CONTOUR_MAX} step={0.1} label="{label}: Höhe" oncommit={(v) => scaleTo('h', v)} />
    </Field>
  </div>
  <ul class="checks">
    {#each checks as c}<li><span class={c.ok === true ? 'ok' : c.ok === 'warn' ? 'wa' : 'bad'}>{c.ok === true ? '✓' : c.ok === 'warn' ? '!' : '✕'}</span>{c.text}</li>{/each}
  </ul>
{/if}
{#if notes.length}<ul class="notes">{#each notes as n}<li>{n}</li>{/each}</ul>{/if}

{#if draw}
  <ContourDraw photo={draw === 'photo'} start={section.draw ?? null} onapply={fromDraw} oncancel={() => (draw = null)} />
{/if}

<style>
  .hidden-file { display: none; }
  .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .src { border: 1px dashed var(--line); border-radius: 10px; padding: 12px; background: var(--card); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font-size: 13px; color: var(--slate); }
  .src b { font-size: 14px; color: var(--graphite); }
  .src svg { width: 40px; height: 30px; }
  .doc { fill: var(--card); stroke: var(--graphite); stroke-width: 1.5; }
  .docl { fill: none; stroke: var(--graphite); stroke-width: 1.5; }
  .red { fill: none; stroke: var(--red); stroke-width: 2; }
  .cam { fill: var(--graphite); }
  .grd { fill: none; stroke: var(--grey); stroke-width: 0.8; opacity: 0.6; }
  .src .ghost.sm { margin-top: auto; background: var(--card); white-space: nowrap; font-size: 13px; padding: 6px 12px; }
  .note { margin: 0; background: var(--mist); border-radius: 8px; padding: 9px 12px; font-size: 13px; line-height: 1.5; color: var(--slate); }
  .link { border: 0; background: none; padding: 0; color: var(--cobalt-d, var(--sky-d)); font-weight: 600; font-size: 13px; cursor: pointer; }
  .link:hover { color: var(--red); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; }
  .chip2 { border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; background: var(--card); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick p { margin: 0 0 8px; font-size: 13.5px; }
  .thumbs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .th { border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; background: var(--card); font-size: 11.5px; display: flex; flex-direction: column; align-items: center; }
  .th:hover { border-color: var(--sky); background: var(--sky-l); }
  .th svg { width: 64px; height: 42px; }
  .th path { fill: var(--soft); stroke: var(--graphite); stroke-width: 1.2; }
  .fig { width: 100%; max-width: 320px; height: auto; align-self: center; background: var(--mist); border-radius: 8px; }
  .outline { fill: var(--red-l); stroke: var(--red); stroke-width: 1.6; stroke-linejoin: round; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .lt { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
  .mid { fill: var(--sky-d); }
  .row .ghost.sm { margin-top: 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; align-items: end; }
  .checks { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; font-size: 13px; }
  .checks span { display: inline-block; width: 18px; font-weight: 700; }
  .ok { color: var(--ok-fg); }
  .wa { color: var(--warn-fg); }
  .bad { color: var(--red); }
  .notes { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--warn-fg); }
  @media (max-width: 520px) {
    .three { grid-template-columns: 1fr; }
  }
</style>
