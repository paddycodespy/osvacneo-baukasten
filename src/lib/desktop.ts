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
        const label = 'seite-' + url.pathname.replace(/[^a-z0-9]/gi, '-');
        const open = await WebviewWindow.getByLabel(label);
        if (open) await open.setFocus();
        else new WebviewWindow(label, { url: url.pathname + url.hash, title: a.textContent?.trim() || 'osVAC neo Konfigurator', width: 900, height: 760 });
        return;
      }
      e.preventDefault();
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url.href);
    }
  });
}
