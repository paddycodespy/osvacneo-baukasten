#!/usr/bin/env python3
"""Abgleich des Konfigurators mit Fusion-Exporten des Originals (osVAC neo v366).

Baut für jeden Export-Ordner die passenden Teile mit scripts/build-ref.ts und vergleicht die Oberflächen
mit surfcmp.py (exakter Punkt-Fläche-Abstand in beide Richtungen, Schrift ausgeblendet).

Ordnerstruktur wie von den Fusion-Skripten unter export/ erzeugt:
  <ref>/M25_F32_H36/            Master: Female_Kupplung.step, Male_Stecker.step, MxxFyy.step, FxxHyy.step, MxxHyy.step, Hose_Schlauch.step
  <ref>/M25_F32_H36_W9/         Materialstärke 9 mm
  <ref>/M32_F32_H36_G04_S05/    Spaltmaß 0,4, Drehring 0,5
  <ref>/coneB_W3/               PipesConesFlangesHandles: Fxx_To_Pipe_Cone_Rohr_Konus.step + parameters.csv

Aufruf (im Projektordner):
  python3 tools/fusion/compare.py <ref-ordner> [Ordnername ...] [--thr=0.1] [--keep]

Voraussetzungen: Node (npm ci), Python mit cadquery, trimesh, libigl, numpy, manifold3d.
Ausgabe: je Teil und Körpergruppe die größte Abweichung über dem Schwellwert und die Stellen (z, θ, r).
Bekannte Scheinabweichungen: Schrift (wird ausgeblendet), Gewindegrund bei θ ≈ 27–37° (Tessellierung der
Fusion-STEP-Dateien), Stützrippen-Kontaktflächen der Druckhilfe (innere Flächen im Fusion-Körper).
"""
import os, re, subprocess, sys, csv

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'out')
SURF = os.path.join(HERE, 'surfcmp.py')

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
if not args:
    print(__doc__)
    sys.exit(1)
ref = os.path.abspath(args[0])
only = set(args[1:])
thr = opts.get('thr', '0.1')

MASTER = re.compile(r'^M(\d+)_F(\d+)_H(\d+)(?:_W(\d+))?(?:_G(\d)(\d)_S(\d)(\d))?$')


def build(part, M, F, H, extra):
    cmd = ['npx', 'tsx', 'scripts/build-ref.ts', part, str(M), str(F), str(H), '--notext', *extra]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=1800)
    line = (r.stdout.strip().splitlines() or [''])[-1]
    if r.returncode or 'total ms' not in line:
        raise RuntimeError(f'Bauen fehlgeschlagen: {" ".join(cmd)}\n{r.stderr[-2000:]}')
    return line.split()[-1]  # Präfix der STL-Dateien


def surf(step, prefix, groups, *extra):
    cmd = [sys.executable, SURF, step, prefix, *[f'--grp={g}' for g in groups], f'--thr={thr}', '--top=4', '--n=150000', *extra]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    return [l for l in r.stdout.splitlines() if '→' in l or l.startswith('   n') or l.startswith('==')] or [r.stderr[-1500:]]


def report(title, lines):
    worst = 0.0
    for l in lines:
        m = re.search(r'gefiltert: (\d+) max ([\d.]+)', l)
        if m and int(m.group(1)):
            worst = max(worst, float(m.group(2)))
    print(f'  {"OK " if worst <= float(thr) else "ABW"} {title:10s} max {worst:.3f} mm')
    if worst > float(thr) or 'verbose' in opts:
        for l in lines:
            print('      ' + l)


def master(name, M, F, H, W, g, sg):
    R = os.path.join(ref, name)
    extra = [f'--w={W}'] + ([f'--g={g}'] if g != 0.2 else []) + ([f'--sg={sg}'] if sg != 0.3 else [])
    rF, rH, rM = F / 2 + W + 0.4, H / 2 + W - 0.6, M / 2 + 3 - g / 2 - 0.6
    fem = f'Female,Textfeld Female,Rändelung Female|0'
    hose = 'Schlauchteil,Textfeld Schlauchteil,Rändelung Schlauchteil,Gewinde'
    jobs = [
        ('Female', 'Female_Kupplung.step', [fem], [f'--tw={rF}']),
        ('Male', 'Male_Stecker.step', ['Male|0', 'Druckhilfe|1'], ['--axis=-40,0', f'--tw=a{rM},x']),
        ('MxxFyy', 'MxxFyy.step', [fem, 'Übergang|3', 'Male|1', 'Druckhilfe|2'], [f'--tw={rF},x,a{rM},x']),
        ('FxxHyy', 'FxxHyy.step', [fem, 'Übergang|1', 'Drehring außen|2', 'Drehring innen|3', f'{hose},Knickschutz|4,5'], [f'--tw={rF},x,x,x,{rH}']),
        ('MxxHyy', 'MxxHyy.step', ['Male|3', 'Gehäuse,Textfeld Gehäuse,Rändelung Gehäuse|2', 'Drehring außen|1', 'Drehring innen|0', f'{hose}|4'], [f'--tw=a{rM},{rH},x,x,{rH}']),
        ('Hose', 'Hose_Schlauch.step', [f'{hose},Knickschutz|0,1'], [f'--tw={rH}']),
    ]
    for part, step, groups, ex in jobs:
        f = os.path.join(R, step)
        if not os.path.exists(f):
            continue
        prefix = build(part, M, F, H, extra)
        report(part, surf(f, prefix, groups, *ex))


def pipes(name):
    R = os.path.join(ref, name)
    p = {}
    with open(os.path.join(R, 'parameters.csv'), encoding='utf-8') as fh:
        for row in csv.reader(fh, delimiter=';'):
            if len(row) > 2:
                try:
                    p[row[0]] = float(row[2])
                except ValueError:
                    pass
    spec = ','.join(str(round(x, 3)) for x in (p['PipeConeDiameter1Inner'], p['PipeConeDiameter2Inner'], p['PipeConeLength'], p['PipeConeMaterialWidth'], p['TransitionConeLength']))
    prefix = build('MachineF', 32, 32, 36, [f'--pipe={spec}'])
    # Maßtexte bei 90° und 270° ausblenden, die Schraubenlöcher bei 210° und 330° bleiben im Vergleich
    report('Rohr', surf(os.path.join(R, 'Fxx_To_Pipe_Cone_Rohr_Konus.step'), prefix, ['Übergang|2', 'Rohr|3'], '--tw=x,x', '--ign=40:140:-200:0:0', '--ign=230:310:-200:0:0'))


for name in sorted(os.listdir(ref)):
    if only and name not in only:
        continue
    d = os.path.join(ref, name)
    if not os.path.isdir(d):
        continue
    m = MASTER.match(name)
    if m:
        M, F, H = map(int, m.group(1, 2, 3))
        W = int(m.group(4) or 7)
        g = float(f'{m.group(5)}.{m.group(6)}') if m.group(5) else 0.2
        sg = float(f'{m.group(7)}.{m.group(8)}') if m.group(7) else 0.3
        print(f'== {name}')
        master(name, M, F, H, W, g, sg)
    elif os.path.exists(os.path.join(d, 'Fxx_To_Pipe_Cone_Rohr_Konus.step')):
        print(f'== {name}')
        pipes(name)
