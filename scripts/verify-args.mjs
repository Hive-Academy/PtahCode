// Pure argument logic of scripts/verify.mjs. It has no side effects, so
// scripts/verify-args.test.mjs can import it without starting a run.

export function splitList(values) {
  return (values ?? [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

// Returns one entry per Nx run: { targetList, label, args }. `args` are the
// arguments after the nx binary. Mixed runs give lint/typecheck first, then
// tests. `--related` gives one test run that Jest limits to the tests related
// to the files changed since the base (`--changedSince`).
export function planPhases(values, passthrough = [], lintParallel = 2) {
  const targets = splitList(values.targets);
  const projects = splitList(values.projects);
  const base = values.base ?? 'main';
  if (values.related) {
    if (!projects.length) throw new Error('--related needs projects: -p a,b');
    if (targets.some((target) => target !== 'test'))
      throw new Error('--related runs the test target only: remove -t');
  }
  const requested = values.related
    ? ['test']
    : targets.length
      ? targets
      : ['lint', 'test', 'typecheck'];
  const nonTest = requested.filter((target) => target !== 'test');
  const phases =
    requested.includes('test') && nonTest.length
      ? [nonTest, ['test']]
      : [requested];
  const label = projects.length ? projects.join(',') : `affected vs ${base}`;
  return phases.map((phase) => {
    const targetList = phase.join(',');
    const args = projects.length
      ? ['run-many', '-t', targetList, '-p', projects.join(',')]
      : ['affected', '-t', targetList, `--base=${base}`];
    if (!projects.length && values.head) args.push(`--head=${values.head}`);
    args.push(`--parallel=${phase.includes('test') ? 1 : lintParallel}`);
    if (values.related) args.push(`--changedSince=${base}`);
    args.push(...passthrough);
    return {
      targetList,
      label: values.related ? `${label}, related to ${base}` : label,
      args,
    };
  });
}
