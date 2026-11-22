<script lang="ts">
  /**
   * Schnitt durch die Dichtnut unten in der Kupplung, maßstäblich (rechte Wandhälfte, Achse links):
   * Boden, Rundung R1,95 als Hinterschneidung, Bohrung darüber, Steckerspitze gestrichelt (eingedreht, Nasen oben in der Nut: so steht sie mit Dichtung),
   * eine Rundschnur passender Größe gepunktet bzw. der Dichtring aus TPU (Lippendichtung) blau. Buchstaben an Hinweislinien rechts, Bedeutung in der Tabelle darunter.
   */
  import { MALE_TIP_EDGE, type SealGroove, type SealRing } from '../lib/osvac/seal';
  /** ring: Dichtring aus TPU (statt der Rundschnur gezeichnet, ungepresst) */
  let { s, ring }: { s: SealGroove; ring?: SealRing } = $props();

  const K = 24; // px je mm
  const X0 = -2.9, Z1 = 6.6; // linke obere Ecke in mm (x ab Innenradius, z ab Boden)
  const X = (x: number) => +((x - X0) * K).toFixed(2);
  const Y = (z: number) => +((Z1 - z) * K).toFixed(2);

  const g = $derived.by(() => {
    const ri = s.inner / 2;
    const dx = s.centerD / 2 - ri; // Mitte der Rundung
    const xb = s.bore / 2 - ri; // Bohrung
    const xo = s.outer / 2 - ri; // tiefste Stelle
    const e = MALE_TIP_EDGE;
    const xm = s.tipOuter / 2 + e - ri; // Stecker außen
    const R = s.radius, hb = s.heightAtBore, t = s.tipMax;
    const wall = `M${X(0)} ${Y(0)} H${X(dx)} A${R * K} ${R * K} 0 0 0 ${X(xb)} ${Y(hb)} V${Y(6.4)} H${X(5.6)} V${Y(-1)} H${X(0)} Z`;
    const male = `M${X(0)} ${Y(6.4)} V${Y(t + e)} A${e * K} ${e * K} 0 0 0 ${X(e)} ${Y(t)} H${X(xm - e)} L${X(xm)} ${Y(t + e)} V${Y(6.4)}`;
    const a30 = Math.PI / 6;
    const pc: [number, number] = [dx + R * Math.cos(a30), R + R * Math.sin(a30)];
    const q = ring;
    const ringPath = q ? 'M' + q.pts.map(([x, z]) => `${X(x - ri)} ${Y(z)}`).join(' L') + ' Z' : '';
    return { dx, xb, xo, xm, R, hb, t, wall, male, pc, ringPath };
  });
  const XL = 6.0; // Ende der Hinweislinien
</script>

<svg class="sfig" viewBox="0 0 248 182" role="img" aria-label="Skizze Dichtnut: Schnitt durch die Kupplung unten, links die Mitte, mit Steckerspitze und Rundschnur">
  <!-- Wand der Kupplung mit Boden und Nut -->
  <path d={g.wall} class="part" />
  {#if g.ringPath}
    <!-- Dichtring aus TPU (Lippendichtung), ohne Stecker: die Steckerspitze überdeckt die Lippe um die Vorspannung -->
    <path d={g.ringPath} class="ring" />
  {:else}
    <!-- Rundschnur passender Größe -->
    <circle cx={X(g.dx)} cy={Y(g.R)} r={g.R * K} class="cord" />
  {/if}
  <!-- Steckerspitze eingedreht, mit Dichtung (Nasen oben in der Nut) -->
  <path d={g.male} class="male" />
  <!-- Hinweislinien -->
  <path d="M{X(g.xb)} {Y(5)} H{X(XL)}" class="lead" />
  <path d="M{X(g.xb)} {Y(g.hb)} H{X(XL)}" class="lead" />
  <path d="M{X(g.pc[0])} {Y(g.pc[1])} L{X(XL)} {Y(2.85)}" class="lead" />
  <path d="M{X(g.xo)} {Y(g.R)} H{X(XL)}" class="lead" />
  <circle cx={X(g.xo)} cy={Y(g.R)} r="2" class="dot" />
  <text x={X(XL) + 4} y={Y(5) + 4} class="lt">A</text>
  <text x={X(XL) + 4} y={Y(g.hb) + 4} class="lt">D</text>
  <text x={X(XL) + 4} y={Y(2.85) + 4} class="lt">C</text>
  <text x={X(XL) + 4} y={Y(g.R) + 4} class="lt">B</text>
  <!-- Steckerspitze über dem Boden -->
  <path d="M{X(0)} {Y(0)} H{X(-1)} M{X(0)} {Y(g.t)} H{X(-1)} M{X(-0.7)} {Y(0)} V{Y(g.t)}" class="lead" />
  <text x={X(-1.55)} y={Y(g.t / 2) + 4} class="lt">E</text>
  <!-- Richtung zur Mitte der Kupplung (Achse liegt weit links) -->
  <path d="M{X(-2.7)} {Y(6.0)} h24 M{X(-2.7)} {Y(6.0)} l5 -3.5 M{X(-2.7)} {Y(6.0)} l5 3.5" class="axis" />
  <text x={X(-2.7)} y={Y(6.0) + 16} class="mute">Mitte</text>
</svg>

<style>
  .sfig { width: 100%; max-width: 268px; height: auto; display: block; background: var(--card); border-radius: 8px; margin: 8px 0 6px; }
  .part { fill: var(--red-l); stroke: var(--red); stroke-width: 1.4; }
  .male { fill: none; stroke: var(--graphite); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .ring { fill: var(--sky-l); stroke: var(--sky); stroke-width: 1.2; fill-opacity: 0.9; }
  .cord { fill: none; stroke: var(--slate); stroke-width: 1.2; stroke-dasharray: 1.5 2.5; }
  .lead { fill: none; stroke: var(--sky-d); stroke-width: 1; }
  .dot { fill: var(--sky-d); }
  .axis { fill: none; stroke: var(--slate); stroke-width: 1.2; }
  .mute { font-family: var(--body); font-size: 11px; font-weight: 500; fill: var(--slate); }
  .lt { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
</style>
