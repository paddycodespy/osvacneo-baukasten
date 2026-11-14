"""
Schwebende Stellen beim Druck: Netze (JSON aus scripts/islands.ts) in 0,2-mm-Schichten schneiden und Flächen
suchen, die nicht auf der Schicht darunter aufliegen. Dazu: offene Netzkanten, falsch herum liegende Flächen.
Aufruf: python3 tools/druck/islands.py <ordner>  (je Fall ein Unterordner mit case.json)
Ausgabe: eine JSON-Zeile je Fall {id, edges, islands: [[name, z, area], ...]}.
"""
import json, sys, os, glob
from collections import Counter
import numpy as np
import trimesh
from shapely.ops import unary_union


def section(m, z):
    try:
        s = m.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
        if s is None:
            return None
        pl = s.to_2D(to_2D=np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, -z], [0, 0, 0, 1]]))[0]
        polys = list(pl.polygons_full)
        return unary_union(polys) if polys else None
    except Exception:
        return None


def check(fn):
    d = json.load(open(fn))
    bodies = []
    edges = []
    for b in d['bodies']:
        v = np.array(b['v'], float).reshape(-1, 3)
        t = np.array(b['t'], int).reshape(-1, 3)
        m = trimesh.Trimesh(v, t, process=False)
        e = Counter(map(tuple, np.sort(m.edges, axis=1)))
        bad = sum(1 for n in e.values() if n != 2)
        if bad or not m.is_winding_consistent:
            edges.append([b['name'], bad, bool(m.is_winding_consistent)])
        bodies.append((b['name'], b['helper'], m))
    allow = d.get('allow', [])
    zmax = max(m.bounds[1][2] for _, _, m in bodies)
    prev = None
    islands = []
    z = 0.1
    while z < zmax:
        per = [(name, section(m, z)) for name, _, m in bodies]
        cur = unary_union([s for _, s in per if s is not None and not s.is_empty])
        if prev is not None and not cur.is_empty:
            pb = prev.buffer(0.15)
            for name, s in per:
                if s is None or s.is_empty or any(name.endswith(a) for a in allow):
                    continue
                for g in (s.geoms if hasattr(s, 'geoms') else [s]):
                    # Fläche ohne Verbindung zur Schicht darunter (0,15 mm Toleranz für die Netzgenauigkeit an Stoßstellen)
                    if g.area > 0.05 and not g.intersects(pb):
                        islands.append([name, round(z, 2), round(g.area, 2)])
        prev = cur
        z += 0.2
    return {'id': d['id'], 'edges': edges, 'islands': islands}


for fn in sorted(glob.glob(os.path.join(sys.argv[1], '*.json'))):
    print(json.dumps(check(fn), ensure_ascii=False), flush=True)
