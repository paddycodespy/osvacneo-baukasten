"""Neu aufgenommene Anleitungsbilder mit den eingecheckten vergleichen.

  python3 tools/anleitung/vergleich.py public/anleitung out/anleitung

Ein Bild gilt als veraltet, wenn sich die Größe geändert hat oder mehr als 0,01 % der Pixel deutlich unterscheiden
(ein Farbkanal um mehr als 40 von 255). Kleines Rauschen (WebP, Kantenglättung der 3D-Vorschau) bleibt darunter.
Ausgabe: je veraltetem Bild eine Zeile „name anteil“; ohne Unterschiede nichts. Exit-Code 0, außer mit --streng.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LIMIT = 0.0001


def diff(a: Path, b: Path) -> float:
    x = Image.open(a).convert('RGB')
    y = Image.open(b).convert('RGB')
    if x.size != y.size:
        return 1.0
    d = np.abs(np.asarray(x, dtype=np.int16) - np.asarray(y, dtype=np.int16)).max(axis=2)
    return float((d > 40).mean())


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    old, new = Path(args[0]), Path(args[1])
    stale = []
    for f in sorted(new.glob('*.webp')):
        ref = old / f.name
        share = 1.0 if not ref.exists() else diff(ref, f)
        if share > LIMIT:
            stale.append(f.name)
            print(f'{f.stem} {share * 100:.2f} %')
    return 1 if stale and '--streng' in sys.argv else 0


if __name__ == '__main__':
    sys.exit(main())
