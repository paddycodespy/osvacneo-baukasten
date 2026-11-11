/**
 * Gemeinsam für die Browser-Prüfungen (test:sketches, test:ui): startet `vite preview` auf dem fertigen Build
 * (oder nimmt BASE_URL) und Chrome (CHROME_PATH oder /usr/bin/google-chrome).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
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

export async function withPreview<T>(port: number, run: (url: string, browser: Browser) => Promise<T>): Promise<T> {
  let server: ChildProcess | null = null;
  let url = process.env.BASE_URL;
  if (!url) {
    if (!existsSync('dist/index.html')) throw new Error('Kein Build gefunden: zuerst „npm run build“ ausführen.');
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
    url = `http://localhost:${port}/`;
  }
  const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
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
