"""
Mitgedruckte Ringe Schicht für Schicht (0,2 mm): Wo beginnt der Ring frei über einem Spalt, und wie weit ist es dort
senkrecht bis zum Teil darunter? Dazu der kleinste waagerechte Abstand zwischen Ring und Rest je Schicht.
Aufruf: python3 tools/druck/ring.py <ordner>  (je Fall eine JSON-Datei aus scripts/bleed-print.ts)
Ausgabe: eine JSON-Zeile je Fall {id, free: [[z, Fläche, Abstand nach unten oder null, verankert], ...], minGap, layers, open (Körper mit offenen Kanten)}.
Als frei zählt, was ein Ring in einer Schicht mehr hat als in der Schicht darunter plus 0,2 mm (also flacher als 45°).
"""
import json, sys, os, glob
import numpy as np
import trimesh
from shapely.ops import unary_union

LH = 0.2


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
    rings, rest, open_ = [], [], []
    for b in d['bodies']:
        m = trimesh.Trimesh(np.array(b['v'], float).reshape(-1, 3), np.array(b['t'], int).reshape(-1, 3), process=False)
        m.merge_vertices()
        if not m.is_watertight:
            open_.append(b['name'])
        (rings if b['ring'] else rest).append(m)
    z0 = min(m.bounds[0][2] for m in rings)
    z1 = max(m.bounds[1][2] for m in rings)
    free, min_gap, layers = [], 9.0, 0
    prev = None
    z = z0 + LH / 2 + 0.003  # nicht genau auf waagerechten Flächen schneiden
    while z < z1:
        cur = unary_union([s for s in (section(m, z) for m in rings) if s is not None])
        other = unary_union([s for s in (section(m, z) for m in rest) if s is not None])
        if not cur.is_empty:
            layers += 1
            if not other.is_empty:
                min_gap = min(min_gap, cur.distance(other))
            new = cur if prev is None or prev.is_empty else cur.difference(prev.buffer(LH * 1.05))
            for g in (new.geoms if hasattr(new, 'geoms') else [new]):
                if g.is_empty or g.area < 0.05:
                    continue
                # senkrechter Abstand zum Rest darunter (in 0,05-mm-Schritten bis 3 mm)
                gap = None
                for k in range(1, 61):
                    o = unary_union([s for s in (section(m, z - LH / 2 - k * 0.05) for m in rest) if s is not None])
                    if not o.is_empty and o.intersects(g):
                        gap = round(k * 0.05, 2)
                        break
                # verankert: berührt die Schicht darunter (Brücke, Überhang), sonst beginnt es frei in der Luft
                anchored = prev is not None and not prev.is_empty and g.intersects(prev.buffer(LH * 1.5))
                free.append([round(z - z0, 2), round(g.area, 2), gap, bool(anchored)])
        prev = cur
        z += LH
    return {'id': d['id'], 'free': free, 'minGap': round(min_gap, 3), 'layers': layers, 'open': open_}


if __name__ == '__main__':
    for fn in sorted(glob.glob(os.path.join(sys.argv[1], '*.json'))):
        print(json.dumps(check(fn)), flush=True)
