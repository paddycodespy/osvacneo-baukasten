<script lang="ts">
  /** Durchmesser des Schlauchgewindes unter dem Schlauchfeld (Schlauchadapter, Nebenluft-Regler) */
  import { threadDiameters } from '../lib/osvac/thread';
  let { hose }: { hose: number } = $props();
  const t = $derived(threadDiameters(hose));
  const mm1 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

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
