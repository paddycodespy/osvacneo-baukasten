"""Erzeugt public/lizenzen-programm.txt: Lizenzen der Rust-Bausteine (Tauri u. a.), die im Programm für Windows,
macOS und Linux stecken, dazu weitere Bestandteile der Installer. public/lizenzen.html verweist darauf
(scripts/licenses.py liest die Übersicht aus dieser Datei).

usage: python3 scripts/licenses-rust.py   (braucht cargo; lädt fehlende Crates mit „cargo fetch“)
Danach python3 scripts/licenses.py ausführen. Nach jeder Änderung an src-tauri/Cargo.lock erneut ausführen.

Erfasst werden alle normalen Abhängigkeiten (keine reinen Build- und Test-Abhängigkeiten) für Windows, macOS
(Apple Silicon und Intel) und Linux. Bei Wahllizenzen („MIT OR Apache-2.0“) gilt MIT, sonst die erste genannte.
"""
import json, pathlib, re, subprocess, sys
from collections import defaultdict

root = pathlib.Path(__file__).resolve().parent.parent
tauri = root / 'src-tauri'
TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-unknown-linux-gnu']

subprocess.run(['cargo', 'fetch', '--locked'], cwd=tauri, check=True)


def metadata(target):
    out = subprocess.check_output(['cargo', 'metadata', '--format-version', '1', '--locked', '--filter-platform', target], cwd=tauri)
    return json.loads(out)


crates = {}            # id → Paket
systems = defaultdict(set)  # id → Systeme
LABEL = {'x86_64-pc-windows-msvc': 'Windows', 'aarch64-apple-darwin': 'macOS', 'x86_64-apple-darwin': 'macOS',
         'x86_64-unknown-linux-gnu': 'Linux'}
for t in TARGETS:
    m = metadata(t)
    pk = {p['id']: p for p in m['packages']}
    nodes = {n['id']: n for n in m['resolve']['nodes']}
    top = m['resolve']['root']
    seen, todo = set(), [top]
    while todo:
        i = todo.pop()
        if i in seen:
            continue
        seen.add(i)
        for d in nodes[i]['deps']:
            if any(k['kind'] is None for k in d['dep_kinds']):  # normale Abhängigkeit
                todo.append(d['pkg'])
    seen.discard(top)
    for i in seen:
        crates[i] = pk[i]
        systems[i].add(LABEL[t])

# Lizenzausdruck → benötigte Lizenzen (bei OR: MIT, sonst Apache-2.0, sonst die erste)
def choose(expr):
    expr = expr.replace('/', ' OR ')
    need = []
    for part in re.split(r'\s+AND\s+', expr):
        part = part.strip().strip('()')
        opts = [o.strip().strip('()') for o in re.split(r'\s+OR\s+', part)]
        opts = [re.sub(r'\s+WITH\s+.*', '', o) for o in opts]
        pick = 'MIT' if 'MIT' in opts else 'Apache-2.0' if 'Apache-2.0' in opts else opts[0]
        if pick not in need:
            need.append(pick)
    return need


SIGN = {
    'MIT': r'Permission is hereby granted, free of charge',
    'Apache-2.0': r'Apache License',
    'Unicode-3.0': r'UNICODE LICENSE',
    'BSD-3-Clause': r'Redistribution and use in source and binary forms',
    'MPL-2.0': r'Mozilla Public License',
    'ISC': r'Permission to use, copy, modify, and/or distribute',
    'Zlib': r"provided 'as-is'",
}
LICFILE = re.compile(r'(?i)^(licen[cs]e|copying|copyright|notice)')

MIT_TEMPLATE = """Copyright (c) {who}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""

BSD3_TEMPLATE = """Copyright (c) {who}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE."""


def who(p):
    a = [re.sub(r'\s*<[^>]*>', '', x).strip() for x in p.get('authors') or []]
    a = [x for x in a if x]
    return ', '.join(a) if a else f'the {p["name"]} authors'


def read(f):
    t = f.read_text(encoding='utf-8', errors='replace').replace('\r\n', '\n')
    return '\n'.join(line.rstrip() for line in t.split('\n')).strip('\n')


def license_files(p):
    d = pathlib.Path(p['manifest_path']).parent
    fs = [f for f in sorted(d.iterdir()) if f.is_file() and LICFILE.match(f.name) and not f.name.endswith('.spdx')]
    if p.get('license_file'):
        lf = d / p['license_file']
        if lf.is_file() and lf not in fs:
            fs.insert(0, lf)
    return fs


def text_for(p, lic):
    """Lizenztext aus den Dateien des Crates, sonst Vorlage mit den Autoren."""
    for f in license_files(p):
        t = read(f)
        if re.search(SIGN.get(lic, r'^\b$'), t, re.I):
            return t, False
    if lic == 'MIT':
        return MIT_TEMPLATE.format(who=who(p)), True
    if lic == 'BSD-3-Clause':
        return BSD3_TEMPLATE.format(who=who(p)), True
    return None, True


def notices(p):
    return [read(f) for f in license_files(p) if re.match(r'(?i)^notice', f.name)]


rows = []                       # (name, version, Ausdruck, gewählt, Systeme)
texts = defaultdict(list)       # (Lizenz, Text) → Crates
shared = defaultdict(list)      # Lizenz mit einem gemeinsamen Text (Apache, MPL) → Crates
apache_text = mpl_text = None
missing = []
for i, p in sorted(crates.items(), key=lambda kv: (kv[1]['name'], kv[1]['version'])):
    expr = p.get('license') or ''
    if not expr:
        missing.append(p['name'])
        continue
    need = choose(expr)
    rows.append((p['name'], p['version'], expr, ' + '.join(need), sorted(systems[i])))
    ref = f"{p['name']} {p['version']}"
    for lic in need:
        if lic in ('Apache-2.0', 'MPL-2.0'):
            shared[lic].append(ref)
            t, _ = text_for(p, lic)
            if t and lic == 'Apache-2.0' and apache_text is None and t.lstrip().startswith('Apache License') and len(t) > 9000:
                apache_text = t
            if t and lic == 'MPL-2.0' and mpl_text is None and len(t) > 10000:
                mpl_text = t
            for n in notices(p):
                texts[('NOTICE', n)].append(ref)
            continue
        t, _ = text_for(p, lic)
        if t is None:
            missing.append(f'{ref} ({lic})')
            continue
        texts[(lic, t)].append(ref)

if missing:
    sys.exit('Kein Lizenztext gefunden für: ' + ', '.join(missing))
if shared['Apache-2.0'] and not apache_text:
    sys.exit('Apache-2.0-Text nicht gefunden')
if shared['MPL-2.0'] and not mpl_text:
    sys.exit('MPL-2.0-Text nicht gefunden')

NSIS_ZLIB = """Copyright (C) NSIS Contributors (siehe https://nsis.sourceforge.io/License)

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held
liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to
alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original
   software. If you use this software in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original
   software.
3. This notice may not be removed or altered from any source distribution."""

L = '-' * 78
out = ['Programm für Windows, macOS und Linux: Bausteine Dritter und ihre Lizenzen', '=' * 74, '',
       'Das Programm des osVAC neo Baukastens ist mit Tauri gebaut (https://tauri.app). Zusätzlich zu den Bausteinen der',
       'Oberfläche (siehe lizenzen.html bzw. THIRD_PARTY_LICENSES.txt) enthält es die folgenden Rust-Bausteine (Crates).',
       'Bei Wahllizenzen wird die angegebene Lizenz genutzt. Quellcode aller Crates: https://crates.io/crates/<Name>.',
       'Erzeugt mit scripts/licenses-rust.py aus src-tauri/Cargo.lock.', '',
       '<<ÜBERSICHT', f'{len(rows)} Crates', '']
w = max(len(f'{n} {v}') for n, v, *_ in rows)
for n, v, expr, pick, sy in rows:
    out.append(f'{(n + " " + v).ljust(w)}  {pick}' + ('' if pick == expr else f'  (aus: {expr})') + ('' if len(sy) == 3 else f'  [{", ".join(sy)}]'))
out += ['ÜBERSICHT>>', '']

out += [L, 'Lizenztexte', L, '']
order = {'MIT': 0, 'BSD-3-Clause': 1, 'ISC': 2, 'Zlib': 3, 'Unicode-3.0': 4, 'NOTICE': 5}
for (lic, t), refs in sorted(texts.items(), key=lambda kv: (order.get(kv[0][0], 9), kv[1][0])):
    label = 'Hinweise (NOTICE) zu Apache-2.0' if lic == 'NOTICE' else lic
    out += [L, f'{label} – gilt für: {", ".join(refs)}', L, '', t, '', '']
if shared['MPL-2.0']:
    out += [L, f'MPL-2.0 – gilt für: {", ".join(shared["MPL-2.0"])}',
            'Quellcode unverändert unter https://crates.io/crates/<Name> bzw. https://github.com/servo/stylo.', L, '', mpl_text, '', '']
if shared['Apache-2.0']:
    out += [L, f'Apache-2.0 – gilt für: {", ".join(shared["Apache-2.0"])}', L, '', apache_text, '', '']

out += [L, 'Weitere Bestandteile der Installer', L, '',
        'Windows-Installer: NSIS (Nullsoft Scriptable Install System), https://nsis.sourceforge.io',
        'Lizenz: zlib/libpng (einzelne Teile unter eigenen, ähnlich freien Lizenzen, siehe Link).', '', NSIS_ZLIB, '',
        'Linux-AppImage: AppImage-Laufzeit (MIT, https://github.com/AppImage/type2-runtime). Das AppImage enthält außerdem',
        'unveränderte Systembibliotheken aus Ubuntu 22.04 (u. a. GTK, WebKitGTK und deren Abhängigkeiten, überwiegend',
        'unter LGPL-2.1 oder neuer). Ihre Lizenztexte und der Quellcode stehen bei Ubuntu: https://packages.ubuntu.com/jammy',
        'bzw. https://launchpad.net/ubuntu/jammy. Das .deb-Paket nutzt stattdessen die Bibliotheken des Systems.', '']
(root / 'public/lizenzen-programm.txt').write_text('﻿' + '\n'.join(out).rstrip() + '\n', encoding='utf-8')
print(f'geschrieben: {len(rows)} Crates, {len(texts)} eigene Lizenztexte')
