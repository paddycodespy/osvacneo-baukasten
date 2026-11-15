/**
 * Eigene Kontur als Querschnitt: geschlossenes Polygon in mm (gegen den Uhrzeigersinn, Mitte des Umrisses im
 * Ursprung). Gerade Stücke sind einzelne lange Kanten, Rundungen dicht abgetastet (Kanten höchstens SEG_MAX lang).
 * Daraus baut freeform.ts den Draht: lange Kanten als Linien, Ketten kurzer Kanten als glatte Kurven (BSpline),
 * an Knicken (Richtungswechsel > CORNER_DEG) getrennt.
 */
import ClipperLib from 'clipper-lib';

export type P2 = [number, number];

/** längste Kante einer Rundung; längere Kanten gelten als gerade Stücke */
export const SEG_MAX = 1.5;
/** ab diesem Richtungswechsel (Grad) zwischen zwei Kanten ist es ein Knick (dort beginnt eine neue Kurve) */
export const CORNER_DEG = 25;
/** kleinster Eckradius an spitzen Ecken */
export const CONTOUR_MIN_R = 0.5;
/** Grenzen der Größe */
export const CONTOUR_MIN = 6, CONTOUR_MAX = 250;

const SCALE = 10000; // Clipper rechnet mit ganzen Zahlen: 0,1 µm

export const area = (pts: P2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

export function bbox(pts: P2[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

const len = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a: P2, b: P2) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const wrap = (t: number) => Math.atan2(Math.sin(t), Math.cos(t));

/**
 * Doppelte Punkte und Punkte (fast) auf einer Geraden entfernen: ein Punkt fällt weg, wenn alle seit dem letzten
 * behaltenen Punkt übersprungenen Punkte höchstens tol von der neuen Kante entfernt liegen.
 */
export function clean(pts: P2[], tol = 0.002): P2[] {
  const p = pts.filter((q, i) => len(q, pts[(i + 1) % pts.length]) > 1e-6);
  if (p.length < 4) return p;
  const dist = (a: P2, b: P2, q: P2) => {
    const L = len(a, b);
    if (L < 1e-12) return len(a, q);
    const t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L);
    if (t < 0 || t > 1) return Infinity;
    return Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / L;
  };
  // beim Punkt mit dem schärfsten Knick beginnen (der bleibt sicher)
  let start = 0, best = -1;
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length], q = p[i], b = p[(i + 1) % p.length];
    const t = Math.abs(wrap(dirOf(q, b) - dirOf(a, q)));
    if (t > best) {
      best = t;
      start = i;
    }
  }
  const r = [...p.slice(start), ...p.slice(0, start)];
  const out: P2[] = [r[0]];
  let skipped: P2[] = [];
  for (let i = 1; i <= r.length; i++) {
    const next = r[i % r.length];
    const cand = r[i - 1];
    if (i === 1) {
      skipped = [];
      continue;
    }
    const last = out[out.length - 1];
    const all = [...skipped, cand];
    if (all.every((q) => dist(last, next, q) <= tol)) skipped = all;
    else {
      out.push(cand);
      skipped = [];
    }
  }
  // r[0] … r[n-1]; der erste Punkt wurde nie geprüft, die Schleife oben prüft r[1] … r[n-1]
  return out.length >= 3 ? out : p;
}

/** gegen den Uhrzeigersinn, Mitte des Umrisses (Rahmen) im Ursprung */
export function normalize(pts: P2[]): P2[] {
  let p = clean(pts);
  if (area(p) < 0) p = p.reverse();
  const b = bbox(p);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return p.map(([x, y]) => [x - cx, y - cy]);
}

/** Lange Rundungskanten unterteilen: gerade Stücke bleiben (gerade = Nachbarn knicken nicht weg), sonst ≤ SEG_MAX */
export function densify(pts: P2[], maxSeg = SEG_MAX): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const L = len(a, b);
    if (L > maxSeg && !isStraight(pts, i)) {
      const n = Math.ceil(L / maxSeg);
      for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return out;
}

/** Kante i ist ein gerades Stück: lang genug oder an beiden Enden ein Knick */
function isStraight(pts: P2[], i: number): boolean {
  const n = pts.length;
  const a = pts[i], b = pts[(i + 1) % n];
  if (len(a, b) > SEG_MAX + 1e-6) return true;
  const d = dirOf(a, b);
  const dp = dirOf(pts[(i - 1 + n) % n], a), dn = dirOf(b, pts[(i + 2) % n]);
  return Math.abs(wrap(d - dp)) > rad(CORNER_DEG) && Math.abs(wrap(dn - d)) > rad(CORNER_DEG);
}
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Spitze Ecken (Richtungswechsel > CORNER_DEG an einem Punkt mit kurzen Nachbarkanten oder zwei geraden Stücken)
 * mit Radius r runden. Rückgabe: neue Punkte und Anzahl gerundeter Ecken.
 */
export function roundCorners(pts: P2[], r = CONTOUR_MIN_R): { pts: P2[]; n: number } {
  const N = pts.length;
  const out: P2[] = [];
  let n = 0;
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], p = pts[i], b = pts[(i + 1) % N];
    const t = wrap(dirOf(p, b) - dirOf(a, p));
    if (Math.abs(t) < rad(CORNER_DEG)) {
      out.push(p);
      continue;
    }
    // Tangentenlänge, höchstens 45 % der Nachbarkanten
    let rr = r;
    let dt = rr * Math.tan(Math.abs(t) / 2);
    const lim = 0.45 * Math.min(len(a, p), len(p, b));
    if (dt > lim) {
      dt = lim;
      rr = dt / Math.tan(Math.abs(t) / 2);
    }
    if (rr < 0.05) {
      out.push(p);
      continue;
    }
    const e1: P2 = [(p[0] - a[0]) / len(a, p), (p[1] - a[1]) / len(a, p)];
    const e2: P2 = [(b[0] - p[0]) / len(p, b), (b[1] - p[1]) / len(p, b)];
    const t1: P2 = [p[0] - e1[0] * dt, p[1] - e1[1] * dt];
    const s = Math.sign(t);
    const c: P2 = [t1[0] - e1[1] * rr * s, t1[1] + e1[0] * rr * s];
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    const steps = Math.max(2, Math.ceil(Math.abs(t) / rad(10)));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (t * k) / steps;
      out.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]);
    }
    n++;
  }
  return { pts: clean(out, 1e-5), n };
}

/** Kontur um delta nach außen versetzen (negativ: nach innen), Ecken außen rund. Größtes Teilstück. */
export function offset(pts: P2[], delta: number): P2[] {
  if (Math.abs(delta) < 1e-9) return pts;
  const path = pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
  const co = new ClipperLib.ClipperOffset(2, 0.01 * SCALE);
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const sol: { X: number; Y: number }[][] = [];
  co.Execute(sol, delta * SCALE);
  if (!sol.length) return pts;
  let best = sol[0], ba = 0;
  for (const s of sol) {
    const a = Math.abs(area(s.map((q) => [q.X, q.Y] as P2)));
    if (a > ba) {
      ba = a;
      best = s;
    }
  }
  let out = best.map((q) => [q.X / SCALE, q.Y / SCALE] as P2);
  if (area(out) < 0) out = out.reverse();
  return densify(clean(out, 0.003));
}

/** Schneiden sich Kanten der Kontur? */
export function selfIntersects(pts: P2[]): boolean {
  const n = pts.length;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j], d = pts[(j + 1) % n];
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])) continue;
      if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}

/**
 * Kontur in Stücke für den Draht teilen: gerade Kanten einzeln ('L'), Ketten kurzer Kanten zwischen Knicken als Kurve
 * ('C', Punkte inklusive Anfang und Ende). Eine Kontur ganz ohne Knick wird in vier Kurven geteilt.
 */
export function runs(pts: P2[]): { k: 'L' | 'C'; pts: P2[] }[] {
  const n = pts.length;
  const straight = pts.map((_, i) => isStraight(pts, i));
  // Knick am Punkt i: Richtungswechsel groß, oder Wechsel zwischen gerade und Kurve
  const kink = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    return straight[i] || straight[(i - 1 + n) % n] || Math.abs(wrap(dirOf(p, b) - dirOf(a, p))) > rad(CORNER_DEG);
  });
  let starts = pts.map((_, i) => i).filter((i) => kink[i]);
  if (!starts.length) starts = [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4)];
  const out: { k: 'L' | 'C'; pts: P2[] }[] = [];
  for (let s = 0; s < starts.length; s++) {
    const i0 = starts[s], i1 = s + 1 < starts.length ? starts[s + 1] : starts[0] + n;
    // von i0 bis i1: einzelne gerade Kanten, sonst eine Kurve
    let i = i0;
    while (i < i1) {
      if (straight[i % n]) {
        out.push({ k: 'L', pts: [pts[i % n], pts[(i + 1) % n]] });
        i++;
        continue;
      }
      const c: P2[] = [pts[i % n]];
      while (i < i1 && !straight[i % n]) {
        c.push(pts[(i + 1) % n]);
        i++;
      }
      out.push({ k: c.length > 2 ? 'C' : 'L', pts: c.length > 2 ? c : [c[0], c[c.length - 1]] });
    }
  }
  return out;
}

/** Fertig aufbereitete Kontur: Ecken gerundet, normalisiert, Rundungen abgetastet */
export function prepare(raw: P2[]): { pts: P2[]; rounded: number } {
  const n0 = normalize(raw);
  const r = roundCorners(densify(n0));
  return { pts: normalize(densify(r.pts)), rounded: r.n };
}

/** Kontur skalieren (um die Mitte), drehen (Grad, gegen den Uhrzeigersinn), spiegeln (links/rechts) */
export function transform(pts: P2[], o: { scale?: number; rot?: number; mirror?: boolean }): P2[] {
  const k = o.scale ?? 1, a = rad(o.rot ?? 0), c = Math.cos(a), s = Math.sin(a);
  let p = pts.map(([x, y]) => [(o.mirror ? -x : x) * k, y * k] as P2).map(([x, y]) => [x * c - y * s, x * s + y * c] as P2);
  if (o.mirror) p = p.reverse();
  return normalize(p);
}

/** Kurzer Schlüssel der Punkte (für Zwischenspeicher und Vergleiche) */
export function contourKey(pts: P2[]): string {
  let h = 2166136261;
  for (const [x, y] of pts) for (const v of [Math.round(x * 1000), Math.round(y * 1000)]) {
    h ^= v & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 16777619);
  }
  return `${pts.length}:${(h >>> 0).toString(36)}`;
}

/** Dichte Punktfolge (Kanten höchstens step lang) */
export function denseAll(pts: P2[], step = 0.5): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const m = Math.max(1, Math.ceil(len(a, b) / step));
    for (let k = 0; k < m; k++) out.push([a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m]);
  }
  return out;
}

/**
 * Gezeichnete Ecken (x, y, Eckradius; y nach oben) in eine Kontur umwandeln: jede Ecke mit ihrem Radius gerundet
 * (0 = spitz, wird beim Aufbereiten auf CONTOUR_MIN_R gerundet).
 */
export function fromVertices(v: [number, number, number][]): P2[] {
  const n = v.length;
  if (n < 3) return v.map(([x, y]) => [x, y]);
  let pts: P2[] = v.map(([x, y]) => [x, y]);
  if (area(pts) < 0) {
    v = [...v].reverse();
    pts = pts.reverse();
  }
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
    const r = Math.max(0, v[i][2] || 0);
    const t = wrap(dirOf(p, b) - dirOf(a, p));
    if (r <= 0 || Math.abs(t) < 1e-3 || len(a, p) < 1e-6 || len(p, b) < 1e-6) {
      out.push(p);
      continue;
    }
    let rr = r;
    let dt = rr * Math.tan(Math.abs(t) / 2);
    const lim = 0.5 * Math.min(len(a, p), len(p, b));
    if (dt > lim) {
      dt = lim;
      rr = dt / Math.tan(Math.abs(t) / 2);
    }
    const e1: P2 = [(p[0] - a[0]) / len(a, p), (p[1] - a[1]) / len(a, p)];
    const t1: P2 = [p[0] - e1[0] * dt, p[1] - e1[1] * dt];
    const s = Math.sign(t);
    const c: P2 = [t1[0] - e1[1] * rr * s, t1[1] + e1[0] * rr * s];
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    const steps = Math.max(3, Math.ceil(Math.abs(t) / rad(6)));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (t * k) / steps;
      out.push([c[0] + rr * Math.cos(ang), c[1] + rr * Math.sin(ang)]);
    }
  }
  return out;
}

/** Anzahl gerader Seiten ab minLen mm (dort sitzen Schraubenlöcher und Klemmrippen) */
export const straightSides = (pts: P2[], minLen = 14) => pts.filter((p, i) => len(p, pts[(i + 1) % pts.length]) >= minLen).length;

/** SVG-Pfad (y nach unten gespiegelt) */
export const svgPath = (pts: P2[], k = 1, ox = 0, oy = 0) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * k).toFixed(2)} ${(oy - y * k).toFixed(2)}`).join(' ') + 'Z';
