# Entwicklung

Hinweise für Entwickler. Die Übersicht für Anwender steht in der [README](../README.md).

## Wie der Baukasten funktioniert

Die Oberfläche ist mit Svelte gebaut. Die Teile berechnet OpenCascade (über replicad) als WebAssembly in mehreren Web Workern, alles im Browser und ohne Server. Die Vorschau zeigt three.js. Das Programm für Windows, macOS und Linux ist dieselbe Oberfläche in einem Tauri-Fenster.

Jeder Adapter ist eine Liste einzelner Teile, zum Beispiel Kupplung, Drehring, Gewinde und Beschriftung. Jedes Teil hat einen Schlüssel aus den Werten, von denen es abhängt. Ändert man nur einen Wert, wird nur das betroffene Teil neu berechnet, der Rest kommt aus dem Zwischenspeicher. Teure Teile werden auch im Browser gespeichert, damit ein Adapter beim nächsten Öffnen schnell wieder da ist.

Ein Adapter besteht wie in Fusion aus mehreren Körpern, die sich berühren oder überlappen. Der Slicer verschmilzt sie beim Laden.

Die genaue Geometrie der einzelnen Teile steht im Code unter `src/lib/osvac/`, jeweils am Anfang der Datei und an den Funktionen.

## Lokal starten

Voraussetzung ist Node.js 22 oder neuer.

```bash
npm ci
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # fertige Website in dist/
npm run preview    # dist/ ansehen auf http://localhost:4173
```

`dist/` läuft mit jedem Webserver, aber nicht per Doppelklick als `file://`, weil Browser dort keine Web Worker und kein WebAssembly laden.

## Wo was liegt

```
src/
  App.svelte            Gerüst der App
  lib/app.svelte.ts     Zustand aller Schritte
  components/           Oberfläche (Schritte, Freiform-Aufbau, Skizzen)
  lib/osvac/            Geometrie der Teile (params.ts enthält die Formeln aus Fusion)
  lib/worker/           Berechnung im Web Worker, 3MF-Export, Filamentschätzung
  lib/cad.ts            verteilt die Teile auf die Worker, Export STL/STEP/3MF
scripts/                Prüfungen und Hilfsskripte
src-tauri/              Programm für Windows, macOS und Linux
docs/                   Anleitung, Installation, diese Datei
tools/fusion/           Abgleich mit dem Fusion-Original
tools/druck/            Schichtprüfung für die Druckbarkeit (Python)
.github/workflows/      Tests, Installer, Release
```

## Prüfungen

| Befehl | Prüft |
|---|---|
| `npm run check` | Typen |
| `npm run test:keys` | Zwischenspeicher liefert gleiche Körper |
| `npm run test:freeform` | Freiform-Vorlagen, Formen, Extras, Flansch, Schieber |
| `npm run test:geometry` | alle Adaptertypen mit Grenzwerten |
| `npm run test:sketches` | Beschriftungen in Skizzen überlappen nicht |
| `npm run test:ui` | Bedienabläufe im Browser |
| `npm run test:swivel` | druckoptimierter Drehring |
| `npm run test:bleed` | Ring des Nebenluft-Reglers |
| `npm run test:islands` | Druckbarkeit ohne Stützen |

`test:sketches` und `test:ui` brauchen vorher `npm run build` und Chrome, Chromium oder Edge. `test:bleed` und `test:islands` brauchen python3 mit trimesh und shapely.

Auf GitHub laufen alle Prüfungen von Hand (**Actions → Tests → Run workflow**) und vor jedem Release, zusammen etwa 20 Minuten. Bei einem normalen Push laufen sie nicht, nach größeren Änderungen also von Hand starten.

## Anleitung

Die Anleitung in der App kommt aus `docs/anleitung.md`. `npm run build` baut daraus `public/anleitung.html`, die HTML-Datei nicht von Hand ändern. Die Bilder liegen in `public/anleitung/` und werden mit `npm run build && npm run docs:bilder` neu aufgenommen (einzelne Szenen: `npm run docs:bilder -- kontur duese`).

**Bei jeder Änderung an der Oberfläche prüfen, ob die Anleitung betroffen ist.** Dann Text anpassen, betroffene Bilder neu aufnehmen und alles mit committen. Ein Eintrag im CHANGELOG reicht dafür nicht. Der Workflow „Tests“ warnt, wenn ein Bild nicht mehr zur App passt.

## Abgleich mit Fusion

Die Standardteile sind gegen STEP-Exporte aus dem Fusion-Master osVAC neo v366 geprüft, in mehreren Größen und mit beiden Materialstärken. Alle Flächen liegen innerhalb von 0,1 mm am Original, nur die Schrift ist ausgenommen. Werkzeuge und Einzelheiten stehen in `tools/fusion/`.

Nicht nachgemessen sind Größen unter 25 und über 50 mm sowie ungewöhnliche Spaltmaße. Die Dichtnut-Füllung des Originals entfällt mit Absicht, damit eine Dichtung in die Kupplung passt.

## Programme bauen

- **Windows** (mit Rust und Visual Studio Build Tools): `npm run desktop:build`, zum Entwickeln `npm run desktop:dev`.
- **Linux** (Ubuntu/Debian): `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev`, dann `npx tauri build --bundles appimage,deb`.
- **macOS** wird auf GitHub gebaut.

Zum Testen lässt sich jeder Installer auf GitHub einzeln bauen: **Actions → Windows-Installer** (bzw. macOS-, Linux-Installer) **→ Run workflow**. Die Datei liegt dann unter **Artifacts**, ein Release entsteht nicht.

## Neue Version veröffentlichen

1. Version erhöhen in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` und `src-tauri/Cargo.lock`. In `CHANGELOG.md` einen Abschnitt `## <Version>` anlegen.
2. Bei geänderten Abhängigkeiten die Lizenzdateien neu erzeugen (siehe unten).
3. Committen, pushen, dann den Tag setzen: `git tag v<Version> && git push origin v<Version>`.

Der Tag startet `release.yml`. Es prüft Versionsnummern, CHANGELOG und Lizenzdateien, lässt alle Tests laufen und baut die drei Installer (etwa 15–20 Minuten). Nur wenn alles grün ist, entsteht unter **Releases** die neue Version mit allen Dateien. Ein Tag mit Bindestrich (z. B. `v0.6.1-beta.1`) wird als Vorabversion veröffentlicht.

Schlägt etwas fehl, entsteht kein Release:
- Störung ohne Fehler im Code: im Lauf **Re-run failed jobs**.
- Fehler im Code: beheben, pushen, dann Tag löschen und neu setzen:
  `git tag -d v0.6.1 && git push origin :refs/tags/v0.6.1 && git tag v0.6.1 && git push origin v0.6.1`.
  Das geht nur, solange es zu dem Tag noch kein Release gibt. Sonst lieber eine neue Version.

## Lizenzen

Der Baukasten und alle damit erzeugten Teile stehen wie osVAC neo unter CC BY-NC-SA 4.0, siehe `LICENSE`. Die exportierten Dateien tragen Namensnennung und Lizenz in ihren Metadaten.

Die Lizenzen der Bausteine Dritter stehen in `public/lizenzen.html`. Nach neuen Abhängigkeiten die Dateien neu erzeugen und mit committen:

```bash
python3 scripts/licenses-rust.py   # nach Änderungen an src-tauri/Cargo.lock, braucht cargo
python3 scripts/licenses.py        # braucht npm ci
```

Vor jedem Release prüft `release.yml`, ob sie aktuell sind, und bricht sonst ab.
