# osVAC neo Baukasten auf dem Mac installieren

Voraussetzung: macOS 11 (Big Sur) oder neuer. Die App läuft auf Apple-Silicon- und Intel-Macs.

1. Die Datei `osVAC neo Baukasten_…_universal.dmg` doppelklicken.
2. Im Fenster das App-Symbol auf den Ordner „Programme“ ziehen.
3. Die App ist nicht bei Apple beglaubigt. Beim ersten Start deshalb:
   - **macOS 15 (Sequoia) und neuer:** App einmal normal öffnen, die Meldung mit „Fertig“ schließen. Dann *Systemeinstellungen → Datenschutz & Sicherheit*, ganz unten bei „osVAC neo Baukasten wurde blockiert“ auf **Dennoch öffnen** klicken und mit dem Passwort bestätigen.
   - **macOS 11 bis 14:** Im Ordner „Programme“ mit der rechten Maustaste (oder Ctrl-Klick) auf die App, **Öffnen** wählen und in der Meldung noch einmal **Öffnen** klicken.
4. Danach startet die App normal per Doppelklick.

Meldet macOS, die App sei „beschädigt“, hilft im Terminal:

```
xattr -cr "/Applications/osVAC neo Baukasten.app"
```
