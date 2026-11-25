// Re-captures every screenshot. Run: node prototype/capture.mjs  (needs Playwright + Chromium). Headless Chromium, NOT Electron.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire('/home/amun/ptah-extension/package.json');
const { chromium } = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const url = (q) => pathToFileURL(path.join(dir, 'index.html')).href + '?shot=1&' + q;
const S = 'surface=skills&';
// [file, query, width, setup(page)]
const shots = [
  ['analyze-default-dark', 'surface=analyze&state=idle&theme=dark'],
  ['analyze-stale-light', 'surface=analyze&state=idle&theme=light&seed=stale'],
  ['settings-signin-deeplink-dark', 'surface=settings&state=deeplink&theme=dark&seed=signedout'],
  ['settings-stale-picker-light', 'surface=settings&state=view&theme=light&seed=stale'],
  ['settings-unset-dark', 'surface=settings&state=view&theme=dark&seed=unset'],
  ['skills-both-failed-narrow-dark', S + 'state=both&theme=dark&w=narrow', 420],
  ['skills-build-editor-dark', S + 'state=judged&theme=dark', 1100, async (p) => { await p.click('[data-act="bdraft"]'); await p.waitForTimeout(1000); await p.click('[data-act="draftMode"]'); }],
  ['skills-build-preview-dark', S + 'state=judged&theme=dark', 1100, async (p) => { await p.click('[data-act="bdraft"]'); await p.waitForTimeout(1000); }],
  ['skills-empty-light', S + 'state=empty&theme=light'],
  ['skills-install-consent-dark', S + 'state=judged&theme=dark', 1100, async (p) => { await p.click('[data-act="install"]'); await p.waitForTimeout(1200); }],
  ['skills-judged-dark', S + 'state=judged&theme=dark'],
  ['skills-judged-wide-dark', S + 'state=judged&theme=dark', 1440],
  ['skills-judged-light', S + 'state=judged&theme=light'],
  ['skills-judged-narrow-light', S + 'state=judged&theme=light&w=narrow', 420],
  ['skills-judged-rxjs-filter-light', S + 'state=judged&theme=light', 1100, async (p) => { await p.click('[data-act="showMore"]',{timeout:2000}).catch(()=>{}); await p.click('[data-filter="item:library:RxJS"]'); }],
  ['skills-loading-dark', S + 'state=loading&theme=dark'],
  ['skills-nojudge-confirm-replace-light', S + 'state=nojudge&theme=light', 1100, async (p) => {
    await p.click('[data-act="idraft"]'); await p.waitForTimeout(1000);
    if (await p.$('[data-act="draftMode"]:has-text("Edit")')) await p.click('[data-act="draftMode"]');
    await p.fill('#dc', 'edited by hand'); await p.click('[data-act="idraft"] >> nth=1'); }],
  ['skills-nojudge-draft-nomodel-light', S + 'state=nojudge&theme=light&gen=nomodel', 1100, async (p) => { await p.click('[data-act="idraft"]'); await p.waitForTimeout(300); }],
  ['skills-nojudge-item-search-light', S + 'state=nojudge&theme=light', 1100, async (p) => { await p.click('[data-act="isearch"]'); await p.waitForTimeout(900); }],
  ['skills-nojudge-light', S + 'state=nojudge&theme=light'],
  ['skills-partial-dark', S + 'state=partial&theme=dark'],
  ['skills-regfail-dark', S + 'state=regfail&theme=dark'],
  ['skills-rerun-blocked-stale-light', S + 'state=judged&theme=light&seed=stale', 1100, async (p) => { await p.click('[data-act="rerun"]',{timeout:3000}).catch(()=>{}); await p.waitForTimeout(300); }],
  // nearest state: the exact reset-notice trigger is not derivable from URL parameters
  ['skills-rerun-reset-light', S + 'state=judged&theme=light', 1100, async (p) => { await p.click('[data-act="rerun"]'); await p.waitForTimeout(1500); }],
];
const browser = await chromium.launch();
const errors = [];
for (const [name, q, w = 1100, setup] of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(name + ' console: ' + m.text()));
  await page.goto(url(q)); await page.waitForTimeout(400);
  try { if (setup) { await setup(page); await page.waitForTimeout(300); } } catch (e) { errors.push(name + ' setup: ' + e.message.split('\n')[0]); }
  await page.screenshot({ path: path.join(dir, 'screenshots', name + '.png'), fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name}.png  ${w}x${h}`);
  await page.close();
}
// load check: no errors for each surface and an unknown surface
for (const q of ['surface=settings', 'surface=analyze', 'surface=skills', 'surface=bogus&state=zzz']) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', (e) => errors.push(q + ': ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(q + ' console: ' + m.text()));
  await page.goto(url(q)); await page.waitForTimeout(300); await page.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
