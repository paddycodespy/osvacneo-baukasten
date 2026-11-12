<script lang="ts">
  /**
   * Seitenansicht Schieber einzeln an der Wand: Rohr steckt oben und unten in den Muffen.
   * In der Zeichnung nur Buchstaben an freien Stellen, die Bedeutung steht rechts daneben.
   */
  let { mount = true }: { mount?: boolean } = $props();
</script>

<svg class="gfig" viewBox="0 0 300 176" role="img" aria-label="Skizze Schieber: Rohr außen, Tiefe der Muffen{mount ? ', Abstand Wand bis Rohrmitte' : ''}">
  {#if mount}
    <!-- Wand und Wandplatte mit Steg -->
    <rect x="6" y="8" width="14" height="160" class="wall" />
    <rect x="20" y="40" width="6" height="96" class="part" />
    <rect x="26" y="74" width="40" height="28" class="part" />
  {/if}
  <!-- Gehäuse: Muffen oben und unten, Rahmen in der Mitte -->
  <path d="M66 34 H124 V76 H134 V100 H124 V142 H66 V100 H56 V76 H66 Z" class="part" />
  <!-- Rohre (eingesteckt) -->
  <path d="M71 6 V58 M119 6 V58 M71 118 V170 M119 118 V170" class="pipe" />
  <line x1="95" y1="2" x2="95" y2="174" class="axis" />
  <!-- Rohr außen -->
  <line x1="71" y1="24" x2="119" y2="24" class="dim" />
  <text x="78" y="18" class="lt">D</text>
  <!-- Tiefe der Muffe -->
  <line x1="130" y1="34" x2="130" y2="58" class="dim" />
  <line x1="126" y1="58" x2="134" y2="58" class="dim" />
  <text x="136" y="51" class="lt">T</text>
  {#if mount}
    <!-- Wand bis Rohrmitte -->
    <line x1="20" y1="156" x2="95" y2="156" class="dim" />
    <text x="40" y="150" class="lt">A</text>
  {/if}
  <text x="168" y="40" class="key">D</text>
  <text x="184" y="40" class="mute">Rohr außen</text>
  <text x="168" y="62" class="key">T</text>
  <text x="184" y="62" class="mute">Tiefe der Muffen</text>
  {#if mount}
    <text x="168" y="84" class="key">A</text>
    <text x="184" y="84" class="mute">Wand bis</text>
    <text x="184" y="98" class="mute">Rohrmitte</text>
  {/if}
</svg>

<style>
  .gfig { width: 100%; max-width: 340px; height: auto; display: block; background: var(--mist); border-radius: 8px; margin: 10px 0 6px; }
  .part { fill: #ffd9d6; stroke: var(--red); stroke-width: 1.4; }
  .wall { fill: #c9d1d5; stroke: var(--slate-2); stroke-width: 1; }
  .pipe { fill: none; stroke: var(--graphite); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .axis { stroke: var(--graphite); stroke-width: 1; stroke-dasharray: 5 3; opacity: 0.5; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .lt, .key { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
  .mute { font-family: var(--body); font-size: 12px; font-weight: 500; fill: var(--slate); }
</style>
