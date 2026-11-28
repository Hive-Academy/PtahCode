# Status — TASK_2026_2329_dd39 (handoff)

Worktree: `.claude-worktrees/settings-overlays`, branch `fix/settings-overlays`. Nothing committed yet.

| Batch | Area | Lane | State |
|---|---|---|---|
| Plan | context/implementation-plan/batches | codex 77dd3935 | done |
| 1 | Shared CDK overlay primitives | codex 69b115f9 | done — 124/124 Jest, tsc ui+renderer pass |
| 2 | CLI lanes table layout | grok 4c296fc6 | done (exit 0) — report written, not yet reviewed |
| 3 | Provider/instance subforms | Kimi Code 2485a3d5 | done (exit 0) — report written, not yet reviewed |
| 4 | Background models resolution | codex 206a7b4a | done — 281 Jest, tsc ui/chat/renderer pass |
| 5 | Routing evidence summaries | Kimi Code 72242a76 | done — 7/7 Jest, tsc chat pass |

Per-batch details: `batch-N-report.md`.

## Remaining work

1. Wait for Batch 2 and Batch 3 lanes; read batch-2-report.md, batch-3-report.md.
2. Review the full diff (`git diff --stat`, then per area).
3. Inner loop: `npm run verify -- --related -p ui,chat,ptah-extension-webview`, then `-t lint,typecheck`.
   ESLint module-boundary rule was skipped in lanes — must run in gate.
4. Template check: `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
5. Electron visual check (no lane ran one): nested select in Add Ptah CLI instance modal near bottom,
   lanes table at 400/640/950/wide, Memory curator popover with Claude Subscription active
   (zero OpenRouter calls), routing evidence view, light/dark/glass.
6. Independent review lane (code-logic-reviewer), then full gate, commit, push, PR, set task in_review.
