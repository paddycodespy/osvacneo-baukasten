<script lang="ts">
  let { mode }: { mode: 'over' | 'into' } = $props();
</script>

<!-- Schnittskizze: wo gemessen wird (vorne und in der Tiefe) -->
<svg class="measure" viewBox="0 0 360 150" role="img" aria-label={mode === 'over' ? 'Außendurchmesser des Stutzens vorne und in der Tiefe messen' : 'Innendurchmesser der Öffnung vorne und in der Tiefe messen'}>
  {#if mode === 'over'}
    <!-- Maschinengehäuse links, Stutzen ragt nach rechts heraus -->
    <rect x="8" y="14" width="70" height="122" rx="4" class="machine" />
    <path d="M78 46 L300 52 L300 98 L78 104 Z" class="stub" />
    <path d="M78 56 L300 60 L300 90 L78 94 Z" class="hole" />
    <line x1="290" y1="40" x2="290" y2="110" class="dim" />
    <line x1="140" y1="36" x2="140" y2="114" class="dim" />
    <text x="290" y="128" class="lbl" text-anchor="middle">Ø vorne</text>
    <text x="140" y="128" class="lbl" text-anchor="middle">Ø in der Tiefe</text>
    <line x1="140" y1="22" x2="300" y2="22" class="dim thin" />
    <text x="220" y="16" class="lbl" text-anchor="middle">Tiefe</text>
  {:else}
    <rect x="8" y="14" width="210" height="122" rx="4" class="machine" />
    <path d="M218 44 L78 52 L78 98 L218 106 Z" class="hole2" />
    <line x1="208" y1="45" x2="208" y2="105" class="dim" />
    <line x1="98" y1="52" x2="98" y2="98" class="dim" />
    <text x="250" y="80" class="lbl">Ø vorne</text>
    <line x1="232" y1="76" x2="210" y2="76" class="dim thin" />
    <text x="98" y="128" class="lbl" text-anchor="middle">Ø in der Tiefe</text>
    <line x1="98" y1="24" x2="218" y2="24" class="dim thin" />
    <text x="158" y="18" class="lbl" text-anchor="middle">Tiefe</text>
  {/if}
</svg>

<style>
  .measure { width: 100%; height: auto; display: block; background: var(--shop); border-radius: 8px; }
  .machine { fill: #c9d1d5; stroke: var(--slate-2); stroke-width: 1; }
  .stub { fill: #9aa7ae; stroke: var(--slate); stroke-width: 1.2; }
  .hole { fill: var(--shop); }
  .hole2 { fill: var(--shop); stroke: var(--slate); stroke-width: 1.2; }
  .dim { stroke: var(--cobalt); stroke-width: 2; marker-start: none; }
  .dim.thin { stroke-width: 1; stroke-dasharray: 3 3; }
  .lbl { font-family: var(--body); font-size: 13px; fill: var(--slate); font-weight: 600; }
</style>
