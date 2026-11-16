/**
 * Als Windows-Programm (Tauri) gibt es keine Tabs: Links mit target="_blank" würden sonst nichts tun.
 * Externe Links (https://…) öffnen deshalb im Standardbrowser, eigene Seiten (lizenzen.html, LICENSE.txt)
 * in einem zweiten Programmfenster. Im normalen Browser ändert sich nichts.
 */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function initDesktopLinks() {
  if (!isDesktop) return;
  document.addEventListener('click', async (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download') || a.href.startsWith('blob:')) return;
    const url = new URL(a.getAttribute('href')!, location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin === location.origin) {
        if (a.target !== '_blank') return; // Sprung innerhalb der Seite
        e.preventDefault();
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const base = 'seite-' + url.pathname.replace(/[^a-z0-9]/gi, '-');
        const open = (await WebviewWindow.getAll()).find((w) => w.label === base || w.label.startsWith(base + '-'));
        // ohne Sprungmarke: offenes Fenster nach vorn holen; mit Sprungmarke (z. B. Kapitel der Anleitung) neu öffnen,
        // denn ein offenes Fenster lässt sich von hier nicht an eine andere Stelle schicken
        if (open && !url.hash) return void (await open.setFocus());
        if (open) await open.close();
        const title = a.dataset.title || (url.pathname.includes('anleitung') ? 'Anleitung – osVAC neo Baukasten' : a.textContent?.trim() || 'osVAC neo Baukasten');
        new WebviewWindow(url.hash ? `${base}-${Date.now()}` : base, { url: url.pathname + url.hash, title, width: 1100, height: 820 });
        return;
      }
      e.preventDefault();
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url.href);
    }
  });
}
