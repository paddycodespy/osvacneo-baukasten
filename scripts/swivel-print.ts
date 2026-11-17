/**
 * Druckoptimierter Drehring (npm run test:swivel): Profile direkt im Schnitt (r, z) prüfen, für 7/9 mm Wand,
 * Spiel 0,2–0,5, an der Kupplung (FxxHyy, Nebenluft-Regler) und im Gehäuse (MxxHyy).
 * - Ringe überlappen nicht, Abstand überall mindestens das Spiel.
 * - Schichten (0,2 mm): Was ein Ring in einer Schicht mehr hat als in der Schicht darunter (mehr als 0,2 mm, also flacher
 *   als 45°), hängt über dem Spalt. Gezählt als Fläche (Breite × 2π r) mit dem senkrechten Abstand zum Teil darunter.
 *   Erlaubt ist nur der Anfang des oberen Rings (Spitze des Flanschs) mit mindestens 0,6 mm Abstand.
 * Zum Vergleich wird das Original mitgerechnet (nur Ausgabe).
 */
import { swivelPrintProfile, swivelOuterPts, swivelInnerPts, INNER_BELOW_OUTER, SWIVEL_PRINT } from '../src/lib/osvac/hose';
import type { P2 } from '../src/lib/osvac/geom';

const LH = 0.2;
const rH = 18;

/** Abschnitte [r0, r1] eines Polygons auf Höhe z */
function intervals(poly: P2[], z: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    if ((z1 <= z && z2 > z) || (z2 <= z && z1 > z)) xs.push(x1 + ((z - z1) * (x2 - x1)) / (z2 - z1));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}
const union = (a: [number, number][]) => {
  const s = [...a].sort((p, q) => p[0] - q[0]);
  const o: [number, number][] = [];
  for (const iv of s) {
    const l = o[o.length - 1];
    if (l && iv[0] <= l[1] + 1e-9) l[1] = Math.max(l[1], iv[1]);
    else o.push([...iv]);
  }
  return o;
};
/** Teile von a, die nicht in b liegen */
function minus(a: [number, number][], b: [number, number][]): [number, number][] {
  let cur = a.map((x) => [...x] as [number, number]);
  for (const [b0, b1] of b) {
    const next: [number, number][] = [];
    for (const [a0, a1] of cur) {
      if (b1 <= a0 || b0 >= a1) next.push([a0, a1]);
      else {
        if (b0 > a0) next.push([a0, b0]);
        if (b1 < a1) next.push([b1, a1]);
      }
    }
    cur = next;
  }
  return cur.filter(([x0, x1]) => x1 - x0 > 1e-6);
}
const area = (iv: [number, number][]) => iv.reduce((s, [a, b]) => s + Math.PI * ((rH + b) ** 2 - (rH + a) ** 2), 0);

/**
 * Überhang je Teil: support(z) sind zusätzliche tragende Bereiche (Schlauchteil, Gehäuse).
 * Rückgabe: Liste [z, Fläche, Abstand nach unten zum anderen Ring].
 */
function sag(self: P2[], other: P2[], support: (z: number) => [number, number][]) {
  const zs = self.map((p) => p[1]);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const res: { z: number; a: number; gap: number }[] = [];
  for (let z = Math.floor(z0 / LH) * LH + LH / 2; z < z1; z += LH) {
    const cur = intervals(self, z);
    const below = union([...intervals(self, z - LH), ...support(z - LH)]).map(([a, b]): [number, number] => [a - LH * 1.001, b + LH * 1.001]);
    const free = minus(cur, below);
    const a = area(free);
    if (a < 0.5) continue;
    // senkrechter Abstand zum anderen Ring unter den freien Stellen
    let gap = Infinity;
    for (const [f0, f1] of free)
      for (let k = 1; k < 40; k++) {
        const o = intervals(other, z - k * 0.05);
        if (o.some(([a0, a1]) => a1 > f0 && a0 < f1)) {
          gap = Math.min(gap, k * 0.05);
          break;
        }
      }
    res.push({ z, a, gap });
  }
  return res;
}

/** Abstand zwischen zwei Polygonen (Ecke–Kante in beide Richtungen) und Überlappungstest (Ecke im anderen Polygon) */
function segDist(p: P2, a: P2, b: P2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const inside = (p: P2, poly: P2[]) => intervals(poly, p[1]).some(([a, b]) => p[0] > a + 1e-6 && p[0] < b - 1e-6);
function minDist(A: P2[], B: P2[]) {
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]])
    for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p, Q[i], Q[(i + 1) % Q.length]));
  return d;
}
const crosses = (A: P2[], B: P2[]) => A.some((p) => inside(p, B)) || B.some((p) => inside(p, A));

const sum = (r: { a: number }[]) => r.reduce((s, x) => s + x.a, 0);
const fmtSag = (r: { z: number; a: number; gap: number }[]) => r.map((x) => `z ${x.z.toFixed(1)}: ${x.a.toFixed(1)} mm² über ${x.gap === Infinity ? 'Luft' : x.gap.toFixed(2) + ' mm'}`).join(', ');

let fail = 0;
const err = (s: string) => {
  fail++;
  console.log('FEHLER ' + s);
};

for (const housed of [false, true])
  for (const W of [7, 9])
    for (const g of [0.2, 0.3, 0.4, SWIVEL_PRINT.gapMax]) {
      const id = `${housed ? 'Gehäuse' : 'Kupplung'} W${W} g${g}`;
      const pr = swivelPrintProfile(W, housed, g);
      const hoseTop = (x: number) => -pr.below - 0.7 * Math.max(0, x - 1.743);
      const outer = housed ? W - 1.6 : W;
      // Schlauchteil trägt den unteren Ring; im Gehäuse trägt die Bohrungswand den oberen Ring
      const hose = (z: number): [number, number][] => {
        if (z > -pr.below) return [];
        const x = z >= hoseTop(outer) ? 1.743 + (-pr.below - z) / 0.7 : outer;
        return [[0, Math.min(outer, x)]];
      };
      const housing = (z: number): [number, number][] => (housed ? [[W - 1.2, W]] : []);
      const d = minDist(pr.top, pr.bottom);
      if (crosses(pr.top, pr.bottom)) err(`${id}: Ringe überlappen`);
      if (d < g - 1e-6) err(`${id}: Abstand ${d.toFixed(3)} < Spiel ${g}`);
      const sTop = sag(pr.top, pr.bottom, housing);
      const sBot = sag(pr.bottom, pr.top, hose);
      const zTop = Math.min(...pr.top.map((p) => p[1]));
      const start = sTop.filter((x) => x.z < zTop + 0.5);
      const rest = sTop.filter((x) => x.z >= zTop + 0.5 && x.a > 3);
      if (sum(start) > 30) err(`${id}: Anfang des oberen Rings ${sum(start).toFixed(1)} mm² (erwartet ≤ 30)`);
      if (start.some((x) => x.gap < 0.6)) err(`${id}: Anfang des oberen Rings nur ${Math.min(...start.map((x) => x.gap)).toFixed(2)} mm über dem unteren Ring`);
      if (rest.length) err(`${id}: oberer Ring hängt über: ${fmtSag(rest)}`);
      if (sBot.some((x) => x.a > 3)) err(`${id}: unterer Ring hängt über: ${fmtSag(sBot)}`);
      console.log(`${fail ? '' : 'ok     '}${id.padEnd(20)} Spiel min ${d.toFixed(2)} mm, frei beginnend ${sum(start).toFixed(1)} mm² (${start.length ? Math.min(...start.map((x) => x.gap)).toFixed(2) : '–'} mm darüber), sonst ${(sum(sTop) - sum(start) + sum(sBot)).toFixed(1)} mm²`);
    }

// Vergleich: Original (gleiches System: Oberkante Außenring z = 0, Innenring 1,367 tiefer)
for (const housed of [false, true]) {
  const W = 7, g = 0.3;
  const o = swivelOuterPts(rH, W, housed, g).map(([x, z]): P2 => [x - rH, z]);
  const i = swivelInnerPts(rH, W, housed, g).map(([x, z]): P2 => [x - rH, z - INNER_BELOW_OUTER]);
  const below = housed ? 8.001 : 6.0;
  const hose = (z: number): [number, number][] => (z > -below ? [] : [[0, W]]);
  const housing = (): [number, number][] => (housed ? [[W - 1.2, W]] : []);
  const sO = sag(o, i, housing), sI = sag(i, o, hose);
  console.log(`Original ${housed ? 'Gehäuse' : 'Kupplung'} W${W} g${g}: über dem Spalt gedruckt ${(sum(sO) + sum(sI)).toFixed(0)} mm² (Außenring ${sum(sO).toFixed(0)}, Innenring ${sum(sI).toFixed(0)}), kleinster Abstand darunter ${Math.min(...[...sO, ...sI].map((x) => x.gap)).toFixed(2)} mm`);
}
process.exit(fail ? 1 : 0);
