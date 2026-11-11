<script lang="ts">
  /** „?“-Knopf, der eine Erklärung aus app.helpTexts ein- und ausblendet (Text mit HelpText an passender Stelle). */
  import { app } from '../lib/app.svelte';
  let { id }: { id: string } = $props();
</script>

<button type="button" class="help-btn" class:on={app.helpOpen[id]} aria-expanded={!!app.helpOpen[id]} aria-label="Erklärung" onclick={() => (app.helpOpen[id] = !app.helpOpen[id])}>?</button>
