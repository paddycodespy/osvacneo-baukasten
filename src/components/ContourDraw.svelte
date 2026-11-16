<script lang="ts">
  /**
   * Umriss zeichnen: auf Millimeterraster oder über einem Foto (mit Maßstab aus zwei Punkten auf einem Lineal).
   * Klick setzt einen Punkt (hinten angehängt), Punkte lassen sich ziehen, Doppelklick auf eine Linie fügt einen Punkt
   * ein, ausgewählter Punkt: Lage, Eckradius, löschen. Ziehen auf freier Fläche verschiebt die Ansicht, Mausrad zoomt.
   * Im Editor zeigt y nach unten; zurückgegeben werden Ecken mit y nach oben (x, y, Eckradius).
   */
  import { onMount, untrack } from 'svelte';
  import { prepare, fromVertices, bbox, selfIntersects, svgPath, CONTOUR_MIN, CONTOUR_MAX } from '../lib/osvac/contour';
  import NumberField from './NumberField.svelte';

  let {
    photo,
    start,
    onapply,
    oncancel,
  }: {
    photo: boolean;
    start: [number, number, number][] | null;
    onapply: (v: [number, number, number][], src: string) => void;
    oncancel: () => void;
  } = $props();

  type V = [number, number, number];
  // Ecken im Editor (y nach unten)
  let verts = $state<V[]>(untrack(() => (start ? start.map(([x, y, r]) => [x, -y, r] as V) : [])));
  let sel = $state<number | null>(null);
  let step = $state<'scale' | 'outline' | 'check'>(untrack(() => (photo ? 'scale' : 'outline')));
  let img = $state<{ url: string; w: number; h: number } | null>(null);
  /** Maßstab: zwei Punkte im Foto (Pixel) und ihr Abstand in mm */
  let s1 = $state<[number, number] | null>(null);
  let s2 = $state<[number, number] | null>(null);
  let scaleLen = $state(50);
  const ppm = $derived(s1 && s2 ? Math.hypot(s2[0] - s1[0], s2[1] - s1[1]) / scaleLen : 0);
  let view = $state({ x: -60, y: -40, w: 120, h: 80 });
  let svg: SVGSVGElement | undefined = $state();
  let fileIn: HTMLInputElement | undefined = $state();
  let measured = $state(0);
  /** Verlauf für Rückgängig (Strg+Z) */
  let history = $state<V[][]>([]);
  const snap0 = () => {
    history.push(verts.map((v) => [...v] as V));
    if (history.length > 100) history.shift();
  };
  function undo() {
    const h = history.pop();
    if (!h) return;
    verts = h;
    sel = verts.length ? Math.min(sel ?? 0, verts.length - 1) : null;
  }
  /** Rückfrage vor dem Schließen, wenn schon gezeichnet wurde */
  let askClose = $state(false);
  const startKey = JSON.stringify(untrack(() => verts));
  function close() {
    if (verts.length && JSON.stringify(verts) !== startKey) askClose = true;
    else oncancel();
  }

  const fmt = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('de-DE');

  function fit(x0: number, y0: number, x1: number, y1: number, m = 0.15) {
    const w = Math.max(x1 - x0, 10), h = Math.max(y1 - y0, 10);
    const box = svg?.getBoundingClientRect();
    const ar = box && box.height > 0 ? box.width / box.height : 1.5;
    let W = w * (1 + 2 * m), H = h * (1 + 2 * m);
    if (W / H < ar) W = H * ar;
    else H = W / ar;
    view = { x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - H / 2, w: W, h: H };
  }
  onMount(() => {
    if (photo) fileIn?.click();
    else if (verts.length) {
      const b = bbox(verts.map(([x, y]) => [x, y]));
      fit(b.x0, b.y0, b.x1, b.y1);
    } else fit(-50, -30, 50, 30, 0);
  });

  function onPhoto(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      if (img) URL.revokeObjectURL(img.url);
      img = { url, w: im.naturalWidth, h: im.naturalHeight };
      step = 'scale';
      s1 = s2 = null;
      // Punkte zum alten Foto passen nicht mehr
      if (verts.length) {
        snap0();
        verts = [];
        sel = null;
      }
      ppmUsed = 0;
      fit(0, 0, img.w, img.h, 0.02);
    };
    im.src = url;
  }

  /** Bildschirm → Welt (Pixel des Fotos im Schritt Maßstab, sonst mm) */
  function toWorld(e: { clientX: number; clientY: number }): [number, number] {
    const m = svg!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  }
  /** Größe eines Bildschirmpixels in Welteinheiten */
  const px = () => view.w / (svg?.clientWidth || 600);
  const snap = (v: number) => (img ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2);

  // ---- Zeiger
  let drag: { kind: 'pt' | 'pan' | 's1' | 's2'; i?: number; x: number; y: number; moved: boolean; vx: number; vy: number; started?: boolean } | null = null;
  /** aktive Finger (für Zoom mit zwei Fingern) */
  const touches = new Map<number, [number, number]>();
  let pinch: { d: number; view: typeof view; mid: [number, number] } | null = null;
  function down(e: PointerEvent, kind: 'pt' | 'pan' | 's1' | 's2' = 'pan', i?: number) {
    e.stopPropagation();
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) {
      // zweiter Finger: Zoomen statt Ziehen
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: { ...view }, mid: toWorld({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }) };
      drag = null;
      return;
    }
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ohne Zeiger (z. B. per Skript ausgelöst) */
    }
    drag = { kind, i, x: e.clientX, y: e.clientY, moved: false, vx: view.x, vy: view.y };
    if (kind === 'pt') sel = i!;
  }
  function move(e: PointerEvent) {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch.mid, pinch.d / Math.max(d, 1), pinch.view);
      return;
    }
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === 'pan') {
      const k = px();
      view = { ...view, x: drag.vx - (e.clientX - drag.x) * k, y: drag.vy - (e.clientY - drag.y) * k };
    } else if (drag.kind === 'pt') {
      if (!drag.started) {
        snap0();
        drag.started = true;
      }
      const [x, y] = toWorld(e);
      verts[drag.i!] = [snap(x), snap(y), verts[drag.i!][2]];
    } else {
      const p = toWorld(e);
      if (drag.kind === 's1') s1 = p;
      else s2 = p;
    }
  }
  function up(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      drag = null;
      return;
    }
    const d = drag;
    drag = null;
    if (!d || d.moved || d.kind !== 'pan') return;
    const [x, y] = toWorld(e);
    if (step === 'scale') {
      if (!s1) s1 = [x, y];
      else if (!s2) s2 = [x, y];
    } else if (step === 'outline') {
      snap0();
      verts.push([snap(x), snap(y), 0]);
      sel = verts.length - 1;
    }
  }
  /** um Punkt p zoomen (f > 1: weiter weg), ausgehend von Ansicht v0 */
  function zoomAt(p: [number, number], f: number, v0 = view) {
    const w = Math.min(Math.max(v0.w * f, 5), 5000), k = w / v0.w;
    view = { x: p[0] - (p[0] - v0.x) * k, y: p[1] - (p[1] - v0.y) * k, w, h: v0.h * k };
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    zoomAt(toWorld(e), Math.exp(e.deltaY * 0.0015));
  }
  const zoomBtn = (f: number) => zoomAt([view.x + view.w / 2, view.y + view.h / 2], f);
  /** alles zeigen: Punkte bzw. Foto */
  function showAll() {
    if (img && (step === 'scale' || !ppm)) return fit(0, 0, img.w, img.h, 0.02);
    const pts: [number, number][] = verts.map(([x, y]) => [x, y]);
    if (img && ppm) pts.push([0, 0], [img.w / ppm, img.h / ppm]);
    if (pts.length < 2) return fit(-50, -30, 50, 30, 0);
    const b = bbox(pts);
    fit(b.x0, b.y0, b.x1, b.y1);
  }
  /** Doppelklick auf eine Linie: Punkt dazwischen einfügen */
  function insert(e: MouseEvent, i: number) {
    e.stopPropagation();
    const [x, y] = toWorld(e);
    snap0();
    verts.splice(i + 1, 0, [snap(x), snap(y), 0]);
    sel = i + 1;
  }
  function remove() {
    if (sel === null) return;
    snap0();
    verts.splice(sel, 1);
    sel = verts.length ? Math.min(sel, verts.length - 1) : null;
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (askClose) askClose = false;
      else close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null && !(e.target instanceof HTMLInputElement)) remove();
  }

  // ---- Schritte
  /** Wechsel Maßstab → Umriss: Foto in mm umrechnen */
  let ppmUsed = 0;
  function toOutline() {
    if (img && ppm > 0) {
      if (ppmUsed && Math.abs(ppmUsed - ppm) > 1e-9) verts = verts.map(([x, y, r]) => [(x * ppmUsed) / ppm, (y * ppmUsed) / ppm, r]);
      ppmUsed = ppm;
      fit(0, 0, img.w / ppm, img.h / ppm, 0.02);
    }
    step = 'outline';
  }
  /** Ecken mit y nach oben, Mitte des Umrisses im Ursprung */
  const upVerts = $derived.by((): V[] => {
    const b = bbox(verts.map(([x, y]) => [x, y]));
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return verts.map(([x, y, r]) => [x - cx, -(y - cy), r]);
  });
  const result = $derived(verts.length >= 3 ? prepare(fromVertices(upVerts)) : null);
  const resB = $derived(result ? bbox(result.pts) : null);
  const problems = $derived.by(() => {
    if (!result || !resB) return ['Mindestens drei Punkte setzen.'];
    const p: string[] = [];
    if (selfIntersects(result.pts)) p.push('Die Linien kreuzen sich. Punkte so verschieben, dass der Umriss einmal rundherum läuft.');
    if (Math.min(resB.w, resB.h) < CONTOUR_MIN) p.push(`Der Umriss ist zu klein (mindestens ${CONTOUR_MIN} mm).`);
    if (Math.max(resB.w, resB.h) > CONTOUR_MAX) p.push(`Der Umriss ist zu groß (höchstens ${CONTOUR_MAX} mm).${img ? ' Stimmt der Maßstab?' : ''}`);
    return p;
  });
  function toCheck() {
    measured = resB ? Math.round(resB.w * 10) / 10 : 0;
    step = 'check';
  }
  function finish() {
    if (!resB) return;
    const f = measured > 0 ? measured / resB.w : 1;
    onapply(upVerts.map(([x, y, r]) => [x * f, y * f, r]), img ? 'am Foto nachgezeichnet' : 'selbst gezeichnet');
  }

  // ---- Darstellung
  const grid = $derived.by(() => {
    if (img && step === 'scale') return { minor: '', major: '' };
    const minorStep = view.w > 300 ? 10 : view.w > 120 ? 5 : 1, majorStep = view.w > 300 ? 50 : 10;
    const line = (s: number) => {
      let d = '';
      for (let x = Math.ceil(view.x / s) * s; x <= view.x + view.w; x += s) d += `M${x} ${view.y}V${view.y + view.h}`;
      for (let y = Math.ceil(view.y / s) * s; y <= view.y + view.h; y += s) d += `M${view.x} ${y}H${view.x + view.w}`;
      return d;
    };
    return { minor: line(minorStep), major: line(majorStep) };
  });
  const k = $derived(view.w / 700);
  /** Vorschau des aufbereiteten Umrisses an der Stelle der Punkte (y wieder nach unten) */
  const prevPath = $derived.by(() => {
    if (!result) return '';
    const b = bbox(verts.map(([x, y]) => [x, y]));
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return svgPath(result.pts, 1, cx, cy);
  });
</script>

<svelte:window onkeydown={keys} />
<input bind:this={fileIn} type="file" accept="image/*" class="hidden-file" onchange={onPhoto} aria-label="Foto wählen" />

<div class="backdrop" role="presentation">
  <div class="dlg" role="dialog" aria-modal="true" aria-label={photo ? 'Stutzen am Foto nachzeichnen' : 'Umriss zeichnen'}>
    <div class="head">
      <h3>{photo ? 'Stutzen am Foto nachzeichnen' : 'Umriss zeichnen'}</h3>
      <button type="button" class="x" aria-label="Schließen" onclick={close}>✕</button>
    </div>
    <div class="steps">
      {#if photo}<span class:on={step === 'scale'} class:done={step !== 'scale'}>{step !== 'scale' ? '✓ ' : ''}1 Maßstab</span>{/if}
      <span class:on={step === 'outline'} class:done={step === 'check'}>{step === 'check' ? '✓ ' : ''}{photo ? '2' : '1'} Umriss anklicken</span>
      <span class:on={step === 'check'}>{photo ? '3' : '2'} Prüfen</span>
    </div>
    {#if askClose}
      <div class="ask" role="alertdialog" aria-label="Zeichnung verwerfen?">
        <span>Die gesetzten Punkte gehen verloren. Wirklich schließen?</span>
        <button type="button" class="ghost sm" onclick={() => (askClose = false)}>Weiter zeichnen</button>
        <button type="button" class="ghost sm danger" onclick={oncancel}>Verwerfen</button>
      </div>
    {/if}
    <div class="body">
      <div class="canvas-wrap">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg
        bind:this={svg}
        class="canvas"
        class:photo={!!img}
        viewBox="{view.x} {view.y} {view.w} {view.h}"
        preserveAspectRatio="xMidYMid meet"
        onpointerdown={(e) => down(e)}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onwheel={wheel}
      >
        {#if img}
          <image href={img.url} x="0" y="0" width={step === 'scale' || !ppm ? img.w : img.w / ppm} height={step === 'scale' || !ppm ? img.h : img.h / ppm} />
        {/if}
        {#if !img}
          <path d={grid.minor} class="g1" stroke-width={k} />
          <path d={grid.major} class="g2" stroke-width={k * 1.6} />
          <path d="M-3 0H3M0 -3V3" class="org" stroke-width={k * 2} />
        {/if}
        {#if step === 'scale'}
          {#if s1 && s2}<line x1={s1[0]} y1={s1[1]} x2={s2[0]} y2={s2[1]} class="sl" stroke-width={view.w / 250} />{/if}
          {#each [s1, s2] as s, i}
            {#if s}<circle cx={s[0]} cy={s[1]} r={view.w / 110} class="sp" stroke-width={view.w / 400} onpointerdown={(e) => down(e, i ? 's2' : 's1')} />{/if}
          {/each}
        {:else if step === 'outline'}
          {#if verts.length > 1}
            {#each verts as v, i}
              {@const w = verts[(i + 1) % verts.length]}
              {#if i < verts.length - 1 || verts.length > 2}
                <line x1={v[0]} y1={v[1]} x2={w[0]} y2={w[1]} class="seg" stroke-width={k * 2.4} class:closing={i === verts.length - 1} />
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <line x1={v[0]} y1={v[1]} x2={w[0]} y2={w[1]} class="hit" stroke-width={k * 14} ondblclick={(e) => insert(e, i)} onpointerdown={(e) => e.stopPropagation()} />
              {/if}
            {/each}
          {/if}
          {#each verts as v, i}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle cx={v[0]} cy={v[1]} r={k * 7} class="pt" class:sel={sel === i} class:round={v[2] > 0} stroke-width={k * 2.4} onpointerdown={(e) => down(e, 'pt', i)} />
          {/each}
        {:else if result}
          <path d={prevPath} class="res" stroke-width={k * 2.4} />
        {/if}
      </svg>
      <div class="zoom">
        <button type="button" aria-label="Vergrößern" onclick={() => zoomBtn(1 / 1.4)}>+</button>
        <button type="button" aria-label="Verkleinern" onclick={() => zoomBtn(1.4)}>−</button>
        <button type="button" aria-label="Alles zeigen" title="Alles zeigen" onclick={showAll}>⤢</button>
        {#if step === 'outline'}<button type="button" aria-label="Rückgängig" title="Rückgängig (Strg+Z)" disabled={!history.length} onclick={undo}>↶</button>{/if}
      </div>
      </div>

      <div class="side">
        {#if step === 'scale'}
          <div class="tip">
            {#if !img}
              <b>Foto wählen</b><br />Von vorne auf den Stutzen fotografieren (Blick auf die Öffnung), genau gerade, ein Lineal auf Höhe der Stutzenkante daneben legen.
              <button type="button" class="ghost sm" onclick={() => fileIn?.click()}>Foto wählen&nbsp;…</button>
            {:else}
              <b>Maßstab</b><br />Auf zwei Marken des Lineals klicken (z. B. 0 und 5 cm). Die Punkte lassen sich verschieben; Mausrad oder zwei Finger zoomen.
              <button type="button" class="link" onclick={() => fileIn?.click()}>Anderes Foto&nbsp;…</button>
            {/if}
          </div>
          {#if img}
            <span class="fl">Abstand der beiden Punkte</span>
            <NumberField bind:value={scaleLen} min={5} max={1000} step={1} label="Abstand der Maßstab-Punkte" />
            <p class="small">{ppm ? `${fmt(ppm, 2)} Pixel je mm` : s1 ? 'Noch den zweiten Punkt setzen.' : 'Ersten Punkt setzen.'}</p>
            {#if s1}<button type="button" class="link" onclick={() => (s1 = s2 = null)}>Punkte neu setzen</button>{/if}
          {/if}
        {:else if step === 'outline'}
          <div class="tip">
            <b>So geht's</b><br />Rund um den Stutzen auf jede Ecke klicken. Punkte lassen sich ziehen, Doppelklick auf eine Linie fügt einen Punkt ein. Runde Stellen: mehrere Punkte setzen oder einer Ecke einen Radius geben. Leere Fläche ziehen verschiebt, Mausrad oder zwei Finger zoomen. Strg+Z macht den letzten Schritt rückgängig.
          </div>
          {#if sel !== null && verts[sel]}
            <div class="selbox">
              <b>Punkt {sel + 1}</b>
              <div class="g3">
                <div><span class="fl">X</span><NumberField bind:value={verts[sel][0]} step={0.1} label="X des Punkts" /></div>
                <div><span class="fl">Y</span><NumberField bind:value={verts[sel][1]} step={0.1} label="Y des Punkts" /></div>
                <div><span class="fl">Ecke runden R</span><NumberField bind:value={verts[sel][2]} min={0} max={100} step={0.5} label="Eckradius des Punkts" /></div>
              </div>
              <button type="button" class="link" onclick={remove}>Punkt löschen</button>
            </div>
          {/if}
          <p class="small">{verts.length} Punkte{resB ? ` · ${fmt(resB.w)} × ${fmt(resB.h)} mm` : ''}</p>
          {#if verts.length}<button type="button" class="link" onclick={() => (snap0(), (verts = []), (sel = null))}>Alle Punkte löschen</button>{/if}
        {:else}
          <div class="tip">
            <b>Gemessen:</b> {resB ? `${fmt(resB.w)} × ${fmt(resB.h)} mm` : '–'}<br />
            Zum Vergleich mit dem Messschieber die Breite messen. Weicht sie ab, hier eintragen (die Kontur wird gleichmäßig angepasst):
          </div>
          <span class="fl">Breite laut Messschieber</span>
          <NumberField bind:value={measured} min={CONTOUR_MIN} max={CONTOUR_MAX} step={0.1} label="Breite laut Messschieber" />
          {#if result?.rounded}<p class="small">{result.rounded} spitze Ecke{result.rounded > 1 ? 'n werden' : ' wird'} auf R 0,5 gerundet.</p>{/if}
          {#if img}<p class="warnbox">Foto möglichst <b>genau von oben</b> und mit etwas Abstand (Zoom) machen. Schräg fotografiert wird die Kontur verzerrt; dann die Breite hier korrigieren.</p>{/if}
        {/if}
        {#if step !== 'scale' && problems.length && verts.length >= 3}<ul class="probs">{#each problems as p}<li>{p}</li>{/each}</ul>{/if}
        <div class="btns">
          {#if step === 'outline' && photo}<button type="button" class="ghost" onclick={() => (step = 'scale')}>Zurück</button>{/if}
          {#if step === 'check'}<button type="button" class="ghost" onclick={() => (step = 'outline')}>Zurück</button>{/if}
          {#if step === 'scale'}
            <button type="button" class="next" disabled={!ppm} onclick={toOutline}>Weiter: Umriss ›</button>
          {:else if step === 'outline'}
            <button type="button" class="next" disabled={problems.length > 0} onclick={toCheck}>Weiter: Prüfen ›</button>
          {:else}
            <button type="button" class="next" disabled={problems.length > 0 || !(measured > 0)} onclick={finish}>Übernehmen</button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .hidden-file { display: none; }
  .backdrop { position: fixed; inset: 0; background: rgba(30, 36, 42, 0.55); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dlg { background: var(--card); border-radius: 16px; width: min(1180px, 100%); max-height: 100%; overflow: auto; padding: 18px 22px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font-size: 20px; font-weight: 700; font-style: italic; }
  .x { border: 0; background: none; font-size: 20px; color: var(--slate-2); }
  .steps { display: flex; gap: 24px; font-size: 14px; color: #999; }
  .steps .on { color: var(--sky-d); font-weight: 700; border-bottom: 2px solid var(--sky); }
  .steps .done { color: #1d7a46; font-weight: 600; }
  .body { display: flex; gap: 20px; min-height: 0; }
  .canvas-wrap { position: relative; flex: 1 1 auto; min-width: 0; display: flex; }
  .zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .zoom button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); font-size: 17px; line-height: 1; padding: 0; }
  .zoom button:hover:not(:disabled) { border-color: var(--sky); }
  .zoom button:disabled { opacity: 0.4; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 12px; border-radius: 8px; border-left: 4px solid var(--signal, #e8b400); background: var(--warn-bg); font-size: 14px; }
  .ask .ghost.sm { margin-top: 0; }
  .ask .danger { border-color: var(--red); color: var(--red); }
  .canvas { flex: 1 1 auto; min-width: 0; height: min(64vh, 560px); background: var(--canvas); border: 1px solid var(--line); border-radius: 10px; touch-action: none; cursor: crosshair; user-select: none; }
  .canvas.photo { background: #222; }
  .g1 { stroke: var(--grid1); fill: none; }
  .g2 { stroke: #c9d3db; fill: none; }
  .org { stroke: #8fa0ad; }
  .sl { stroke: var(--red); }
  .sp { fill: var(--card); stroke: var(--red); cursor: grab; }
  .seg { stroke: var(--sky); fill: none; }
  .seg.closing { stroke-dasharray: 2 2; opacity: 0.8; }
  .hit { stroke: transparent; cursor: copy; }
  .pt { fill: var(--card); stroke: var(--sky-d); cursor: grab; }
  .pt.round { fill: #bfe3f7; }
  .pt.sel { fill: var(--red); stroke: #fff; }
  .res { fill: rgba(232, 66, 58, 0.18); stroke: var(--red); stroke-linejoin: round; }
  .side { width: 330px; flex: none; display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.5; }
  .tip { background: var(--mist); border-radius: 10px; padding: 10px 12px; }
  /* Knopf und Link unter dem Text, nicht neben dem letzten Wort */
  .tip > button { display: flex; margin-top: 10px; }
  .warnbox { background: var(--warn-bg); border-radius: 10px; padding: 8px 12px; font-size: 13px; margin: 0; }
  .fl { display: block; font-size: 13px; font-weight: 500; margin-bottom: 2px; }
  .small { margin: 0; font-size: 13px; color: var(--slate-2); }
  .selbox { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .g3 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
  .g3 > div:last-child { grid-column: 1 / -1; }
  .link { border: 0; background: none; padding: 0; color: var(--cobalt-d, var(--sky-d)); font-weight: 600; font-size: 13px; cursor: pointer; align-self: flex-start; }
  .link:hover { color: var(--red); }
  .probs { margin: 0; padding-left: 18px; color: var(--red); font-size: 13px; }
  .btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; }
  @media (max-width: 820px) {
    .body { flex-direction: column; }
    .side { width: auto; }
    .canvas { height: 52vh; }
  }
</style>
