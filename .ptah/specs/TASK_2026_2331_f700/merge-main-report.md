# Merge main into fix/live-session-resolver

PR #1521 · Issue #1518

## Conflicted files

- `parent-lane-permission.ts:21` combines main's provider-session permission lookup (0749c6db6) with the branch's explicit `ask` ceiling and fail-closed handling of unrecognized permissions. The shared `unknownParent` option from 72e4a6110 still lets an orphaned resumed lane keep its stored policy.
- `parent-lane-permission.spec.ts:66` keeps the branch's Claude permission and malformed metadata cases along with main's Antigravity lookup and missing-parent spawn and resume cases. The Antigravity matrix now expects an explicit `ask` ceiling.
- `ptah-api-builder.service.ts:624` accepts both the branch's live-chat resolver and main's provider adapter. Lane parent identity and permission use the live resolver when supplied (lines 796 and 816) and the SDK, Codex, and provider adapters otherwise. The recorder path at line 1297 keeps the branch's ambiguity and provisional-ID checks and main's provider attribution fallback. Main's route-record reader from 901b5ecd3 remains wired at line 794.
- `ptah-api-builder.service.spec.ts:788` lets the test builder accept both dependencies. The branch's ACP test at line 423 checks canonical lane parent identity and raw ambiguous caller identity as well as permission and recorder attribution. Main's standalone Antigravity fixture still exercises adapter-only resolution at line 1065.

## Decisions

- Electron's live resolver already includes Claude, Codex, and provider-session sources. A result of ambiguous or unresolved stays unattributed for recorders and caps spawn permission to `plan`. Lane threading retains its raw caller fallback. Claude's provisional IDs are excluded from recorder attribution.
- An explicit `ask` is a permission ceiling for all supported parent sources. This supersedes main's uncapped treatment of `ask`. Unknown permissions cap new lanes to `plan`, while resume keeps the stored policy when the parent is gone.
- The auto-merged `cli-lane-policy-resolver.ts:62` applies the same parent ceiling to new selections and stored resume policies. The optional `parentLevel` accommodates an uncapped missing parent. No auto-merged source file required edits.

## Checks

Commands ran from the worktree root, one at a time. Logs are under `.ptah/tmp/`.

```text
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts
npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts
npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json
npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json
git diff --check
git grep -n '^<<<<<<<' -- '*.ts'
```

- CLI agent runtime Jest run passed all 73 tests across 3 suites, including the auto-merged policy resolver and handoff acknowledgment.
- VS Code LM tools Jest run passed all 43 tests in 1 suite.
- `git diff --check` exited 0 with no output. The conflict-marker grep exited 1 with no matches.
- ESLint exited 0 on the four files with one `max-lines` warning. Its Nx module-boundary rule was skipped because the project graph cache was unavailable. The verification scope excluded Nx commands.
- TypeScript passed all four projects with zero diagnostics: Electron, platform-cli, cli-engine, and vscode-lm-tools.
- The four resolutions are in the working tree. The coordinator owns staging and committing the merge.
