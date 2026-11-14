# Batch 8 report

## Findings

| Finding | File:line | Fix | Regression test |
| --- | --- | --- | --- |
| F1 | `libs/backend/codex-runtime/src/lib/codex-context.ts:767,828` | Bind each buffered turn before admission; debug log stale or unknown native terminals. | `admits activity before buffered child items and exactly one terminal`; `ignores an unbound terminal and a late terminal from an older child turn` |
| F7 | `libs/backend/codex-runtime/src/lib/codex-context.ts:597,628` | Admit native activity before linking and flushing child events. | `admits activity before buffered child items and exactly one terminal` |
| F2 | `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:234` | Map interrupted child terminal to paused; retain status keyed dedup. | `maps an interrupted child terminal to paused with the native cycle` (live and history parity) |
| F3a | `libs/backend/codex-runtime/src/lib/codex-context.ts:838`, `libs/backend/codex-runtime/src/lib/codex-runtime.types.ts:350`, `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:218` | Attach optional native cycle metadata and use it for later turn status on the canonical card. | `projects a later-turn native terminal without a local card record` |
| F3b | `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts:146,153` | Keep native cards pending during background drain; leave them without fabricated terminal output. | `keeps a native card pending for background drain without inventing a terminal` |
| F3c | `libs/backend/codex-runtime/src/lib/codex-context.ts:419,450` | Buffer up to 64 native terminals without subscribers and replay once on next subscription. | `replays a native terminal to the next subscriber once` |
| F5 | `libs/backend/codex-runtime/src/lib/codex-context.ts:690` | Debug log non-started activity for unknown child. | `logs a non-started activity for an unknown child` |
| F8 | `libs/backend/codex-runtime/src/lib/codex-context.spec.ts:551` | Pin existing v1 linkage behavior without changing v1 source. | `flushes v1 child notifications once toolStarted supplies agentThreadIds` |
| F9 | `libs/backend/codex-runtime/src/lib/codex-context.ts:693` | Cap native child states at 256, evict oldest terminal first, log if forced to evict active. | `evicts the oldest terminal native child before an active child`; `logs when a full native cache has no terminal child to evict` |

## Verification

- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-context.spec.ts`: 25 passed, 0 failed in the final run after the last assertion. Logs: `.ptah/tmp/b8-jest-runtime-rerun.log`, `.ptah/tmp/b8-jest-runtime-final.log`.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts`: 62 passed, 0 failed across 2 suites. Log: `.ptah/tmp/b8-jest-agent-sdk.log`.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json`: passed, 0 errors. Log: `.ptah/tmp/b8-tsc-runtime-final.log`.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: passed, 0 errors. Log: `.ptah/tmp/b8-tsc-agent-sdk.log`.
- `npx eslint libs/backend/codex-runtime/src/lib/codex-context.ts libs/backend/codex-runtime/src/lib/codex-context.spec.ts libs/backend/codex-runtime/src/lib/codex-runtime.types.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`: passed, 0 errors, 4 warnings in `codex-context.ts` (file length and existing thrown errors without causes). Log: `.ptah/tmp/b8-eslint.log`.
- `ptah_get_diagnostics` after edits was unavailable because its compiler check exceeded 45 seconds; the two explicit TypeScript commands above passed.

The initial runtime Jest run had 4 failing tests because prototype fixtures lacked the new pending list and new item notifications lacked required timestamps; both fixture issues were corrected. The initial runtime TypeScript run had 1 error because logger metadata included undefined; corrected and rerun passed.

## Decisions

No open decision. Changes followed the task contracts. F4 and F6 were excluded as requested.

## Anything not done

None within Batch 8 scope.

