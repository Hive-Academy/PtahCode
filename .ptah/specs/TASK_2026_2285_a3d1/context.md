# Migrate Nx and update outdated packages

The user asked to run `nx migrate latest` first, then update the outdated
packages that Nx does not manage. The user approved doing this task in the
main checkout on branch `build/nx-migrate-latest` instead of a worktree.

## Plan

1. `nx migrate latest`, install, `nx migrate --run-migrations`.
2. Update the remaining packages inside their current major versions.
3. List the major-version upgrades for a separate decision.

## What was done

- `nx migrate latest`: nx and @nx/* 24.0.0 -> 24.0.6. Nx generated no migrations.
  The pinned @nx/nx-* platform packages were bumped by hand to match.
- Angular framework ranges `~22.2.0` -> `~22.2.7`, `@angular/aria` 22.2.6 -> 22.2.7.
  npm would not move the group until the locked entries were dropped and re-resolved.
- Exact pins bumped: zod 4.6.7, @codemirror/view 6.43.15, @codemirror/language 6.13.1,
  discord.js 14.28.1.
- In-range `npm update` of the other outdated packages (lockfile only).

## Held back

- `better-sqlite3` stays at 13.0.3: the Electron rebuild check cannot run on the
  developer machine (no Visual Studio C++ build tools).
- `@cursor/sdk` stays at 1.0.31: 1.4.2 breaks the anchor in
  `scripts/windows-hide-patch/patch-windows-hide-deps.js`.
- `electron-builder`, `shiki`, `@pierre/diffs`, Angular 22.3, `@astrojs/starlight` 0.43.
- Major upgrades, each a separate task: @anthropic-ai/sdk 1.x, @agentclientprotocol/sdk 2.x,
  @huggingface/transformers 4.x, @sentry/node 11, @tavily/core 1.x, tailwindcss 4, daisyui 5,
  mermaid 12, gridstack 14, uuid 14, chokidar 6, croner 11, minimatch 11.
- `lucide-angular` is deprecated in favour of `@lucide/angular`; migration is a separate task.

## Local verification (Node 26.13.1; the repo requires Node 24)

- lint, typecheck for ptah-electron, ptah-extension-webview, shared: 6 of 6 tasks passed.
- typecheck-templates for ptah-extension-webview: passed.
- test: 11 of 13 tasks passed.
  - shared: 2 tests in `dashboard-budgets.spec.ts` fail because `JSON.stringify` no longer
    overflows the stack on Node 26.
  - ptah-electron: `container.smoke.spec.ts` runs out of memory at the default 2 GB heap;
    it passes 67 of 67 tests with `--max-old-space-size=6144`.
- `web-tree-sitter` 0.27.2: the runtime row in `scripts/tree-sitter-grammars.json` now records
  0.27.2 and its size (210688 bytes); `copy-wasm.js` checks both (CodeRabbit finding).

## Dev app run (Electron 44.4.3, prebuilt better-sqlite3 binary)

- The dev build and launch work; the window renders on Angular 22.2.7 and the SQLite
  migrations apply.
- First start: the main process blocked about 27 s and several RPC calls timed out.
  Second start: about 2.9 s, no RPC timeouts. A CPU profile attributes the block to the
  process spawn in the Codex `readVersion` probe, not to an updated package.

## Root package.json is the only source of versions

Decided with the user: every third-party dependency in a project manifest
(`apps/**/package.json`, `libs/**/package.json`) uses `*`. The root
`package.json` sets the version and the lockfile fixes it. Workspace
dependencies (`@ptah-extension/*`) keep their `0.0.1` spec.

- `@openai/codex` (the bundled Codex CLI) moved to the root as `>=0.165.0`.
- Re-applied: discord.js 14.28.1, zod 4.6.7, @openai/codex-sdk and @openai/codex 0.171.0.
- Checks: lint (including `@nx/dependency-checks`) for the 20 changed projects passed;
  `nx build-main ptah-electron` generated the dist manifest and pruned lockfile without
  falling back; `validate-deps.js`, `prune-dist-deps.js` and `npm ci --dry-run` in
  `dist/apps/ptah-electron` passed. electron-builder packaging was not run locally.
