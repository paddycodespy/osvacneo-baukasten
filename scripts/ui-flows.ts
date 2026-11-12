/**
 * Prüft die wichtigsten Bedienabläufe im Browser (npm run build && npm run test:ui):
 * „Neu anfangen“, Rückfrage vor dem Laden einer Vorlage, Bereich „Versetzen, knicken, drehen“ bleibt offen,
 * Download gesperrt bei Fehlern, gespeicherter Stand nach dem Neuladen, Extras im Namen auf dem Druckbett.
 *
 * Chrome: CHROME_PATH oder /usr/bin/google-chrome. Andere Adresse statt eigenem Server: BASE_URL=http://localhost:5173/
 */
import type { Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { withPreview } from './lib/preview';

mkdirSync('out', { recursive: true });

const results: { name: string; ok: boolean; msg?: string }[] = [];
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function ready(pg: Page) {
  // erst warten, bis eine Berechnung begonnen hat, dann bis sie fertig ist
  await pg.waitForTimeout(400);
  const status = pg.locator('.stage-foot .status');
  for (let i = 0; i < 600; i++) {
    const t = await status.innerText();
    if (t.includes('Bereit') || t.includes('nicht druckbar')) return;
    if (t.includes('Fehler')) throw new Error('Berechnung fehlgeschlagen: ' + (await pg.locator('.error').allInnerTexts()).join(' '));
    await pg.waitForTimeout(250);
  }
  throw new Error('Berechnung nicht fertig geworden');
}
async function fill(pg: Page, label: string, value: string) {
  const el = pg.getByLabel(label, { exact: true }).first();
  await el.fill(value);
  await el.press('Tab');
  await pg.waitForTimeout(150);
}
const step = (pg: Page, name: string) => pg.locator('.step-tab', { hasText: name }).click();

async function test(name: string, pg: Page, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, msg: (e as Error).message.split('\n')[0] });
    await pg.screenshot({ path: `out/ui-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  }
}

await withPreview(4180, async (url, browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errors: string[] = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.setDefaultTimeout(20000);
  await pg.goto(url);
  await ready(pg);

  await test('Neu anfangen erst nach einer Änderung', pg, async () => {
    expect((await pg.locator('.reset-all').count()) === 0, 'Link ist schon beim ersten Öffnen da');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    expect((await pg.locator('.reset-all').count()) === 1, 'Link fehlt nach Wahl von Freiform');
  });

  await test('Rückfrage vor dem Laden einer Vorlage', pg, async () => {
    await step(pg, 'Aufbau');
    await pg.locator('.card-head', { hasText: 'Bogen' }).first().click();
    await fill(pg, 'Radius des Bogens', '45');
    await pg.getByRole('radio', { name: 'Gerade auf Stutzen' }).click();
    expect(await pg.locator('.confirm').isVisible(), 'keine Rückfrage trotz geändertem Aufbau');
    await pg.getByRole('button', { name: 'Behalten' }).click();
    expect((await pg.locator('.card-title small').nth(1).innerText()).includes('45'), 'Änderung nach „Behalten“ verloren');
    await pg.getByRole('radio', { name: 'Gerade auf Stutzen' }).click();
    await pg.getByRole('button', { name: 'Vorlage laden' }).click();
    expect(await pg.getByRole('radio', { name: 'Gerade auf Stutzen' }).getAttribute('aria-checked') === 'true', 'Vorlage nicht geladen');
    expect((await pg.locator('.confirm').count()) === 0, 'Rückfrage bleibt stehen');
  });

  await test('Versetzen, knicken, drehen bleibt offen', pg, async () => {
    await pg.getByRole('radio', { name: 'Versatz mit Knick' }).click();
    await pg.locator('.card-head', { hasText: 'Übergang' }).first().click();
    const d = pg.locator('.card.open details.more', { hasText: 'Versetzen' });
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), 'anfangs zu, obwohl Werte gesetzt');
    for (const l of ['Versatz des Endes', 'Knick des Endes', 'Verdrehung des Querschnitts']) await fill(pg, l, '0');
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), 'zugeklappt, nachdem alle Werte 0 sind');
  });

  await test('Download gesperrt bei Fehler', pg, async () => {
    // Aussparung breiter als der halbe Umfang: Fehler am Ende B
    await pg.getByRole('radio', { name: 'Gerade auf Stutzen' }).click();
    const load = pg.getByRole('button', { name: 'Vorlage laden' });
    if (await load.count()) await load.click();
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.locator('.card.open summary', { hasText: 'Extras' }).click();
    await pg.getByLabel('Aussparung am Rand').check();
    await fill(pg, 'Breite der Aussparung', '150');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'Download trotz Fehler wählbar');
    // Meldung nennt Feld und Wert, das Feld ist markiert, der Knopf übernimmt den Wert
    expect((await pg.locator('.num-in.flag-error input[aria-label="Breite der Aussparung"]').count()) === 1, 'Feld nicht markiert');
    await pg.locator('.fix', { hasText: 'Breite der Aussparung auf' }).click();
    await pg.waitForTimeout(200);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Vorschlag behebt den Fehler nicht');
    expect((await pg.locator('.num-in.flag-error').count()) === 0, 'Markierung bleibt nach dem Beheben');
    await fill(pg, 'Breite der Aussparung', '20');
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Download nach Korrektur weiter gesperrt');
    await pg.getByLabel('Aussparung am Rand').uncheck();
  });

  await test('Teil unter dem Druckbett sperrt den Download', pg, async () => {
    // U-Bogen: Anschluss A ragt tiefer als Ende B auf dem Bett
    await pg.locator('.card-head', { hasText: 'Gerade' }).first().click();
    await fill(pg, 'Länge der Geraden', '5');
    await pg.locator('.add-btn', { hasText: 'Bogen' }).click();
    await fill(pg, 'Winkel des Bogens', '180');
    await fill(pg, 'Radius des Bogens', '40');
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await fill(pg, 'Steckweg', '10');
    await ready(pg);
    expect((await pg.locator('.print-note.error').innerText()).includes('tiefer als Ende B'), 'kein Hinweis auf das Teil unter dem Bett');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'Download trotz nicht druckbarem Adapter wählbar');
    // Rückweg: Bogen entfernen, dann wieder frei
    await pg.getByRole('button', { name: /^Bogen entfernen/ }).first().click();
    await fill(pg, 'Steckweg', '25');
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Download nach Korrektur weiter gesperrt');
  });

  await test('Stand nach dem Neuladen', pg, async () => {
    await pg.waitForTimeout(800); // Speichern ist leicht verzögert
    await pg.reload();
    await ready(pg);
    expect((await pg.locator('.step-tab.current').innerText()).includes('Aufbau'), 'Schritt nicht wiederhergestellt');
    expect((await pg.locator('.stage-head .code').innerText()).includes('Ø 32'), 'Freiform-Aufbau nicht wiederhergestellt');
  });

  await test('Extras im Namen auf dem Druckbett', pg, async () => {
    // Aufbau „Gerade auf Stutzen“ aus dem vorigen Ablauf, Ende B ist noch offen
    if (!(await pg.getByLabel('Löcher für Schrauben').isVisible())) {
      await pg.locator('.card-head', { hasText: 'Ende B' }).click();
      await pg.locator('.card.open summary', { hasText: 'Extras' }).click();
    }
    await pg.getByLabel('Löcher für Schrauben').check();
    await ready(pg);
    await step(pg, 'Download');
    await pg.locator('summary', { hasText: 'Mehrere Adapter' }).click();
    await pg.getByRole('button', { name: 'Aktuellen Adapter hinzufügen' }).click();
    const label = (await pg.locator('.plate li').first().innerText()).trim();
    expect(label.includes('Schrauben'), `Name ohne Extras: ${label}`);
  });

  await test('Flansch an Ende B', pg, async () => {
    await step(pg, 'Aufbau');
    if (!(await pg.getByRole('radio', { name: 'Mit Flansch' }).isVisible())) await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.getByRole('radio', { name: 'Mit Flansch' }).click();
    await ready(pg);
    expect((await pg.locator('.fi-opt').innerText()).includes('Der Flansch (Ende B) liegt flach'), 'Druckbett-Wahl nicht durch Hinweis ersetzt');
    expect((await pg.locator('.card.open').innerText()).includes('Löcher Ø 4,5 mm'), 'Hinweis zu den Löchern fehlt');
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Download mit Flansch gesperrt');
    if (!(await pg.getByLabel('Nut für ein Dichtband').isVisible())) await pg.locator('.card.open summary', { hasText: 'Extras' }).click();
    await pg.getByLabel('Nut für ein Dichtband').check();
    expect((await pg.getByLabel('Rand des Flanschs', { exact: true }).inputValue()) === '18', 'Rand für die Dichtung nicht vergrößert');
    await fill(pg, 'Rand des Flanschs', '10');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'zu schmaler Rand nicht gesperrt');
    expect((await pg.locator('.card.open').innerText()).includes('mindestens 18 mm'), 'keine verständliche Meldung zum Rand');
    await pg.locator('.fix', { hasText: 'Rand auf 18 mm setzen' }).click();
    expect((await pg.getByLabel('Rand des Flanschs', { exact: true }).inputValue()) === '18', 'Knopf setzt den Rand nicht');
    await pg.locator('.card.open summary', { hasText: 'Feineinstellungen' }).click();
    await pg.getByRole('radio', { name: 'Rund', exact: true }).click();
    expect(await pg.getByLabel('Lochkreis-Durchmesser', { exact: true }).first().isVisible(), 'Felder für den Lochkreis fehlen');
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Lochkreis aus der Vorbelegung passt nicht');
    expect((await pg.locator('.stage-head').innerText()).includes('Flansch'), 'Untertitel ohne Flansch');
    // breiteres Dichtband: Rand wächst mit (im automatischen Lochbild)
    await pg.getByRole('radio', { name: 'Automatisch' }).click();
    await pg.getByRole('radio', { name: '10 mm' }).click();
    expect((await pg.getByLabel('Rand des Flanschs', { exact: true }).inputValue()) === '22', 'Rand wächst nicht mit dem Dichtband');
    // Lochbild nach Maß läuft mit der Öffnung mit, bis es von Hand geändert wird
    await pg.getByRole('radio', { name: 'Rund', exact: true }).click();
    const plateD = () => pg.getByLabel('Durchmesser der Platte', { exact: true }).inputValue();
    const d0 = await plateD();
    await fill(pg, 'Form der Öffnung: Durchmesser', '50');
    const d1 = await plateD();
    expect(d1 !== d0, 'Platten-Ø läuft nicht mit der Öffnung mit');
    await fill(pg, 'Durchmesser der Platte', '140');
    await fill(pg, 'Form der Öffnung: Durchmesser', '40');
    expect((await plateD()) === '140', 'von Hand geänderter Wert wurde überschrieben');
    await pg.locator('.refill-row .help-btn').click();
    expect((await pg.locator('.card.open .help-text').innerText()).includes('Deine eigenen Eingaben'), 'Hilfetext zum Neu-Vorschlagen fehlt');
    await pg.getByRole('button', { name: 'Platte und Löcher neu vorschlagen' }).click();
    expect((await plateD()) !== '140', 'Link stellt die Werte nicht neu ein');
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'neu vorbelegter Flansch passt nicht');
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Dichtband 10 mm'), 'Druckhinweis zur Dichtung fehlt');
    await step(pg, 'Aufbau');
    await pg.getByRole('radio', { name: 'Über den Stutzen' }).click();
    await ready(pg);
  });

  await test('Y-Abzweig mit Ende C', pg, async () => {
    await step(pg, 'Aufbau');
    await pg.getByRole('radio', { name: 'Y-Abzweig 45°' }).click();
    const load = pg.getByRole('button', { name: 'Vorlage laden' });
    if (await load.count()) await load.click();
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('+'), 'Kopfzeile ohne Ende C');
    expect((await pg.locator('.print-note').innerText()).includes('Ende C'), 'Druckhinweis zur Kupplung am Abzweig fehlt');
    // Plaketten A, B, C in der Vorschau; das aufgeklappte Ende ist hervorgehoben, „Enden“ blendet sie aus
    expect((await pg.locator('.end-marker').count()) === 3, 'nicht drei Plaketten A, B, C');
    await pg.locator('.card-head', { hasText: 'Ende C ·' }).click();
    await pg.waitForTimeout(200);
    expect((await pg.locator('.end-marker.active').innerText().catch(() => '')) === 'C', 'Plakette C nicht hervorgehoben');
    await pg.locator('button.tool', { hasText: 'Enden' }).click();
    expect((await pg.locator('.end-marker').count()) === 0, '„Enden“ blendet die Plaketten nicht aus');
    await pg.locator('button.tool', { hasText: 'Enden' }).click();
    await pg.locator('.card.open .seg button', { hasText: 'Gerät' }).first().click();
    await fill(pg, 'Steckweg', '7');
    expect((await pg.locator('.card.open').innerText()).includes('Unter 10 mm Tiefe'), 'Meldung von Ende C nicht in der Karte C');
    expect((await pg.locator('.num-in.flag-warn input[aria-label="Steckweg"]').count()) === 1, 'Feld an Ende C nicht markiert');
    await pg.locator('.card.open .fix', { hasText: 'Tiefe auf 10 mm setzen' }).click();
    expect((await pg.getByLabel('Steckweg', { exact: true }).inputValue()) === '10', 'Vorschlag setzt den Wert an Ende C nicht');
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Y-Abzweig mit Gerät an C nicht druckbar');
    // Abzweig entfernen: Karte C verschwindet, nur ein Abzweig je Adapter
    await pg.locator('.add-btn', { hasText: 'Abzweig' }).isDisabled().then((d) => expect(d, 'zweiter Abzweig möglich'));
    await pg.getByRole('button', { name: 'Abzweig entfernen' }).click();
    expect((await pg.locator('.card-head', { hasText: 'Ende C ·' }).count()) === 0, 'Karte C bleibt nach dem Entfernen');
    await ready(pg);
  });

  await test('Neu anfangen setzt alles zurück, Druckbett bleibt', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.locator('.reset-all').click();
    await pg.getByRole('button', { name: 'Behalten' }).click();
    expect((await pg.locator('.kind.sel strong').innerText()).includes('Freiform'), '„Behalten“ hat trotzdem zurückgesetzt');
    await pg.locator('.reset-all').click();
    await pg.getByRole('button', { name: 'Neu anfangen', exact: true }).click();
    expect(!(await pg.locator('.kind.sel strong').innerText()).includes('Freiform'), 'Typ nicht zurückgesetzt');
    expect((await pg.locator('.reset-all').count()) === 0, 'Link nach dem Zurücksetzen noch da');
    await step(pg, 'Download');
    expect((await pg.locator('.plate li').count()) === 1, 'Druckbett wurde geleert');
    await pg.waitForTimeout(800);
    await pg.reload();
    await ready(pg);
    expect((await pg.locator('.reset-all').count()) === 0, 'nach dem Neuladen wieder der alte Stand');
    await step(pg, 'Download');
    expect((await pg.locator('.plate li').count()) === 1, 'Druckbett nach dem Neuladen leer');
  });

  await test('Download-Hinweis führt zum passenden Schritt', pg, async () => {
    await step(pg, 'Größen');
    await fill(pg, 'Innendurchmesser der Bajonett-Kupplung', '33');
    await step(pg, 'Download');
    expect((await pg.locator('ul.warn').innerText()).includes('kein Standardmaß'), 'Hinweis zum Maß fehlt');
    await pg.locator('ul.warn .fix', { hasText: 'Zu den Größen' }).click();
    expect((await pg.locator('.step-tab.current').innerText()).includes('Größen'), 'Link führt nicht zu den Größen');
    await fill(pg, 'Innendurchmesser der Bajonett-Kupplung', '32');
    await ready(pg);
  });

  await test('Druckhilfe gilt je Verbindung', pg, async () => {
    const tool = pg.locator('button.tool', { hasText: 'Druckhilfe' });
    const on = async () => (await tool.getAttribute('aria-pressed')) === 'true';
    const kind = async (re: RegExp) => {
      await step(pg, 'Verbindung');
      await pg.getByRole('radio', { name: re }).click();
      await ready(pg);
    };
    await kind(/Stecker einzeln/);
    expect(await on(), 'Druckhilfe beim Stecker nicht an');
    await tool.click();
    expect(!(await on()), 'Druckhilfe lässt sich nicht abschalten');
    await kind(/Stecker ↔ Kupplung/);
    expect(await on(), 'Abschalten beim Stecker wirkt auch auf Stecker ↔ Kupplung');
    await pg.waitForTimeout(800);
    await pg.reload();
    await ready(pg);
    expect(await on(), 'nach dem Neuladen bei Stecker ↔ Kupplung aus');
    await kind(/Stecker einzeln/);
    expect(!(await on()), 'nach dem Neuladen beim Stecker wieder an');
    await tool.click();
    await kind(/Freiform/);
  });

  if (errors.length) results.push({ name: 'keine Skriptfehler im Browser', ok: false, msg: errors.join(' | ') });
  await ctx.close();
});

for (const r of results) console.log(`${r.ok ? 'ok    ' : 'FEHLER'} ${r.name}${r.msg ? ': ' + r.msg : ''}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} Abläufe fehlerhaft` : 'Alle Abläufe in Ordnung');
process.exit(bad ? 1 : 0);
