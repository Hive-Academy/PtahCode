# Summary

Moved Codex Agent behavior into the Codex Credentials tab. Context management retains its other controls in their existing order.

# Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts` — removed only the Codex group and sandbox mount.
- `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.spec.ts` — pins absence of Codex controls and presence of background queries.
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` — deferred Codex behavior immediately after sign-in block.
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.spec.ts` — checks signed-out Codex destination and ordering.
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/codex-agent-behavior.component.ts` — single-column wrapper reusing existing generic setting group and sandbox component.
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/codex-agent-behavior.component.spec.ts` — checks both existing controls mount.
- `libs/shared/src/lib/types/advanced-settings.types.ts` — renamed visible group to Agent behavior, retained id and key.
- `libs/shared/src/lib/types/advanced-settings.types.spec.ts` — pins title, group id and setting key.
- `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.spec.ts` — checks new title and existing next-agent copy.

# Parity rows preserved

| Row | Where now | Test |
| --- | --- | --- |
| Codex web search | Credentials → Agent behavior → existing generic settings group | `codex-agent-behavior.component.spec.ts`; `advanced-settings-group.component.spec.ts` |
| Codex sandbox | Credentials → Agent behavior → existing sandbox component | `codex-agent-behavior.component.spec.ts`; unchanged `codex-sandbox-setting.component.spec.ts` |
| Session budget and lane guards | Context management | `orchestration-settings.component.spec.ts` |
| Global context budget fields | Context management | `orchestration-settings.component.spec.ts`; `advanced-settings.types.spec.ts` |
| Background query limits | Context management | `orchestration-settings.component.spec.ts`; `advanced-settings.types.spec.ts` |

# Verification

Command: `npm run verify -- -p chat,shared 2>&1 | Select-Object -Last 60` (one run). Ptah diagnostics returned unchecked after the TypeScript worker exceeded 45 seconds.

Tailed result lines:

```text
[verify 2026-11-08T21:05:27.223Z] lock slot 0 acquired after 1084s: verify lint,typecheck (chat,shared) then verify test (chat,shared)
NX   4 tasks: 4 succeeded
[verify 2026-11-08T21:07:16.371Z] starting verify test (chat,shared)
NX   2 tasks: 1 succeeded, 1 failed
✖ nx run @ptah-extension/chat:test
Test Suites: 1 failed, 351 passed, 352 total
Tests:       1 failed, 2 skipped, 6236 passed, 6239 total
[verify 2026-11-08T21:13:00.772Z] lock released after 453.5s, exit code 1
```

Chat lint/typecheck: pass. Shared lint/typecheck: pass. Chat test: fail in `cli-orchestration-matrix.component.spec.ts`, outside this batch's allowed files ("resets a saved default with a null row and Undo restores it": expected `saveSettings` call, received 0). All required Batch 5 Chat specs and unchanged Codex sandbox spec passed; the Chat test log reports only that one unrelated failed suite. Shared test: pass (the second test task succeeded). No changes made to the failing file.

Rendered screenshot: unavailable under the task's prohibition on build/serve/dev/e2e; visual quality was not inferred from source or type checks.

# Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Reuse both existing controls in one deferred Credentials wrapper | Reuse versus duplicate controls | The generic group already owns `settings:get/set`; the sandbox component owns agent config RPC, confirmation and effective state. | Yes |
| Show behavior regardless of Codex sign-in state | Gate on sign-in versus show for Codex connection | Acceptance explicitly requires signed-out visibility when host RPC is available. | Yes |

Skill limitation: `angular-frontend-patterns` was requested, but the host exposed no skill loader and the skill catalogue returned zero matches. Repository guidance was used.

