/** Svelte-Aktion: Element beim Erscheinen ganz in den sichtbaren Bereich holen (z. B. Rückfragen unter der Navigation) */
export function reveal(node: HTMLElement) {
  requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}
