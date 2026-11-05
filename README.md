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

Einstellbar: Durchmesser von Stecker, Kupplung und Schlauch, Spaltmaß Stecker/Kupplung, Spaltmaß Drehring (ab 0,2 mm, Standard 0,3 wie im Original; an der Kupplung höchstens 0,5 mm bei 7 mm bzw. 0,35 mm bei 9 mm Materialstärke, im Gehäuse bis 0,8 mm), Materialstärke (7 oder 9 mm), Beschriftung, Druckhilfe sowie beim Stutzen Befestigungsart, Durchmesser vorne und in der Tiefe, Steckweg, Wandstärke, Zugabe, Übergangslänge (TransitionConeLength, Standard 8 mm) und Schraubenlöcher.

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
  lib/cad.ts                 Worker-Pool, Auftragsverteilung, Export STL/STEP/3MF
  lib/worker/cad.worker.ts   OpenCascade (replicad) im Web Worker, Teile-Cache
  lib/worker/threemf.ts      3MF-Writer
  lib/osvac/params.ts        Parameter und Formeln aus Fusion
  lib/osvac/female.ts        Kupplung mit Bajonett, Rastnase, Dichtnut
  lib/osvac/male.ts          Stecker mit Bajonettnasen, Druckhilfe
  lib/osvac/hose.ts          Gewindekörper, Drehring, Gehäuse, Knickschutz
  lib/osvac/thread.ts        Schlauchgewinde (linksgängig, Steigung 5 mm, Konus 4°)
  lib/osvac/machine.ts       Rohrkonus für Stutzen
  lib/osvac/grip.ts          Rändelung und Textfelder
  lib/osvac/assemblies.ts    Baugruppen als Liste einzelner Teile
  lib/osvac/catalog.ts       Adaptertypen für den Wizard
scripts/
  build-ref.ts               Einzelteil in Node bauen (npm run part -- MxxFyy 25 32 32)
  matrix.ts                  Alle Typen mit Grenzwerten bauen (npm run test:geometry)
```

### Rechenzeit

- Jede Baugruppe ist eine Liste einzelner Teile. Jedes Teil hat einen Schlüssel aus den Parametern, von denen es wirklich abhängt. Ändert sich nur die Beschriftung, wird nur das Textfeld neu gerechnet; Gewinde, Drehring und Kupplung kommen aus dem Cache.
- Mehrere Web Worker (bis zu 4, je nach CPU-Kernen) rechnen die Teile parallel, teure Teile zuerst. Fertige Teile erscheinen sofort in der Vorschau.
- Grundkörper, Rändelung und Textfelder sind getrennte Körper: Der Rändelring greift 0,3 mm in den Grundkörper und spart die Textfelder aus, die Textfelder (mit gravierter Schrift) greifen 0,05 mm hinein. Rändelung und Schrift hängen nur vom Außendurchmesser ab; ein anderes Spaltmaß rechnet nur den Grundkörper neu, und die volle Berechnung übernimmt den Grundkörper aus der schnellen Vorschau. Im 3MF sind alle Körper Teile desselben Objekts, der Slicer vereinigt sie. Volumen und Fläche der Überlappungen werden für die Filamentangabe herausgerechnet.
- `npm run test:keys` prüft, dass gleiche Zwischenspeicher-Schlüssel in allen Adaptertypen denselben Körper liefern.
- Der Senkkonus des Rohrstutzens nutzt glatte BSpline-Ringe statt Polygonen.

Konvention: Achse = Z, Oberkante eines Moduls bei z = 0, Profile als (r, z). Radien hängen über die Fusion-Formeln von den Eingaben ab, axiale Maße sind fest.

## Abgleich mit Fusion

Geprüft gegen die Fusion-STEP-Exporte (M25/F32/H36, M32/F32/H32, M25/F25/H25, 7 und 9 mm, Maschinenadapter
mit drei Rohrvarianten): Volumen, waagerechte Schnitte alle 0,25 mm und ein Flächenvergleich, bei dem für
300 000 Punkte jeder Oberfläche der exakte Abstand zur Gegenfläche berechnet wird (Rändelung eingeschlossen,
nur die Schrift ausgenommen). Ergebnis: Alle Flächen liegen innerhalb von 0,1 mm am Original, außer den
Schraubenlöchern bei 4 mm Rohrwand (siehe unten).

Nicht aus den vorhandenen Daten ableitbar:
- Höhe der Schraubenlöcher im Rohrkonus: bei 3 mm Wand wie im Original, bei 4 mm Wand ohne Konus liegen sie im Original 0,13 mm höher. Die zugrunde liegende Regel lässt sich aus drei Exporten nicht eindeutig bestimmen.
- Einführung der Nut zwischen F25 und F32 und der Endanschnitt des Gewindes zwischen H25 und H36 sind linear interpoliert.

| Teil | Volumen gegenüber Fusion | Anmerkung |
|---|---|---|
| Female F32 / F25 (mit Text) | +0,2 % / +0,1 % | Einführkanal mit R-1-Oberkante, Einlaufschräge (Ebene, < 0,1 mm), Rastnase mit R-1-Übergängen und bis an die Schräge reichend, Nutende mit Fase bzw. gerade bei 60° (F25) |
| Male M25 / M32 (mit Text) | +0,5 % / +0,4 % | Unterschied nur in der Beschriftung (Schrift); Nasen mit R 1 am Rohr und an der oberen Außenkante |
| Druckhilfe | ±0,01 % | Stützblöcke enden an der Steckerunterkante, Kerbe zur Fangring-Schräge wie im Original |
| Drehringe, Übergänge, Gehäuse | ±0,2 % | |
| Hose H36 (Schlauchteil, Gewinde, Knickschutz) | +0,1 % | Gewinde mit Anschnitt am Anfang, Auslauf im Knickschutz bzw. Endanschnitt ohne Knickschutz wie im Original |
| Rohrkonus, Übergang, Dichtnut-Füllung | ±0,15 % | Senkung als Fase der Bohrung wie im Original |

Beschriftung: Lage, Größe und Laufweite sind am Original vermessen (Liberation Sans Regular ist maßgleich zu Arial, Abweichung ≤ 0,15 mm). Die Lizenzzeile „CC BY-NC-SA 4.0“ steht wie im Original auf dem Band (Kupplung, Schlauchteil) und oben am Stecker; zusätzlich wird die Lizenz beim Download verlinkt.

Noch nicht umgesetzt: geteilte Varianten (FxxHyyDivided, MxxHyyDivided) mit Stützstruktur, Flansche, Griffe und Düsen aus „PipesConesFlangesHandles“.

## Lizenzen

Basiert auf **osVAC neo von Ludo Kerz**, ursprünglich entstanden im Hobbyhimmel Stuttgart.

- **Dieses Projekt** (Quellcode und alle damit erzeugten Teile) steht wie osVAC neo unter **CC BY-NC-SA 4.0**: Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen. Siehe `LICENSE`.
- **Bausteine Dritter** mit eigenen Lizenzen, vollständig in `public/lizenzen.html` (in der App im Download-Schritt verlinkt) und als Text in `public/THIRD_PARTY_LICENSES.txt`:
  - OpenCascade (LGPL 2.1, als WebAssembly unverändert und austauschbar eingebunden)
  - replicad, three.js, Svelte, fflate (MIT)
  - Poppins (Oberfläche) und Liberation Sans Regular (Beschriftung): SIL Open Font License
- Nach neuen Abhängigkeiten `python3 scripts/licenses.py` ausführen, damit die Datei aktuell bleibt.
