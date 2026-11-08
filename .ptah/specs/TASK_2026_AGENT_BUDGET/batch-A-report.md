# Batch A report

## Files changed

- `libs/shared/src/lib/types/advanced-settings.types.ts`: four agent budget descriptors; legacy controls removed from editor descriptors.
- `libs/backend/platform-core/src/file-settings-keys.ts`: new file keys and retained old reader defaults.
- `libs/backend/platform-core/src/index.ts`: migration export.
- `libs/backend/platform-core/src/agent-budget-settings-migration.ts` and `.spec.ts`: one-time migration and focused tests.
- `apps/ptah-electron/src/main.ts`: migrate before boot defaults; forward bounded warnings to the resolved Logger.
- `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts` and `.spec.ts`: context copy and four-control rendering assertions.

## Settings definitions

| Key | Default | Range | Unit |
| --- | ---: | ---: | --- |
| `agentBudget.warnRatio` | 0.85 | 0.01–0.99 | ratio |
| `agentBudget.stopWeightedTokens` | 3,000,000 | 1,000–100,000,000 | weighted tokens |
| `agentBudget.handoffContextTokens` | 150,000 | 1,000–2,000,000 | tokens |
| `agentBudget.maxDurationMin` | 90 | 1–1,440 | minutes |

All token and duration values require integers. The ratio requires a finite number. Descriptors validate settings RPC values; the migration parses legacy numbers with Zod and checks descriptor bounds.

## Migration behavior

| Existing data | Result |
| --- | --- |
| Explicit new key | Preserved, even if an old key also exists. |
| Valid old key, new key absent | Migrated independently to the corresponding new key. |
| Invalid old key, new key absent | Old value retained, new default written, one warning per key per run. |
| `__migrations.agentBudgetV1` true | File left unchanged. |
| No settings file | No write; defaults apply when settings load. |

Writes use an exclusive temp file and atomic rename. Electron runs this after the prior threshold migration and before bootstrap. The CLI invocation belongs to batch E.

## UI change

The advanced context group now renders the four `agentBudget` controls from the shared descriptors. The two old subagent controls are absent. Copy says agent limits apply even when compaction is off.

## Verification

The mandatory scoped `npm run verify -- -p platform-core,chat,ptah-electron,ptah-extension-webview` ran lint/typecheck: 7 of 8 tasks passed. `ptah-extension-webview:lint` failed on 26 static imports of lazy-loaded `@ptah-extension/core` in unrelated renderer files (for example `file-link-wiring.spec.ts`, `initial-navigation.ts`, and `webview-routing.spec.ts`). Its test phase produced no result after ten minutes and was interrupted. Ptah diagnostics timed out and later reported its worker terminated, with no files checked.

The first focused command (`--testPathPatterns=agent-budget`) matched the worktree path and ran all 59 platform-core suites: 56 passed, 3 failed. One failure is caused by this batch: `file-settings-keys.spec.ts` has a hardcoded advanced-settings list and expects the two removed editor keys instead of four new ones. The other two failures are unrelated `session-driver-lock/control-endpoint.spec.ts` and `session-driver-lock/kernel-session-driver-lock.spec.ts` tests. The exact filename run (`--testPathPatterns=agent-budget-settings-migration.spec.ts`) passed.

## Follow-ups

- Batch E: invoke the migration during CLI initialization before defaults materialize.
- Coordinator: update `libs/backend/platform-core/src/file-settings-keys.spec.ts` hardcoded advanced-settings list; it was excluded by batch A's exact file scope.
- No `libs/shared/src/index.ts` export is needed: the descriptors already flow through its existing advanced settings export.
- Skill discovery/loading was unavailable in this lane; Angular conventions were checked against the component's existing implementation.

## Decisions

- Preserve the old keys and their defaults in file-based routing until hosts migrate, while removing their editor descriptors. Evidence: existing SDK readers still use the old keys; reversible: yes.
- Buffer invalid-value warnings until Electron's injected Logger exists. Evidence: migration runs before bootstrap creates the Logger; reversible: yes.
