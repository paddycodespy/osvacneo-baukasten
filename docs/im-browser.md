# osVAC neo Baukasten im Browser nutzen

Statt das Programm zu installieren, kannst du den Baukasten auch selbst im Browser starten. Das geht unter Windows,
macOS und Linux. Der Baukasten läuft dabei nur auf deinem Rechner: Er ist nicht im Internet erreichbar, und
nichts wird hochgeladen.

Einmal einrichten dauert etwa 10 Minuten. Danach reicht ein Befehl zum Starten.

## 1. Node.js installieren

Node.js ist die Laufzeitumgebung, die den Baukasten zusammenbaut und auf deinem Rechner bereitstellt.

1. Auf [nodejs.org](https://nodejs.org) die **LTS**-Version herunterladen und installieren (Version 22 oder neuer).
2. Prüfen: ein Terminal öffnen (siehe Schritt 3) und `node -v` eingeben. Es sollte etwa `v22.…` oder höher erscheinen.

Unter Linux geht es auch über die Paketverwaltung. Die Version muss aber mindestens 22 sein, ältere Distributionen
liefern oft eine zu alte.

## 2. Baukasten herunterladen

1. Auf der GitHub-Seite des Baukastens oben auf den grünen Knopf **Code** klicken, dann **Download ZIP**.
2. Die ZIP-Datei entpacken, zum Beispiel nach `Dokumente`. Es entsteht ein Ordner `osvacneo-baukasten-main`.

Wer Git kennt, kann stattdessen `git clone https://github.com/paddycodespy/osvacneo-baukasten.git` verwenden.

## 3. Terminal im Ordner öffnen

- **Windows:** den Ordner `osvacneo-baukasten-main` im Explorer öffnen, oben in die Adresszeile klicken, `cmd`
  eintippen und Enter drücken. Es öffnet sich die Eingabeaufforderung direkt in diesem Ordner.
- **macOS:** das Programm *Terminal* öffnen, `cd ` (mit Leerzeichen) eintippen, den Ordner aus dem Finder ins
  Terminalfenster ziehen und Enter drücken.
- **Linux:** im Dateimanager Rechtsklick auf den Ordner → *Im Terminal öffnen*.

## 4. Einmalig einrichten

Diese beiden Befehle nacheinander eingeben und jeweils warten, bis sie fertig sind:

```
npm ci
npm run build
```

`npm ci` lädt die benötigten Bausteine aus dem Internet (rund 350 MB, je nach Verbindung einige Minuten).
`npm run build` baut daraus den fertigen Baukasten. Warnungen in gelber Schrift kannst du ignorieren.

## 5. Starten

```
npm run preview
```

Danach im Browser **http://localhost:4173** öffnen. Am besten geeignet sind aktuelle Versionen von Chrome, Edge oder
Firefox.

Solange du den Baukasten benutzt, muss das Terminalfenster offen bleiben. Zum Beenden das Fenster schließen oder darin
**Strg + C** drücken.

Beim nächsten Mal genügen Schritt 3 und Schritt 5.

## Auf eine neue Version aktualisieren

1. Die neue ZIP-Datei herunterladen und entpacken (Schritt 2). Den alten Ordner kannst du danach löschen.
2. Im neuen Ordner wieder `npm ci` und `npm run build` ausführen (Schritt 4), dann starten (Schritt 5).

Deine Eingaben und bereits berechnete Teile bleiben erhalten. Der Browser speichert sie zur Adresse
`localhost:4173`, nicht im Ordner.

## Wenn etwas nicht klappt

- **`npm` oder `node` wird nicht gefunden:** Node.js ist nicht installiert, oder das Terminal war schon vor der
  Installation offen. Terminal schließen und neu öffnen.
- **Windows meldet „Ausführung von Skripts ist auf diesem System deaktiviert“:** Das passiert in der PowerShell.
  Nimm die Eingabeaufforderung (`cmd`) wie in Schritt 3 beschrieben.
- **„Port 4173 is already in use“:** Der Baukasten läuft schon in einem anderen Terminalfenster. Dort weiterbenutzen oder das
  andere Fenster schließen.
- **Doppelklick auf `index.html` zeigt nur eine leere Seite:** Das ist normal. Browser laden auf diesem Weg die
  Rechenbausteine nicht. Starte den Baukasten immer mit `npm run preview`.
