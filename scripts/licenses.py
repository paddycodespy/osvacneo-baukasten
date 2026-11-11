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

intro = ('Der osVAC neo Baukasten basiert auf osVAC neo von Ludo Kerz, ursprünglich entstanden im Hobbyhimmel Stuttgart, '
         'und steht wie dieses unter CC BY-NC-SA 4.0 (siehe LICENSE.txt). Für den Baukasten nachgebaut und verändert: Maße, Spaltmaße und Stutzen sind frei einstellbar. Die folgenden Bausteine Dritter sind eingebunden '
         'und stehen unter ihren eigenen Lizenzen.')

# Textfassung
out = ['Bausteine Dritter im osVAC neo Baukasten und ihre Lizenzen', '=' * 58, '', intro, '']
for title, p, spdx, note, text in items:
    out += ['-' * 62, title, f'Paket: {p}', f'Lizenz: {spdx}', note, '-' * 62, '', text, '', '']
(root / 'public/THIRD_PARTY_LICENSES.txt').write_text('\ufeff' + '\n'.join(out).rstrip() + '\n', encoding='utf-8')

# HTML-Fassung: Poppins wie in der App (eigene Kopie, die Seite lädt das App-CSS nicht)
import shutil
fdir = root / 'public/fonts'
faces = ''
for w, st in (('400', 'normal'), ('500', 'normal'), ('600', 'normal'), ('700', 'normal'), ('700', 'italic')):
    for sub, rng in (('latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'),
                     ('latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF')):
        fn = f'poppins-{sub}-{w}-{st}.woff2'
        shutil.copyfile(nm / '@fontsource/poppins/files' / fn, fdir / fn)
        faces += f"@font-face{{font-family:Poppins;font-style:{st};font-weight:{w};font-display:swap;src:url(./fonts/{fn}) format('woff2');unicode-range:{rng}}}\n"
e = html.escape
toc = ''.join(f'<li><a href="#l{i}">{e(t)}</a> <span>{e(s)}</span></li>' for i, (t, p, s, n, x) in enumerate(items))
secs = ''.join(
    f'<section id="l{i}"><h2>{e(t)}</h2><p class="meta">Paket: {e(p)} · Lizenz: {e(s)}<br>{e(n)}</p><pre>{e(x)}</pre></section>'
    for i, (t, p, s, n, x) in enumerate(items))
page = f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lizenzen – osVAC neo Baukasten</title><link rel="icon" type="image/svg+xml" href="./favicon.svg">
<style>
{faces}body{{margin:0;font-family:Poppins,system-ui,sans-serif;color:#333;background:#f5f7f8;line-height:1.5}}
header{{height:64px;display:flex;align-items:center;padding:0 36px;background:#333}}
.wordmark{{margin:0;display:flex;align-items:center;gap:12px;color:#fff;white-space:nowrap}}
.wm-logo{{display:block;width:34px;height:34px}} .wm-text{{display:flex;flex-direction:column;line-height:1}}
.wm-os{{font-weight:700;font-size:13px;letter-spacing:-0.01em}}
.wordmark .os,.wordmark .neo{{color:#ef453b}} .wordmark .vac{{color:#28a3e5}}
.wm-sub{{font-weight:600;font-size:19px;letter-spacing:0.09em;margin-top:3px}}
main{{max-width:880px;margin:0 auto;padding:24px 28px 60px}}
h1{{font-style:italic;font-size:26px;margin:0 0 8px}} h2{{font-size:18px;margin:0 0 4px}}
.lead{{color:#555;margin:0 0 18px}} a{{color:#1d86c2;text-decoration:none;font-weight:600}} a:hover{{color:#ff4136}}
ul{{background:#fff;border:1px solid #e1e5e8;border-radius:10px;padding:12px 16px 12px 34px;margin:0 0 22px}}
li span{{color:#7a7a7a;font-size:13px;margin-left:6px}}
section{{background:#fff;border:1px solid #e1e5e8;border-radius:10px;padding:16px 18px;margin:0 0 14px}}
.meta{{color:#7a7a7a;font-size:13px;margin:0 0 10px}}
pre{{white-space:pre-wrap;word-wrap:break-word;font:12.5px/1.45 ui-monospace,Consolas,monospace;background:#f5f7f8;border-radius:6px;padding:12px;margin:0;max-height:420px;overflow:auto}}
</style></head><body>
<header><p class="wordmark"><img class="wm-logo" src="./favicon.svg" alt="" width="34" height="34"><span class="wm-text"><span class="wm-os"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span></span><span class="wm-sub">BAUKASTEN</span></span></p></header>
<main><h1>Lizenzen</h1><p class="lead">{e(intro)} <a href="./LICENSE.txt">Lizenztext CC BY-NC-SA 4.0</a></p>
<ul>{toc}</ul>{secs}</main></body></html>
'''
(root / 'public/lizenzen.html').write_text(page, encoding='utf-8')
print('geschrieben:', len(items), 'Bausteine')
