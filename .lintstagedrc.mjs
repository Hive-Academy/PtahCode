import path from 'node:path';

export default {
  // Privacy guard: no home path with a real user name in a public repository.
  // Runs on every staged text file (binary files are skipped by the script).
  '*': (files) => {
    const rel = files.map((f) => `"${path.relative(process.cwd(), f).split(path.sep).join('/')}"`);
    // Chunks keep each command line under the Windows limit (about 8191 chars).
    const commands = [];
    for (let i = 0; i < rel.length; i += 40) {
      commands.push(`node scripts/check-home-paths.mjs ${rel.slice(i, i + 40).join(' ')}`);
    }
    return commands;
  },
  // Single glob with function form: runs format + lint ONCE, never chunked.
  // Prevents lint-staged from spawning parallel nx processes that OOM.
  '*.{ts,js,json,md}': (files) => {
    const cmds = [`npx nx format:write --files=${files.join(',')}`];
    // Lint only the staged TS/JS files (skip JSON/MD). `nx affected -t lint`
    // re-linted every project the whole branch touched on each commit.
    // ESLint 10 resolves the nearest eslint.config.mjs per file, and no
    // config uses type-aware rules, so per-file linting matches the project
    // lint targets. CI does not run ESLint; this is the lint gate.
    const tsFiles = files.filter((f) => /\.[tj]sx?$/.test(f));
    if (tsFiles.length > 0) {
      const quoted = tsFiles
        .map((f) => `"${path.relative(process.cwd(), f).split(path.sep).join('/')}"`)
        .join(' ');
      // @nx/enforce-module-boundaries reads the cached project graph and is
      // silently skipped without one (a fresh worktree has none). `nx show
      // projects` writes .nx/workspace-data/project-graph.json first.
      cmds.push('npx nx show projects --json');
      cmds.push(`npx eslint --max-warnings=-1 --no-warn-ignored ${quoted}`);
    }
    return cmds;
  },
};
