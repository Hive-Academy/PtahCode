const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../../node_modules/playwright-core'));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const p = b.contexts().flatMap((c) => c.pages()).find((x) => !x.url().startsWith('devtools://'));
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.getByRole('button', { name: 'Providers', exact: true }).first().click();
  await p.waitForTimeout(1500);
  const t = p.locator('button:has-text("Uninstalled CLI agents")').first();
  const before = await t.evaluate((e) => ({ exp: e.getAttribute('aria-expanded'), c: getComputedStyle(e, '::before').content, tr: getComputedStyle(e, '::before').transform }));
  await t.click(); await p.waitForTimeout(400);
  const after = await t.evaluate((e) => ({ exp: e.getAttribute('aria-expanded'), tr: getComputedStyle(e, '::before').transform }));
  await t.click(); await p.waitForTimeout(400);
  console.log('uninstalled', JSON.stringify({ before, after }));
  await p.locator('[data-testid=cli-provider-card-codex] button:has-text("Test")').first().focus();
  const seq = [];
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Shift+Tab'); await p.waitForTimeout(150);
    seq.push(await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return (e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 30) + ' | outline=' + s.outlineStyle + ' ' + s.outlineWidth + ' shadow=' + (s.boxShadow !== 'none'); }));
  }
  console.log(seq.join('\n'));
  await p.locator('[data-testid=cli-provider-card-codex]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(__dirname, 'r2-focus-glass-1600.png') });
  process.exit(0);
})().catch((e) => { console.error(String(e)); process.exit(1); });
