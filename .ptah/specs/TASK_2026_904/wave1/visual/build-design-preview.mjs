import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
const snap = join(root, '.ptah/specs/TASK_2026_904/wave1/visual/snapshots');
const out = join(root, '.ptah/specs/TASK_2026_904/wave1/visual/design-preview.html');
const uri = (name) => 'data:image/png;base64,' + readFileSync(join(snap, name)).toString('base64');

const images = {
  machinesDark: uri('machines-add-before-dark-glass.png'),
  machinesLight: uri('machines-add-before-light-glass.png'),
  reviewDark: uri('review-settings-before-dark-glass.png'),
  reviewLight: uri('review-settings-before-light-glass.png'),
  analyze: uri('analyze-ready-dark-solid.png'),
  header: uri('ready-workspace-dark-glass.png'),
  rail: uri('chat-rail-expanded-dark-glass.png'),
  railFocus: uri('chat-rail-focus-dark-glass.png'),
};

const pair = (id, title, where, adopted) => `
<article class="pair">
  <header><h3>${title}</h3><p>${where}</p></header>
  <div class="cols">
    <figure><img data-img="${id}" alt="${title}, capture from the build before Wave 1"><figcaption><b>Before</b> build without Wave 1</figcaption></figure>
    <figure><img data-img="${id}" alt="${title}, the render after Wave 1 is pixel-identical to this capture"><figcaption><b>After</b> build with Wave 1 <span class="px">0 px changed</span></figcaption></figure>
  </div>
  <p class="note">${adopted}</p>
</article>`;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design preview — machines and reviews, Wave 1</title>
<style>
:root{--b1:#12110f;--b2:#1a1917;--b3:#2a2825;--bc:#ece8df;--bcm:#a39d90;--ptah-gold:#d4a84b;--ptah-link:#d4a84b;--state-ink-done:#6fbf8b;--surface-highlight:rgba(255,255,255,.06)}
:root[data-theme=light]{--b1:#faf8f3;--b2:#f1eee6;--b3:#dcd7ca;--bc:#22201b;--bcm:#6b665a;--ptah-gold:#8a6510;--ptah-link:#8a6510;--state-ink-done:#1f7a45;--surface-highlight:rgba(0,0,0,.04)}
*{box-sizing:border-box}
body{margin:0;background:var(--b1);color:var(--bc);font:15px/1.55 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 20px 48px}
h1{font-size:clamp(1.5rem,3.4vw,2.2rem);line-height:1.15;margin:0 0 6px;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:1.15rem;margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--b3)}
h3{font-size:1rem;margin:0}
p{margin:6px 0}
.eyebrow{font:600 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ptah-gold)}
.lede{font-size:1.05rem;max-width:68ch;color:var(--bc)}
.muted,.note,figcaption,header p{color:var(--bcm);font-size:.88rem}
.verdict{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--b3);border:1px solid var(--b3);border-radius:10px;overflow:hidden;margin:20px 0 0}
.verdict div{background:var(--b2);padding:14px 16px}
.verdict b{display:block;font:600 1.6rem/1.1 ui-monospace,Consolas,monospace;font-variant-numeric:tabular-nums;color:var(--bc)}
.verdict span{font-size:.8rem;color:var(--bcm)}
.pair{background:var(--b2);border:1px solid var(--b3);border-radius:12px;padding:16px;margin:14px 0}
.pair header{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin-bottom:12px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
figure{margin:0}
img{display:block;max-width:100%;height:auto;border:1px solid var(--b3);border-radius:8px;background:var(--b1)}
figcaption{margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
figcaption b{color:var(--bc)}
.px{font:600 11px/1 ui-monospace,Consolas,monospace;color:var(--state-ink-done);border:1px solid currentColor;border-radius:999px;padding:3px 8px}
.parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.part{background:var(--b2);border:1px solid var(--b3);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px}
code{font:12.5px ui-monospace,Consolas,monospace;background:var(--surface-highlight);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
ul{margin:6px 0;padding-left:18px}
li{margin:3px 0}
.next{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1px;background:var(--b3);border:1px solid var(--b3);border-radius:12px;overflow:hidden;list-style:none;padding:0}
.next li{background:var(--b2);margin:0;padding:12px 14px}
.next b{display:block}
.next span{color:var(--bcm);font-size:.86rem}
button.theme{font:inherit;font-size:.82rem;color:var(--bc);background:var(--b2);border:1px solid var(--b3);border-radius:8px;padding:6px 12px;cursor:pointer}
button.theme:focus-visible{outline:2px solid var(--ptah-gold);outline-offset:2px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 0}
</style>
</head>
<body>
<main>
<p class="eyebrow">TASK_2026_904 · Wave 1 · PR #1042</p>
<h1>Design preview — machines and reviews, Wave 1</h1>
<p class="lede">Wave 1 is a zero-pixel extraction by design: it moves existing markup into shared components and changes nothing that you can see.</p>
<p class="muted">All images are real Electron captures (1600 × 1000, glass theme) from the Wave 1 visual gate. No mock-ups.</p>
<div class="verdict">
  <div><b>18 / 18</b><span>captured states equal to the baseline</span></div>
  <div><b>0 px</b><span>changed on every state</span></div>
  <div><b>3</b><span>extracted components</span></div>
  <div><b>5</b><span>machines and reviews buttons adopted</span></div>
</div>
<div class="bar">
  <button class="theme" type="button" id="swap" aria-pressed="false">Show light captures</button>
  <span class="muted">Switches the machines and reviews captures between the dark and the light theme.</span>
</div>

<h2>Machines and reviews: before and after</h2>
<p class="muted">The gate compares the new render to the baseline capture and fails on one changed pixel. It keeps no second file when the two are equal, so each pair shows the same capture.</p>
${pair('machines', 'Machines — add machine pane', '/machines, empty list, add pane open', 'Adopted: Pair and Cancel in the add pane, and the Add machine button of the list, now use the extracted setup action.')}
${pair('review', 'Reviews — review settings drawer', '/review-runs, settings drawer open', 'Adopted: Close and Retry now use the extracted setup action. Save review settings stays local because no extracted look has its exact size.')}

<h2>Extracted components</h2>
<div class="parts">
  <section class="part">
    <h3>Setup action</h3>
    <p><code>button[ptahSetupAction]</code> — looks <code>primaryCompact</code>, <code>primaryFull</code>, <code>ghost</code>, <code>glass</code>.</p>
    <img data-img="analyze" alt="Onboarding analyze page with the Start analysis action">
    <p class="note">Source: onboarding analyze page (full window shown) and the resume banner.</p>
  </section>
  <section class="part">
    <h3>Setup field</h3>
    <p><code>select[ptahSetupField]</code> — looks <code>model</code>, <code>workspace</code>.</p>
    <img data-img="header" alt="Workspace header with the open folder select">
    <p class="note">Source: workspace header select (crop) and the generation model picker.</p>
  </section>
  <section class="part">
    <h3>Rail icon action</h3>
    <p><code>button[ptahRailIconAction]</code> — compact icon button with label, pressed and disabled state.</p>
    <img data-img="rail" alt="Canvas rail header with the dense cards and collapse icon buttons">
    <img data-img="railFocus" alt="Canvas rail header with keyboard focus on the dense cards button">
    <p class="note">Source: canvas rail header (crop). Second capture: keyboard focus.</p>
  </section>
</div>
<p class="muted">Deferred to Wave 1b (no machines or reviews consumer in the plan): chat send/stop, composer layout, suggestions frame, glass menu.</p>

<h2>Next: Wave 2 — the visible changes</h2>
<p class="muted">Wave 2 brings the look of the polished pages to machines and reviews. Planned rows from <code>component-system-plan.md</code>:</p>
<ul class="next">
  <li><b>Status chip</b><span>Reviews run status and machines connection status. Source: canvas rail chips.</span></li>
  <li><b>Stat tile</b><span>Reviews summary, if the anatomy fits. Source: chat session stats.</span></li>
  <li><b>Confirm dialog</b><span>Reviews destructive actions and machines removal. Source: setup confirmation dialog.</span></li>
  <li><b>State panel</b><span>Machines no-connection and error, reviews no-runs. Source: onboarding status card.</span></li>
  <li><b>List row</b><span>Machines rows and reviews repository rows. Source: agent recommendation list.</span></li>
  <li><b>Page header and toolbar</b><span>Reviews title and action row, machines heading. Source: onboarding home header.</span></li>
  <li><b>Card</b><span>Machines connection card and reviews run card. Source: onboarding path tile.</span></li>
</ul>
</main>
<script>
const IMG = ${JSON.stringify(images)};
let light = false;
const paint = () => {
  for (const el of document.querySelectorAll('img[data-img]')) {
    const k = el.dataset.img;
    el.src = k === 'machines' ? (light ? IMG.machinesLight : IMG.machinesDark)
      : k === 'review' ? (light ? IMG.reviewLight : IMG.reviewDark) : IMG[k];
  }
};
const swap = document.getElementById('swap');
swap.addEventListener('click', () => {
  light = !light;
  swap.setAttribute('aria-pressed', String(light));
  swap.textContent = light ? 'Show dark captures' : 'Show light captures';
  paint();
});
paint();
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
</script>
</body>
</html>
`;
writeFileSync(out, html);
console.log(out, Buffer.byteLength(html), 'bytes');
