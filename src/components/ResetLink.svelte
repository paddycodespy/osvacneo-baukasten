<script lang="ts">
  /** Zurücksetzen als unauffälliger Textknopf; nur sichtbar, wenn etwas vom Standard abweicht. */
  let { show, label, onclick }: { show: boolean; label: string; onclick: () => void } = $props();
</script>

{#if show}
  <button type="button" class="reset-all" {onclick}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 9.5a5.5 5.5 0 1 1 1.6 3.9" /><path d="M4 5v4.5h4.5" /></svg>{label}
  </button>
{/if}
