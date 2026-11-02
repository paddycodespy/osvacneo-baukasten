# osVAC neo Konfigurator

Konfigurator für Absaugadapter von **osVAC neo**, der komplett im Browser läuft. Ein Wizard führt durch Verbindung, Größen, Passung und Download. Am Ende gibt es das Teil als **3MF**, **STL** oder **STEP**.

Es werden keine neuen Adapter erfunden. Jedes Teil ist ein parametrisiertes Originalteil von osVAC neo: Profile, Bajonett, Toleranzen und Formeln stammen aus dem Fusion-360-Master **osVAC neo v366 (beta)** und wurden gegen Fusion-Exporte in mehreren Größen geprüft.

## Adaptertypen

| Typ | Aufbau | Fusion-Vorlage |
|---|---|---|
| Stecker ↔ Kupplung | Female, Übergangskonus, Male, Druckhilfe | MxxFyy |
| Kupplung einzeln | Female | Female (Kupplung) |
| Stecker einzeln | Male, Druckhilfe | Male (Stecker) |
| Kupplung ↔ Schlauch | Female, Übergang, Drehring (2 Ringe), Gewindekörper, Gewinde, Knickschutz | FxxHyy |
| Stecker ↔ Schlauch | Male, Gehäuse, Drehring (2 Ringe), Gewindekörper, Gewinde | MxxHyy |
| Kupplung → Stutzen | Female, Dichtnut-Füllung, Übergang, Rohrkonus | Fxx To Pipe Cone |
| Stecker → Stutzen | Male, Übergang, Rohrkonus | Mxx To Pipe Cone |

Einstellbar: Durchmesser von Stecker, Kupplung und Schlauch, Spaltmaß Stecker/Kupplung, Materialstärke (7 oder 9 mm), Beschriftung, Druckhilfe sowie beim Stutzen Befestigungsart, Durchmesser vorne und in der Tiefe, Steckweg, Wandstärke, Zugabe und Schraubenlöcher.

Wie in Fusion besteht ein Adapter aus mehreren Körpern, die sich berühren oder überlappen. Slicer verschmelzen sie beim Laden. In 3MF liegen sie als Teile eines Objekts vor, in STEP als einzelne Volumenkörper.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
```

Fertige Version bauen und lokal ausliefern:

```bash
npm run build
npm run preview    # http://localhost:4173
```

Der Ordner `dist/` ist eine statische Website und läuft mit jedem lokalen Webserver. Per Doppelklick als `file://` funktioniert er nicht, weil Browser dort keine Web Worker und kein WebAssembly laden.

## Versionsverwaltung mit GitHub

Das Repository ist für die Nutzung auf dem eigenen Rechner gedacht. GitHub dient nur als Ablage und Versionsverwaltung, es wird nichts veröffentlicht. Empfohlen ist ein **privates** Repository.

```bash
git remote add origin https://github.com/<dein-account>/osvacneo-konfigurator.git
git push -u origin main
```

Danach reicht nach Änderungen `git add -A`, `git commit -m "…"` und `git push`.

## Aufbau

```
src/
  App.svelte                 Wizard und Oberfläche
  lib/viewer.ts              3D-Ansicht (three.js) mit Druckbett
  lib/cad.ts                 Aufrufe an den CAD-Worker
  lib/worker/cad.worker.ts   OpenCascade (replicad) im Web Worker, Export STL/STEP/3MF
  lib/worker/threemf.ts      3MF-Writer
  lib/osvac/params.ts        Parameter und Formeln aus Fusion
  lib/osvac/female.ts        Kupplung mit Bajonett, Rastnase, Dichtnut
  lib/osvac/male.ts          Stecker mit Bajonettnasen, Druckhilfe
  lib/osvac/hose.ts          Gewindekörper, Drehring, Gehäuse, Knickschutz
  lib/osvac/thread.ts        Schlauchgewinde (linksgängig, Steigung 5 mm, Konus 4°)
  lib/osvac/machine.ts       Rohrkonus für Stutzen
  lib/osvac/grip.ts          Rändelung und Textfelder
  lib/osvac/catalog.ts       Adaptertypen für den Wizard
scripts/
  build-ref.ts               Einzelteil in Node bauen (npm run part -- MxxFyy 25 32 32)
  matrix.ts                  Alle Typen mit Grenzwerten bauen (npm run test:geometry)
```

Konvention: Achse = Z, Oberkante eines Moduls bei z = 0, Profile als (r, z). Radien hängen über die Fusion-Formeln von den Eingaben ab, axiale Maße sind fest.

## Abgleich mit Fusion

| Teil | Volumen gegenüber Fusion | Anmerkung |
|---|---|---|
| Male M32 (mit Text) | −0,4 % | Druckhilfe ohne Aussparungen an den Nasen |
| Female F32 (mit Text) | +0,3 % | |
| MxxFyy M25/F32 | +0,3 % | |
| FxxHyy F32/H32 | +0,1 % | |
| MxxHyy M25/H36 | −0,5 % | Gewinde als eigener Körper; die 0,5-mm-Überlappung mit der Wand ist herausgerechnet |
| Fxx to Pipe Cone | +0,7 % | |
| Hose H36 (Schlauchteil, Gewinde, Knickschutz) | −0,9 % | Gewinde mit Auslauf im Knickschutz (knapp 2 Umdrehungen bis Tiefe 0) |

Die Drehringe stimmen auf den Kubikmillimeter mit Fusion überein. Schlauchseite, Drehring und Knickschutz sind zusätzlich bei 9 mm Materialstärke gegen Fusion geprüft (Außenmaße auf 0,03 mm genau). Bajonett, Nut, Rastnase, Dichtnut, Drehring und Gewinde liegen in den Schnitten deckungsgleich auf den Fusion-Exporten.

Beschriftung: Lage, Größe und Laufweite sind am Original vermessen (Liberation Sans Regular ist maßgleich zu Arial, Abweichung ≤ 0,15 mm). Statt der Lizenzzeile „CC BY-NC-SA 4.0“ steht auf dem Band „osVAC neo“ und die Kennung; die Lizenz wird beim Download verlinkt. Schraubenlöcher am Rohrkonus mit 90°-Senkung Ø 8 bei 90/210/330° wie im Original.

Noch nicht umgesetzt: geteilte Varianten (FxxHyyDivided, MxxHyyDivided) mit Stützstruktur, einstellbares Spaltmaß am Drehring (fest 0,3 mm wie im Original), Flansche, Griffe und Düsen aus „PipesConesFlangesHandles“.

## Lizenzen

- **osVAC neo** (Konstruktion, Maße, Formeln): CC BY-NC-SA 4.0. Diese Lizenz gilt auch für alle mit dem Konfigurator erzeugten Teile: Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen.
- **Liberation Sans Regular** (Beschriftung): SIL Open Font License, siehe `public/fonts/LICENSE-LiberationSans.txt`.
- **Barlow** (Oberfläche): SIL Open Font License.
- **replicad** (MIT) und **OpenCascade** (LGPL 2.1, als WebAssembly unverändert eingebunden), **three.js** (MIT).
