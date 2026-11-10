#!/usr/bin/env node
// Counts exact-DOM duplicate groups for each UI control family in the Electron renderer.
// Read-only. Run from the repository root:
//   node .ptah/specs/TASK_2026_924_8ac1/inventory/exact-dom-groups.mjs > <output.md>
// Method (approximate, see renderer-component-inventory.md section 1.5):
//   host signature  = tag + sorted static class tokens + static type/role + class bindings
//   frame signature = host signature + host signatures of the direct children (text = T,
//                     control-flow block = @name). For form controls (F1, F2, F4 and
//                     <select>) the frame is the PARENT element and its direct children,
//                     because the label and the hint are siblings of the control.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync(
  "git ls-files \"libs/frontend/**/*.ts\" \"libs/frontend/**/*.html\" \"apps/ptah-extension-webview/src/**/*.ts\" \"apps/ptah-extension-webview/src/**/*.html\"",
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\n')
  .filter((f) => f && !/\.spec\.ts$|\.stories\.ts$|webview-e2e-harness/.test(f));

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source', 'area', 'col', 'wbr']);
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const FLOW_RE = /@(if|for|else|switch|case|default|defer|empty|placeholder|loading)\b/g;

function scopeOf(file) {
  if (file.startsWith('libs/frontend/chat/src/lib/settings/')) return 'settings';
  if (file.startsWith('libs/frontend/ui/')) return 'ui';
  return 'rest';
}

function templatesOf(file, text) {
  if (file.endsWith('.html')) return [{ text, offset: 0 }];
  const out = [];
  const re = /template:\s*`((?:[^`\\]|\\[\s\S])*)`/g;
  let m;
  while ((m = re.exec(text))) out.push({ text: m[1], offset: m.index + m[0].indexOf('`') + 1 });
  return out;
}

function hostSig(tag, rawAttrs) {
  const attrs = {};
  const classBindings = [];
  let dynamic = false;
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(rawAttrs))) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? '';
    if (name === '/') continue;
    if (name === '[class]' || name === '[ngClass]' || name === '[className]') dynamic = true;
    else if (name.startsWith('[class.')) classBindings.push(name.slice(7, -1));
    else attrs[name] = value;
  }
  const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean).sort();
  let sig = tag;
  if (attrs.type) sig += `[type=${attrs.type}]`;
  if (attrs.role) sig += `[role=${attrs.role}]`;
  if (classes.length) sig += '.' + classes.join('.');
  if (classBindings.length) sig += '?' + classBindings.sort().join('?');
  if (dynamic) sig += '~dyn';
  return { sig, attrs, classes, raw: rawAttrs };
}

function parse(template) {
  const root = { tag: '#root', sig: '#root', children: [], attrs: {}, classes: [], raw: '' };
  const stack = [root];
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  const pushText = (text) => {
    const top = stack[stack.length - 1];
    let f;
    FLOW_RE.lastIndex = 0;
    const stripped = text.replace(FLOW_RE, (all, name) => {
      f = name;
      top.children.push('@' + name);
      return '';
    });
    void f;
    if (/[^\s{}()]/.test(stripped.replace(/\([^)]*\)/g, ''))) {
      if (top.children[top.children.length - 1] !== 'T') top.children.push('T');
    }
  };
  while ((m = TAG_RE.exec(template))) {
    pushText(template.slice(last, m.index));
    last = TAG_RE.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = { tag, ...hostSig(tag, m[3]), children: [], index: m.index, parent: stack[stack.length - 1] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node);
  }
  pushText(template.slice(last));
  return root;
}

const frame = (node) =>
  node.sig + '(' + node.children.map((c) => (typeof c === 'string' ? c : c.sig)).join(',') + ')';

const has = (n, ...tokens) => tokens.some((t) => n.classes.includes(t));
const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'file', 'hidden', 'color']);
const FAMILIES = [
  ['F1 text input', (n) => n.tag === 'input' && !NOT_TEXT.has(n.attrs.type ?? ''), true],
  ['F2 textarea', (n) => n.tag === 'textarea', true],
  ['F3 native select', (n) => n.tag === 'select', true],
  ['F3 menu, listbox, dropdown', (n) => /^(menu|listbox|combobox)$/.test(n.attrs.role ?? '') || has(n, 'menu', 'dropdown-content') || n.tag === 'ptah-native-dropdown', false],
  ['F4 checkbox, radio, toggle', (n) => n.tag === 'input' && /^(checkbox|radio)$/.test(n.attrs.type ?? ''), true],
  ['F5 button', (n) => n.tag === 'button' || (n.tag === 'a' && has(n, 'btn')), false],
  ['F6 tabs, segmented', (n) => n.attrs.role === 'tablist' || has(n, 'tabs', 'join') || n.tag === 'ptah-native-tab-group', false],
  ['F7 dialog, drawer, popover', (n) => n.tag === 'dialog' || n.attrs.role === 'dialog' || /^ptah-native-(modal|drawer|popover)$/.test(n.tag), false],
  ['F8 table', (n) => n.tag === 'table', false],
  ['F8 table row', (n) => n.tag === 'tr', false],
  ['F8 list item', (n) => n.tag === 'li', false],
  ['F9 card, glass surface', (n) => has(n, 'card') || 'data-glass-surface' in n.attrs || /^ptah-(native|surface|catalog|stat)-card$/.test(n.tag), false],
  ['F10 badge', (n) => has(n, 'badge'), false],
  ['F11 spinner', (n) => has(n, 'loading', 'animate-spin'), false],
  ['F11 skeleton', (n) => has(n, 'skeleton', 'animate-pulse'), false],
  ['F12 alert', (n) => has(n, 'alert') || n.attrs.role === 'alert', false],
  ['F13 mark, avatar', (n) => /^ptah-(brand-mark|provider-mark|monogram-tile|agent-avatar)$/.test(n.tag) || has(n, 'avatar'), false],
  ['F14 stat, progress', (n) => has(n, 'stat') || n.tag === 'progress', false],
];

// rows[family][scope] = [{ host, frame, where }]
const rows = Object.fromEntries(FAMILIES.map(([name]) => [name, { settings: [], rest: [], ui: [] }]));
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const scope = scopeOf(file);
  for (const tpl of templatesOf(file, text)) {
    const visit = (node) => {
      for (const child of node.children) {
        if (typeof child === 'string') continue;
        for (const [name, test, useParent] of FAMILIES) {
          if (!test(child)) continue;
          const line = text.slice(0, tpl.offset + child.index).split('\n').length;
          rows[name][scope].push({
            host: child.sig,
            frame: useParent ? frame(child.parent) + ' > ' + child.sig : frame(child),
            where: `${file}:${line}`,
          });
        }
        visit(child);
      }
    };
    visit(parse(tpl.text));
  }
}

function stats(items, key) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item[key])) groups.set(item[key], []);
    groups.get(item[key]).push(item);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const sizes = sorted.map(([, g]) => g.length);
  const sum = (n) => sizes.slice(0, n).reduce((a, b) => a + b, 0);
  return {
    groups: sizes.length,
    single: sizes.filter((s) => s === 1).length,
    top1: sum(1),
    top3: sum(3),
    top5: sum(5),
    inDup: sizes.filter((s) => s >= 2).reduce((a, b) => a + b, 0),
    sorted,
  };
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) + ' %' : '-');
const out = [];
out.push('# Exact-DOM duplicate groups by family', '');
out.push(`Files: ${files.length}. Made by \`exact-dom-groups.mjs\` in this folder.`, '');
for (const [scopeName, scopes] of [
  ['Renderer without Settings and without the ui lib', ['rest']],
  ['Settings only', ['settings']],
]) {
  out.push(`## ${scopeName}`, '');
  out.push('| Family | Elements | Host recipes | Largest host recipe | Top 5 host recipes | Frame groups | Frames with one element | Largest frame group | Top 5 frame groups | Elements in a frame group of 2 or more |');
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name] of FAMILIES) {
    const items = scopes.flatMap((s) => rows[name][s]);
    const n = items.length;
    const h = stats(items, 'host');
    const f = stats(items, 'frame');
    out.push(
      `| ${name} | ${n} | ${h.groups} | ${h.top1} (${pct(h.top1, n)}) | ${h.top5} (${pct(h.top5, n)}) | ${f.groups} | ${f.single} | ${f.top1} (${pct(f.top1, n)}) | ${f.top5} (${pct(f.top5, n)}) | ${f.inDup} (${pct(f.inDup, n)}) |`,
    );
  }
  out.push('');
}
out.push('## Largest frame groups (renderer without Settings and without the ui lib)', '');
for (const [name] of FAMILIES) {
  const f = stats(rows[name].rest, 'frame');
  out.push(`### ${name}`, '');
  for (const [sig, group] of f.sorted.slice(0, 3)) {
    const libs = new Set(group.map((g) => g.where.split('/')[2]));
    out.push(`- ${group.length} elements, ${libs.size} libs: \`${sig.slice(0, 300)}\` (example \`${group[0].where}\`)`);
  }
  out.push('');
}
process.stdout.write(out.join('\n') + '\n');
