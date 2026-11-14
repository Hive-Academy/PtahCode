# Batch 12: PR #1263 review triage

| Comment | Finding and evidence | Verdict | Fix | Regression test |
| --- | --- | --- | --- | --- |
| 4573159677 | `codex-context.ts:694-702` evicted the oldest live child when all 256 entries were active. | confirmed | `codex-context.ts:694-701`: retain live entries and reject the new activity at capacity, with the existing overflow log. | `codex-context.spec.ts:472` preserves active native children when a full cache has no terminal child |
| 4573159684 | `codex-chat-events.ts:387-399` emitted completed activity but did not settle `hasPendingChildren` at line 146. | confirmed | `codex-chat-events.ts:387-389`: record the completed cycle. | `codex-chat-events.spec.ts:54` ends background drain when native activity completes |
| 4573166057 | `codex-chat-events.ts:223-224` excluded interrupted child terminals from the drained-cycle key. | confirmed | `codex-chat-events.ts:223`: record the cycle for interrupted terminals too. | `codex-chat-events.spec.ts:65` maps an interrupted child terminal to paused with the native cycle; now asserts drain is clear |
| 4573166058 | `codex-history-projector.ts:82-84` sorted only the root first, leaving nested descendants in snapshot order. | confirmed | `codex-history-projector.ts:82-92`: sort by ancestry depth. | `codex-history-projector.spec.ts:130` projects a native grandchild after its parent regardless of snapshot order |
| 4573166063 | `codex-context.ts:599` skipped all native activity on a thread with any pending spawn. | confirmed | `codex-context.ts:599`: remove that guard. | `codex-context.spec.ts:493` admits native activity while an unrelated spawn is pending |
| 4573166067 | `codex-context.ts:850-851` waited for `childTools.size === 0`, including retained native links. | confirmed | `codex-context.ts:850-852`: wait only for non-native links. | `codex-context.spec.ts:432` finishes the root after the last non-native child while a native link remains |
| 4573166070 | `codex-context.ts:203-221` requires `activeTurn` and uses its aborted controller for a later native child approval. | deferred, needs owner | none | none |
| 4573166072 | `native-codex-status.reducer.ts:37` dropped duplicate failure statuses with new error text. | confirmed | `native-codex-status.reducer.ts:37-38`: accept a duplicate failed status only when it fills missing text. | `native-codex-status.reducer.spec.ts:84` fills missing failure text from a duplicate terminal status |

## Deferred reply

4573166070: Confirmed. After the root turn completes, the request guard rejects a live native child's approval and the root cancellation signal has already aborted. A safe fix needs an independently owned approval lifetime and permission decision. That crosses the approval routing boundary reserved for the owner; no approval check or permission level was changed here. The parent report attempt was rejected because its inbox was full.

## Decisions

- At cache capacity with no terminal entry, preserve all 256 live children and drop the newly seen activity. This keeps D14's cap and avoids evicting a live child; reversible.
- For approval routing, defer to the owner rather than changing the root turn guard or cancellation semantics without an approved child lifetime contract; reversible.

## Changed files

- `libs/backend/codex-runtime/src/lib/codex-context.ts`
- `libs/backend/codex-runtime/src/lib/codex-context.spec.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.ts`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts`
- `libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.ts`
- `libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts`
- `.ptah/specs/TASK_2026_1173_c17f/batch-12-report.md`

## Checks

- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-context.spec.ts` — pass, 27 tests. Initial run failed on an existing expectation that native links are pruned; updated it for retained native links and reran successfully.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts` — pass, 66 tests.
- `npx jest --config libs/frontend/chat-streaming/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts` — pass, 14 tests.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.spec.json` — pass.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` — pass.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.spec.json` — fails on existing unrelated spec and shared BigInt target errors; no error reported in changed reducer or its spec.
- `npx tsc --noEmit --project libs/frontend/chat-streaming/tsconfig.lib.json` — pass after a nullability fix.
- `npx eslint libs/backend/codex-runtime/src/lib/codex-context.ts libs/backend/codex-runtime/src/lib/codex-context.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-events.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-history-projector.spec.ts libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.ts libs/frontend/chat-streaming/src/lib/native-codex-status.reducer.spec.ts` — exit 0, four pre-existing warnings in codex-context.ts.
- `ptah_get_diagnostics` scoped to changed source — initial call timed out; retry reported no diagnostics in the requested reducer and 156 sibling spec errors.
