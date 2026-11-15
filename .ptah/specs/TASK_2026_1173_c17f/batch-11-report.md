# Batch 11 report

## Root cause

Cached-tab resume calls `restoreNativeCompletedChildren`, but its v1 recovery path required a card `tool_result`. Native Codex v2 cards end with `agent_status`, so neither the monitor record nor child transcript was restored.

## Changes

- `libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.ts:593-649`: index native Codex status events by card, replay them through `AgentMonitorStore` when no card result exists, and restore the child transcript without store-only events. The v1 result path is unchanged. Existing nonterminal records are still skipped.
- `libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.native-recovery.spec.ts:54-215`: add a two-cycle native history with four Bash tools, check the real execution tree and completed monitor status, check duplicate recovery, and check a started-only card remains running. Existing v1 recovery test still passes.

## Checks

- `JEST_PROJECT=libs/frontend/chat node D:\projects\ptah-extension\node_modules\jest\bin\jest.js --config .ptah/tmp/jest-marked-fix.config.js --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.native-recovery.spec.ts libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.spec.ts` — passed, 2 suites / 70 tests.
- `node D:\projects\ptah-extension\node_modules\typescript\bin\tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — passed.
- `node D:\projects\ptah-extension\node_modules\typescript\bin\tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` — failed with numerous pre-existing errors in other specs and shared libraries; output was truncated. No changed-file error was visible in the returned output.
- `node D:\projects\ptah-extension\node_modules\eslint\bin\eslint.js libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.ts libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.native-recovery.spec.ts` — 0 errors, 1 existing max-lines warning in the service.
- `ptah_get_diagnostics` on both changed files — unavailable after its 45-second TypeScript timeout.

## Decisions

- Preserve D15: a native card with only a running status stays running and is never marked interrupted or resumable. The existing execution-store guard does not restore a transcript while the monitor record is nonterminal. Reversible: yes.

## Remaining limits

If native child history cannot be read, its tool count cannot be recovered. Spec-project TypeScript checking remains blocked by unrelated existing errors.
