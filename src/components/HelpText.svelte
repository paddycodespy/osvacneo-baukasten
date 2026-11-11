<script lang="ts">
  import { app } from '../lib/app.svelte';
  let { id }: { id: string } = $props();
</script>

{#if app.helpOpen[id]}<p class="help-text">{app.helpTexts[id]}</p>{/if}
