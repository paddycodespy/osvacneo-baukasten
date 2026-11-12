/**
 * Prüft alle Skizzen der Oberfläche: Beschriftungen dürfen keine Linien oder Flächen berühren,
 * sich nicht gegenseitig überdecken und nicht aus der Skizze ragen.
 *
 * Ablauf: baut nichts selbst, sondern startet `vite preview` auf dem fertigen Build (vorher `npm run build`),
 * klickt sich mit Chrome durch alle Stellen mit Skizzen und meldet jede Überschneidung.
 *
 *   npm run build && npm run test:sketches
 *
 * Chrome: CHROME_PATH oder /usr/bin/google-chrome. Andere Adresse statt eigenem Server: BASE_URL=http://localhost:5173/
 */
import type { Page } from 'playwright-core';
import { withPreview } from './lib/preview';

const SHAPES = ['Kreis', 'Ellipse', 'Langloch', 'Rechteck', 'D-Form', 'Trapez'];

/** läuft im Browser: alle Treffer der gerade sichtbaren Skizzen */
const OVERLAP = `(() => {
  const out = [];
  for (const svg of document.querySelectorAll('svg')) {
    const texts = [...svg.querySelectorAll('text')].filter((t) => t.getBBox().width > 0);
    if (!texts.length) continue;
    const geoms = [...svg.querySelectorAll('path,rect,line,circle,ellipse,polygon,polyline')];
    const name = svg.getAttribute('aria-label') || svg.getAttribute('class') || 'svg';
    const bbs = texts.map((t) => {
      const b = t.getBBox();
      // Glyphenkasten etwas verkleinern (Luft für Ober- und Unterlängen)
      return { t, x: b.x + 0.5, y: b.y + b.height * 0.18, w: b.width - 1, h: b.height * 0.66 };
    });
    bbs.forEach((b, bi) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) pts.push([b.x + (b.w * i) / 8, b.y + (b.h * j) / 4]);
      for (const g of geoms) {
        const cs = getComputedStyle(g);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const fill = cs.fill !== 'none' && parseFloat(cs.fillOpacity || '1') > 0;
        const stroke = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0;
        const hit = pts.some(([x, y]) => {
          const p = new DOMPoint(x, y);
          return (fill && g.isPointInFill(p)) || (stroke && g.isPointInStroke(p));
        });
        if (hit) out.push(name + ': „' + b.t.textContent + '“ berührt <' + g.tagName + ' ' + (g.getAttribute('class') || '') + '>');
      }
      bbs.forEach((c, ci) => {
        if (ci > bi && b.x - 2 < c.x + c.w && c.x < b.x + b.w + 2 && b.y < c.y + c.h && c.y < b.y + b.h)
          out.push(name + ': „' + b.t.textContent + '“ überlappt „' + c.t.textContent + '“');
      });
      const vb = svg.viewBox.baseVal;
      if (vb && vb.width && (b.x < vb.x || b.y < vb.y || b.x + b.w > vb.x + vb.width || b.y + b.h > vb.y + vb.height))
        out.push(name + ': „' + b.t.textContent + '“ ragt aus der Skizze');
    });
  }
  return out;
})()`;

async function main() {
  const found = new Map<string, string>();
  await withPreview(4179, async (url, browser) => {
    const pg: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pg.goto(url);
    const chk = async (state: string) => {
      await pg.waitForTimeout(150);
      for (const r of (await pg.evaluate(OVERLAP)) as string[]) if (!found.has(r)) found.set(r, state);
    };
    const step = (name: string) => pg.locator('.step-tab', { hasText: name }).click();

    // Stutzen
    await pg.getByRole('radio', { name: 'Kupplung → Stutzen' }).click();
    await step('Größen');
    await chk('Stutzen aufgesteckt');
    await pg.getByRole('radio', { name: 'Adapter kommt in die Öffnung' }).click();
    await chk('Stutzen eingesteckt');

    // Freiform: alle Bausteine, alle Formen, Gerät in beiden Befestigungen
    await step('Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step('Aufbau');
    await pg.locator('.card-head', { hasText: 'Bogen' }).first().click();
    await chk('Bogen');
    for (const t of ['Gerade', 'Übergang', 'Absatz']) {
      await pg.locator('.add-btn', { hasText: t }).click();
      await chk(t);
      if (t === 'Gerade') continue;
      for (const sh of SHAPES) {
        await pg.locator('.card.open .shape', { hasText: sh }).click();
        await chk(`${t} ${sh}`);
      }
    }
    // Abzweig mit Ende C
    await pg.locator('.add-btn', { hasText: 'Abzweig' }).click();
    await chk('Abzweig');
    await pg.locator('.add-btn', { hasText: 'Schieber' }).click();
    await chk('Schieber');
    await pg.locator('.card-head', { hasText: 'Ende C ·' }).click();
    await chk('Ende C');
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.locator('.seg button', { hasText: 'Gerät' }).first().click();
    for (const mode of ['Über den Stutzen', 'In die Öffnung']) {
      await pg.getByRole('radio', { name: mode }).click();
      for (const sh of SHAPES) {
        await pg.locator('.card.open .shape', { hasText: sh }).click();
        await chk(`Gerät ${mode} ${sh}`);
      }
    }
    // Flansch mit Dichtband
    await pg.getByRole('radio', { name: 'Mit Flansch' }).click();
    await chk('Flansch');
    await pg.locator('.card.open summary', { hasText: 'Extras' }).click();
    await pg.getByLabel('Nut für ein Dichtband').check();
    await chk('Flansch mit Dichtung');
  });
  for (const [r, st] of found) console.log(`[${st}] ${r}`);
  console.log(found.size ? `${found.size} Überschneidungen` : 'Skizzen: keine Überschneidungen');
  process.exit(found.size ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
