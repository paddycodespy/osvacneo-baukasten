<script lang="ts">
  import type { EndType } from '../lib/osvac/catalog';
  let { top, bottom }: { top: EndType; bottom: EndType | null } = $props();
  // Schematische Seitenansicht: oben → unten wie gedruckt
  const H = 56;
  const shapes = $derived(bottom ? [top, bottom] : [top]);
</script>

<svg class="kind-icon" viewBox="0 0 44 {H}" aria-hidden="true">
  {#each shapes as s, i}
    {@const y = bottom ? (i === 0 ? 3 : 29) : 15}
    {#if s === 'female'}
      <rect x="6" y={y} width="32" height="24" rx="3" class="f" />
      {#each [10, 14, 18, 22, 26, 30, 34] as x}<line x1={x} x2={x} y1={y + 4} y2={y + 20} class="rib" />{/each}
    {:else if s === 'male'}
      <rect x="11" y={y} width="22" height="24" rx="2" class="m" />
      <rect x="8" y={y + 14} width="28" height="5" rx="1" class="m" />
    {:else if s === 'hose'}
      <path d="M10 {y} h24 l3 24 h-30 z" class="h" />
      {#each [5, 11, 17] as d}<line x1="12" x2="32" y1={y + d} y2={y + d + 3} class="rib" />{/each}
    {:else if s === 'gate'}
      <!-- Rohr mit Rahmen und Schieberplatte, die seitlich herausragt -->
      <rect x="13" y="0" width="18" height="54" rx="1.5" class="h" />
      <rect x="9" y="22" width="26" height="10" rx="1.5" class="h" />
      <rect x="2" y="25.5" width="40" height="3" rx="1" class="m" />
    {:else if s === 'nozzle'}
      <!-- schmale Düse mit schräger Spitze -->
      <path d="M15 {y + 24} V{y + 16} L18 {y + 9} V{y + 4} L26 {y - 3} V{y + 9} L29 {y + 16} V{y + 24} Z" class="h" />
    {:else if s === 'bleed'}
      <!-- Kupplung mit Drehring und Fenster darunter -->
      <path d="M12 {y} H32 V{y + 12} L28 {y + 16} V{y + 24} H16 V{y + 16} L12 {y + 12} Z" class="h" />
      <rect x="11" y={y + 15} width="22" height="7" rx="1.5" class="h" />
      <rect x="19" y={y + 16.5} width="6" height="4" class="win" />
    {:else if s === 'magnet' || s === 'magnet-plate'}
      <!-- Adapter, zwei Flansche mit Nasen, dazwischen die Magnete -->
      <rect x="12" y="2" width="20" height="20" rx="1.5" class="h" />
      <rect x="4" y="22" width="36" height="5" rx="1" class="m" />
      <rect x="4" y="29" width="36" height="5" rx="1" class="m" />
      <rect x="8" y="23.5" width="5" height="2" class="mag" /><rect x="31" y="23.5" width="5" height="2" class="mag" />
      <rect x="8" y="30.5" width="5" height="2" class="mag" /><rect x="31" y="30.5" width="5" height="2" class="mag" />
      {#if s === 'magnet'}
        <!-- Schlauch mit Rillen, nach unten weiter werdend -->
        <path d="M13 34 h18 l3 20 h-24 z" class="h" />
        {#each [38, 43, 48] as d}<line x1="13" x2="31" y1={d} y2={d + 2.5} class="rib" />{/each}
      {:else}
        <!-- Platte mit zwei Anschlüssen: Kupplung (gerippt) und Stecker (mit Bund) -->
        <rect x="5" y="34" width="15" height="20" rx="2" class="f" />
        {#each [9, 12.5, 16] as x}<line x1={x} x2={x} y1="38" y2="50" class="rib" />{/each}
        <rect x="27" y="34" width="10" height="20" rx="1.5" class="m" />
        <rect x="25" y="45" width="14" height="4" rx="1" class="m" />
      {/if}
    {:else if s === 'helper'}
      <!-- Block mit Stutzen und Rippe -->
      <rect x="13" y="2" width="18" height="27" rx="1.5" class="m" />
      <rect x="9" y="7" width="4" height="22" rx="1" class="m" />
      <rect x="31" y="7" width="4" height="22" rx="1" class="m" />
      <rect x="3" y="29" width="38" height="24" rx="2" class="h" />
    {:else if s === 'free'}
      <!-- Rohrbogen, der nach rechts abknickt -->
      <path d="M13 {y} V{y + 9} Q13 {y + 25} 29 {y + 25} H42 V{y + 12} H31 Q27 {y + 12} 27 {y + 8} V{y} Z" class="h" />
    {:else}
      <path d="M12 {y} h20 v10 l4 14 h-28 l4 -14 z" class="h" />
    {/if}
  {/each}
</svg>

<style>
  .kind-icon { width: 40px; height: 52px; flex: none; }
  .f, .m, .h { fill: var(--icon-fill, var(--soft)); stroke: var(--icon-stroke, var(--ink)); stroke-width: 1.4; }
  .mag { fill: var(--icon-stroke, var(--ink)); }
  .win { fill: var(--card); stroke: var(--icon-stroke, var(--ink)); stroke-width: 1; }
  .rib { stroke: var(--icon-stroke, var(--ink)); stroke-width: 1; opacity: 0.45; }
</style>
