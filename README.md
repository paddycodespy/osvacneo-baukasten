# osVAC neo Baukasten

Der **osVAC neo Baukasten** gestaltet Absaugadapter für das System osVAC neo. Ein Wizard führt durch Verbindung, Größen, Passung und Download. Am Ende gibt es das Teil als **3MF**, **STL** oder **STEP**. Alles wird auf dem eigenen Rechner berechnet, ohne Anmeldung und ohne Server.

Jedes Standardteil ist ein parametrisiertes Originalteil von osVAC neo. Maße und Formeln stammen aus dem Fusion-360-Master **osVAC neo v366 (beta)** und wurden gegen Fusion-Exporte geprüft (Abweichung unter 0,1 mm).

## Benutzen

- **Als Programm** für Windows, macOS und Linux: [neueste Version herunterladen](https://github.com/paddycodespy/osvacneo-baukasten/releases/latest). Installation: [Windows](docs/installation-windows.md), [macOS](docs/installation-mac.md), [Linux](docs/installation-linux.md).
- **Im Browser**, auf dem eigenen Rechner gestartet (braucht Node.js): [docs/im-browser.md](docs/im-browser.md).

Die Anleitung ist in der App unter **Anleitung** zu finden. Änderungen stehen in [CHANGELOG.md](CHANGELOG.md). Fehler und Wünsche bitte als [Issue](https://github.com/paddycodespy/osvacneo-baukasten/issues) melden.

## Was sich bauen lässt

- **Stecker ↔ Kupplung**, Kupplung oder Stecker einzeln
- **Kupplung oder Stecker ↔ Schlauch** mit Drehring und Gewinde
- **Kupplung oder Stecker → Stutzen** für Geräte mit rundem Anschluss
- **Freiform** für Geräte ohne runden Stutzen, mit Winkeln, Versätzen, Abzweig, Schieber, Flansch und eigener Kontur (SVG, DXF oder gezeichnet)
- **Saugdüse**, **Absperrschieber**, **Nebenluft-Regler**
- **Magnet-Schnellkupplung Ø100**, **Drehring-Lösehilfe** und eine **Lippendichtung** aus TPU für die Kupplung

## Entwickeln

Voraussetzung ist Node.js 22 oder neuer.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # statische Website in dist/
```

Projektaufbau, Prüfungen, Abgleich mit Fusion, das Bauen der Programme und das Veröffentlichen neuer Versionen stehen in [docs/entwicklung.md](docs/entwicklung.md).

## Lizenz

Der Baukasten basiert auf **osVAC neo von Ludo Kerz**, ursprünglich entstanden im Hobbyhimmel Stuttgart. Er stammt von [paddycodespy](https://github.com/paddycodespy) und steht wie osVAC neo unter **CC BY-NC-SA 4.0** (Namensnennung, nicht kommerziell, Weitergabe unter gleichen Bedingungen). Das gilt auch für alle damit erzeugten Teile, siehe [LICENSE](LICENSE). Die Lizenzen der verwendeten Bausteine Dritter stehen in `public/lizenzen.html`.
