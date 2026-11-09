// Usage: node cdp-shot.mjs <port> <expr1|-> <out1.png|-> [<expr2> <out2> ...]
// Connects to the Electron renderer over CDP. For each step it evaluates the
// expression (result printed) and saves a screenshot unless out is "-".
// CDP_SIZE=WxH emulates the viewport size for the whole run.
import { readFileSync, writeFileSync } from 'node:fs';

const [port = '9334', ...steps] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((r) => {
  const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params }));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.env.CDP_SIZE) {
  const [width, height] = process.env.CDP_SIZE.split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await wait(800);
}
for (let i = 0; i < steps.length; i += 2) {
  let expr = steps[i];
  const out = steps[i + 1] ?? '-';
  if (expr.startsWith('@')) expr = readFileSync(expr.slice(1), 'utf8');
  if (expr !== '-') {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails?.text ?? res.error));
    await wait(700);
  }
  if (out !== '-') {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', out);
  }
}
ws.close();
