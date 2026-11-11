<script lang="ts">
  /** Schnittskizze Flansch: Platte liegt auf der Gerätewand, Öffnung innen messen; Rand, Dicke, Schrauben, ggf. Dichtband */
  let { seal = false }: { seal?: boolean } = $props();
</script>

<svg class="measure" viewBox="0 0 360 172" role="img" aria-label="Flansch auf der Gerätewand: Öffnung im Gerät innen messen, Rand und Dicke der Platte, Schrauben durch die Platte ins Gerät">
  <!-- Legende -->
  <rect x="8" y="8" width="12" height="9" rx="2" class="adapter" />
  <text x="26" y="17" class="lbl key">Adapter</text>
  <!-- Gerätewand mit Öffnung -->
  <rect x="8" y="110" width="122" height="30" rx="3" class="machine" />
  <rect x="230" y="110" width="122" height="30" rx="3" class="machine" />
  <text x="40" y="156" class="lbl key" text-anchor="middle">Gerät</text>
  <!-- Platte und Übergang zum Adapter -->
  <path d="M70 96 H130 V110 H70 Z M230 96 H290 V110 H230 Z" class="adapter" />
  <path d="M140 30 H150 V78 L130 96 H120 L140 78 Z" class="adapter" />
  <path d="M220 30 H210 V78 L230 96 H240 L220 78 Z" class="adapter" />
  <!-- Senkkopfschrauben -->
  <path d="M92 96 H108 L103 101 H97 Z" class="screw" />
  <rect x="98" y="101" width="4" height="27" class="screw" />
  <path d="M252 96 H268 L263 101 H257 Z" class="screw" />
  <rect x="258" y="101" width="4" height="27" class="screw" />
  {#if seal}
    <rect x="132" y="106" width="9" height="4" class="seal" />
    <rect x="219" y="106" width="9" height="4" class="seal" />
  {/if}
  <!-- Maße -->
  <line x1="130" y1="150" x2="230" y2="150" class="dim" />
  <text x="180" y="166" class="lbl" text-anchor="middle">Öffnung</text>
  <line x1="230" y1="88" x2="290" y2="88" class="dim thin" />
  <text x="272" y="80" class="lbl" text-anchor="middle">Rand</text>
  <line x1="300" y1="96" x2="300" y2="110" class="dim" />
  <text x="307" y="105" class="lbl">Dicke</text>
</svg>

<style>
  .measure { width: 100%; max-height: 190px; height: auto; display: block; background: var(--shop); border-radius: 8px; }
  .machine { fill: #c9d1d5; stroke: var(--slate-2); stroke-width: 1; }
  .screw { fill: #5f6b72; }
  .seal { fill: #2b2b2b; }
  .dim { stroke: var(--cobalt); stroke-width: 2; }
  .dim.thin { stroke-width: 1; stroke-dasharray: 3 3; }
  .adapter { fill: var(--red); fill-opacity: 0.35; fill-rule: evenodd; stroke: var(--red); stroke-width: 1.2; }
  .lbl { font-family: var(--body); font-size: 13px; fill: var(--slate); font-weight: 600; }
  .key { font-weight: 500; }
</style>
