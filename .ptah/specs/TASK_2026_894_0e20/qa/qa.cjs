// Visual QA helper: connects to the Electron renderer over CDP (port 9333).
// Usage: node qa.cjs <cmd> [args]
//   shot <name> [w] [h]   viewport (optional) + screenshot to qa/<name>.png
//   click <selector>      click the first match
//   role <name>           click the button with this accessible name
//   eval <js>             evaluate an expression, print JSON
//   measure [w] [h]       print the grid / card geometry
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../../node_modules/playwright-core'));

async function page() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const pages = browser.contexts().flatMap((c) => c.pages());
  const p = pages.find((x) => !x.url().startsWith('devtools://')) ?? pages[0];
  if (!p) throw new Error('no renderer page');
  return { browser, p };
}

const MEASURE = `(() => {
  const grids = [...document.querySelectorAll('[data-testid="cli-provider-grid"]')];
  const out = { viewport: [innerWidth, innerHeight], theme: document.documentElement.getAttribute('data-theme'), grids: [] };
  for (const g of grids) {
    const cards = [...g.querySelectorAll('[data-testid^="cli-provider-card-"]')];
    const rects = cards.map((c) => c.getBoundingClientRect());
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
    const perRow = tops.length ? rects.filter((r) => Math.round(r.top) === tops[0]).length : 0;
    out.grids.push({
      gridWidth: Math.round(g.getBoundingClientRect().width),
      columns: getComputedStyle(g.firstElementChild ?? g).gridTemplateColumns || getComputedStyle(g).gridTemplateColumns,
      cards: cards.length, perRow,
      sizes: [...new Set(rects.map((r) => Math.round(r.width) + 'x' + Math.round(r.height)))],
      scrolling: cards.filter((c) => [...c.querySelectorAll('*')].concat(c).some((e) => e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))).map((c) => c.dataset.testid),
      clipped: cards.filter((c) => c.scrollHeight > c.clientHeight + 1).map((c) => c.dataset.testid + ':' + c.scrollHeight + '>' + c.clientHeight),
      overlap: cards.flatMap((c) => {
        const body = c.querySelector('.card-body');
        if (!body) return [];
        const kids = [...body.children].filter((k) => k.getBoundingClientRect().height > 0);
        const bad = kids.filter((k) => k.scrollHeight > k.clientHeight + 1 || [...k.querySelectorAll('*')].some((d) => d.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 1));
        return bad.map((k) => c.dataset.testid + ':' + (k.className || k.tagName).toString().slice(0, 40));
      }),
    });
  }
  return out;
})()`;

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const { browser, p } = await page();
  try {
    if ((cmd === 'shot' || cmd === 'measure') && args[cmd === 'shot' ? 1 : 0]) {
      const i = cmd === 'shot' ? 1 : 0;
      await p.setViewportSize({ width: Number(args[i]), height: Number(args[i + 1] ?? 1000) });
      await p.waitForTimeout(600);
    }
    if (cmd === 'shot') {
      const file = path.join(__dirname, `${args[0]}.png`);
      await p.screenshot({ path: file, fullPage: false });
      console.log('WROTE', file);
    } else if (cmd === 'click') {
      await p.locator(args[0]).first().click();
      await p.waitForTimeout(500);
      console.log('clicked', args[0]);
    } else if (cmd === 'role') {
      await p.getByRole('button', { name: args[0], exact: true }).first().click();
      await p.waitForTimeout(800);
      console.log('clicked button', args[0]);
    } else if (cmd === 'eval') {
      console.log(JSON.stringify(await p.evaluate(args.join(' ')), null, 1));
    } else if (cmd === 'measure') {
      console.log(JSON.stringify(await p.evaluate(MEASURE), null, 1));
    } else {
      console.log('url', p.url());
    }
  } finally {
    // Do not call browser.close(): it can send Browser.close and quit Electron. Exit only this process.
    void browser;
  }
})().then(() => process.exit(0), (e) => { console.error(String(e && e.stack || e)); process.exit(1); });
