// Builds design-preview.html for TASK_2026_906 (PR #1038) from real Electron captures.
// Usage (repository root):
//   node .ptah/specs/TASK_2026_906_22a0/build-design-preview.mjs [shots-dir]
// Reads design-preview-defects.json (same folder). Embeds the JPEG files as data URIs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = resolve(
  process.argv[2] ?? 'dist/apps/ptah-electron-e2e/git-dock-preview-shots',
);
const data = JSON.parse(
  readFileSync(join(here, 'design-preview-defects.json'), 'utf8'),
);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// [group heading, [[file stem, caption, note?], ...]]
const groups = [
  ['1. Git dock docked, with changes', [
    ['01-docked', 'Main window. The Git dock is in its default position. The new Detach button is at the right end of the dock header.'],
    ['01b-docked-header', 'Close-up of the dock header with the Detach button.'],
    ['01c-detach-focus', 'Keyboard focus on the Detach button.'],
  ]],
  ['2. Git dock detached into its own window', [
    ['02-detached-window', 'The Git window (a second BrowserWindow), opened in each theme. It reads Git data through the real RPC handlers.'],
    ['02x-detached-theme-not-followed', 'Theme not followed: the Git window opened in the dark theme, then the main window changed to Ptah Glass Light. The Git window stays dark.'],
  ]],
  ['3. Main window while the dock is detached (the detached rail)', [
    ['03-main-detached-rail', 'Main window. A separate 96 px rail replaces the dock.', 'deviation'],
    ['03b-rail-close-up', 'Close-up of the rail: label, Focus and Attach.'],
    ['03c-rail-focus-ring', 'Keyboard focus in the rail.'],
  ]],
  ['4. Re-dock', [
    ['04-redocked-after-attach', 'After the Attach button of the rail: the Git window closed and the dock is back.'],
    ['04b-redocked-after-window-close', 'After the user closed the Git window: the dock is back.'],
  ]],
  ['5. Empty, loading and error states', [
    ['05a-docked-no-changes', 'Repository with no changes, docked.'],
    ['05a-detached-no-changes', 'Repository with no changes, detached.'],
    ['06-docked-no-repository', 'Folder that is not a repository, docked.'],
    ['06b-detached-no-repository', 'Folder that is not a repository, detached.'],
    ['05b-child-first-paint', 'First paint of the Git window, before the review shell loads (dark only).'],
    ['05c-detached-pull-error', 'Git window after a failed Pull in a repository with no remote (error state).'],
  ]],
];

const uri = (stem) => {
  const file = join(shots, `${stem}.jpg`);
  return existsSync(file)
    ? `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
    : null;
};
const skip = new Set(data.omit ?? []);
const figures = groups
  .map(([heading, frames]) => {
    const body = frames
      .map(([stem, caption, flag]) => {
        const cells = ['dark', 'light']
          .filter((mode) => !skip.has(`${mode}-${stem}`))
          .map((mode) => {
            const src = uri(`${mode}-${stem}`);
            const label = mode === 'dark' ? 'Dark (default)' : 'Ptah Glass Light';
            return src
              ? `<figure><img loading="lazy" src="${src}" alt="${esc(caption)} ${label}"><figcaption>${label}</figcaption></figure>`
              : '';
          })
          .join('');
        if (!cells) return '';
        const note = flag === 'deviation'
          ? `<aside class="deviation"><strong>Decision 16 deviation — your decision.</strong> ${esc(data.deviation)}</aside>`
          : '';
        return `<div class="frame"><h3>${esc(caption)}</h3>${note}<div class="pair">${cells}</div></div>`;
      })
      .join('');
    return body ? `<section><h2>${esc(heading)}</h2>${body}</section>` : '';
  })
  .join('\n');

const list = (items, empty) =>
  items?.length
    ? items.map((d) => `<li><strong>${esc(d.title)}</strong> — ${esc(d.detail)} <em>${esc(d.where ?? '')}</em></li>`).join('')
    : `<li>${esc(empty)}</li>`;

const title = 'Design preview — detachable Git dock (PR #1038)';
const html = `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{--b1:#12141a;--b2:#1a1d25;--b3:#2a2e39;--bc:#e8e6df;--bcm:#a09d94;--ptah-gold:#d4af37;--ptah-link:#8ab4f8;--state-ink-err:#f0857a}
html[data-theme=light]{--b1:#faf8f3;--b2:#f1eee6;--b3:#dcd7ca;--bc:#22201b;--bcm:#6b675d;--ptah-gold:#8a6d12;--ptah-link:#1a55b0;--state-ink-err:#a8261a}
*{box-sizing:border-box}
body{margin:0;background:var(--b1);color:var(--bc);font:15px/1.55 system-ui,"Segoe UI",sans-serif}
main{max-width:1240px;margin:0 auto;padding:28px 20px 48px}
p.kicker{margin:0;color:var(--ptah-gold);font-size:12px;letter-spacing:.14em;text-transform:uppercase}
h1{margin:6px 0 8px;font-size:clamp(22px,3.4vw,32px);line-height:1.15;text-wrap:balance}
header p{margin:0;color:var(--bcm);max-width:78ch}
section{margin-top:32px;padding-top:20px;border-top:1px solid var(--b3)}
h2{margin:0 0 4px;font-size:18px}
h3{margin:18px 0 10px;font-size:14px;font-weight:600;color:var(--bcm)}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;align-items:start}
figure{margin:0;background:var(--b2);border:1px solid var(--b3);border-radius:10px;padding:10px}
img{display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto}
figcaption{margin-top:8px;font-size:12px;color:var(--bcm);letter-spacing:.06em;text-transform:uppercase}
.deviation{margin:0 0 12px;padding:12px 14px;border:1px solid var(--ptah-gold);border-left-width:4px;border-radius:8px;background:var(--b2);max-width:90ch}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.notes>div{background:var(--b2);border:1px solid var(--b3);border-radius:10px;padding:16px}
.notes h2{font-size:15px;margin-bottom:8px}
ul{margin:0;padding-left:18px}li{margin:8px 0}em{color:var(--bcm)}
a{color:var(--ptah-link)}
</style></head><body><main>
<header><p class="kicker">TASK_2026_906 · Electron</p>
<h1>${title}</h1>
<p>Real captures from the Electron app (Playwright, real RPC handlers, scratch repository). No mock-ups. Themes: the default dark theme and Ptah Glass Light. Captured at PR head ${esc(data.head)}. <a href="https://github.com/Hive-Academy/PtahCode/pull/1038">Open PR #1038</a></p></header>
${figures}
<section class="notes">
<div><h2>Visual defects seen in the captures</h2><ul>${list(data.defects, 'No defect recorded.')}</ul></div>
<div><h2>States with no capture</h2><ul>${list(data.notCaptured, 'All planned states have a capture.')}</ul></div>
</section>
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
