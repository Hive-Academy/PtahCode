# Issue #1518 fix round 2

## Findings

- **Blocking, fixed.** Spawn applies `plan < ask < auto-edit < yolo` to explicit requests, saved defaults and built-in defaults for Claude, Codex and ACP callers. Missing or unrecognized permission on a bound caller caps to `plan`. See `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:799`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:29` and `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:102`. Specs cover each parent mode, an unknown mode, explicit stronger requests, a weaker request, and live `ask` propagation from all three runtimes.
- **Serious, fixed.** Electron resolves a pending Claude lifecycle record by its existing tab ID, with its workspace and permission metadata. Handoff still models the SDK ID as absent until binding. See `apps/ptah-electron/src/di/phase-2-libraries.ts:261`, `apps/ptah-electron/src/di/live-chat-session-resolver.ts:12`, `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1105` and `apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts:22`.
- **Moderate and Minor.** The review lists no separate findings. The `auto-edit` gap was part of the Blocking item and is fixed.

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:102` (additional file outside the input diff file list)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts:73` (additional file outside the input diff file list)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts:29` (additional file outside the input diff file list)
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts:49` (additional file outside the input diff file list)
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:799`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts:455`
- `apps/ptah-electron/src/di/live-chat-session-resolver.ts:12`
- `apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts:22`
- `apps/ptah-electron/src/di/phase-2-libraries.ts:261`
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:1105`

The two additional production files are the common spawn policy resolver and the legacy parent permission lookup. Their specs cover both paths. The diff file list came from the previous fix report. The backend lane prohibits running Git, so live `git diff` and `git status` were unavailable.

## Decisions

- Clamp in the shared spawn policy resolver rather than only in the Electron builder. Both external and SDK-backed lanes use the shared resolver. If the lane adapter cannot represent the ceiling, use a supported mode below it or refuse the policy. Codex `ask` has no declared lane support, so a stronger Codex lane request under an `ask` parent lands at read-only `plan` with network denied. This is reversible in the resolver. The existing persisted `parent-plan` provenance value avoids a schema migration.
- Reuse the existing Claude tab alias until the lifecycle binds the SDK ID. This keeps collision handling in the same resolver and lets handoff retain its nullable SDK ID. The mapping is reversible and requires no new registry or shared transport shape.

## Verification

Scoped `ptah_get_diagnostics` timed out after 45 seconds with all ten files unchecked. The native project type checks below passed. Skill discovery through a CLI skill loader was unavailable.

**Exit 0.** 136 passed across 3 suites. Node emitted a Jest config module-loading warning.

```powershell
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts
```

**Exit 0.** 41 passed. Node emitted a Jest config module-loading warning.

```powershell
npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts
```

**Exit 0.** 7 passed.

```powershell
npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts
```

**Exit 0.** Passed.

```powershell
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
```

**Exit 0.** Passed.

```powershell
npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json
```

**Exit 0.** Passed.

```powershell
npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json
```

**Exit 0.** 0 errors and 10 warnings for file length and existing non-null assertions. The Nx module-boundary rule skipped because no project graph was cached.

```powershell
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts apps/ptah-electron/src/di/live-chat-session-resolver.ts apps/ptah-electron/src/di/live-chat-session-resolver.spec.ts apps/ptah-electron/src/di/phase-2-libraries.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts
```

