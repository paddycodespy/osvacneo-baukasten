"""Flächenvergleich: Vereinigung der Fusion-Körper gegen Vereinigung unserer Körper.
usage: surfcmp.py fusion.step ours_prefix [--only=A,B] [--fidx=0,1] [--axis=x,y] [--thr=0.1] [--n=300000] [--rmin=r]
Abstände exakt Punkt->Dreieck (libigl). Ausgabe: Volumen, Abweichungs-Cluster (z 1 mm, θ 6°)."""
import cadquery as cq, numpy as np, sys, glob, trimesh, tempfile, igl
args = sys.argv[1:]
fstep, pref = args[0], args[1]
opt = {a.split('=')[0][2:]: a.split('=', 1)[1] for a in args[2:] if '=' in a}
thr = float(opt.get('thr', 0.1)); N = int(opt.get('n', 300000))
ss = cq.importers.importStep(fstep).solids().vals()
ztop = cq.Compound.makeCompound(ss).BoundingBox().zmax
big = max(ss, key=lambda s: s.Volume()); bb = big.BoundingBox(); cx, cy = (bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2
if 'axis' in opt: cx, cy = map(float, opt['axis'].split(','))
fidx = list(map(int, opt['fidx'].split(','))) if 'fidx' in opt else range(len(ss))
if 'fidx' in opt:
    ztop = cq.Compound.makeCompound([ss[i] for i in fidx]).BoundingBox().zmax if 'ztopsel' in opt else ztop

def fix(m):
    if not m.is_watertight:
        m.update_faces(m.nondegenerate_faces(height=1e-7)); m.merge_vertices(digits_vertex=4); m.update_faces(m.unique_faces())
        m.update_faces(m.nondegenerate_faces(height=1e-7)); m.remove_unreferenced_vertices(); trimesh.repair.fill_holes(m)
    return m

fm = []
for i in fidx:
    fn = tempfile.mktemp(suffix='.stl'); cq.exporters.export(ss[i], fn, tolerance=0.004, angularTolerance=0.04)
    m = fix(trimesh.load(fn)); m.apply_translation([-cx, -cy, -ztop]); fm.append(m)
ob = {}
for f in sorted(glob.glob(pref + '__*.stl')):
    ob[f.split('__')[-1][:-4]] = fix(trimesh.load(f))
def U(ms):
    if len(ms) == 1: return ms[0]
    try:
        r = trimesh.boolean.union(ms, engine='manifold')
        if abs(r.volume) > 0.5 * max(m.volume for m in ms): return r
    except Exception as e: print('  (Vereinigung fehlgeschlagen, verkettet)', e)
    c = trimesh.util.concatenate(ms); c.metadata['parts'] = ms
    return c
# Gruppen: --grp="Name1,Name2|0,3"  (unsere Körper | Fusion-Indizes); ohne Angabe alles gegen alles
grps = [g[6:] for g in args if g.startswith('--grp=')]
if not grps: grps = [','.join(ob) + '|' + ','.join(map(str, range(len(fm))))]
pairs = []
for g in grps:
    on, fi = g.split('|')
    O = U([ob[n] for n in on.split(',')]); F = U([fm[int(i)] for i in fi.split(',')])
    print(f'== {on}  <->  Fusion {fi}:  Volumen ours {O.volume:10.1f}  Fusion {F.volume:10.1f}  ({(O.volume / F.volume - 1) * 100:+.3f} %)')
    pairs.append((O, F))
def dist(A, B, n):
    P, _ = trimesh.sample.sample_surface(A, n, seed=1)
    d2, _, _ = igl.point_mesh_squared_distance(P, np.asarray(B.vertices, float), np.asarray(B.faces, np.int64))
    return P, np.sqrt(d2)

rmin = float(opt.get('rmin', -1))
for gi, (O, F) in enumerate(pairs):
  print(f'-- Gruppe {gi}')
  for label, A, B in (('ours→Fusion', O, F), ('Fusion→ours', F, O)):
      P, d = dist(A, B, N)
      if 'parts' in A.metadata:  # verkettete Körper: Berührflächen zwischen den Körpern ignorieren
          ds = np.stack([np.sqrt(igl.point_mesh_squared_distance(P, np.asarray(q.vertices, float), np.asarray(q.faces, np.int64))[0]) for q in A.metadata['parts']], 1)
          own = ds.argmin(1); bad = (ds < 0.01).sum(1) >= 2
          for k, q in enumerate(A.metadata['parts']):
              sel = own != k
              w = igl.winding_number(np.asarray(q.vertices, float), np.asarray(q.faces, np.int64), P[sel])
              bad[np.where(sel)[0][np.abs(w) > 0.5]] = True
          P, d = P[~bad], d[~bad]
      r = np.hypot(P[:, 0], P[:, 1]); th = np.degrees(np.arctan2(P[:, 1], P[:, 0])) % 360
      m = (d > thr) & (r >= rmin)
      for g in [a[6:] for a in sys.argv if a.startswith('--ign=')]:
          t0, t1, z0, z1, r0 = map(float, g.split(':'))
          inwin = ((th - t0) % 360 <= (t1 - t0) % 360) & (P[:, 2] >= z0) & (P[:, 2] <= z1) & (r >= r0)
          m &= ~inwin
      twv = opt.get('tw', 'x').split(',')
      twv = twv[gi] if gi < len(twv) else twv[-1]
      if twv != 'x':  # Schrift: flache Abweichungen (≤ 0,52) in den Textfenstern außen ignorieren
          tw = ((th >= 200) & (th <= 340)) | ((th >= 20) & (th <= 160)) if not twv.startswith('a') else np.ones(len(th), bool)
          m &= ~(tw & (r >= float(twv.lstrip('a'))) & (d <= 0.52))
      print(f'{label}: max {d.max():.3f} (ungefiltert)  99.9% {np.percentile(d, 99.9):.3f}  Punkte > {thr} gefiltert: {m.sum()} max {d[m].max() if m.any() else 0:.3f} ({m.mean() * 100:.3f} %)')
      if not m.any(): continue
      key = np.stack([np.floor(P[m, 2]), np.floor(th[m] / 6)], 1)
      uk, inv = np.unique(key, axis=0, return_inverse=True)
      rows = []
      for k in range(len(uk)):
          s = inv.ravel() == k
          rows.append((s.sum(), d[m][s].max(), P[m][s, 2].mean(), th[m][s].mean(), r[m][s].min(), r[m][s].max()))
      rows.sort(key=lambda x: -x[0] * x[1])
      for c, dm, z, t, r0, r1 in rows[:int(opt.get('top', 25))]:
          print(f'   n {c:5d}  max {dm:.3f}  z {z:7.2f}  θ {t:6.1f}  r {r0:6.2f}–{r1:6.2f}')
