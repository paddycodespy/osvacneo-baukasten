# Abgleich mit dem Original in Fusion

Mit diesen Werkzeugen lässt sich nach jeder Geometrie-Änderung prüfen, ob der Konfigurator noch dem Original
osVAC neo v366 entspricht.

## 1. Referenzteile in Fusion exportieren

`export/osvac_export3.py` ist ein Fusion-Skript. Es setzt im geöffneten Design nacheinander verschiedene
Parameter, lässt Fusion neu rechnen und exportiert jede Komponente als STEP und STL, dazu die Parameterliste.
Es erkennt selbst, ob `osVACneo Master` oder `osVACneo PipesConesFlangesHandles` geöffnet ist.

1. In Fusion **Skripts und Add-Ins** öffnen (Umschalt+S), über **+** den Ordner `export` hinzufügen.
2. Design öffnen, Skript ausführen, Design danach **nicht speichern**.
3. Ergebnis liegt in `Dokumente/osvac_export3/master` bzw. `.../pipes`.

Welche Varianten exportiert werden, steht oben im Skript (`MASTER`, `PIPES`). Die Ordnernamen
(`M25_F32_H36`, `M25_F32_H36_W9`, `M32_F32_H36_G04_S05`, …) liest der Vergleich aus.

## 2. Vergleichen

Im Projektordner:

```
python3 tools/fusion/compare.py <Pfad>/osvac_export3/master
python3 tools/fusion/compare.py <Pfad>/osvac_export3/pipes
python3 tools/fusion/compare.py <Pfad>/master M50_F50_H50      # nur ein Ordner
```

Benötigt: `npm ci`, Python 3 mit `cadquery`, `trimesh`, `libigl`, `numpy`, `manifold3d`.
Ein Durchlauf dauert je Größe einige Minuten.

Ausgabe je Teil: `OK` (alles ≤ 0,1 mm) oder `ABW` mit den Stellen (z, Winkel θ, Radius r).

Bekannte Scheinabweichungen:

- Schrift: wird ausgeblendet (flache Abweichungen ≤ 0,52 mm in den Textbereichen).
- Gewindegrund bei θ ≈ 27–37°: Fehler beim Zerlegen der Fusion-STEP-Dateien in Dreiecke;
  Schnitte durch das feine STL aus Fusion zeigen dort Deckungsgleichheit.
- Druckhilfe, Rippen an der Fangring-Schräge (≈ 0,2 mm): Der Fusion-Körper enthält dort innere Kontaktflächen
  der Rippen, die Außenkontur ist deckungsgleich.

`surfcmp.py` kann auch einzeln aufgerufen werden, die Parameter stehen im Kopf der Datei.
