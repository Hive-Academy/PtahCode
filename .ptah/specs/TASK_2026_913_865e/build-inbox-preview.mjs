// Builds one self-contained design preview page per page of TASK_2026_913.
// Usage: node build-inbox-preview.mjs <repo root> <machines|reviews>
// Input: real captures from apps/ptah-electron-e2e/src/design-preview/inbox.preview.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = process.argv[2];
const pageId = process.argv[3];
const sharp = createRequire(join(root, 'package.json'))('sharp');
const shots = join(root, 'dist/apps/ptah-electron-e2e/design-preview');
const out = join(root, `.ptah/specs/TASK_2026_913_865e/design-preview-${pageId}.html`);
const LIMIT = 2 * 1024 * 1024 - 64 * 1024;

const PAGES = {
  machines: {
    title: 'Design preview — Machines (new Inbox design)',
    lead: 'The Machines page now uses the approved option A "Inbox" layout: a 280 px machine list and one detail pane. All captures come from the real Electron build of branch feat/reviews-machines-inbox-layout.',
    pairs: [
      ['Main state, dark theme', 'machines-main-dark', 'machines-prototype-dark'],
      ['Main state, light theme', 'machines-main-light', 'machines-prototype-light'],
    ],
    singles: [
      ['Readiness after a check, dark theme (sample result)', 'machines-readiness-dark'],
      ['Readiness after a check, light theme (sample result)', 'machines-readiness-light'],
      ['Closed Readiness tile after a check, dark theme: the result shows on the tile', 'machines-readiness-closed-dark'],
      ['Closed Readiness tile after a check, light theme', 'machines-readiness-closed-light'],
      ['Error state, dark theme: the machine list did not load', 'machines-error-dark'],
      ['Error state, light theme', 'machines-error-light'],
      ['Empty state, dark theme (real data: the fixture workspace has no machines)', 'machines-empty-dark'],
      ['Empty state, light theme', 'machines-empty-light'],
      ['Narrow window, 720 px: one pane with the "All machines" back button', 'machines-narrow-dark'],
    ],
    sample: 'The populated captures use SAMPLE DATA. The capture script puts four sample machines, three sample sessions, one waiting tool approval and one readiness result into the real MachinesStore and readiness panel. The sample machines do not exist in the backend, so the script also clears the real "not found" error of the session list. The error state uses a sample error message. The layout, components and styles are the real build.',
    diffs: [
      'The app shows its top navigation bar and the Workspaces and Git rails around the page. The prototype shows only the page.',
      'The app uses the glass theme surfaces (rounded panes, gold primary action). The prototype uses plain DaisyUI surfaces with a blue primary action.',
      'Not a chrome or theme difference, open: the approval card uses the block of the session view ("Waiting for you", a table with machine, tool and arguments, "Denied automatically in 42 s"). The prototype shows a compact card ("Approval waiting", "42 s left of 60 s"). The built card has the "Allow once" and "Deny" actions.',
      'Not a chrome or theme difference, open: small text differences. The header line shows "via SSH alias build" (prototype: "ssh: build").',
      'Not a chrome or theme difference, open: the closed Readiness tile shows the result ("7 of 7 passed") only after the first check of the machine in this visit. Before that, it shows its description line. The prototype shows the result immediately. An automatic check on machine change needs a follow-up task.',
    ],
  },
  reviews: {
    title: 'Design preview — Reviews (new Inbox design)',
    lead: 'The Reviews page now uses the approved option A "Inbox" layout: repositories 240 px, runs 340 px and the run detail. All captures come from the real Electron build of branch feat/reviews-machines-inbox-layout.',
    pairs: [
      ['Main state, dark theme', 'reviews-main-dark', 'reviews-prototype-dark'],
      ['Main state, light theme', 'reviews-main-light', 'reviews-prototype-light'],
    ],
    singles: [
      ['Error state, dark theme: the run list did not load', 'reviews-error-dark'],
      ['Error state, light theme', 'reviews-error-light'],
      ['Empty state, dark theme (real data: the fixture workspace has no review runs)', 'reviews-empty-dark'],
      ['Empty state, light theme', 'reviews-empty-light'],
      ['Medium window, 1100 px: the repositories pane becomes the repository select', 'reviews-medium-dark'],
    ],
    sample: 'The populated captures use SAMPLE DATA. The capture script puts four sample repositories (live, dry run, paused, disabled), eight sample runs and a next-page cursor into the real ReviewRunsStore. The layout, components and styles are the real build.',
    diffs: [
      'The app shows its top navigation bar and the Workspaces and Git rails around the page. The prototype shows only the page.',
      'The app uses the glass theme surfaces (gold primary action). The prototype uses plain DaisyUI surfaces with a blue primary action.',
      'Not a chrome or theme difference, open: the header line has no attempt number ("Attempt 2" in the prototype). The run contract has only an attempt ID, not a number. The attempt ID is the tooltip of the line.',
      'Not a chrome or theme difference, open: the coverage tile counts the lenses that ran ("4 of 4 lenses completed"), from the lens records of the run. The run contract has no set of selected lenses, so a lens that was selected but did not start is not in the count. The tile shows "Lens count unavailable" when the run has no lens record. The strings of the coverage field show as "Coverage notes".',
      'Not a chrome or theme difference, owned by PR #1040: the Findings section is the current content of the branch, not the prototype table. PR #1040 replaces it with interactive cards.',
      'Not a chrome or theme difference, kept because they are real functions: "Review settings", the "All states" filter, the queued count and the "Last refreshed" line. The "Walkthrough preview" and "Artifacts" sections of the current product stay below the findings.',
    ],
  },
};

const page = PAGES[pageId];
if (!page) throw new Error(`unknown page ${pageId}`);

const names = [...page.pairs.flatMap(([, a, b]) => [a, b]), ...page.singles.map(([, a]) => a)];
async function encode(quality, width) {
  const map = {};
  for (const name of names) {
    const buf = await sharp(join(shots, `${name}.png`)).resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    map[name] = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  return map;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function render(images) {
  const fig = (name, label) => `<figure><img src="${images[name]}" alt="${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`;
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<style>
:root{--b1:#12110f;--b2:#1a1917;--b3:#2a2825;--bc:#ece8df;--bcm:#a39d90;--ptah-gold:#d4a84b;--surface-highlight:rgba(255,255,255,.06)}
:root[data-theme=light]{--b1:#faf8f3;--b2:#f1eee6;--b3:#dcd7ca;--bc:#22201b;--bcm:#6b665a;--ptah-gold:#8a6510;--surface-highlight:rgba(0,0,0,.04)}
*{box-sizing:border-box}
body{margin:0;background:var(--b1);color:var(--bc);font:15px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
main{max-width:1500px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:32px 0 10px;color:var(--ptah-gold)}h3{font-size:14px;margin:0 0 8px}
p{margin:0 0 10px}.lead{color:var(--bcm);max-width:80ch}
.note{border:1px solid var(--b3);border-left:3px solid var(--ptah-gold);background:var(--b2);border-radius:8px;padding:10px 14px;max-width:100ch}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}
article{margin:0 0 22px}
figure{margin:0;background:var(--b2);border:1px solid var(--b3);border-radius:10px;overflow:hidden}
img{display:block;width:100%;height:auto}
figcaption{padding:8px 12px;font-size:13px;color:var(--bcm);border-top:1px solid var(--b3)}
figcaption b{color:var(--bc)}
ol{padding-left:22px;max-width:100ch}li{margin:0 0 6px}
.single{max-width:1100px}
</style>
</head>
<body>
<main>
<h1>${esc(page.title)}</h1>
<p class="lead">${esc(page.lead)}</p>
<p class="note"><b>Sample data.</b> ${esc(page.sample)}</p>
<h2>Built page and approved prototype</h2>
${page.pairs.map(([title, built, proto]) => `<article><h3>${esc(title)}</h3><div class="cols">${fig(built, 'Built page — real Electron capture')}${fig(proto, 'Approved prototype — capture of the prototype file')}</div></article>`).join('\n')}
<h2>Other states of the built page</h2>
${page.singles.map(([title, name]) => `<article class="single"><h3>${esc(title)}</h3>${fig(name, 'Built page — real Electron capture')}</article>`).join('\n')}
<h2>Remaining differences from the prototype</h2>
<ol>${page.diffs.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
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
  if (data?.type !== 'theme' || !['light', 'dark'].includes(data.mode) || typeof data.nonce !== 'string' || !data.vars || typeof data.vars !== 'object') return;
  nonce = data.nonce;
  document.documentElement.dataset.theme = data.mode;
  for (const [name, value] of Object.entries(data.vars)) {
    if (typeof value === 'string') document.documentElement.style.setProperty(name, value);
  }
  sendHeight();
});
new ResizeObserver(sendHeight).observe(document.documentElement);
</script>
</body>
</html>
`;
}

let html = '';
for (const [quality, width] of [[82, 1600], [76, 1600], [72, 1400], [66, 1280], [58, 1200]]) {
  html = render(await encode(quality, width));
  if (Buffer.byteLength(html) <= LIMIT) break;
}
if (Buffer.byteLength(html) > LIMIT) throw new Error('page is larger than 2 MiB');
writeFileSync(out, html);
console.log(out, Buffer.byteLength(html), 'bytes');
