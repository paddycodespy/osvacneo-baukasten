<script lang="ts">
  /** round = false: nicht runder Querschnitt (Freiform) – ein Maß über die ganze Tiefe, Form siehe Querschnittsskizze */
  let { mode, round = true }: { mode: 'over' | 'into'; round?: boolean } = $props();
  const front = $derived(round ? 'Ø vorne' : 'Maß');
</script>

<!-- Schnittskizze: wo gemessen wird (vorne und in der Tiefe) -->
<svg class="measure" viewBox="0 0 360 160" role="img" aria-label={mode === 'over' ? 'Adapter wird über den Stutzen geschoben: Außendurchmesser des Stutzens vorne und in der Tiefe messen' : 'Adapter wird in die Öffnung gesteckt: Innendurchmesser der Öffnung vorne und in der Tiefe messen'}>
  {#if mode === 'over'}
    <!-- Maschinengehäuse links, Stutzen ragt nach rechts heraus, Adapter (rot) darübergeschoben -->
    <rect x="8" y="30" width="70" height="88" rx="4" class="machine" />
    <path d="M78 46 L300 52 L300 98 L78 104 Z" class="stub" />
    <path d="M78 56 L300 60 L300 90 L78 94 Z" class="hole" />
    <path d="M140 38 L352 38 L352 112 L140 112 Z M140 47.7 L300 52 L352 52 L352 98 L300 98 L140 102.3 Z" class="adapter" />
    <line x1="290" y1="40" x2="290" y2="110" class="dim" />
    {#if round}<line x1="140" y1="34" x2="140" y2="116" class="dim" />{/if}
    <text x="290" y="130" class="lbl" text-anchor="middle">{front}</text>
    {#if round}<text x="140" y="130" class="lbl" text-anchor="middle">Ø in der Tiefe</text>{/if}
    <line x1="140" y1="22" x2="300" y2="22" class="dim thin" />
    <text x="220" y="16" class="lbl" text-anchor="middle">Tiefe</text>
  {:else}
    <!-- Maschinengehäuse mit Absaugöffnung, Adapter (rot) von rechts hineingesteckt -->
    <rect x="8" y="30" width="210" height="88" rx="4" class="machine" />
    <path d="M218 44 L78 52 L78 98 L218 106 Z" class="hole2" />
    <path d="M98 50.9 L218 44 L352 44 L352 106 L218 106 L98 99.1 Z M98 58.9 L218 52 L352 52 L352 98 L218 98 L98 91.1 Z" class="adapter" />
    <line x1="208" y1="40" x2="208" y2="110" class="dim" />
    {#if round}<line x1="98" y1="46" x2="98" y2="104" class="dim" />{/if}
    <text x="250" y="80" class="lbl">{front}</text>
    <line x1="246" y1="76" x2="210" y2="76" class="dim thin" />
    {#if round}<text x="98" y="137" class="lbl" text-anchor="middle">Ø in der Tiefe</text>{/if}
    <line x1="98" y1="22" x2="218" y2="22" class="dim thin" />
    <text x="158" y="16" class="lbl" text-anchor="middle">Tiefe</text>
  {/if}
  <rect x="226" y="143" width="12" height="9" rx="2" class="adapter" />
  <text x="244" y="152" class="lbl key">Adapter</text>
</svg>

<style>
  .measure { width: 100%; max-height: 190px; height: auto; display: block; background: var(--shop); border-radius: 8px; }
  .machine { fill: #c9d1d5; stroke: var(--slate-2); stroke-width: 1; }
  .stub { fill: #9aa7ae; stroke: var(--slate); stroke-width: 1.2; }
  .hole { fill: var(--shop); }
  .hole2 { fill: var(--shop); stroke: var(--slate); stroke-width: 1.2; }
  .dim { stroke: var(--cobalt); stroke-width: 2; marker-start: none; }
  .dim.thin { stroke-width: 1; stroke-dasharray: 3 3; }
  .adapter { fill: var(--red); fill-opacity: 0.35; fill-rule: evenodd; stroke: var(--red); stroke-width: 1.2; }
  .lbl { font-family: var(--body); font-size: 13px; fill: var(--slate); font-weight: 600; }
  .key { font-weight: 500; }
</style>
