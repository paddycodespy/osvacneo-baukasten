/**
 * Gemeinsam für die Browser-Prüfungen (test:sketches, test:ui): startet `vite preview` auf dem fertigen Build
 * (oder nimmt BASE_URL) und Chrome bzw. Chromium/Edge (CHROME_PATH, sonst gesucht, siehe findChrome).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';

async function waitForServer(url: string, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server unter ${url} antwortet nicht`);
}

/** Chrome, Chromium oder Edge finden: CHROME_PATH, übliche Orte je System, zuletzt der Browser von `npx playwright install chromium`. */
function playwrightVersion(): string {
  try {
    return JSON.parse(readFileSync('node_modules/playwright-core/package.json', 'utf8')).version;
  } catch {
    return 'latest';
  }
}

export function findChrome(): string {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH zeigt auf ${process.env.CHROME_PATH}, dort liegt kein Browser.`);
  }
  const home = os.homedir();
  const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[];
  const candidates = [
    // Linux
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/usr/bin/microsoft-edge', '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Windows
    ...pf.flatMap((d) => [path.join(d, 'Google/Chrome/Application/chrome.exe'), path.join(d, 'Microsoft/Edge/Application/msedge.exe')]),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  // von Playwright heruntergeladen (npx playwright install chromium)
  const cache = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : process.platform === 'darwin' ? path.join(home, 'Library/Caches/ms-playwright') : path.join(home, '.cache/ms-playwright');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe']) {
        const f = path.join(cache, d, sub);
        if (existsSync(f)) return f;
      }
    }
  }
  throw new Error(
    'Kein Chrome, Chromium oder Edge gefunden. Eine der Möglichkeiten:\n' +
      '  • Browser installieren, z. B. unter Linux Mint/Ubuntu: sudo apt install chromium\n' +
      `  • oder nur für die Prüfungen: npx playwright@${playwrightVersion()} install chromium\n` +
      '  • oder Pfad angeben: CHROME_PATH=/pfad/zum/chrome npm run …',
  );
}

export async function withPreview<T>(port: number, run: (url: string, browser: Browser) => Promise<T>): Promise<T> {
  const chrome = findChrome();
  let server: ChildProcess | null = null;
  let url = process.env.BASE_URL;
  if (!url) {
    if (!existsSync('dist/index.html')) throw new Error('Kein Build gefunden: zuerst „npm run build“ ausführen.');
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
    url = `http://localhost:${port}/`;
  }
  // WebGL per Software, damit die 3D-Vorschau auch ohne Grafikkarte läuft
  const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await waitForServer(url);
    return await run(url, browser);
  } finally {
    await browser.close();
    server?.kill();
  }
}
