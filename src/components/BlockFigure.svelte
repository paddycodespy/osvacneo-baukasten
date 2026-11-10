<script lang="ts">
  /** Kleine Erklärskizze je Baustein: was die Maße bedeuten (Seitenansicht, Mittellinie gestrichelt). */
  import type { BlockType } from '../lib/osvac/freeform';
  let { type }: { type: BlockType } = $props();
</script>

<svg class="bfig" viewBox="0 0 240 96" role="img" aria-label="Skizze: {type === 'straight' ? 'Länge der Geraden' : type === 'bend' ? 'Winkel und Radius des Bogens' : type === 'transition' ? 'Länge, Versatz und Knick des Übergangs' : 'Absatz mit 45°-Schräge'}">
  {#if type === 'straight'}
    <rect x="30" y="30" width="150" height="36" class="part" />
    <line x1="18" y1="48" x2="196" y2="48" class="axis" />
    <line x1="30" y1="80" x2="180" y2="80" class="dim" />
    <text x="105" y="93" class="lt" text-anchor="middle">Länge</text>
  {:else if type === 'bend'}
    <!-- Viertelbogen: Mittelpunkt links unten -->
    <path d="M40 22 A62 62 0 0 1 102 84 L78 84 A38 38 0 0 0 40 46 Z" class="part" />
    <path d="M40 34 A50 50 0 0 1 90 84" class="axis" fill="none" />
    <circle cx="40" cy="84" r="2.5" class="pt" />
    <line x1="40" y1="84" x2="75.4" y2="48.6" class="dim" />
    <text x="50" y="62" class="lt" text-anchor="start">R</text>
    <path d="M58 84 A18 18 0 0 0 40 66" class="dim" fill="none" />
    <text x="62" y="78" class="lt" text-anchor="start">Winkel</text>
    <text x="118" y="34" class="lt" text-anchor="start">R = Radius der</text>
    <text x="118" y="48" class="lt" text-anchor="start">Mittellinie</text>
    <text x="118" y="70" class="lt mute" text-anchor="start">größer = sanfter</text>
  {:else if type === 'transition'}
    <!-- gerader Anfang, S-förmig nach oben versetzt, Endfläche geneigt (Knick) -->
    <path d="M14 40 H50 C88 40 98 18 136 14 L140 38 C110 42 92 64 50 64 H14 Z" class="part" />
    <path d="M14 52 H50 C90 52 104 30 138 26" class="axis" />
    <line x1="14" y1="52" x2="170" y2="52" class="axis thin" />
    <line x1="160" y1="52" x2="160" y2="26" class="dim" />
    <text x="166" y="43" class="lt" text-anchor="start">V</text>
    <line x1="138" y1="26" x2="160" y2="20" class="dim thin" />
    <path d="M150 23 A14 14 0 0 0 151 30" class="dim" fill="none" />
    <text x="176" y="24" class="lt" text-anchor="start">K</text>
    <line x1="14" y1="78" x2="138" y2="78" class="dim" />
    <text x="76" y="91" class="lt" text-anchor="middle">Länge</text>
    <text x="186" y="80" class="lt mute" text-anchor="start">V Versatz</text>
    <text x="186" y="92" class="lt mute" text-anchor="start">K Knick</text>
  {:else}
    <path d="M20 26 H80 L100 46 H190 V50 H100 L80 70 H20 Z" class="part" />
    <line x1="10" y1="48" x2="200" y2="48" class="axis" />
    <text x="122" y="30" class="lt" text-anchor="start">45°-Schräge,</text>
    <text x="122" y="43" class="lt" text-anchor="start">Länge automatisch</text>
  {/if}
</svg>

<style>
  .bfig { width: 100%; max-width: 300px; height: auto; display: block; background: var(--mist); border-radius: 8px; margin: 4px 0 8px; }
  .part { fill: #ffd9d6; stroke: var(--red); stroke-width: 1.4; }
  .axis { stroke: var(--graphite); stroke-width: 1; stroke-dasharray: 5 3; fill: none; }
  .axis.thin { opacity: 0.35; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .dim.thin { stroke-width: 0.9; stroke-dasharray: 2 2; }
  .pt { fill: var(--sky-d); }
  .lt { font-family: var(--body); font-size: 11.5px; font-weight: 600; fill: var(--sky-d); }
  .mute { fill: var(--grey); font-weight: 500; }
</style>
