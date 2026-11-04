<script lang="ts">
  /**
   * Zahlenfeld mit eigenen Pfeiltasten (mit Abstand zum Wert, in allen Browsern gleich).
   * Pfeiltasten auf der Tastatur und das Mausrad funktionieren wie gewohnt über das Eingabefeld.
   */
  let {
    value = $bindable(),
    min,
    max,
    step = 1,
    unit = 'mm',
    label,
    oncommit,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    label: string;
    oncommit?: (v: number) => void;
  } = $props();

  const decimals = $derived((String(step).split('.')[1] ?? '').length);

  function commit(v: number, el?: HTMLInputElement) {
    if (!Number.isFinite(v)) {
      if (el) el.value = String(value); // ungültige Eingabe verwerfen
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    v = Number(v.toFixed(decimals));
    value = v;
    oncommit?.(v);
    // Feld zeigt immer den übernommenen Wert, auch wenn er begrenzt wurde und sich dadurch nicht geändert hat
    if (el) el.value = String(v);
  }
</script>

<span class="num-in nf">
  <input
    type="number"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    onchange={(e) => { const el = e.currentTarget as HTMLInputElement; commit(el.value.trim() === '' ? NaN : +el.value.replace(',', '.'), el); }}
  />
  <span class="unit">{unit}</span>
  <span class="spin">
    <button type="button" tabindex="-1" aria-label="{label} erhöhen" onclick={() => commit(value + step)}>
      <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 5 5 1 9 5" /></svg>
    </button>
    <button type="button" tabindex="-1" aria-label="{label} verringern" onclick={() => commit(value - step)}>
      <svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1 5 5 9 1" /></svg>
    </button>
  </span>
</span>

<style>
  .nf { padding-right: 4px; }
  .nf input { appearance: textfield; -moz-appearance: textfield; }
  .nf input::-webkit-inner-spin-button,
  .nf input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .spin {
    display: flex;
    flex-direction: column;
    margin-left: 10px;
    border-left: 1px solid var(--line);
    padding-left: 4px;
  }
  .spin button {
    display: grid;
    place-items: center;
    width: 22px;
    height: 15px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--grey);
  }
  .spin button { --grow: 1; } /* keine Vergrößerung beim Hover */
  .spin svg { width: 10px; height: 6px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
</style>
