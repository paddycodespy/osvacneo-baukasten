"""Erzeugt public/THIRD_PARTY_LICENSES.txt aus den Lizenzdateien der eingebundenen Bausteine.
usage: python3 scripts/licenses.py   (nach npm ci; bei neuen Abhängigkeiten erneut ausführen)"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
nm = root / 'node_modules'
items = [
    ('OpenCascade Technology (CAD-Kern, als WebAssembly über replicad-opencascadejs)', 'replicad-opencascadejs', 'LICENSE',
     'Die Bibliothek ist unverändert als eigene Datei (replicad_single.wasm) eingebunden und kann ersetzt werden. '
     'Quellcode: https://github.com/Open-Cascade-SAS/OCCT und https://github.com/sgenoud/replicad'),
    ('replicad', 'replicad', 'LICENSE', 'https://github.com/sgenoud/replicad'),
    ('three.js', 'three', 'LICENSE', 'https://threejs.org'),
    ('Svelte', 'svelte', 'LICENSE.md', 'https://svelte.dev'),
    ('fflate', 'fflate', 'LICENSE', 'https://github.com/101arrowz/fflate'),
    ('Poppins (Schrift der Oberfläche, über @fontsource/poppins)', '@fontsource/poppins', 'LICENSE', 'https://fonts.google.com/specimen/Poppins'),
]
out = ['Bausteine Dritter im osVAC neo Konfigurator und ihre Lizenzen', '=' * 64, '']
for title, pkg, lic, note in items:
    meta = json.loads((nm / pkg / 'package.json').read_text())
    out += ['#' * 72, f'{title}', f'Paket {pkg} {meta.get("version", "")}, Lizenz {meta.get("license", "")}', note, '#' * 72, '',
            (nm / pkg / lic).read_text().strip(), '', '']
out += ['#' * 72, 'Liberation Sans Regular (Schrift der Beschriftung auf den Adaptern)', 'Lizenz OFL-1.1', '#' * 72, '',
        (root / 'public/fonts/LICENSE-LiberationSans.txt').read_text().strip(), '']
(root / 'public/THIRD_PARTY_LICENSES.txt').write_text('\n'.join(out) + '\n')
print('geschrieben', len(out), 'Zeilen')
