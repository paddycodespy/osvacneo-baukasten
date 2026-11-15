/**
 * Konturen aus SVG- und DXF-Dateien lesen. Ergebnis: alle geschlossenen Umrisse in mm (y nach oben), größte zuerst.
 * SVG wird im Browser abgetastet (getPointAtLength, Transformationen über getCTM), DXF mit einem kleinen eigenen
 * Leser (LWPOLYLINE/POLYLINE mit Bögen, LINE, ARC, CIRCLE, ELLIPSE, SPLINE; offene Stücke werden zu Umrissen verkettet).
 */
import { area, bbox, clean, type P2 } from './osvac/contour';

export interface Found {
  pts: P2[];
  /** Fläche in mm² */
  area: number;
}
export interface ImportResult {
  loops: Found[];
  /** Hinweise (z. B. offene Linien, unbekannte Einheit) */
  notes: string[];
}

const STEP = 0.2; // mm zwischen den abgetasteten Punkten

/** Douglas-Peucker für einen geschlossenen Umriss */
function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 8) return pts;
  // am weitesten entfernten Punkt teilen, damit der Umriss als zwei offene Linien vereinfacht werden kann
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const dp = (p: P2[]): P2[] => {
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
    let im = 0, dm = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L;
      if (d > dm) {
        dm = d;
        im = i;
      }
    }
    if (dm <= tol) return [a, b];
    const l = dp(p.slice(0, im + 1)), r = dp(p.slice(im));
    return [...l.slice(0, -1), ...r];
  };
  const A = dp(pts.slice(0, far + 1)), B = dp([...pts.slice(far), pts[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}

function finish(loops: P2[][], notes: string[]): ImportResult {
  const out: Found[] = [];
  for (const l of loops) {
    let p = clean(simplify(l, 0.002), 1e-4);
    if (p.length < 3) continue;
    if (area(p) < 0) p = p.reverse();
    const a = area(p);
    const b = bbox(p);
    if (a < 1 || Math.min(b.w, b.h) < 1) continue;
    out.push({ pts: p, area: a });
  }
  out.sort((a, b) => b.area - a.area);
  if (!out.length) notes.push('In der Datei wurde kein geschlossener Umriss gefunden.');
  return { loops: out, notes };
}

// ---------------------------------------------------------------- SVG

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

/** SVG lesen (nur im Browser) */
export function readSvg(text: string): ImportResult {
  const notes: string[] = [];
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.documentElement;
  if (!src || src.nodeName.toLowerCase() !== 'svg') return { loops: [], notes: ['Die Datei ist keine gültige SVG-Datei.'] };
  // Maßstab: mm je Benutzereinheit aus width/height und viewBox
  const len = (v: string | null) => {
    const m = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(v ?? '');
    return m ? { v: parseFloat(m[1]), u: m[2].toLowerCase() } : null;
  };
  const W = len(src.getAttribute('width'));
  const vb = (src.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let k = 25.4 / 96;
  if (W && W.u in UNIT_MM) {
    const wmm = W.v * UNIT_MM[W.u];
    k = vb.length === 4 && vb[2] > 0 ? wmm / vb[2] : UNIT_MM[W.u];
    if (W.u === '' || W.u === 'px') notes.push('Die SVG hat keine Maßeinheit; angenommen: 96 Pixel je Zoll. Bitte die Breite prüfen.');
  } else if (!W) notes.push('Die SVG hat keine Breitenangabe; angenommen: 1 Einheit = 1 Pixel (96 je Zoll). Bitte die Breite prüfen.');
  // unsichtbar ins Dokument hängen, damit Längen und Transformationen gerechnet werden
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);
  const loops: P2[][] = [];
  let open = 0;
  try {
    const root = svg.getCTM()?.inverse();
    const els = svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
    els.forEach((el) => {
      const g = el as SVGGeometryElement;
      if (typeof g.getTotalLength !== 'function') return;
      const ctm = g.getCTM();
      if (!ctm || !root) return;
      const m = root.multiply(ctm);
      const L = g.getTotalLength();
      if (!(L > 0)) return;
      // Schrittweite in Benutzereinheiten (Maßstab der Transformation berücksichtigen)
      const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      const step = STEP / (k * sc);
      const n = Math.min(20000, Math.max(8, Math.ceil(L / step)));
      const pts: P2[] = [];
      for (let i = 0; i <= n; i++) {
        const p = g.getPointAtLength((L * i) / n);
        const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
        pts.push([x * k, -y * k]);
      }
      // Teilpfade an Sprüngen trennen
      const gap = (3 * L * k * sc) / n + 0.05;
      let cur: P2[] = [pts[0]];
      const flush = () => {
        if (cur.length > 2 && Math.hypot(cur[0][0] - cur[cur.length - 1][0], cur[0][1] - cur[cur.length - 1][1]) < 0.2) loops.push(cur.slice(0, -1));
        else if (cur.length > 1) open++;
      };
      for (let i = 1; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) > gap) {
          flush();
          cur = [];
        }
        cur.push(pts[i]);
      }
      flush();
    });
  } finally {
    host.remove();
  }
  if (open) notes.push(`${open} offene Linie${open > 1 ? 'n' : ''} übersprungen (nur geschlossene Umrisse zählen).`);
  return finish(loops, notes);
}

// ---------------------------------------------------------------- DXF

type Pair = [number, string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(c)) continue;
    out.push([c, lines[i + 1].trim()]);
  }
  return out;
}

/** Bogen zwischen zwei Punkten mit Ausbuchtung (bulge = tan(Winkel/4)) abtasten (ohne Endpunkt) */
function bulgeArc(a: P2, b: P2, bulge: number): P2[] {
  if (Math.abs(bulge) < 1e-9) return [a];
  const th = 4 * Math.atan(bulge);
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const r = c / (2 * Math.sin(Math.abs(th) / 2));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const h = r * Math.cos(th / 2);
  const nx = -(b[1] - a[1]) / c, ny = (b[0] - a[0]) / c;
  const s = Math.sign(bulge);
  const cx = mx + nx * h * s, cy = my + ny * h * s;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx);
  const n = Math.max(2, Math.ceil((Math.abs(th) * r) / STEP));
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (th * i) / n;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): P2[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(4, Math.ceil((sweep * r) / STEP));
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

/** B-Spline (de Boor), rational wenn Gewichte da sind */
function splinePts(deg: number, knots: number[], ctrl: P2[], w: number[]): P2[] {
  if (ctrl.length < 2 || knots.length !== ctrl.length + deg + 1) return ctrl;
  const t0 = knots[deg], t1 = knots[knots.length - deg - 1];
  let L = 0;
  for (let i = 1; i < ctrl.length; i++) L += Math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]);
  const n = Math.min(5000, Math.max(16, Math.ceil(L / STEP)));
  const out: P2[] = [];
  for (let s = 0; s <= n; s++) {
    const t = Math.min(t1 - 1e-12, t0 + ((t1 - t0) * s) / n);
    let k = deg;
    while (k < knots.length - deg - 2 && t >= knots[k + 1]) k++;
    const d = Array.from({ length: deg + 1 }, (_, j) => {
      const i = k - deg + j, ww = w[i] ?? 1;
      return [ctrl[i][0] * ww, ctrl[i][1] * ww, ww];
    });
    for (let r = 1; r <= deg; r++)
      for (let j = deg; j >= r; j--) {
        const i = k - deg + j;
        const a = (t - knots[i]) / (knots[i + deg + 1 - r] - knots[i] || 1);
        d[j] = d[j].map((v, q) => (1 - a) * d[j - 1][q] + a * v);
      }
    out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
  }
  return out;
}

/** DXF lesen (ASCII) */
export function readDxf(text: string): ImportResult {
  const notes: string[] = [];
  const P = pairs(text);
  if (!P.length || !P.some(([c, v]) => c === 0 && v === 'SECTION')) return { loops: [], notes: ['Die Datei ist keine lesbare DXF-Datei (nur das Textformat wird unterstützt).'] };
  // Einheit
  let unit = 1;
  const iu = P.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (iu >= 0 && P[iu + 1]?.[0] === 70) {
    const u = parseInt(P[iu + 1][1], 10);
    const map: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
    if (u in map) unit = map[u];
    else notes.push('Unbekannte Maßeinheit in der DXF; angenommen: mm. Bitte die Breite prüfen.');
    if (u === 1) notes.push('Die DXF ist in Zoll; umgerechnet in mm.');
  }
  // nur ENTITIES (Blöcke werden nicht aufgelöst)
  const es = P.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && P[i - 1]?.[1] === 'SECTION');
  if (es < 0) return { loops: [], notes: ['In der DXF wurden keine Zeichnungselemente gefunden.'] };
  const ents: Pair[][] = [];
  for (let i = es + 1; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === 0 && v === 'ENDSEC') break;
    if (c === 0) ents.push([P[i]]);
    else ents[ents.length - 1]?.push(P[i]);
  }
  const loops: P2[][] = [];
  const pieces: P2[][] = [];
  let skipped = 0;
  const num = (e: Pair[], code: number, def = 0) => {
    const f = e.find(([c]) => c === code);
    return f ? parseFloat(f[1]) : def;
  };
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    const type = e[0][1];
    if (type === 'LWPOLYLINE') {
      const closed = (num(e, 70) & 1) === 1;
      const vs: { p: P2; b: number }[] = [];
      for (const [c, v] of e) {
        if (c === 10) vs.push({ p: [parseFloat(v), 0], b: 0 });
        else if (c === 20 && vs.length) vs[vs.length - 1].p[1] = parseFloat(v);
        else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v);
      }
      polyline(vs, closed);
    } else if (type === 'POLYLINE') {
      const closed = (num(e, 70) & 1) === 1;
      const vs: { p: P2; b: number }[] = [];
      for (i++; i < ents.length && ents[i][0][1] !== 'SEQEND'; i++) if (ents[i][0][1] === 'VERTEX') vs.push({ p: [num(ents[i], 10), num(ents[i], 20)], b: num(ents[i], 42) });
      polyline(vs, closed);
    } else if (type === 'LINE') pieces.push([[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]]);
    else if (type === 'ARC') pieces.push(arcPts(num(e, 10), num(e, 20), num(e, 40), (num(e, 50) * Math.PI) / 180, (num(e, 51) * Math.PI) / 180));
    else if (type === 'CIRCLE') loops.push(arcPts(num(e, 10), num(e, 20), num(e, 40), 0, 2 * Math.PI).slice(0, -1));
    else if (type === 'ELLIPSE') {
      const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
      let t0 = num(e, 41, 0), t1 = num(e, 42, 2 * Math.PI);
      const a = Math.hypot(mx, my), rot = Math.atan2(my, mx);
      while (t1 <= t0) t1 += 2 * Math.PI;
      const n = Math.max(16, Math.ceil(((t1 - t0) * a) / STEP));
      const pts: P2[] = [];
      for (let k = 0; k <= n; k++) {
        const t = t0 + ((t1 - t0) * k) / n;
        const x = a * Math.cos(t), y = a * ratio * Math.sin(t);
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      if (t1 - t0 > 2 * Math.PI - 1e-6) loops.push(pts.slice(0, -1));
      else pieces.push(pts);
    } else if (type === 'SPLINE') {
      const deg = num(e, 71, 3);
      const knots = e.filter(([c]) => c === 40).map(([, v]) => parseFloat(v));
      const w = e.filter(([c]) => c === 41).map(([, v]) => parseFloat(v));
      const ctrl: P2[] = [];
      const fit: P2[] = [];
      for (const [c, v] of e) {
        if (c === 10) ctrl.push([parseFloat(v), 0]);
        else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v);
        else if (c === 11) fit.push([parseFloat(v), 0]);
        else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
      }
      const pts = ctrl.length ? splinePts(deg, knots, ctrl, w) : fit;
      const closed = (num(e, 70) & 1) === 1 || (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6);
      if (closed) loops.push(pts.slice(0, -1));
      else pieces.push(pts);
    } else if (type !== 'SEQEND' && type !== 'VERTEX') skipped++;
  }
  function polyline(vs: { p: P2; b: number }[], closed: boolean) {
    if (vs.length < 2) return;
    const pts: P2[] = [];
    const n = vs.length;
    for (let k = 0; k < (closed ? n : n - 1); k++) pts.push(...bulgeArc(vs[k].p, vs[(k + 1) % n].p, vs[k].b));
    if (closed) loops.push(pts);
    else {
      pts.push(vs[n - 1].p);
      if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) loops.push(pts.slice(0, -1));
      else pieces.push(pts);
    }
  }
  // offene Stücke an gemeinsamen Endpunkten verketten
  const tol = 0.05 / unit + 1e-6;
  const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  const left = [...pieces];
  let open = 0;
  while (left.length) {
    let chain = left.shift()!;
    for (let grew = true; grew; ) {
      grew = false;
      if (near(chain[0], chain[chain.length - 1]) && chain.length > 2) break;
      for (let j = 0; j < left.length; j++) {
        const q = left[j];
        const end = chain[chain.length - 1];
        if (near(end, q[0])) chain = [...chain, ...q.slice(1)];
        else if (near(end, q[q.length - 1])) chain = [...chain, ...[...q].reverse().slice(1)];
        else if (near(chain[0], q[q.length - 1])) chain = [...q, ...chain.slice(1)];
        else if (near(chain[0], q[0])) chain = [...[...q].reverse(), ...chain.slice(1)];
        else continue;
        left.splice(j, 1);
        grew = true;
        break;
      }
    }
    if (chain.length > 2 && near(chain[0], chain[chain.length - 1])) loops.push(chain.slice(0, -1));
    else open++;
  }
  if (open) notes.push(`${open} offene Linie${open > 1 ? 'n' : ''} übersprungen (nur geschlossene Umrisse zählen).`);
  if (skipped) notes.push(`${skipped} Element${skipped > 1 ? 'e' : ''} (z. B. Text, Bemaßung, Blöcke) übersprungen.`);
  return finish(
    loops.map((l) => l.map(([x, y]) => [x * unit, y * unit] as P2)),
    notes,
  );
}

/** Datei nach Endung lesen */
export async function readContourFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith('.dxf')) return readDxf(text);
  if (name.endsWith('.svg')) return readSvg(text);
  return { loops: [], notes: ['Bitte eine SVG- oder DXF-Datei wählen.'] };
}
