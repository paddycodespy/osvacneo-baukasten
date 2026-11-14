<script lang="ts">
  /**
   * Kleine Erklärskizze je Baustein (Seitenansicht). In der Zeichnung stehen nur Buchstaben an freien Stellen,
   * was sie bedeuten, steht rechts daneben. Keine Beschriftung berührt Form, Maß- oder Mittellinie.
   */
  import type { BlockType } from '../lib/osvac/freeform';
  let { type }: { type: BlockType } = $props();
</script>

<svg class="bfig" viewBox="0 0 280 104" role="img" aria-label="Skizze: {type === 'straight' ? 'Länge der Geraden' : type === 'bend' ? 'Winkel und Radius des Bogens' : type === 'transition' ? 'Länge, Versatz und Knick des Übergangs' : type === 'branch' ? 'Winkel, Durchmesser und Länge des Abzweigs' : type === 'gate' ? 'Länge des Schiebers und Schieberplatte' : type === 'bleed' ? 'Länge des Nebenluft-Reglers mit Drehring' : 'Absatz mit 45°-Schräge'}">
  {#if type === 'straight'}
    <rect x="24" y="30" width="140" height="34" class="part" />
    <line x1="12" y1="47" x2="176" y2="47" class="axis" />
    <line x1="24" y1="78" x2="164" y2="78" class="dim" />
    <line x1="24" y1="73" x2="24" y2="83" class="dim" />
    <line x1="164" y1="73" x2="164" y2="83" class="dim" />
    <text x="94" y="97" class="lt" text-anchor="middle">L</text>
    <text x="194" y="44" class="key">L</text>
    <text x="210" y="44" class="mute">Länge</text>
  {:else if type === 'bend'}
    <!-- Viertelbogen um den Drehpunkt (36|86), Mittellinie gestrichelt -->
    <path d="M36 26 A60 60 0 0 1 96 86 L72 86 A36 36 0 0 0 36 50 Z" class="part" />
    <path d="M36 38 A48 48 0 0 1 84 86" class="axis" />
    <circle cx="36" cy="86" r="2.5" class="pt" />
    <!-- Radius bis zur Mittellinie bei 70° -->
    <line x1="36" y1="86" x2="52.4" y2="40.9" class="dim" />
    <!-- Winkel -->
    <path d="M52 86 A16 16 0 0 0 36 70" class="dim" fill="none" />
    <!-- Buchstaben außerhalb der Form, mit kurzer Hinweislinie -->
    <polyline points="44.2,63.4 30,56" class="lead" />
    <text x="18" y="57" class="lt">R</text>
    <polyline points="47.3,74.7 56,90" class="lead" />
    <text x="58" y="100" class="lt">W</text>
    <text x="124" y="40" class="key">R</text>
    <text x="142" y="40" class="mute">Radius, gemessen</text>
    <text x="142" y="54" class="mute">bis zur Mitte des Rohrs</text>
    <text x="124" y="76" class="key">W</text>
    <text x="142" y="76" class="mute">Winkel</text>
  {:else if type === 'transition'}
    <!-- gerader Anfang, nach oben versetzt, Ende geneigt (Knick) -->
    <path d="M14 44 H46 C80 44 92 22 126 18 L131 42 C104 46 84 68 46 68 H14 Z" class="part" />
    <path d="M14 56 H46 C82 56 96 34 128 30" class="axis" />
    <line x1="14" y1="56" x2="154" y2="56" class="axis thin" />
    <line x1="146" y1="56" x2="146" y2="30" class="dim" />
    <line x1="141" y1="30" x2="151" y2="30" class="dim" />
    <text x="152" y="47" class="lt">V</text>
    <line x1="14" y1="84" x2="128" y2="84" class="dim" />
    <line x1="14" y1="79" x2="14" y2="89" class="dim" />
    <line x1="128" y1="79" x2="128" y2="89" class="dim" />
    <text x="71" y="101" class="lt" text-anchor="middle">L</text>
    <text x="138" y="18" class="lt">K</text>
    <text x="178" y="30" class="key">L</text>
    <text x="196" y="30" class="mute">Länge</text>
    <text x="178" y="50" class="key">V</text>
    <text x="196" y="50" class="mute">Versatz</text>
    <text x="178" y="70" class="key">K</text>
    <text x="196" y="70" class="mute">Knick</text>
  {:else if type === 'branch'}
    <!-- Rohr waagerecht, Abzweig unter 45° nach oben rechts, Ende C am Abzweig -->
    <path d="M16 56 H55 L91.1 19.9 L108.1 36.9 L89 56 H136 V80 H16 Z" class="part" />
    <line x1="8" y1="68" x2="144" y2="68" class="axis" />
    <line x1="60" y1="68" x2="106" y2="22" class="axis" />
    <path d="M80 68 A20 20 0 0 0 74.1 53.9" class="dim" fill="none" />
    <polyline points="78.4,60.3 96,90" class="lead" />
    <text x="98" y="101" class="lt">W</text>
    <line x1="84" y1="27" x2="101" y2="44" class="dim" />
    <polyline points="84,27 74,22" class="lead" />
    <text x="62" y="24" class="lt">Ø</text>
    <line x1="16" y1="88" x2="136" y2="88" class="dim" />
    <line x1="16" y1="84" x2="16" y2="92" class="dim" />
    <line x1="136" y1="84" x2="136" y2="92" class="dim" />
    <text x="40" y="101" class="lt">L</text>
    <text x="112" y="18" class="lt">C</text>
    <text x="158" y="30" class="key">W</text>
    <text x="174" y="30" class="mute">Winkel</text>
    <text x="158" y="48" class="key">Ø</text>
    <text x="174" y="48" class="mute">Abzweig, innen</text>
    <text x="158" y="66" class="key">L</text>
    <text x="174" y="66" class="mute">Rohrlänge</text>
    <text x="158" y="84" class="key">C</text>
    <text x="174" y="84" class="mute">Ende C</text>
  {:else if type === 'bleed'}
    <!-- Rohr waagerecht, Bunde mit 45°-Flanken, Drehring (Parallelogramm) dazwischen, Fenster im Ring -->
    <path d="M16 34 H40 L48 26 H52 L60 34 H96 L104 26 H108 L116 34 H136 V60 H116 L108 68 H104 L96 60 H60 L52 68 H48 L40 60 H16 Z" class="part" />
    <path d="M62 33 L68 25 H94 L100 33 Z" class="plate" />
    <path d="M62 61 L68 69 H94 L100 61 Z" class="plate" />
    <rect x="74" y="27" width="14" height="5" class="win" />
    <line x1="8" y1="47" x2="144" y2="47" class="axis" />
    <line x1="16" y1="84" x2="136" y2="84" class="dim" />
    <line x1="16" y1="79" x2="16" y2="89" class="dim" />
    <line x1="136" y1="79" x2="136" y2="89" class="dim" />
    <text x="76" y="101" class="lt" text-anchor="middle">L</text>
    <polyline points="81,22 81,12 96,12" class="lead" />
    <text x="99" y="16" class="lt">R</text>
    <text x="158" y="30" class="key">L</text>
    <text x="174" y="30" class="mute">Länge</text>
    <text x="158" y="50" class="key">R</text>
    <text x="174" y="50" class="mute">Drehring, wird</text>
    <text x="174" y="64" class="mute">mitgedruckt</text>
  {:else if type === 'gate'}
    <!-- Rohr waagerecht, Rahmen in der Mitte mit 45°-Schrägen, Platte steht oben heraus (gezogen = auf) -->
    <path d="M16 34 H58 L68 24 H82 L92 34 H136 V70 H92 L82 80 H68 L58 70 H16 Z" class="part" />
    <rect x="73" y="6" width="4" height="40" class="plate" />
    <line x1="8" y1="52" x2="144" y2="52" class="axis" />
    <line x1="16" y1="90" x2="136" y2="90" class="dim" />
    <line x1="16" y1="85" x2="16" y2="95" class="dim" />
    <line x1="136" y1="85" x2="136" y2="95" class="dim" />
    <text x="40" y="102" class="lt">L</text>
    <polyline points="79,10 96,10" class="lead" />
    <text x="99" y="14" class="lt">P</text>
    <text x="158" y="30" class="key">L</text>
    <text x="174" y="30" class="mute">Länge</text>
    <text x="158" y="50" class="key">P</text>
    <text x="174" y="50" class="mute">Platte, als</text>
    <text x="174" y="64" class="mute">eigenes Teil</text>
  {:else}
    <path d="M16 30 H70 L88 48 H160 V56 H88 L70 74 H16 Z" class="part" />
    <line x1="8" y1="52" x2="170" y2="52" class="axis" />
    <text x="186" y="40" class="mute">Schräge 45°,</text>
    <text x="186" y="54" class="mute">Länge ergibt</text>
    <text x="186" y="68" class="mute">sich von selbst</text>
  {/if}
</svg>

<style>
  .bfig { width: 100%; max-width: 340px; height: auto; display: block; background: var(--mist); border-radius: 8px; margin: 10px 0 6px; }
  .part { fill: #ffd9d6; stroke: var(--red); stroke-width: 1.4; }
  .axis { stroke: var(--graphite); stroke-width: 1; stroke-dasharray: 5 3; fill: none; }
  .axis.thin { opacity: 0.35; }
  .dim { stroke: var(--sky-d); stroke-width: 1.4; }
  .pt { fill: var(--sky-d); }
  .plate { fill: #d6e6f5; stroke: var(--sky-d); stroke-width: 1.2; }
  .lead { fill: none; stroke: var(--sky-d); stroke-width: 0.9; }
  .lt, .key { font-family: var(--body); font-size: 12px; font-weight: 700; fill: var(--sky-d); }
  .mute { font-family: var(--body); font-size: 12px; font-weight: 500; fill: var(--slate); }
  .win { fill: #fff; stroke: var(--slate-2, #7a7a7a); stroke-width: 1; }
</style>
