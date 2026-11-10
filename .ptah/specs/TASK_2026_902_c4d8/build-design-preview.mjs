// Builds design-preview.html from the real Electron captures (TASK_2026_902).
// Usage: node .ptah/specs/TASK_2026_902_c4d8/build-design-preview.mjs <shots dir> [defects.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
const defectsFile = process.argv[3];
const defects = defectsFile && existsSync(defectsFile) ? JSON.parse(readFileSync(defectsFile, 'utf8')) : [];

const frames = [
  ['02-panel-summary-filters', 'Findings panel: run summary, filter bar and finding cards.'],
  ['03-card-collapsed', 'Finding card, details collapsed: severity, lens, confidence, impact and evidence list.'],
  ['04-card-expanded', 'Finding card, details expanded: failure mode, scenario, affected caller and fix prompt.'],
  ['05-reply-box', 'Reply box: the text goes to the GitHub thread of the finding.'],
  ['06-dismiss-reason', 'Dismiss with an optional reason.'],
  ['07-accepted', 'Accepted state: Accept and Dismiss are inactive.'],
  ['08-dismissed', 'Dismissed state.'],
  ['09-panel-after-triage', 'Panel after triage: the summary counts the accepted and dismissed findings.'],
  ['01-window', 'Full Electron window with the run detail open.'],
];

const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (mode, name) => {
  const file = join(shots, `${mode}-${name}.jpg`);
  if (!existsSync(file)) return null;
  return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
};

const figures = frames
  .map(([name, caption]) => {
    const cells = ['dark', 'light']
      .map((mode) => {
        const src = img(mode, name);
        return src
          ? `<figure><img src="${src}" alt="${esc(caption)} (${mode} theme)" loading="lazy"><figcaption>${mode === 'dark' ? 'Dark' : 'Light'}</figcaption></figure>`
          : '';
      })
      .join('');
    return cells ? `<section class="frame"><h2>${esc(caption)}</h2><div class="pair">${cells}</div></section>` : '';
  })
  .join('\n');

const defectList = defects.length
  ? defects.map((d) => `<li><strong>${esc(d.title)}</strong> — ${esc(d.detail)} <em>${esc(d.state)}</em></li>`).join('')
  : '<li>No comparison with the UX brief is recorded.</li>';

const html = `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design preview — interactive review findings (PR #1040)</title>
<style>
:root{--b1:#12141a;--b2:#1a1d25;--b3:#2a2e39;--bc:#e8e6df;--bcm:#a09d94;--ptah-gold:#d4af37;--ptah-link:#8ab4f8}
html[data-theme=light]{--b1:#faf8f3;--b2:#f1eee6;--b3:#dcd7ca;--bc:#22201b;--bcm:#6b675d;--ptah-gold:#8a6d12;--ptah-link:#1a55b0}
*{box-sizing:border-box}
body{margin:0;background:var(--b1);color:var(--bc);font:15px/1.55 system-ui,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 20px 48px}
header p.kicker{margin:0;color:var(--ptah-gold);font-size:12px;letter-spacing:.14em;text-transform:uppercase}
h1{margin:6px 0 8px;font-size:clamp(22px,3.4vw,32px);line-height:1.15;text-wrap:balance}
header p{margin:0;color:var(--bcm);max-width:70ch}
h2{margin:0 0 12px;font-size:15px;font-weight:600}
.frame{margin-top:28px;padding-top:20px;border-top:1px solid var(--b3)}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;align-items:start}
figure{margin:0;background:var(--b2);border:1px solid var(--b3);border-radius:10px;padding:10px}
img{display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto}
figcaption{margin-top:8px;font-size:12px;color:var(--bcm);letter-spacing:.06em;text-transform:uppercase}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:28px}
.notes section{background:var(--b2);border:1px solid var(--b3);border-radius:10px;padding:16px}
ul{margin:0;padding-left:18px}li{margin:6px 0}em{color:var(--bcm)}
a{color:var(--ptah-link)}
</style></head><body><main>
<header><p class="kicker">TASK_2026_902 · Electron renderer</p>
<h1>Design preview — interactive review findings (PR #1040)</h1>
<p>Real captures from the Electron app (Playwright, e2e fake RPC listener, sample data). No mock-ups. Themes: the default dark theme and Ptah Glass Light. <a href="https://github.com/Hive-Academy/PtahCode/pull/1040">Open PR #1040</a></p></header>
${figures}
<div class="notes">
<section><h2>Not done</h2><ul>
<li>Persistent triage state: accepted and dismissed are session-local. A reload of the app clears them.</li>
<li>Send-to-lane RPC: the card has "Copy fix prompt" (clipboard) only.</li>
<li>Thread resolved state belongs to TASK_2026_901.</li>
</ul></section>
<section><h2>Visual defects against the UX brief (PR #1018)</h2><ul>${defectList}</ul></section>
</div>
</main>
<script>
let nonce = null;
const sendHeight = () => {
  if (!nonce) return;
  const px = Math.max(160, Math.min(1600, Math.ceil(document.documentElement.scrollHeight)));
  parent.postMessage({ type: 'height', px, nonce }, '*');
};
addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const data = event.data;
  if (data?.type !== 'theme' || !['light', 'dark'].includes(data.mode) ||
      typeof data.nonce !== 'string' || !data.vars || typeof data.vars !== 'object') return;
  nonce = data.nonce;
  document.documentElement.dataset.theme = data.mode;
  for (const [name, value] of Object.entries(data.vars)) {
    if (typeof value === 'string') document.documentElement.style.setProperty(name, value);
  }
  sendHeight();
});
new ResizeObserver(sendHeight).observe(document.documentElement);
addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  const url = new URL(link.href, location.href);
  if (!['http:', 'https:'].includes(url.protocol)) return;
  event.preventDefault();
  if (nonce) parent.postMessage({ type: 'open-link', url: url.href, nonce }, '*');
});
</script></body></html>
`;
const out = join(here, 'design-preview.html');
writeFileSync(out, html);
console.log(`${out} ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB`);
