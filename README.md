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
| Freiform | Anschluss A (Female oder Male), Übergang, Bausteine, Ende B (Gerät oder Female/Male) | eigene Erweiterung, siehe unten |

Einstellbar: Durchmesser von Stecker, Kupplung und Schlauch, Spaltmaß Stecker/Kupplung, Spaltmaß Drehring (ab 0,2 mm, Standard 0,3 wie im Original; an der Kupplung höchstens 0,5 mm bei 7 mm bzw. 0,35 mm bei 9 mm Materialstärke, im Gehäuse bis 0,8 mm), Materialstärke (7 oder 9 mm), Beschriftung, Druckhilfe sowie beim Stutzen Befestigungsart, Durchmesser vorne und in der Tiefe, Steckweg, Wandstärke, Zugabe, Übergangslänge (TransitionConeLength, Standard 8 mm) und Schraubenlöcher.

### Freiform

Für Geräte ohne runden Stutzen oder für Winkel und Versätze. Der Adapter wird im Schritt „Aufbau“ als Kette zusammengesetzt:

- **Anschluss A** oben: Kupplung oder Stecker von osVAC neo in den Standardgrößen oder frei (15–60 mm), mit 8-mm-Übergangskonus auf die Wandstärke der Bausteine.
- **Bausteine** in beliebiger Reihenfolge: **Gerade** (Länge), **Bogen** (Winkel, Radius der Mittellinie, Richtung), **Übergang** (neuer Querschnitt, Länge, Versatz, Knick, Verdrehung), **Absatz** (neuer Querschnitt mit 45°-Schräge, Länge automatisch).
- **Ende B**: ein Geräteanschluss (aufgesteckt als Muffe/Haube oder eingesteckt als Zapfen, mit Steckweg, Zugabe, Drehung, Einführfase und beim Zapfen optional einem Anschlagring) oder wieder eine Kupplung bzw. ein Stecker. Ein automatischer Übergang führt vom letzten Baustein auf den Querschnitt des Endes.
- **Extras am Geräteanschluss** (eingeklappt unter „Extras“): Klemmrippen für einen Presssitz (dreieckig, 1,6 mm breit, ragen 0,3 mm über die Gerätefläche), Längsschlitze für eine Schlauchschelle (nur aufgesteckt, fest nach Größe: 80 % der Tiefe, Breite Umfang/40 = 2,5–4 mm, mit Schraubenlöchern 3 zwischen den Löchern, sonst 3/4/6 je nach Umfang < 100 / ≤ 200 / > 200 mm; runder Schlitzgrund), drei Schraubenlöcher (aufgesteckt Ø 4 mit Senkung wie beim Rohrkonus, eingesteckt Ø 3,2 zum Eindrehen; 8 mm vom Rand) und eine Aussparung am offenen Rand (nur aufgesteckt; Breite, Tiefe, Lage). Löcher, Schlitze und Rippen liegen versetzt zueinander und entfallen im Bereich der Aussparung.
- Querschnitte: Kreis, Ellipse, Langloch, Rechteck (Eckradien oben und unten getrennt), D-Form (Kreis mit Abflachung), Trapez. Maße der Bausteine sind die lichte Weite, die Wandstärke (1,6–8 mm) kommt außen dazu; am Gerät wird das gemessene Maß eingegeben.
- Vorlagen nach Beispielen von Thingiverse: Winkel 90° (stefanegg), rechteckige Haube (esbenrug, Bosch PSM 18 LI), Versatz mit Knick (dynamic-cube, Einhell TC-BJ 900), Gerade auf Stutzen.
- Wahlweise liegt Ende B oder Anschluss A auf dem Druckbett. Ein Stecker unten bekommt die Druckhilfe; liegt eine Kupplung mit der Öffnung unten, erscheint ein Hinweis. Nach der Berechnung meldet die Überhang-Prüfung (src/lib/overhang.ts: Fläche der Bausteine, die steiler als 45° frei nach unten zeigt) im Aufbau und in den Druckhinweisen, ob Stützmaterial nötig ist. Stoßflächen zwischen zwei Körpern zählen nicht mit, ebenso waagerechte Brücken am Geräteanschluss.
- Prüfungen in Klartext direkt am Baustein, z. B. zu kleiner Bogenradius, D-Form ohne Abflachung, zu steiler Übergang, zu kurzer Steckweg.

Gerade, Bogen, Anschlagring und Muffe/Zapfen ohne Konus sind exakte Extrusionen bzw. Rotationen einer Ringfläche. Übergänge, Absätze, Fase und konische Geräteanschlüsse sind Lofts durch abgetastete Querschnitte (periodische B-Spline-Interpolation, gleiche Startlage und Laufrichtung bei allen Formen, damit sich nichts verwindet). Außenhaut, Innenhaut und die beiden Ringflächen werden direkt zu einem Körper vernäht statt Innen- von Außenkörper abzuziehen: das ist schneller (unter 1 s statt bis zu 70 s) und bei Freiformflächen zuverlässig. `npm run test:freeform` baut alle Vorlagen, alle Querschnitte auf- und eingesteckt und längere Ketten und prüft jeden Körper.

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
  App.svelte                 Gerüst: Vorschau, Berechnung mit Fortschritt, Schrittleiste
  lib/app.svelte.ts          Zustand aller Schritte (Eingaben, abgeleitete Werte, Export, Speichern im Browser)
  components/steps/          Die Schritte Verbindung, Größen, Passung, Download
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
  lib/osvac/freeform.ts      Freiform: Querschnitte, Bausteine, Prüfungen, Lage auf dem Druckbett
  lib/osvac/catalog.ts       Adaptertypen für den Wizard
  components/FreeformEditor.svelte  Schritt „Aufbau“ (Vorlagen, Bausteine, Ende B)
  components/SectionEditor.svelte   Querschnitt wählen und bemaßen, mit Skizze
  components/BlockFigure.svelte     Erklärskizzen der Bausteine
scripts/
  build-ref.ts               Einzelteil in Node bauen (npm run part -- MxxFyy 25 32 32)
  matrix.ts                  Alle Typen mit Grenzwerten bauen (npm run test:geometry)
  freeform.ts                Freiform-Vorlagen und -Varianten bauen (npm run test:freeform, --stl schreibt out/)
  sketch-overlap.ts          Skizzen auf überlappende Beschriftungen prüfen (npm run build && npm run test:sketches)
.github/workflows/tests.yml  Alle Prüfungen bei jedem Push (Typen, Build, Schlüssel, Freiform, Skizzen, Geometrie)
```

### Prüfungen

| Befehl | Prüft | Dauer |
|---|---|---|
| `npm run check` | Typen (Svelte und TypeScript) | < 1 min |
| `npm run test:keys` | gleiche Cache-Schlüssel ergeben gleiche Körper | ca. 1 min |
| `npm run test:freeform` | alle Freiform-Vorlagen, Querschnitte und längere Ketten | ca. 1 min |
| `npm run test:sketches` | keine Beschriftung in Skizzen berührt Linien, Flächen oder andere Beschriftungen (braucht `npm run build` und Chrome, Pfad über `CHROME_PATH`) | < 1 min |
| `npm run test:geometry` | alle Adaptertypen mit Grenzwerten | ca. 10–15 min |

Auf GitHub laufen alle bei jedem Push (Actions → Tests).

### Rechenzeit

- Jede Baugruppe ist eine Liste einzelner Teile. Jedes Teil hat einen Schlüssel aus den Parametern, von denen es wirklich abhängt. Ändert sich nur die Beschriftung, wird nur das Textfeld neu gerechnet; Gewinde, Drehring und Kupplung kommen aus dem Cache.
- Mehrere Web Worker (bis zu 4, je nach CPU-Kernen) rechnen die Teile parallel, teure Teile zuerst. Fertige Teile erscheinen sofort in der Vorschau.
- Grundkörper, Rändelung und Textfelder sind getrennte Körper: Der Rändelring greift 0,3 mm in den Grundkörper und spart die Textfelder aus, die Textfelder (mit gravierter Schrift) greifen 0,05 mm hinein. Rändelung und Schrift hängen nur vom Außendurchmesser ab; ein anderes Spaltmaß rechnet nur den Grundkörper neu, und die volle Berechnung übernimmt den Grundkörper aus der schnellen Vorschau. Im 3MF sind alle Körper Teile desselben Objekts, der Slicer vereinigt sie. Volumen und Fläche der Überlappungen werden für die Filamentangabe herausgerechnet.
- `npm run test:keys` prüft, dass gleiche Zwischenspeicher-Schlüssel in allen Adaptertypen denselben Körper liefern.
- Der Senkkonus des Rohrstutzens nutzt glatte BSpline-Ringe statt Polygonen.
- OpenCascade (22 MB WebAssembly) wird beim Laden der Seite einmal übersetzt und allen Workern übergeben.
- Teure Körper werden zusätzlich im Browser gespeichert (IndexedDB, höchstens 150). Beim nächsten Öffnen ist ein schon einmal berechneter Adapter nach wenigen Sekunden da. Der Schlüssel enthält eine Prüfsumme des Geometrie-Codes; nach einem Update wird neu gerechnet.
- Jeder berechnete Körper wird auf gültige Topologie geprüft (BRepCheck). Scheitert eine Boolesche Operation, erscheint eine Meldung statt eines kaputten Teils. `npm run test:geometry` prüft das ebenso.

### Bedienung

- Ruhige Oberfläche für Laien: Jedes Feld hat eine kurze Beschriftung; die Erklärung steht hinter dem „?“ daneben (src/components/Field.svelte). Werte, die selten geändert werden (Luft/Zugabe, Wandstärke, Übergangslänge, Schraubenlöcher, Drehung, Fase), liegen in eingeklappten „Feineinstellungen“.
- Texte in einfacher Sprache, Fachbegriffe vermieden (z. B. „Spiel“ statt „Spaltmaß“ in den Überschriften, „Tiefe“ statt „Steckweg“).
- Schlicht: Zurücksetzen gibt es nur beim Stutzen (alle Stutzen-Maße inkl. Feineinstellungen, die Befestigungsart bleibt), im Schritt „Passung“ und im Freiform-Aufbau (auf die zuletzt gewählte Vorlage, mit Rückfrage), jeweils nur sichtbar, wenn etwas geändert wurde; F, M und H haben keine eigenen Kennfarben mehr, Auswahlen sind überall gleich himmelblau markiert.
- Fehler: Solange ein Fehler vorliegt (Berechnung gescheitert oder rot markierte Prüfung), sind der Reiter „Download“ und der Weiter-Knopf dorthin gesperrt, mit Hinweis über den Knöpfen. In der Oberfläche erscheinen nur verständliche Meldungen (src/lib/errors.ts: `UserError` für eigene Meldungen, alles andere wie WebAssembly-Ausnahmen von OpenCascade nur in der Konsole und als allgemeiner Hinweis bzw. „Baustein n (…) ließ sich mit diesen Maßen nicht berechnen“).
- In Skizzen berührt keine Beschriftung eine Form, Linie oder andere Beschriftung; Eckradien sind mit Hinweislinien außerhalb der Form beschriftet.
- Der Stand (Typ, Größen, Passung, Freiform-Aufbau, Schritt) wird im Browser gespeichert (localStorage) und beim nächsten Öffnen wiederhergestellt; beschädigte oder unbekannte Werte fallen auf den Standard zurück.
- Freiform: Ist der Aufbau gegenüber der Vorlage verändert, fragt ein Klick auf eine Vorlage vorher nach. Nach der Berechnung steht schon im Aufbau, ob Stützen nötig sind. Die Zugabe am Gerät ist bei runden Formen 0,2 mm, bei eckigen 0,4 mm (wechselt mit, solange der Standard drinsteht).
- Während der Berechnung zeigt die Vorschau den Fortschritt („3 von 9 Teilen“). Scheitert sie, bleibt das letzte Modell blass stehen; gab es noch keins, erscheint ein Hinweis statt einer leeren Vorschau.
- Im Download-Schritt lassen sich mehrere Adapter auf ein Druckbett legen und zusammen als 3MF, STL oder STEP herunterladen.
- Dateinamen enthalten abweichende Einstellungen (z. B. „osVAC neo F32H36 Drehring 0,4“).

Konvention: Achse = Z, Oberkante eines Moduls bei z = 0, Profile als (r, z). Radien hängen über die Fusion-Formeln von den Eingaben ab, axiale Maße sind fest.

## Abgleich mit Fusion

Geprüft gegen die Fusion-STEP-Exporte M25/F32/H36, M32/F32/H32, M25/F25/H25, M50/F50/H50, M40/F40/H40,
M25/F25/H27, M40/F25/H50 (7 mm), M25/F32/H36 und M32/F32/H32 (9 mm), M32/F32/H36 mit Spaltmaß 0,4 und
Drehring 0,5 sowie sieben Rohrvarianten (konisch, gerade mit 3–6 mm Wand, Ø 30 und 40): Volumen, waagerechte
Schnitte und ein Flächenvergleich, bei dem für 150 000–300 000 Punkte jeder Oberfläche der exakte Abstand zur
Gegenfläche berechnet wird (Rändelung eingeschlossen, nur die Schrift ausgenommen). Ergebnis: Alle Flächen liegen
innerhalb von 0,1 mm am Original. Einzige Ausnahme: Am Gewindeanfang großer Schläuche (H50) weicht die
Anschnittfläche nahe am Gewindegrund an wenigen Punkten bis 0,15 mm ab; eine Ebene, die H50 genauer trifft,
verschlechtert die kleinen Größen.

Die Werkzeuge dafür liegen in `tools/fusion/` (Fusion-Exportskript und Vergleich, siehe dortige README).

Nicht nachgemessen (fortgeschrieben): Größen unter 25 und über 50 mm, Spaltmaße außer 0,2/0,4 bzw. 0,3/0,5,
Drehring bei 9 mm mit anderem Spaltmaß, Schraubenlöcher an sich verjüngenden Rohren.

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

## Windows-Programm (Installer)

Der Konfigurator lässt sich als eigenes Windows-Programm installieren (Tauri). Er läuft dann in einem eigenen
Fenster mit dem in Windows eingebauten WebView2 (Edge), weiterhin vollständig lokal und ohne Internet.
Externe Links öffnen im Standardbrowser, die Lizenzseiten in einem zweiten Fenster.

**Installer bauen lassen (GitHub):** im Repository unter **Actions → Windows-Installer → Run workflow**.
Nach etwa 10–15 Minuten liegt unter dem Lauf bei **Artifacts** eine ZIP mit
`osVAC neo Konfigurator_0.1.0_x64-setup.exe`. Alternativ startet ein Versions-Tag den Bau:
`git tag v0.1.0 && git push --tags`.

**Installieren:** Setup-Datei starten. Sie installiert ohne Administratorrechte für den angemeldeten Benutzer
(Startmenü, Deinstallation über „Apps“). Da die Datei nicht signiert ist, meldet Windows beim ersten Start
„Der Computer wurde durch Windows geschützt“: **Weitere Informationen → Trotzdem ausführen**.
Fehlt WebView2 (nur sehr alte Windows-10-Installationen), lädt der Installer es nach.

**Selbst bauen** (Windows mit Rust und Visual Studio Build Tools): `npm ci`, dann `npm run desktop:build`.
Zum Entwickeln im Programmfenster: `npm run desktop:dev`.

## macOS-Programm

Unter **Actions → macOS-Installer → Run workflow** entsteht eine DMG (Universal: Apple Silicon und Intel), ebenfalls als Artefakt.
Auf einem Mac installiert und getestet: läuft. Da die App nicht signiert ist, beim ersten Start im Finder
Rechtsklick → **Öffnen** (oder Systemeinstellungen → Datenschutz & Sicherheit → **Dennoch öffnen**), Einzelheiten in `docs/installation-mac.md`.

Die Version steht in `src-tauri/tauri.conf.json` (`version`) und sollte mit `package.json` übereinstimmen.

## Lizenzen

Basiert auf **osVAC neo von Ludo Kerz**, ursprünglich entstanden im Hobbyhimmel Stuttgart.
Für diesen Konfigurator nachgebaut und verändert: Maße, Spaltmaße und Stutzen sind frei einstellbar.

Auch die exportierten Dateien tragen Namensnennung und Lizenz: 3MF in den Metadaten, STL im Dateikopf, STEP im Kopfbereich (Autor, Organisation, Beschreibung).

- **Dieses Projekt** (Quellcode und alle damit erzeugten Teile) steht wie osVAC neo unter **CC BY-NC-SA 4.0**: Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen. Siehe `LICENSE`.
- **Bausteine Dritter** mit eigenen Lizenzen, vollständig in `public/lizenzen.html` (in der App im Download-Schritt verlinkt) und als Text in `public/THIRD_PARTY_LICENSES.txt`:
  - OpenCascade (LGPL 2.1, als WebAssembly unverändert und austauschbar eingebunden)
  - replicad, three.js, Svelte, fflate (MIT)
  - Poppins (Oberfläche) und Liberation Sans Regular (Beschriftung): SIL Open Font License
- Nach neuen Abhängigkeiten `python3 scripts/licenses.py` ausführen, damit die Datei aktuell bleibt.
