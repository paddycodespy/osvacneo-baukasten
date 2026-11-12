<script lang="ts">
  /** Schritt 1: Adaptertyp wählen */
  import { app } from '../../lib/app.svelte';
  import { KINDS } from '../../lib/osvac/catalog';
  import KindIcon from '../KindIcon.svelte';
  import ResetLink from '../ResetLink.svelte';
  import { reveal } from '../../lib/reveal';

  /** Rückfrage vor „Neu anfangen“ */
  let asking = $state(false);

  /** Zerlegt "MxxFyy" in hervorgehobene Kennbuchstaben (M, F, H) und Platzhalter */
  const codeParts = (code: string) => code.split(/([MFH](?=[xy]{2}|$|-))/).filter(Boolean).map((t) => ({ t, key: /^[MFH]$/.test(t) }));
</script>

<h2>Verbindung</h2>
<div class="kinds" role="radiogroup" aria-label="Adaptertyp">
  {#each KINDS as k}
    <button class="kind" class:sel={k.id === app.kindId} role="radio" aria-checked={k.id === app.kindId} disabled={!k.available} onclick={() => (app.kindId = k.id)}>
      <KindIcon top={k.ends.top} bottom={k.ends.bottom} />
      <span class="kind-text">
        <strong>{k.title}</strong>
        <small>{k.available ? k.description : 'Folgt in der nächsten Version.'}</small>
      </span>
      {#if !k.freeform && !k.gate}
        <span class="kind-code" aria-label={k.code}>
          {#each codeParts(k.code) as part}
            {#if part.key}<b class="ck">{part.t}</b>{:else}<span class="cx">{part.t}</span>{/if}
          {/each}
        </span>
      {/if}
    </button>
  {/each}
</div>
{#if asking}
  <div class="confirm" role="alertdialog" aria-label="Neu anfangen" use:reveal>
    <p>Alle Eingaben gehen verloren: Typ, Größen, Passung und Freiform-Aufbau. Das Druckbett und fertige Dateien bleiben.</p>
    <div class="confirm-btns">
      <button type="button" class="ghost sm" onclick={() => (asking = false)}>Behalten</button>
      <button type="button" class="next sm" onclick={() => { app.resetAll(); asking = false; }}>Neu anfangen</button>
    </div>
  </div>
{:else}
  <ResetLink show={app.changed} label="Neu anfangen: alle Eingaben auf den Anfang" onclick={() => (asking = true)} />
{/if}
