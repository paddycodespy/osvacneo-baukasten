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

Geprüft mit waagerechten Schnitten alle 0,25 mm (Draufsicht) und Volumen gegen die Fusion-STEP-Exporte
(M25/F32/H36, M32/F32/H32, M25/F25/H25, 7 und 9 mm, Maschinenadapter). Außer an Beschriftung und Rändelung
weicht keine Schnittkontur mehr als 0,15 mm ab.

| Teil | Volumen gegenüber Fusion | Anmerkung |
|---|---|---|
| Female F32 / F25 (mit Text) | +0,2 % / +0,1 % | Einführkanal mit R-1-Oberkante, Einlaufschräge (Ebene, < 0,1 mm), Rastnase mit R-1-Übergängen, Nutende mit Fase |
| Male M25 / M32 (mit Text) | +0,5 % / +0,4 % | Unterschied nur in der Beschriftung (Schrift); Nasen mit R 1 am Rohr und an der oberen Außenkante |
| Druckhilfe | +0,03 % | |
| Drehringe, Übergänge, Gehäuse | ±0,2 % | |
| Hose H36 (Schlauchteil, Gewinde, Knickschutz) | +0,1 % | Gewinde mit Anschnitt am Anfang, Auslauf im Knickschutz bzw. Endanschnitt ohne Knickschutz wie im Original |
| Rohrkonus, Übergang, Dichtnut-Füllung | ±0,15 % | Senkung als Fase der Bohrung wie im Original |

Beschriftung: Lage, Größe und Laufweite sind am Original vermessen (Liberation Sans Regular ist maßgleich zu Arial, Abweichung ≤ 0,15 mm). Die Lizenzzeile „CC BY-NC-SA 4.0“ steht wie im Original auf dem Band (Kupplung, Schlauchteil) und oben am Stecker; zusätzlich wird die Lizenz beim Download verlinkt.

Noch nicht umgesetzt: geteilte Varianten (FxxHyyDivided, MxxHyyDivided) mit Stützstruktur, einstellbares Spaltmaß am Drehring (fest 0,3 mm wie im Original), Flansche, Griffe und Düsen aus „PipesConesFlangesHandles“.

## Lizenzen

- **osVAC neo** (Konstruktion, Maße, Formeln): CC BY-NC-SA 4.0. Diese Lizenz gilt auch für alle mit dem Konfigurator erzeugten Teile: Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen.
- **Liberation Sans Regular** (Beschriftung): SIL Open Font License, siehe `public/fonts/LICENSE-LiberationSans.txt`.
- **Barlow** (Oberfläche): SIL Open Font License.
- **replicad** (MIT) und **OpenCascade** (LGPL 2.1, als WebAssembly unverändert eingebunden), **three.js** (MIT).
