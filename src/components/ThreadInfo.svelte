<script lang="ts">
  /** Durchmesser des Schlauchgewindes unter dem Schlauchfeld (Schlauchadapter, Nebenluft-Regler) */
  import { threadDiameters } from '../lib/osvac/thread';
  import { app } from '../lib/app.svelte';
  /** hand: Auswahl Links-/Rechtsgewinde zeigen (bei der Magnetplatte steht sie im eigenen Formular) */
  let { hose, hand = true }: { hose: number; hand?: boolean } = $props();
  const t = $derived(threadDiameters(hose));
  const mm1 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

{#if hand}
<div class="seg thread-hand" role="radiogroup" aria-label="Drehrichtung des Schlauchgewindes">
  <button type="button" role="radio" aria-checked={app.hoseHand === 'left'} class:sel={app.hoseHand === 'left'} onclick={() => (app.hoseHand = 'left')}>Linksgewinde</button>
  <button type="button" role="radio" aria-checked={app.hoseHand === 'right'} class:sel={app.hoseHand === 'right'} onclick={() => (app.hoseHand = 'right')}>Rechtsgewinde</button>
</div>
<p class="hint">{app.hoseHand === 'left' ? 'Standard, wie im Original.' : 'Für Schläuche, deren Spirale rechtsherum gewickelt ist.'} Den Schlauch senkrecht halten und von außen auf die Spirale schauen: Steigt sie nach links an, ist es ein Linksgewinde, nach rechts ein Rechtsgewinde.</p>
{/if}
<div class="thread-info">
  <table>
    <thead><tr><th>Gewinde</th><th>am Eingang</th><th>hinten</th></tr></thead>
    <tbody>
      <tr><td>Gewindegrund Ø</td><td><strong>{mm1(t.rootEntry)} mm</strong></td><td>{mm1(t.rootBack)} mm</td></tr>
      <tr><td>Rippen innen Ø</td><td>{mm1(t.tipEntry)} mm</td><td>{mm1(t.tipBack)} mm</td></tr>
    </tbody>
  </table>
  <p>Der Schlauch passt, wenn sein Außendurchmesser höchstens so groß ist wie der Gewindegrund am Eingang.</p>
</div>
