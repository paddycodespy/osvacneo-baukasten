<script lang="ts">
  /**
   * Eingabefeld mit Beschriftung und optionaler Erklärung: Das „?“ neben der Beschriftung blendet einen kurzen Text
   * ein und aus. So bleibt die Oberfläche ruhig, die Erklärung ist trotzdem einen Klick entfernt.
   */
  import type { Snippet } from 'svelte';

  let { label, help, children }: { label: string; help?: string; children: Snippet } = $props();
  let open = $state(false);
</script>

<div class="field">
  <span class="field-label">
    {label}
    {#if help}
      <button type="button" class="help-btn" class:on={open} aria-expanded={open} aria-label="Erklärung zu {label}" onclick={() => (open = !open)}>?</button>
    {/if}
  </span>
  {#if help && open}<p class="help-text">{help}</p>{/if}
  {@render children()}
</div>
