// node scroll-shot.cjs <selector> <name> <w> <h>: set viewport, scroll selector to top, screenshot.
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../../node_modules/playwright-core'));
(async () => {
  const [sel, name, w, h] = process.argv.slice(2);
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const p = b.contexts().flatMap((c) => c.pages()).find((x) => !x.url().startsWith('devtools://'));
  await p.setViewportSize({ width: Number(w), height: Number(h) });
  await p.waitForTimeout(500);
  await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(__dirname, name + '.png') });
  console.log('WROTE', name);
})().then(() => process.exit(0), (e) => { console.error(String(e)); process.exit(1); });
