// Development renderer only (needs window.ng). Gives the first Running and
// the first Background rail card a fully loaded set of inputs, the way a busy
// real session looks: long title, +N lanes, linked task id, 3 agents, 2 CLI,
// 9% ctx, todos and a large diff. Only the component inputs change; the
// template, CSS and layout are the real ones. Returns state:height per card.
(async () => {
  const setInput = (cmp, name, value) => {
    const fn = cmp[name];
    const sym = Object.getOwnPropertySymbols(fn).find((s) => String(s) === 'Symbol(SIGNAL)');
    const node = fn[sym];
    node.applyValueToInputSignal(node, value);
  };
  const lanes = {
    rows: [], moreCount: 5, total: 5,
    counts: { running: 3, waiting: 0, error: 0, done: 2, stopped: 0 },
    kinds: { cli: 2, subagent: 3, background: 0 },
  };
  const load = (el) => {
    const cmp = window.ng.getComponent(el);
    const summary = cmp.summary();
    setInput(cmp, 'title', 'Refactor the workspace session rail virtual layout and FLIP motion for dense cards');
    setInput(cmp, 'summary', { ...summary, metrics: { ...summary.metrics, agentCount: 3 } });
    setInput(cmp, 'lanes', lanes);
    setInput(cmp, 'linkedTask', { taskId: 'TASK_2026_894_0e20', missing: false });
    setInput(cmp, 'contextPercent', 9);
    setInput(cmp, 'todos', { kind: 'known', done: 4, total: 7, active: 'Write specs' });
    setInput(cmp, 'gitStats', { kind: 'known', additions: 3829, deletions: 10, partial: false });
    window.ng.applyChanges(el);
  };
  const out = [];
  const cards = [];
  for (const state of window.__loadStates || ['running', 'background']) {
    const host = [...document.querySelectorAll('[data-rail-card]')]
      .find((x) => x.dataset.state === state);
    if (!host) { out.push(state + ':missing'); continue; }
    const el = host.querySelector('ptah-compact-rail-card');
    load(el);
    cards.push([state, host, el]);
  }
  // Live session updates can overwrite the inputs, so load them again
  // after the motion settles and measure in the same task.
  await new Promise((r) => setTimeout(r, 400));
  for (const [, , el] of cards) load(el);
  for (const [state, host, el] of cards) {
    const meta = el.querySelector('ptah-compact-rail-meta');
    const diff = meta && meta.querySelector('.tabular-nums');
    const mr = meta && meta.getBoundingClientRect();
    const dr = diff && diff.getBoundingClientRect();
    out.push([
      state,
      'card=' + Math.round(host.getBoundingClientRect().height),
      'meta=' + (mr ? Math.round(mr.height) : 'none'),
      'diff=' + (diff ? diff.textContent.trim() : 'none'),
      'diffVisible=' + (dr && mr ? dr.right <= mr.right + 0.5 && dr.width > 0 : false),
      'metaW=' + (mr ? Math.round(mr.width) : 0) + '/sw' + (meta ? meta.scrollWidth : 0),
      'chips=' + (meta ? [...meta.children].map((c) => c.textContent.trim() + '[' + c.clientWidth + (c.scrollWidth > c.clientWidth ? ' cut' : '') + ']').join(' | ') : ''),
    ].join(' '));
  }
  return out.join('\n');
})()
