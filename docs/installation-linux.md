# osVAC neo Baukasten unter Linux

Es gibt zwei Dateien, eine davon reicht:

- **AppImage** (`osVAC-neo-Baukasten-…-Linux.AppImage`): läuft ohne Installation auf den meisten Distributionen
  (64 Bit, ab etwa Ubuntu 22.04 bzw. gleich alten Systemen).
- **.deb** (`osVAC-neo-Baukasten-…-Linux.deb`): für Debian, Ubuntu und Linux Mint, mit Eintrag im Startmenü.

## AppImage

1. Datei in einen beliebigen Ordner legen, z. B. `~/Programme`.
2. Ausführbar machen: Rechtsklick → *Eigenschaften* → *Als Programm ausführen erlauben*, oder im Terminal

   ```
   chmod +x osVAC-neo-Baukasten-0.5.1-Linux.AppImage
   ```

3. Doppelklick startet das Programm.

Startet es nicht und meldet etwas mit `libfuse.so.2`: unter Ubuntu 22.04 `sudo apt install libfuse2`, unter Ubuntu 24.04
`sudo apt install libfuse2t64`. Ohne FUSE geht es auch so:

```
./osVAC-neo-Baukasten-0.5.1-Linux.AppImage --appimage-extract-and-run
```

## .deb

```
sudo apt install ./osVAC-neo-Baukasten-0.5.1-Linux.deb
```

Danach steht „osVAC neo Baukasten“ im Startmenü. Deinstallieren: `sudo apt remove os-vac-neo-baukasten`.

## Gut zu wissen

- Heruntergeladene Dateien (3MF, STL, STEP) landen im Ordner „Downloads“ (bzw. „Herunterladen“).
- Bleibt das Fenster leer oder weiß, im Terminal mit `WEBKIT_DISABLE_COMPOSITING_MODE=1` davor starten und Bescheid geben.
