# Batch U01 report

Status: lane implementation complete; both required checks passed. Parent follow-up: bots-ui is missing from the standard Nx lint/test plugin include lists (outside this lane's write scope).

## Files

Written:
- libs/frontend/bots-ui/project.json
- libs/frontend/bots-ui/tsconfig.json
- libs/frontend/bots-ui/tsconfig.lib.json
- libs/frontend/bots-ui/tsconfig.spec.json
- libs/frontend/bots-ui/jest.config.ts
- libs/frontend/bots-ui/eslint.config.mjs
- libs/frontend/bots-ui/src/lib/bots-client.ts
- .ptah/specs/TASK_2026_2274_eb79/batch-U01-report.md (skeleton written before implementation, then completed)

Configuration copied from cron-scheduler-ui with the library name/path updated. Project tags are scope:webview, type:feature, platform:angular. Strict TypeScript flags include strict, noImplicitOverride, noImplicitReturns, noFallthroughCasesInSwitch and noPropertyAccessFromIndexSignature; Angular options include strictTemplates, strictInjectionParameters, strictInputAccessModifiers and typeCheckHostBindings. Existing @ptah-extension/bots-ui alias verified in tsconfig.base.json.

No page, store, public src/index.ts, generated setup file, U02-owned file or git write was made by this lane.

## Method list

Each public method takes the corresponding shared BotsRpcMethods wire-input params and returns Promise<RpcResult<shared result type>> through ClaudeRpcService.call:

| Client method | RPC method | Shared result |
| --- | --- | --- |
| list | bots:list | BotsListResult |
| get | bots:get | BotsGetResult |
| create | bots:create | BotsWriteResult |
| update | bots:update | BotsWriteResult |
| setEnabled | bots:set-enabled | BotsWriteResult |
| archive | bots:archive | BotsWriteResult |
| restore | bots:restore | BotsWriteResult |
| delete | bots:delete | BotsDeleteResult |
| previewImport | bots:preview-import | BotsPreviewImportResult |
| uploadAvatar | bots:upload-avatar | BotAvatarUploadResult |
| getAvatar | bots:get-avatar | BotAvatarGetResult |

BotsClient uses inject(ClaudeRpcService) and providedIn: root. Shared wire inputs preserve optional schema defaults. ID-based methods add no workspace root. list preserves summaries, unreadable, unidentifiedRowCount, archivedCount and availability fields. RpcResult is forwarded intact so consumers can inspect structured errorCode values and diagnostics.

## Check results

- PASS (exit 0): npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json
- PASS (exit 0, no warnings): npx eslint libs/frontend/bots-ui/jest.config.ts libs/frontend/bots-ui/src/lib/bots-client.ts
- PASS: ptah_get_diagnostics scoped to bots-client.ts and jest.config.ts; TypeScript compiler source, clean coverage, 0 errors and 0 warnings.
- Verified the existing alias and required project tags/strict flags by inspection.
- No nx, npm run verify, build, serve, dev, e2e or package command ran. No templates or rendered UI changed; screenshot review does not apply to this configuration/transport lane.

## Decisions

1. Added eslint.config.mjs, copied from cron-scheduler-ui. Siblings carry local Angular ESLint configuration; retaining it supports per-file config discovery and inferred lint targets.
2. Reused ../ui/src/test-setup.ts read-only in both Jest setupFilesAfterEnv and tsconfig.spec.json files. No generated local setup or mock paths were added.
3. Left .github/ci/test-weights.json unchanged. Both example siblings have recorded timings, but tools/ci/assign-test-shard.mjs explicitly uses defaultSeconds for unlisted projects; complete enumeration is not required. A measured bots-ui timing can be recorded later.
4. Retained RpcResult rather than throwing a new generic Error, preserving host error codes for later conflict/availability handling. No client-side DTO parsing or payload projection was added; this facade delegates to the existing typed RPC transport.
5. Parent action: contrary to the task precondition, rg found no bots-ui entry in nx.json. Standard lint and test plugins have explicit project include lists containing cron-scheduler-ui and skill-synthesis-ui but not bots-ui. Add libs/frontend/bots-ui/**/* to the appropriate lists in the owning integration lane. nx.json is outside U01's allowed files and was not edited. The separate eslint:lint plugin has no include restriction.
6. CLI skill invocation/discovery was unavailable: read local .claude/skills/angular-frontend-patterns/SKILL.md and .claude/skills/nx-workspace-architect/SKILL.md directly, including the latter's library-creation/module-boundaries references. No UI/design implementation was performed.
7. Ptah workspace analysis, source structure, file discovery, dependency inspection and scoped diagnostics were used. Dependency graph was partial and the new client was not indexed; used targeted native rg for client usages (only its declaration) and PowerShell reads for the specified sources/configs.
