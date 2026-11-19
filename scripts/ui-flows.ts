/**
 * Prüft die wichtigsten Bedienabläufe im Browser (npm run build && npm run test:ui):
 * „Neu anfangen“, Rückfrage vor dem Laden einer Vorlage, Bereich „Versetzen, knicken, drehen“ bleibt offen,
 * Download gesperrt bei Fehlern, gespeicherter Stand nach dem Neuladen, Extras im Namen auf dem Druckbett.
 *
 * Chrome: CHROME_PATH oder /usr/bin/google-chrome. Andere Adresse statt eigenem Server: BASE_URL=http://localhost:5173/
 */
import type { Page } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const fixture = (n: string) => path.join(import.meta.dirname, 'fixtures', n);
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
/** Warten, bis die Bedingung gilt (höchstens 15 s): z. B. bis nach einer Korrektur neu gerechnet ist */
async function until(pg: Page, cond: () => Promise<boolean>, msg: string) {
  for (let i = 0; i < 150; i++) {
    if (await cond()) return;
    await pg.waitForTimeout(100);
  }
  throw new Error(msg);
}
const downloadOpen = (pg: Page) => async () => !(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled());
async function fill(pg: Page, label: string, value: string) {
  const el = pg.getByLabel(label, { exact: true }).first();
  await el.fill(value);
  await el.press('Tab');
  await pg.waitForTimeout(150);
}
const step = (pg: Page, name: string) => pg.locator('.step-tab', { hasText: name }).click();
/**
 * Vorlage wählen und laden, auch wenn vorher die Rückfrage kommt. Wartet, bis die Vorlage wirklich aktiv ist
 * (die Rückfrage erscheint nicht sofort; ohne Warten blieb auf langsamen Rechnern der alte Aufbau stehen).
 */
async function pickTemplate(pg: Page, name: string) {
  const radio = pg.getByRole('radio', { name });
  await radio.click();
  const load = pg.getByRole('button', { name: 'Vorlage laden' });
  for (let i = 0; i < 100; i++) {
    if (await load.count()) await load.click();
    else if ((await radio.getAttribute('aria-checked')) === 'true' && !(await pg.locator('.confirm').count())) return;
    await pg.waitForTimeout(100);
  }
  throw new Error(`Vorlage „${name}“ nicht geladen`);
}

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
  // THROTTLE=4: Rechner künstlich langsamer machen (Fehler, die nur auf GitHub auftreten, nachstellen)
  if (process.env.THROTTLE) await (await ctx.newCDPSession(pg)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
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
    await pickTemplate(pg, 'Versatz mit Knick');
    await pg.locator('.card-head', { hasText: 'Übergang' }).first().click();
    const d = pg.locator('.card.open details.more', { hasText: 'Versetzen' });
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), 'anfangs zu, obwohl Werte gesetzt');
    for (const l of ['Versatz des Endes', 'Knick des Endes', 'Verdrehung des Querschnitts']) await fill(pg, l, '0');
    expect(await d.evaluate((e) => (e as HTMLDetailsElement).open), 'zugeklappt, nachdem alle Werte 0 sind');
  });

  await test('Download gesperrt bei Fehler', pg, async () => {
    // Aussparung breiter als der halbe Umfang: Fehler am Ende B
    await pickTemplate(pg, 'Gerade auf Stutzen');
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.locator('.card.open summary', { hasText: 'Extras' }).click();
    await pg.getByLabel('Aussparung am Rand').check();
    await fill(pg, 'Breite der Aussparung', '150');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'Download trotz Fehler wählbar');
    // Meldung nennt Feld und Wert, das Feld ist markiert, der Knopf übernimmt den Wert
    expect((await pg.locator('.num-in.flag-error input[aria-label="Breite der Aussparung"]').count()) === 1, 'Feld nicht markiert');
    try {
      await pg.locator('.fix', { hasText: 'Breite der Aussparung auf' }).click();
      // Meldung und Markierung verschwinden sofort; freigegeben ist der Download erst, wenn die fehlgeschlagene
      // Berechnung mit der zu breiten Aussparung durch eine neue ersetzt ist (auf langsamen Rechnern dauert das)
      expect((await pg.locator('.num-in.flag-error').count()) === 0, 'Markierung bleibt nach dem Beheben');
      await until(pg, downloadOpen(pg), 'Vorschlag behebt den Fehler nicht');
      await fill(pg, 'Breite der Aussparung', '20');
      await until(pg, downloadOpen(pg), 'Download nach Korrektur weiter gesperrt');
    } finally {
      // Aussparung wieder aus, auch wenn etwas schiefging (sonst scheitern die folgenden Abläufe mit)
      await pg.getByLabel('Aussparung am Rand').uncheck();
    }
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
    // Filament je Eintrag und zusammen (kommt nach, falls die Messung noch lief)
    await until(pg, async () => (await pg.locator('.plate-sum').count()) > 0, 'Summe Filament fürs Druckbett fehlt');
    expect(/\d+\s*g/.test(await pg.locator('.plate li .g').first().innerText()), 'Filament beim Druckbett-Eintrag fehlt');
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
    // dreieckige Platte: vorbelegter Lochkreis passt
    await pg.getByRole('radio', { name: 'Dreieck', exact: true }).click();
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'dreieckiger Flansch aus der Vorbelegung passt nicht');
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Dichtband 10 mm'), 'Druckhinweis zur Dichtung fehlt');
    await step(pg, 'Aufbau');
    await pg.getByRole('radio', { name: 'Über den Stutzen' }).click();
    await ready(pg);
  });

  await test('Y-Abzweig mit Ende C', pg, async () => {
    await step(pg, 'Aufbau');
    await pickTemplate(pg, 'Y-Abzweig 45°');
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('+'), 'Kopfzeile ohne Ende C');
    expect((await pg.locator('.print-note').innerText()).includes('Ende C'), 'Druckhinweis zur Kupplung am Abzweig fehlt');
    // keine Plaketten mehr in der Vorschau
    expect((await pg.locator('.end-marker').count()) === 0, 'Plaketten A, B, C noch da');
    await pg.locator('.card-head', { hasText: 'Ende C ·' }).click();
    await pg.waitForTimeout(200);
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

  await test('Schieber einzeln und in der Freiform', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Schieber einzeln/ }).click();
    await step(pg, 'Größen');
    await fill(pg, 'Außendurchmesser des Rohrs', '40');
    await pg.getByRole('radio', { name: 'Schlüssellöcher' }).click();
    const wall = async () => Number((await pg.getByLabel('Abstand Wand bis Rohrmitte', { exact: true }).inputValue()).replace(',', '.'));
    const minA = await wall();
    expect(minA > 20 && minA < 35, `kleinster Wandabstand unplausibel: ${minA}`);
    expect((await pg.locator('.step-body').innerText()).includes('direkt an der Wand'), 'Hinweis „direkt an der Wand“ fehlt');
    await fill(pg, 'Abstand Wand bis Rohrmitte', '60');
    expect((await pg.locator('.step-body').innerText()).includes('60 mm vor der Wand'), 'Wandabstand nicht übernommen');
    await fill(pg, 'Abstand Wand bis Rohrmitte', '200');
    expect(Math.abs((await wall()) - (minA + 50)) < 0.11, `Wandabstand nicht auf den Höchstwert begrenzt: ${await wall()}`);
    await pg.getByRole('radio', { name: 'Rohr waagerecht' }).click();
    await fill(pg, 'Abstand Wand bis Rohrmitte', '60');
    // kleiner als möglich: springt auf den kleinsten Wert
    await fill(pg, 'Abstand Wand bis Rohrmitte', '5');
    expect((await wall()) === minA, 'Wandabstand unter dem kleinsten Wert');
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('Schieber Ø40'), 'Kopfzeile ohne Schieber');
    await step(pg, 'Passung');
    expect(await pg.getByText('Spiel der Platte').isVisible(), 'Spiel der Platte fehlt in der Passung');
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Schlüssellöcher'), 'Druckhinweis zu den Schlüssellöchern fehlt');
    expect((await pg.locator('.tips').innerText()).includes('Schrauben M3'), 'Druckhinweis zu den Schrauben fehlt');
    expect((await pg.locator('.tips').innerText()).includes('Stützen werden nicht gebraucht'), 'Schieber einzeln braucht Stützen');
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Download gesperrt');
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step(pg, 'Aufbau');
    await pickTemplate(pg, 'Absperrschieber');
    await ready(pg);
    expect((await pg.locator('.print-note').innerText()).includes('ohne Stützen'), 'Schieber in der Freiform braucht Stützen');
    // nur ein Schieber je Adapter; „Düse“ an Ende B gibt es nur aus der Saugdüse
    expect(await pg.locator('.add-btn', { hasText: 'Schieber' }).isDisabled(), 'zweiter Schieber möglich');
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.waitForTimeout(200);
    expect(!(await pg.locator('.card.open .seg button', { hasText: 'Düse' }).count()), 'Düse an Ende B wählbar');
    await pg.locator('.card-head', { hasText: 'Schieber' }).first().click();
    await fill(pg, 'Länge des Schiebers', '15');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'zu kurzer Schieber nicht gesperrt');
    await pg.locator('.card.open .fix', { hasText: 'Länge auf' }).click();
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Vorschlag behebt die Länge nicht');
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Schieberplatte'), 'Druckhinweis zur Schieberplatte fehlt');
  });

  await test('Speicherort und Download', pg, async () => {
    await step(pg, 'Download');
    const t = await pg.locator('.target').innerText();
    expect(t.includes('Speichern in') && t.includes('(Standard)'), 'Speicherort fehlt: ' + t);
    expect((await pg.getByRole('button', { name: 'Ordner wählen\u00a0…' }).count()) === 1, 'Knopf „Ordner wählen …“ fehlt (Chrome kann Ordner wählen)');
    // ohne gewählten Ordner: normaler Download des Browsers
    const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.locator('.dl', { hasText: 'STL' }).click()]);
    expect(d.suggestedFilename().endsWith('.stl'), 'Dateiname ' + d.suggestedFilename());
    await pg.locator('.files li').first().waitFor();
    expect((await pg.locator('.files').innerText()).includes(d.suggestedFilename()), 'Datei nicht in der Liste');
  });

  await test('Kupplung auf dem Bett braucht Stützen', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step(pg, 'Aufbau');
    await pickTemplate(pg, 'Gerade auf Stutzen');
    await pg.getByRole('radio', { name: /Anschluss A \(Kupplung\)/ }).click();
    await ready(pg);
    expect((await pg.locator('.print-note').innerText()).includes('Stützen nötig'), 'Kupplung auf der Öffnung ohne Hinweis „Stützen nötig“');
    await pg.getByRole('radio', { name: /Ende B/ }).click();
    await ready(pg);
  });

  await test('Übergangslänge nur mit Übergang', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step(pg, 'Aufbau');
    await pickTemplate(pg, 'Absperrschieber');
    await pg.locator('.card-head', { hasText: 'Ende B ·' }).click();
    await pg.waitForTimeout(200);
    const field = pg.locator('input[aria-label="Übergangslänge zu Ende B"]');
    expect((await field.count()) === 0, 'Übergangslänge angezeigt, obwohl es keinen Übergang gibt');
    await pg.locator('.card.open .chip', { hasText: /^40$/ }).click();
    await until(pg, async () => (await field.count()) === 1, 'Übergangslänge fehlt bei anderem Durchmesser');
    await pg.locator('.card.open .chip', { hasText: /^32$/ }).click();
    await ready(pg);
  });

  await test('Stutzen: steiler Übergang mit Vorschlag', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Kupplung → Stutzen/ }).click();
    await step(pg, 'Größen');
    await fill(pg, 'Innendurchmesser der Bajonett-Kupplung', '50');
    expect((await pg.locator('.step-body').innerText()).includes('steiler als 45°'), 'kein Hinweis auf den steilen Übergang');
    await pg.locator('.fix', { hasText: 'Übergangslänge auf' }).click();
    expect(!(await pg.locator('.step-body').innerText()).includes('steiler als 45°'), 'Vorschlag behebt den steilen Übergang nicht');
    await fill(pg, 'Innendurchmesser der Bajonett-Kupplung', '32');
    await pg.locator('details.more summary', { hasText: 'Feineinstellungen' }).click();
    await fill(pg, 'Übergangslänge', '8');
    await ready(pg);
  });

  await test('Saugdüse mit Extras, Vorschlag und Freiform', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Saugdüse/ }).click();
    await step(pg, 'Düse');
    await pg.getByRole('radio', { name: /Breitdüse/ }).click();
    await ready(pg);
    expect((await pg.locator('.code').innerText()).includes('90 × 8'), 'Kopfzeile zeigt nicht die Öffnung der Breitdüse');
    await pg.getByLabel('Nut für eine Bürstenleiste').check();
    expect(await pg.getByLabel('Schutzring an der Spitze').isChecked(), 'Bürstennut hakt den Schutzring nicht mit an');
    await fill(pg, 'Länge der Düse', '40');
    await until(pg, async () => (await pg.locator('.fix', { hasText: 'Länge auf' }).count()) > 0, 'kein Vorschlag für die Länge');
    expect(!(await downloadOpen(pg)()), 'Download trotz zu kurzer Düse offen');
    await pg.locator('.fix', { hasText: 'Länge auf' }).click();
    await ready(pg);
    await until(pg, downloadOpen(pg), 'Download nach dem Vorschlag gesperrt');
    expect((await pg.locator('.dims').innerText()).match(/\d/), 'keine Maße');
    await pg.getByRole('button', { name: /In der Freiform weiterbauen/ }).click();
    await until(pg, async () => (await pg.locator('.step-tab', { hasText: 'Aufbau' }).count()) > 0, 'nicht in der Freiform gelandet');
    expect((await pg.locator('.step-body').innerText()).includes('Ende B · Düse'), 'Ende B ist keine Düse');
    await ready(pg);
    expect((await pg.locator('.code').innerText()).includes('90 × 8'), 'Freiform hat eine andere Düse');
    await pg.locator('details.more summary', { hasText: 'Wandstärke' }).click();
    await fill(pg, 'Wandstärke der Bausteine', '2.5');
    await pg.getByRole('button', { name: 'Zurück zur Düse' }).click();
    await until(pg, async () => (await pg.locator('.step-tab', { hasText: 'Düse' }).count()) > 0, 'nicht zurück bei der Düse');
    expect(await pg.getByRole('radio', { name: /Breitdüse/ }).getAttribute('aria-checked') === 'true', 'Formular der Düse hat sich verändert');
    await pg.getByRole('button', { name: /In der Freiform weiterbauen/ }).click();
    await until(pg, async () => (await pg.locator('.confirm', { hasText: 'wird durch die Düse ersetzt' }).count()) > 0, 'keine Rückfrage vor dem Ersetzen der Freiform');
    await pg.getByRole('button', { name: 'Abbrechen' }).click();
    expect((await pg.locator('.step-tab', { hasText: 'Düse' }).count()) > 0, 'Abbrechen hat trotzdem gewechselt');
    // auch „Eigene Form“ oben fragt nach, und zwar direkt unter den Düsenarten (nicht unten außer Sicht)
    await pg.getByRole('button', { name: /Eigene Form/ }).click();
    await until(pg, async () => (await pg.locator('.tpl + .confirm').count()) > 0, 'Rückfrage bei „Eigene Form“ nicht unter den Düsenarten');
    await pg.getByRole('button', { name: 'Abbrechen' }).click();
    await ready(pg);
  });

  await test('Nebenluft-Regler mit Spiel am Drehring', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Nebenluft-Regler/ }).click();
    await step(pg, 'Größen');
    await ready(pg);
    expect((await pg.locator('.code').innerText()).includes('F32H36'), 'Kopfzeile: ' + (await pg.locator('.code').innerText()));
    expect((await pg.getByRole('button', { name: /In der Freiform weiterbauen/ }).count()) === 0, 'Weg in die Freiform noch da');
    // oben Stecker 40, unten Schlauch 32
    await pg.getByRole('radio', { name: 'Stecker (M)' }).click();
    await pg.locator('.dia-row').first().locator('.chip', { hasText: '40' }).click();
    await pg.locator('.dia-row').nth(1).locator('.chip', { hasText: '32' }).click();
    await ready(pg);
    expect((await pg.locator('.code').innerText()).includes('M40H32'), 'Stecker/Schlauch nicht übernommen: ' + (await pg.locator('.code').innerText()));
    await step(pg, 'Passung');
    await pg.getByLabel('Spiel am Nebenluft-Ring').fill('0.45');
    expect((await pg.locator('.step-body').innerText()).includes('Spiel am Drehring'), 'Spiel am Drehring für den Schlauch fehlt');
    await ready(pg);
    await until(pg, downloadOpen(pg), 'Download gesperrt');
    await step(pg, 'Download');
    expect((await pg.locator('.step-body').innerText()).includes('das Rohr des Reglers'), 'kein Druckhinweis zum Drehring am Schlauch');
    expect((await pg.locator('.tips').innerText()).includes('„fliegender Träger“'), 'Hinweis zur Slicer-Meldung fehlt');
    expect((await pg.locator('.lead').first().innerText()).includes('oben Stecker M40, unten Schlauch H32'), 'Download-Text: ' + (await pg.locator('.lead').first().innerText()));
    await step(pg, 'Passung');
    await pg.getByRole('button', { name: /Passung auf Standard/ }).click();
    await step(pg, 'Größen');
    // Schlauch 33 ist kein Standardmaß: Hinweis im Schritt
    await fill(pg, 'Innendurchmesser des Schlauchs', '33');
    expect((await pg.locator('.issues').innerText()).includes('kein Standardmaß'), 'Hinweis zum Maß fehlt');
    await pg.getByRole('button', { name: /Größen auf Standard/ }).click();
    await ready(pg);
    expect((await pg.locator('.code').innerText()).includes('F32H36'), 'Standard nicht wiederhergestellt');
    // Freiform hat keinen Baustein „Nebenluft“ mehr
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step(pg, 'Aufbau');
    expect((await pg.locator('.add-btn', { hasText: 'Nebenluft' }).count()) === 0, 'Baustein Nebenluft noch wählbar');
  });

  await test('Eigene Kontur: Datei, Foto, Zeichnen', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: 'Freiform' }).click();
    await step(pg, 'Aufbau');
    await pickTemplate(pg, 'Rechteckige Haube');
    await pg.locator('.card-head', { hasText: 'Ende B' }).click();
    await pg.locator('.card.open .shape', { hasText: 'Eigene' }).click();
    expect((await pg.locator('.card.open').innerText()).includes('Noch keine Kontur'), 'Hinweis ohne Kontur fehlt');
    // fehlende Kontur ist kein Fehler: nicht rot, Hinweis „Kontur fehlt noch“, Download gesperrt
    await until(pg, async () => (await pg.locator('.stage-foot .status').innerText()).includes('Kontur fehlt noch'), 'Status ohne Kontur nicht „Kontur fehlt noch“');
    expect(!(await pg.locator('.card.open.has-error').count()), 'Karte ohne Kontur rot markiert');
    expect(await pg.locator('.card.open .fi-issues li.todo').count(), 'Hinweis ohne Kontur nicht blau');
    expect(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled(), 'Download ohne Kontur offen');
    // SVG mit Stutzen, Loch und offener Linie: Auswahl, Hinweis zur offenen Linie
    await pg.getByLabel('Form des Stutzens: Kontur-Datei').setInputFiles(fixture('kontur-stutzen.svg'));
    await pg.locator('.card.open .th').first().waitFor();
    expect((await pg.locator('.card.open .th').count()) === 2, 'zwei Umrisse erwartet');
    expect((await pg.locator('.card.open .notes').innerText()).includes('offene Linie'), 'Hinweis zur offenen Linie fehlt');
    await pg.locator('.card.open .th').first().click();
    expect((await pg.locator('.card.open .card-head').innerText()).includes('Kontur 56,5 × 33,6'), 'Maße der Kontur: ' + (await pg.locator('.card.open .card-head').innerText()));
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('56,5 × 33,6'), 'Kopfzeile ohne Kontur');
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'Kontur nicht druckbar');
    // Breite auf gemessenes Maß
    await fill(pg, 'Form des Stutzens: Breite', '60');
    expect((await pg.locator('.card.open .card-head').innerText()).includes('Kontur 60 ×'), 'Breite nicht übernommen');
    // SVG mit <use> (Vorlage in defs, gedreht): genau ein Umriss, 30 × 44
    await pg.getByLabel('Form des Stutzens: Kontur-Datei').setInputFiles(fixture('kontur-use.svg'));
    await pg.waitForTimeout(500);
    expect((await pg.locator('.card.open .card-head').innerText()).includes('Kontur 30 × 44'), 'SVG mit use: ' + (await pg.locator('.card.open .card-head').innerText()));
    // DXF in mm mit drei Umrissen
    await pg.getByLabel('Form des Stutzens: Kontur-Datei').setInputFiles(fixture('kontur-haube.dxf'));
    await pg.locator('.card.open .th').first().waitFor();
    await pg.locator('.card.open .th').first().click();
    expect((await pg.locator('.card.open .card-head').innerText()).includes('Kontur 50 × 40'), 'DXF: ' + (await pg.locator('.card.open .card-head').innerText()));
    // Foto nachzeichnen: Maßstab 50 mm (6 Pixel je mm), acht Ecken
    const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Nachzeichnen\u00a0…' }).click()]);
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
    await pg.getByRole('button', { name: /Weiter: Umriss/ }).click();
    await pg.waitForTimeout(200);
    for (const [x, y] of [[262, 362], [598, 362], [598, 296], [613, 290], [613, 254], [598, 248], [598, 158], [262, 158]]) await at(x / 6, y / 6);
    await pg.getByRole('button', { name: /Weiter: Prüfen/ }).click();
    expect((await pg.locator('.dlg').innerText()).includes('58,5 × 34 mm'), 'Foto: Maße falsch');
    await pg.getByRole('button', { name: 'Übernehmen' }).click();
    expect((await pg.locator('.card.open .card-head').innerText()).includes('Kontur 58,5 × 34'), 'Foto-Kontur nicht übernommen');
    // gezeichnet: bearbeiten, einen Punkt löschen
    await pg.getByRole('button', { name: 'Bearbeiten' }).click();
    await pg.locator('.dlg .pt').first().waitFor(); // Zeichenfenster wird nachgeladen
    // Rückgängig nach dem Löschen, Rückfrage vor dem Schließen
    const n0 = await pg.locator('.dlg .pt').count();
    await pg.locator('.dlg .pt').nth(3).dispatchEvent('pointerdown');
    await pg.getByRole('button', { name: 'Punkt löschen' }).click();
    expect((await pg.locator('.dlg .pt').count()) === n0 - 1, 'Punkt nicht gelöscht');
    await pg.getByRole('button', { name: 'Rückgängig' }).click();
    expect((await pg.locator('.dlg .pt').count()) === n0, 'Rückgängig stellt den Punkt nicht wieder her');
    await pg.locator('.dlg .pt').nth(3).dispatchEvent('pointerdown');
    await pg.getByRole('button', { name: 'Punkt löschen' }).click();
    await pg.keyboard.press('Escape');
    expect(await pg.locator('.dlg .ask').isVisible(), 'keine Rückfrage vor dem Schließen');
    await pg.getByRole('button', { name: 'Weiter zeichnen' }).click();
    await pg.getByRole('button', { name: /Weiter: Prüfen/ }).click();
    await pg.getByRole('button', { name: 'Übernehmen' }).click();
    await ready(pg);
    expect(!(await pg.locator('.step-tab', { hasText: 'Download' }).isDisabled()), 'gezeichnete Kontur nicht druckbar');
  });

  await test('Drehring-Lösehilfe: Halter wählen', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Drehring-Lösehilfe/ }).click();
    await step(pg, 'Größen');
    expect((await pg.locator('fieldset.dia').count()) === 2, 'Kupplung und Stecker sollten abgefragt werden');
    await pg.locator('.lead .help-btn').click();
    expect((await pg.locator('.help-text').innerText()).includes('trägt „M“'), 'Erklärung zur Beschriftung fehlt');
    await pg.getByLabel(/Für Stecker/).uncheck();
    expect((await pg.locator('fieldset.dia').count()) === 1, 'Stecker-Größe bleibt sichtbar');
    expect(await pg.getByLabel(/Für Kupplungen/).isDisabled(), 'letzter Halter abwählbar');
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).trim() === 'M32', 'Kopfzeile: ' + (await pg.locator('.stage-head .code').innerText()));
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Drehring gelöst'), 'Druckhinweis zur Lösehilfe fehlt');
    expect((await pg.locator('.tips').innerText()).includes('Stützen werden nicht gebraucht'), 'Lösehilfe braucht Stützen?');
    expect((await pg.locator('.tips').innerText()).includes('Füllung reicht'), 'Hinweis zur Füllung fehlt');
    await step(pg, 'Größen');
    await pg.getByLabel(/Für Stecker/).check();
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('F32'), 'Stecker-Halter fehlt in der Kopfzeile');
  });

  await test('Magnet-Schnellkupplung: Teile, Magnete, Druckpause', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Magnet-Schnellkupplung/ }).click();
    await step(pg, 'Teile');
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('10 × 3'), 'Kopfzeile: ' + (await pg.locator('.stage-head .code').innerText()));
    await pg.getByRole('radio', { name: '12 × 5 mm' }).click();
    await ready(pg);
    expect((await pg.locator('.stage-head .code').innerText()).includes('12 × 5'), 'Magnetgröße nicht übernommen');
    await pg.getByLabel(/Schlauchkupplung: wird/).uncheck();
    expect(await pg.getByLabel(/Maschinenadapter: kommt/).isDisabled(), 'letztes Teil abwählbar');
    expect((await pg.getByText('Steigung', { exact: true }).count()) === 0, 'Gewinde-Felder ohne Kupplung sichtbar');
    await ready(pg);
    await step(pg, 'Download');
    const tips = await pg.locator('.tips').innerText();
    expect(tips.includes('8 Neodym-Scheibenmagnete 12 × 5 mm'), 'Zahl/Größe der Magnete fehlt');
    expect(/Adapter bei [\d,]+ mm/.test(tips) && !tips.includes('Kupplung bei'), 'Druckpause nur für den Adapter erwartet');
    expect(tips.includes('M5 × 25') && tips.includes('DIN 985'), 'Schraube/Mutter fehlt');
    expect(tips.includes('Stützen werden nicht gebraucht'), 'Magnetkupplung braucht Stützen?');
    expect((await pg.locator('.lead').first().innerText()).includes('Magnete 12 × 5 mm'), 'Download-Text ohne Magnetgröße');
    await step(pg, 'Teile');
    await pg.getByLabel(/Schlauchkupplung: wird/).check();
    await pg.getByRole('radio', { name: 'Rechtsgewinde' }).click();
    await step(pg, 'Passung');
    expect((await pg.getByText('Spiel am Zentrierbund').count()) === 1, 'Spiel am Bund fehlt');
    await ready(pg);
    await step(pg, 'Download');
    expect((await pg.locator('.tips').innerText()).includes('Kupplung bei'), 'Druckpause der Kupplung fehlt');
    expect((await pg.locator('.tips').innerText()).includes('im Uhrzeigersinn'), 'Drehrichtung Rechtsgewinde fehlt');
    await step(pg, 'Teile');
    await pg.getByRole('radio', { name: '10 × 3 mm' }).click();
    await pg.getByRole('radio', { name: 'Linksgewinde' }).click();
  });
  await test('Drehring: druckoptimiert ist Standard, wie Original wählbar', pg, async () => {
    await step(pg, 'Verbindung');
    await pg.getByRole('radio', { name: /Kupplung ↔ Schlauch/ }).click();
    await step(pg, 'Passung');
    expect((await pg.getByRole('radio', { name: 'Druckoptimiert' }).getAttribute('aria-checked')) === 'true', 'Druckoptimiert ist nicht Standard');
    expect((await pg.locator('#swivel-hint').innerText()).includes('an den Schrägen 0,45 mm'), 'Spiel an den Schrägen fehlt');
    await pg.getByRole('radio', { name: 'Wie Original' }).click();
    expect((await pg.locator('#swivel-hint').innerText()).includes('0,3 mm wie im Original'), 'Standard 0,3 fehlt: ' + (await pg.locator('#swivel-hint').innerText()));
    await pg.getByRole('radio', { name: 'Druckoptimiert' }).click();
    await ready(pg);
    await step(pg, 'Download');
    expect(!(await pg.locator('.tips').innerText()).includes('wie im Original'), 'PETG-Hinweis zum Original beim druckoptimierten Drehring');
    await step(pg, 'Passung');
    await pg.getByRole('radio', { name: 'Wie Original' }).click();
    await pg.getByRole('button', { name: /Passung auf Standard/ }).click();
    expect((await pg.getByRole('radio', { name: 'Druckoptimiert' }).getAttribute('aria-checked')) === 'true', 'Zurücksetzen stellt nicht druckoptimiert ein');
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

  await test('hell/dunkel: Standard hell, Umschalter wirkt und bleibt gemerkt', pg, async () => {
    const mode = () => pg.evaluate(() => document.documentElement.dataset.theme ?? 'light');
    const btn = pg.getByTestId('theme-toggle');
    await pg.evaluate(() => localStorage.removeItem('osvacneo-theme'));
    await pg.reload();
    await ready(pg);
    expect((await mode()) === 'light', 'Start nicht hell');
    expect((await btn.getAttribute('title')) === 'Dunkle Ansicht', 'Titel im hellen Schema falsch');
    await btn.click();
    expect((await mode()) === 'dark', 'Umschalten auf dunkel wirkt nicht');
    const bar = await pg.locator('.topbar').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bar === 'rgb(12, 15, 17)', 'Kopfzeile im dunklen Schema: ' + bar);
    await pg.reload();
    await ready(pg);
    expect((await mode()) === 'dark', 'dunkel nach dem Neuladen nicht gemerkt');
    await btn.click();
    expect((await mode()) === 'light', 'zurück auf hell wirkt nicht');
    await pg.reload();
    await ready(pg);
    expect((await mode()) === 'light', 'hell nach dem Neuladen nicht gemerkt');
  });

  if (errors.length) results.push({ name: 'keine Skriptfehler im Browser', ok: false, msg: errors.join(' | ') });
  await ctx.close();
});

for (const r of results) console.log(`${r.ok ? 'ok    ' : 'FEHLER'} ${r.name}${r.msg ? ': ' + r.msg : ''}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} Abläufe fehlerhaft` : 'Alle Abläufe in Ordnung');
process.exit(bad ? 1 : 0);
