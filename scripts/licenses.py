"""Erzeugt die Lizenzübersicht der eingebundenen Bausteine:
  public/lizenzen.html            (in der App verlinkt, UTF-8)
  public/THIRD_PARTY_LICENSES.txt (Textfassung, UTF-8 mit BOM, damit Browser und Editoren die Umlaute richtig zeigen)
usage: python3 scripts/licenses.py   (nach npm ci; bei neuen Abhängigkeiten erneut ausführen)"""
import html, json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
nm = root / 'node_modules'

def pkg(name, lic):
    meta = json.loads((nm / name / 'package.json').read_text(encoding='utf-8'))
    return meta.get('version', ''), meta.get('license', ''), (nm / name / lic).read_text(encoding='utf-8').strip('\n').rstrip()

def poppins_text(t):
    # Fontsource fasst die Copyright-Zeilen aller 18 Schnitte zu einer Zeile zusammen: einmal genügt
    first, rest = t.split('\n', 1)
    first = re.split(r'\s+Poppins-\w+\.ttf:', first)[0]
    return first + '\n' + rest

items = []
for title, name, lic, note in [
    ('OpenCascade Technology', 'replicad-opencascadejs', 'LICENSE',
     'CAD-Kern, als WebAssembly über replicad-opencascadejs. Unverändert als eigene Datei eingebunden und austauschbar. '
     'Quellcode: https://github.com/Open-Cascade-SAS/OCCT und https://github.com/sgenoud/replicad'),
    ('replicad', 'replicad', 'LICENSE', 'https://github.com/sgenoud/replicad'),
    ('three.js', 'three', 'LICENSE', 'https://threejs.org'),
    ('Svelte', 'svelte', 'LICENSE.md', 'https://svelte.dev'),
    ('fflate', 'fflate', 'LICENSE', 'https://github.com/101arrowz/fflate'),
    ('Poppins', '@fontsource/poppins', 'LICENSE', 'Schrift der Oberfläche. https://fonts.google.com/specimen/Poppins'),
]:
    ver, spdx, text = pkg(name, lic)
    if name == '@fontsource/poppins':
        text = poppins_text(text)
    items.append((title, f'{name} {ver}', spdx, note, text))
items.append(('Liberation Sans Regular', 'public/fonts/LiberationSans-Regular.ttf', 'OFL-1.1',
              'Schrift der Beschriftung auf den Adaptern. https://github.com/liberationfonts',
              (root / 'public/fonts/LICENSE-LiberationSans.txt').read_text(encoding='utf-8').strip()))

intro = ('Der osVAC neo Konfigurator basiert auf osVAC neo von Ludo Kerz, ursprünglich entstanden im Hobbyhimmel Stuttgart, '
         'und steht wie dieses unter CC BY-NC-SA 4.0 (siehe LICENSE.txt). Die folgenden Bausteine Dritter sind eingebunden '
         'und stehen unter ihren eigenen Lizenzen.')

# Textfassung
out = ['Bausteine Dritter im osVAC neo Konfigurator und ihre Lizenzen', '=' * 62, '', intro, '']
for title, p, spdx, note, text in items:
    out += ['-' * 62, title, f'Paket: {p}', f'Lizenz: {spdx}', note, '-' * 62, '', text, '', '']
(root / 'public/THIRD_PARTY_LICENSES.txt').write_text('\ufeff' + '\n'.join(out).rstrip() + '\n', encoding='utf-8')

# HTML-Fassung
e = html.escape
toc = ''.join(f'<li><a href="#l{i}">{e(t)}</a> <span>{e(s)}</span></li>' for i, (t, p, s, n, x) in enumerate(items))
secs = ''.join(
    f'<section id="l{i}"><h2>{e(t)}</h2><p class="meta">Paket: {e(p)} · Lizenz: {e(s)}<br>{e(n)}</p><pre>{e(x)}</pre></section>'
    for i, (t, p, s, n, x) in enumerate(items))
page = f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lizenzen – osVAC neo Konfigurator</title><link rel="icon" type="image/svg+xml" href="./favicon.svg">
<style>
body{{margin:0;font-family:Poppins,Arial,sans-serif;color:#333;background:#f5f7f8;line-height:1.5}}
header{{background:#333;color:#fff;padding:16px 28px;font-weight:700;font-size:20px}}
header .os,header .neo{{color:#ef453b}} header .vac{{color:#28a3e5}} header small{{font-weight:500;font-size:16px;margin-left:6px}}
main{{max-width:880px;margin:0 auto;padding:24px 28px 60px}}
h1{{font-style:italic;font-size:26px;margin:0 0 8px}} h2{{font-size:18px;margin:0 0 4px}}
.lead{{color:#555;margin:0 0 18px}} a{{color:#1d86c2;text-decoration:none;font-weight:600}} a:hover{{color:#ff4136}}
ul{{background:#fff;border:1px solid #e1e5e8;border-radius:10px;padding:12px 16px 12px 34px;margin:0 0 22px}}
li span{{color:#7a7a7a;font-size:13px;margin-left:6px}}
section{{background:#fff;border:1px solid #e1e5e8;border-radius:10px;padding:16px 18px;margin:0 0 14px}}
.meta{{color:#7a7a7a;font-size:13px;margin:0 0 10px}}
pre{{white-space:pre-wrap;word-wrap:break-word;font:12.5px/1.45 ui-monospace,Consolas,monospace;background:#f5f7f8;border-radius:6px;padding:12px;margin:0;max-height:420px;overflow:auto}}
</style></head><body>
<header><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span><small>Konfigurator · Lizenzen</small></header>
<main><h1>Lizenzen</h1><p class="lead">{e(intro)} <a href="./LICENSE.txt">Lizenztext CC BY-NC-SA 4.0</a></p>
<ul>{toc}</ul>{secs}</main></body></html>
'''
(root / 'public/lizenzen.html').write_text(page, encoding='utf-8')
print('geschrieben:', len(items), 'Bausteine')
