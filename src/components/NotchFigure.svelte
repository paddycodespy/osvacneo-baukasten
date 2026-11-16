<script lang="ts">
  /**
   * Querschnitt des Stutzens mit der Aussparung (rot), Klick setzt die Lage.
   * Winkel wie in der Geometrie: 0° = rechts (+u), 90° = oben (+v).
   */
  import { samplePoints, type Section } from '../lib/osvac/freeform';

  let { section, dir, width, onpick }: { section: Section; dir: number; width: number; onpick: (deg: number) => void } = $props();

  const W = 200, H = 120, PAD = 12;
  const pts = $derived(samplePoints(section, 240, 0));
  const scale = $derived.by(() => {
    const ext = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x) / (W / 2 - PAD), Math.abs(y) / (H / 2 - PAD))));
    return ext > 0 ? 1 / ext : 1;
  });
  const sx = (x: number) => W / 2 + x * scale;
  const sy = (y: number) => H / 2 - y * scale;
  const outline = $derived(pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' ') + ' Z');
  /** Teile der Kontur im Bereich der Aussparung */
  const cut = $derived.by(() => {
    const r = (dir * Math.PI) / 180;
    const ray = [Math.cos(r), Math.sin(r)], perp = [-ray[1], ray[0]];
    const inside = pts.map(([x, y]) => x * ray[0] + y * ray[1] > 0 && Math.abs(x * perp[0] + y * perp[1]) < width / 2);
    const segs: string[] = [];
    let cur = '';
    for (let k = 0; k <= pts.length; k++) {
      const i = k % pts.length;
      if (inside[i]) cur += `${cur ? 'L' : 'M'}${sx(pts[i][0]).toFixed(1)} ${sy(pts[i][1]).toFixed(1)} `;
      else if (cur) (segs.push(cur), (cur = ''));
    }
    if (cur) segs.push(cur);
    return segs;
  });

  function pick(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const b = svg.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W - W / 2;
    const y = H / 2 - ((e.clientY - b.top) / b.height) * H;
    if (Math.hypot(x, y) < 2) return;
    const deg = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 / 5) * 5;
    onpick(deg % 360);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg class="notch-fig" viewBox="0 0 {W} {H}" role="img" aria-label="Lage der Aussparung am Querschnitt" onclick={pick}>
  <path d={outline} class="nf-shape" />
  {#each cut as d}<path {d} class="nf-cut" />{/each}
</svg>

<style>
  .notch-fig { display: block; width: 100%; max-width: 220px; height: auto; margin: 2px 0 8px; cursor: pointer; }
  .nf-shape { fill: var(--card); stroke: var(--graphite); stroke-width: 1.5; }
  .nf-cut { fill: none; stroke: var(--red); stroke-width: 6; stroke-linecap: round; }
</style>
