<script lang="ts">
  /** Meldungen einer Karte im Aufbau, mit Vorschlägen „… auf … setzen“ */
  import type { Fix, Issue } from '../lib/osvac/freeform';
  let { list, apply }: { list: Issue[]; apply: (fx: Fix) => void } = $props();
  /** Vorsatz weglassen, die Karte zeigt ohnehin, worum es geht */
  const strip = (t: string) => t.replace(/^[^:]*\(Baustein \d+\): /, '').replace(/^(Gerät|Ende B|Ende C): /, '');
</script>

{#if list.length}
  <ul class="fi-issues">
    {#each list as x}
      <li class={x.todo ? 'todo' : x.level}>
        {strip(x.text)}
        {#if x.fixes?.length}
          <span class="fixes">{#each x.fixes as fx}<button type="button" class="fix" onclick={() => apply(fx)}>{fx.label}</button>{/each}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .fi-issues { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .fi-issues li { padding: 8px 12px; border-radius: 4px; border-left: 4px solid var(--signal); background: var(--warn-bg); }
  .fi-issues li.todo { border-left-color: var(--sky); background: var(--sky-l); }
  .fi-issues li.error { border-left-color: var(--err); background: var(--err-bg); color: var(--err-fg); }
</style>
