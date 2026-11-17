/**
 * Bilder für die Anleitung (docs/anleitung.md → public/anleitung.html) neu aufnehmen:
 *   npm run build && npm run docs:bilder        (alle Bilder)
 *   npm run docs:bilder -- duese kontur         (nur Szenen, deren Name das Wort enthält)
 * Jede Szene startet mit leerem Speicher (Standardwerte), damit die Bilder zu den Texten passen.
 * Die Bilder landen in public/anleitung/ als WebP (helle Ansicht, Breite 1440 px; Chrome wandelt sie um, ohne weitere Pakete).
 *
 * Chrome: CHROME_PATH oder /usr/bin/google-chrome. Andere Adresse statt eigenem Server: BASE_URL=http://localhost:5173/
 */
import type { Browser, Locator, Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withPreview } from './lib/preview';

const OUT = 'public/anleitung';
const fixture = (n: string) => path.join(import.meta.dirname, 'fixtures', n);
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

async function ready(pg: Page) {
  await pg.waitForTimeout(400);
  const status = pg.locator('.stage-foot .status');
  for (let i = 0; i < 600; i++) {
    const t = await status.innerText();
    if (/Bereit|nicht druckbar|fehlt noch|Fehler/.test(t)) break;
    await pg.waitForTimeout(250);
  }
  // Filamentangabe abwarten (kommt kurz nach „Bereit“), höchstens 10 s
  for (let i = 0; i < 40 && (await pg.locator('.dims').count()); i++) {
    const t = await pg.locator('.dims').innerText();
    if (!/PETG ca\.\s*–/.test(t)) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(400);
}
const step = (pg: Page, name: string) => pg.locator('.step-tab', { hasText: name }).click();
async function kind(pg: Page, name: string | RegExp) {
  await step(pg, 'Verbindung');
  await pg.getByRole('radio', { name }).click();
  await ready(pg);
}
async function fill(pg: Page, label: string, value: string) {
  const el = pg.getByLabel(label, { exact: true }).first();
  await el.fill(value);
  await el.press('Tab');
  await pg.waitForTimeout(150);
}
async function pickTemplate(pg: Page, name: string) {
  const radio = pg.getByRole('radio', { name });
  await radio.click();
  const load = pg.getByRole('button', { name: 'Vorlage laden' });
  for (let i = 0; i < 100; i++) {
    if (await load.count()) await load.click();
    else if ((await radio.getAttribute('aria-checked')) === 'true' && !(await pg.locator('.confirm').count())) return;
    await pg.waitForTimeout(100);
  }
}
/** Karte in der Freiform öffnen (Kopf mit diesem Text) */
async function card(pg: Page, title: string) {
  const head = pg.locator('.card-head', { hasText: title }).first();
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await pg.waitForTimeout(250);
}

/** Bildschirmfoto als WebP speichern (Qualität 0,85: etwa ein Viertel so groß wie PNG, Schrift bleibt scharf) */
async function save(pg: Page, name: string, png: Buffer) {
  const url = await pg.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.85);
  }, png.toString('base64'));
  writeFileSync(`${OUT}/${name}.webp`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('  ', name);
}

/** ganzes Fenster */
async function shotApp(pg: Page, name: string) {
  await save(pg, name, await pg.screenshot());
}
/**
 * Ausschnitt der Einstellungen rechts: vom Element `from` bis einschließlich `to` (Standard: ganzer Schritt).
 * Das Fenster wird dafür so hoch gemacht, dass der Schritt nicht scrollt.
 */
async function shotPanel(pg: Page, name: string, from?: Locator, to?: Locator, pad = 14) {
  const body = pg.locator('.step-body');
  const h = await body.evaluate((e) => e.scrollHeight);
  await pg.setViewportSize({ width: 1440, height: Math.max(900, Math.min(6000, h + 320)) });
  await pg.waitForTimeout(300);
  const pb = (await pg.locator('.panel').boundingBox())!;
  // ohne Angabe: Inhalt des Schritts (alle Kinder), ohne den leeren Rest darunter
  const content = await body.evaluate((e) => {
    const rs = [...e.children].map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0);
    return { x: 0, y: Math.min(...rs.map((r) => r.top)), width: 0, height: Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top)) };
  });
  const a = from ? (await from.boundingBox())! : content;
  const b = to ? (await to.boundingBox())! : from ? a : content;
  const top = Math.max(0, a.y - pad);
  const bottom = b.y + b.height + pad;
  const png = await pg.screenshot({ clip: { x: pb.x, y: top, width: pb.width, height: bottom - top } });
  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.waitForTimeout(200);
  await save(pg, name, png);
}
/** einzelnes Element (z. B. Dialog) */
async function shotEl(pg: Page, name: string, el: Locator, pad = 10) {
  const b = (await el.boundingBox())!;
  await save(pg, name, await pg.screenshot({ clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad } }));
}
/**
 * nummerierte Marken über die Oberfläche legen (für das Übersichtsbild). side: l/r/t/b = Mitte der Seite außen,
 * e = hinter dem Ende des Textes. dx/dy verschieben zusätzlich.
 */
async function marks(pg: Page, list: [string, number, 'l' | 'r' | 't' | 'b' | 'e', number?, number?][]) {
  await pg.evaluate((list) => {
    for (const [sel, n, side, dx = 0, dy = 0] of list) {
      const el = document.querySelector(sel);
      if (!el) continue;
      let r = el.getBoundingClientRect();
      if (side === 'e') {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        r = rg.getBoundingClientRect();
      }
      const m = document.createElement('div');
      m.textContent = String(n);
      const cx = side === 'l' ? r.left - 22 : side === 'r' || side === 'e' ? r.right + 22 : r.left + r.width / 2;
      const cy = side === 't' ? r.top - 22 : side === 'b' ? r.bottom + 22 : r.top + r.height / 2;
      Object.assign(m.style, {
        position: 'fixed', left: `${cx - 16 + dx}px`, top: `${cy - 16 + dy}px`, width: '32px', height: '32px', borderRadius: '50%',
        background: '#ff4136', color: '#fff', font: '700 17px/32px Poppins, sans-serif', textAlign: 'center', zIndex: '9999',
        boxShadow: '0 0 0 3px #fff, 0 2px 6px rgba(0,0,0,.35)',
      });
      document.body.appendChild(m);
    }
  }, list);
}

type Scene = { name: string; run: (pg: Page) => Promise<void> };
const scenes: Scene[] = [
  {
    name: 'uebersicht',
    run: async (pg) => {
      await pg.locator('.dims').waitFor();
      await marks(pg, [
        ['.step-tab', 1, 'l', 4],
        ['.step-body h2', 2, 'e'],
        ['.stage-head .code', 3, 'e'],
        ['.stage-tools', 4, 'b'],
        ['.stage-foot .status', 5, 'l'],
        ['.dims', 6, 't', -60],
        ['.step-nav .next', 7, 'l'],
        ['.doc-btn', 8, 'b'],
        ['.theme-btn', 9, 'b'],
      ]);
      await shotApp(pg, 'uebersicht');
    },
  },
  {
    name: 'verbindung',
    run: async (pg) => {
      await shotPanel(pg, 'verbindung');
    },
  },
  {
    name: 'stecker-kupplung',
    run: async (pg) => {
      await step(pg, 'Größen');
      await shotPanel(pg, 'groessen-stecker-kupplung');
      await step(pg, 'Passung');
      await shotPanel(pg, 'passung-stecker-kupplung');
      await step(pg, 'Download');
      await ready(pg);
      await shotPanel(pg, 'download', pg.locator('.step-body h2'), pg.locator('details.box', { hasText: 'Mehrere Adapter' }));
      await pg.locator('summary', { hasText: 'Mehrere Adapter' }).click();
      await pg.getByRole('button', { name: 'Aktuellen Adapter hinzufügen' }).click();
      await step(pg, 'Passung');
      await pg.locator('input[type=range]').first().fill('0.3');
      await ready(pg);
      await step(pg, 'Download');
      await pg.getByRole('button', { name: 'Aktuellen Adapter hinzufügen' }).click();
      await pg.locator('.plate-sum').waitFor({ timeout: 20000 }).catch(() => {});
      await shotPanel(pg, 'druckbett', pg.locator('details.box', { hasText: 'Mehrere Adapter' }));
    },
  },
  {
    name: 'schlauch',
    run: async (pg) => {
      await kind(pg, /Kupplung ↔ Schlauch/);
      await shotApp(pg, 'schlauch-vorschau');
      await step(pg, 'Größen');
      await shotPanel(pg, 'groessen-schlauch');
      await step(pg, 'Passung');
      await shotPanel(pg, 'passung-schlauch');
    },
  },
  {
    name: 'stutzen',
    run: async (pg) => {
      await kind(pg, /Kupplung → Stutzen/);
      await step(pg, 'Größen');
      await shotPanel(pg, 'groessen-stutzen');
      await shotApp(pg, 'stutzen-vorschau');
      await pg.locator('details.more summary', { hasText: 'Feineinstellungen' }).click();
      await shotPanel(pg, 'stutzen-fein', pg.locator('details.more'));
    },
  },
  {
    name: 'duese',
    run: async (pg) => {
      await kind(pg, /Saugdüse/);
      await step(pg, 'Düse');
      await ready(pg);
      await shotPanel(pg, 'duese');
      await pg.getByRole('radio', { name: /Breitdüse/ }).click();
      await ready(pg);
      await shotApp(pg, 'duese-breit');
    },
  },
  {
    name: 'nebenluft',
    run: async (pg) => {
      await kind(pg, /Nebenluft/);
      await step(pg, 'Größen');
      await shotPanel(pg, 'nebenluft');
      await shotApp(pg, 'nebenluft-vorschau');
    },
  },
  {
    name: 'schieber',
    run: async (pg) => {
      await kind(pg, /Schieber einzeln/);
      await step(pg, 'Größen');
      await shotPanel(pg, 'schieber');
      await shotApp(pg, 'schieber-vorschau');
    },
  },
  {
    name: 'loesehilfe',
    run: async (pg) => {
      await kind(pg, /Lösehilfe/);
      await step(pg, 'Größen');
      await shotPanel(pg, 'loesehilfe');
      await shotApp(pg, 'loesehilfe-vorschau');
    },
  },
  {
    name: 'magnet',
    run: async (pg) => {
      await kind(pg, /Magnet-Schnellkupplung/);
      await step(pg, 'Teile');
      await shotPanel(pg, 'magnet');
      await shotApp(pg, 'magnet-vorschau');
    },
  },
  {
    name: 'freiform',
    run: async (pg) => {
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await ready(pg);
      await shotPanel(pg, 'freiform-vorlagen', pg.locator('.step-body h2'), pg.locator('.tpl').first());
      await shotPanel(pg, 'freiform-aufbau', pg.locator('.card').first(), pg.locator('.card').last());
      await card(pg, 'Bogen');
      await shotPanel(pg, 'freiform-bogen', pg.locator('.card.open'));
      await shotApp(pg, 'freiform-vorschau');
    },
  },
  {
    name: 'freiform-geraet',
    run: async (pg) => {
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await pickTemplate(pg, 'Rechteckige Haube');
      await ready(pg);
      await card(pg, 'Ende B');
      await shotPanel(pg, 'freiform-ende-b', pg.locator('.card.open'));
      await shotApp(pg, 'freiform-haube');
      await pickTemplate(pg, 'Flansch am Gehäuse');
      await ready(pg);
      await card(pg, 'Ende B');
      await shotPanel(pg, 'freiform-flansch', pg.locator('.card.open'));
      await shotApp(pg, 'freiform-flansch-vorschau');
    },
  },
  {
    name: 'freiform-abzweig',
    run: async (pg) => {
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await pickTemplate(pg, 'Y-Abzweig 45°');
      await ready(pg);
      await shotApp(pg, 'freiform-abzweig');
      await pickTemplate(pg, 'Absperrschieber');
      await ready(pg);
      await shotApp(pg, 'freiform-schieber');
    },
  },
  {
    name: 'freiform-hinweis',
    run: async (pg) => {
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await card(pg, 'Bogen');
      await fill(pg, 'Radius des Bogens', '10');
      await ready(pg);
      await shotPanel(pg, 'freiform-hinweis', pg.locator('.card.open'));
    },
  },
  {
    name: 'kontur',
    run: async (pg) => {
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await pickTemplate(pg, 'Gerade auf Stutzen');
      await card(pg, 'Ende B');
      await pg.locator('.card.open .shape', { hasText: 'Eigene' }).click();
      await pg.waitForTimeout(600);
      await shotPanel(pg, 'kontur-auswahl', pg.locator('.card.open .three'), pg.locator('.card.open .three'));
      // Foto nachzeichnen
      const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Foto wählen …' }).click()]);
      await fc.setFiles(fixture('kontur-foto.png'));
      await pg.getByRole('button', { name: /Weiter: Umriss/ }).waitFor();
      await pg.waitForTimeout(300);
      const at = async (x: number, y: number) => {
        const q = await pg.evaluate(([x, y]) => new DOMPoint(x, y).matrixTransform((document.querySelector('.canvas') as SVGSVGElement).getScreenCTM()!), [x, y]);
        await pg.mouse.click(q.x, q.y);
        await pg.waitForTimeout(40);
      };
      await at(120, 505);
      await at(420, 505);
      await shotEl(pg, 'kontur-foto-massstab', pg.locator('.dlg'));
      await pg.getByRole('button', { name: /Weiter: Umriss/ }).click();
      await pg.waitForTimeout(200);
      for (const [x, y] of [[262, 362], [598, 362], [598, 296], [613, 290], [613, 254], [598, 248], [598, 158], [262, 158]]) await at(x / 6, y / 6);
      await shotEl(pg, 'kontur-foto-umriss', pg.locator('.dlg'));
      await pg.getByRole('button', { name: /Weiter: Prüfen/ }).click();
      await pg.waitForTimeout(300);
      await shotEl(pg, 'kontur-foto-pruefen', pg.locator('.dlg'));
      await pg.getByRole('button', { name: 'Übernehmen' }).click();
      await ready(pg);
      await shotPanel(pg, 'kontur-fertig', pg.locator('.card.open .sec').first());
      await shotApp(pg, 'kontur-vorschau');
      // Raster
      await pg.getByRole('button', { name: 'Bearbeiten' }).click();
      await pg.locator('.dlg .pt').first().waitFor();
      await pg.waitForTimeout(300);
      await shotEl(pg, 'kontur-zeichnen', pg.locator('.dlg'));
      await pg.keyboard.press('Escape');
    },
  },
  {
    name: 'dunkel',
    run: async (pg) => {
      await pg.getByTestId('theme-toggle').click();
      await kind(pg, 'Freiform');
      await step(pg, 'Aufbau');
      await ready(pg);
      await shotApp(pg, 'dunkel');
    },
  },
];

async function runScene(browser: Browser, url: string, s: Scene) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(20000);
  await pg.goto(url);
  await ready(pg);
  try {
    await s.run(pg);
  } catch (e) {
    console.log('FEHLER', s.name, (e as Error).message.split('\n')[0]);
    process.exitCode = 1;
  }
  await ctx.close();
}

await withPreview(4181, async (url, browser) => {
  for (const s of scenes) {
    if (only.length && !only.some((o) => s.name.includes(o))) continue;
    console.log(s.name);
    await runScene(browser, url, s);
  }
});
