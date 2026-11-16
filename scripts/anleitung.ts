/**
 * Anleitung bauen: docs/anleitung.md → public/anleitung.html (eine Seite, ohne fremde Bibliothek).
 *   npm run docs
 * Die Bilder liegen in public/anleitung/ und werden mit `npm run docs:bilder` neu aufgenommen.
 *
 * Erlaubtes Markdown (bewusst klein gehalten):
 *   # Titel · ## Kapitel · ### Abschnitt (Anker automatisch aus dem Text, z. B. „Größen“ → #groessen;
 *   eigener Anker: `## Text {#anker}`)
 *   Absätze, Listen mit „- “ oder „1. “, **fett**, *kursiv*, `Code`, [Link](#anker)
 *   ![Bildunterschrift](anleitung/bild.webp)       Bild auf eigener Zeile
 *   ![Bildunterschrift](anleitung/bild.webp){klein} schmal (für Ausschnitte aus den Einstellungen)
 *   > Tipp: …                                      Hinweiskasten (Zeilen mit „> “)
 *   [[INHALT]]                                     Inhaltsverzeichnis aus den ##/###-Überschriften
 *   <!-- Kommentar -->                             wird weggelassen
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = 'docs/anleitung.md';
const OUT = 'public/anleitung.html';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function inline(s: string) {
  const code: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(code[+i])}</code>`);
}

const md = readFileSync(SRC, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const lines = md.split('\n');
const toc: { level: number; id: string; text: string }[] = [];
const used = new Set<string>();
const missing: string[] = [];
let title = 'Anleitung';
const out: string[] = [];
let list: 'ul' | 'ol' | null = null;
let para: string[] = [];
let quote: string[] = [];
let inSection = false;

const flushPara = () => {
  if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
  para = [];
};
const flushList = () => {
  if (list) out.push(`</${list}>`);
  list = null;
};
const flushQuote = () => {
  if (!quote.length) return;
  const text = quote.join(' ');
  const m = /^(Tipp|Achtung|Hinweis):\s*/.exec(text);
  const cls = m?.[1] === 'Achtung' ? 'warn' : 'tip';
  out.push(`<div class="box ${cls}">${m ? `<strong>${m[1]}:</strong> ` : ''}${inline(text.slice(m ? m[0].length : 0))}</div>`);
  quote = [];
};
const flush = () => (flushPara(), flushList(), flushQuote());

for (const raw of lines) {
  const line = raw.trimEnd();
  let m: RegExpExecArray | null;
  if (!line.trim()) {
    flush();
    continue;
  }
  if ((m = /^(#{1,3})\s+(.*?)(?:\s*\{#([a-z0-9-]+)\})?$/.exec(line))) {
    flush();
    const level = m[1].length;
    if (level === 1) {
      title = m[2];
      out.push(`<h1>${inline(m[2])}</h1>`);
      continue;
    }
    let id = m[3] ?? slug(m[2]);
    for (let i = 2; used.has(id); i++) id = `${m[3] ?? slug(m[2])}-${i}`;
    used.add(id);
    toc.push({ level, id, text: m[2] });
    if (level === 2) {
      if (inSection) out.push('<p class="up"><a href="#inhalt">nach oben</a></p></section>');
      out.push(`<section><h2 id="${id}">${inline(m[2])}</h2>`);
      inSection = true;
    } else out.push(`<h3 id="${id}">${inline(m[2])}</h3>`);
    continue;
  }
  if ((m = /^!\[([^\]]*)\]\(([^)]+)\)(\{klein\})?$/.exec(line))) {
    flush();
    if (!existsSync(`public/${m[2]}`)) missing.push(m[2]);
    out.push(`<figure${m[3] ? ' class="small"' : ''}><a href="${m[2]}" target="_blank"><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy"></a>${m[1] ? `<figcaption>${inline(m[1])}</figcaption>` : ''}</figure>`);
    continue;
  }
  if (line.trim() === '[[INHALT]]') {
    flush();
    out.push('\u0001TOC\u0001');
    continue;
  }
  if ((m = /^>\s?(.*)$/.exec(line))) {
    flushPara();
    flushList();
    quote.push(m[1]);
    continue;
  }
  if ((m = /^(?:-|(\d+)\.)\s+(.*)$/.exec(line))) {
    flushPara();
    flushQuote();
    const kind = m[1] ? 'ol' : 'ul';
    if (list !== kind) {
      flushList();
      out.push(`<${kind}>`);
      list = kind;
    }
    out.push(`<li>${inline(m[2])}</li>`);
    continue;
  }
  if (list && /^\s{2,}\S/.test(raw)) {
    // Fortsetzung des letzten Listenpunkts
    out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
    continue;
  }
  flushList();
  flushQuote();
  para.push(line.trim());
}
flush();
if (inSection) out.push('<p class="up"><a href="#inhalt">nach oben</a></p></section>');

const tocHtml = `<nav class="toc" id="inhalt" aria-label="Inhalt"><p class="toc-title">Inhalt</p><ol>${toc
  .map((t, i) => {
    const next = toc[i + 1];
    const open = t.level === 2 && next?.level === 3 ? '<ol>' : '';
    const close = t.level === 3 && (!next || next.level === 2) ? '</ol></li>' : t.level === 2 && open ? '' : '</li>';
    return `<li><a href="#${t.id}">${inline(t.text)}</a>${open}${close}`;
  })
  .join('')}</ol></nav>`;

const page = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – osVAC neo Baukasten</title><link rel="icon" type="image/svg+xml" href="./favicon.svg">
<!-- erzeugt aus docs/anleitung.md mit „npm run docs“, nicht von Hand ändern -->
<script>try{if(localStorage.getItem('osvacneo-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
<style>
${readFileSync('public/lizenzen.html', 'utf8').match(/@font-face[^\n]*\n/g)!.join('')}:root{--fg:#333;--bg:#f5f7f8;--card:#fff;--line:#e1e5e8;--grey:#6b7378;--link:#1d86c2;--red:#ff4136;--tip:#e9f5fc;--tip-l:#28a3e5;--warn:#fdf6dc;--warn-l:#e8b400}
html[data-theme=dark]{color-scheme:dark;--fg:#e3e7ea;--bg:#14181b;--card:#1d2226;--line:#323a40;--grey:#9aa5ad;--link:#62c1f4;--red:#ff5a4f;--tip:#14354d;--tip-l:#3bb0ef;--warn:#3a3320;--warn-l:#c9a227}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{margin:0;font-family:Poppins,system-ui,sans-serif;color:var(--fg);background:var(--bg);line-height:1.6;font-size:16px}
header{height:64px;display:flex;align-items:center;padding:0 36px;background:#333}
html[data-theme=dark] header{background:#0c0f11;border-bottom:1px solid var(--line)}
.wordmark{margin:0;display:flex;align-items:center;gap:12px;color:#fff;white-space:nowrap}
.wm-logo{display:block;width:34px;height:34px} .wm-text{display:flex;flex-direction:column;line-height:1}
.wm-os{font-weight:700;font-size:13px;letter-spacing:-0.01em}
.wordmark .os,.wordmark .neo{color:#ef453b} .wordmark .vac{color:#28a3e5}
.wm-sub{font-weight:600;font-size:19px;letter-spacing:0.09em;margin-top:3px}
.wrap{max-width:1180px;margin:0 auto;padding:24px 28px 80px;display:grid;grid-template-columns:260px minmax(0,1fr);gap:40px;align-items:start}
.toc{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.toc-title{margin:0 0 6px;font-weight:700}
.toc ol{list-style:none;margin:0;padding:0} .toc ol ol{padding-left:14px;margin:2px 0 6px}
.toc li{margin:3px 0} .toc a{font-weight:500;color:var(--fg)} .toc ol ol a{color:var(--grey);font-weight:400}
.toc a:hover{color:var(--red)}
main{min-width:0}
h1{font-style:italic;font-size:32px;margin:0 0 8px;line-height:1.2}
h2{font-style:italic;font-size:25px;margin:0 0 10px;line-height:1.25}
h3{font-size:18px;margin:28px 0 6px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px 28px 10px;margin:0 0 22px}
a{color:var(--link);text-decoration:none;font-weight:600} a:hover{color:var(--red)}
p{margin:0 0 12px} ul,ol{margin:0 0 14px;padding-left:24px} li{margin:4px 0}
em{font-style:normal;font-weight:600}
code{font:14px ui-monospace,Consolas,monospace;background:var(--bg);border-radius:4px;padding:1px 5px}
figure{margin:16px 0 20px} figure img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
figure.small img{max-width:min(100%,480px)}
figcaption{font-size:13.5px;color:var(--grey);margin-top:6px}
.box{border-left:4px solid var(--tip-l);background:var(--tip);border-radius:6px;padding:10px 14px;margin:0 0 14px;font-size:15px}
.box.warn{border-left-color:var(--warn-l);background:var(--warn)}
.up{text-align:right;font-size:13px;margin:4px 0 10px}
.lead{font-size:17px;color:var(--grey)}
@media (max-width:900px){.wrap{grid-template-columns:1fr;gap:18px;padding:16px 14px 60px}.toc{position:static;max-height:none}section{padding:18px 16px 8px}header{padding:0 16px}}
</style></head><body>
<header><p class="wordmark"><img class="wm-logo" src="./favicon.svg" alt="" width="34" height="34"><span class="wm-text"><span class="wm-os"><span class="os">os</span><span class="vac">VAC</span> <span class="neo">neo</span></span><span class="wm-sub">BAUKASTEN</span></span></p></header>
<div class="wrap">${tocHtml}<main>
${out.join('\n').replace('\u0001TOC\u0001', '')}
</main></div>
</body></html>
`;
writeFileSync(OUT, page);
console.log(`${OUT}: ${toc.filter((t) => t.level === 2).length} Kapitel, ${toc.length} Überschriften`);
if (missing.length) {
  console.log('Bilder fehlen:', missing.join(', '));
  process.exitCode = 1;
}
