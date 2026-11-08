# Live test round 3 fix report

## Defect 1: Codex warning delivery

The budget callback in `agent-process-manager.service.ts:462-471` tried explicit steer and then generic queue routing. Generic queue routing can start a new turn when the manager has marked the lane completed (`agent-message-router.service.ts:207-211`), while the Codex adapter still rejects overlapping turns (`codex-app-server-lane.adapter.ts:731-734`). The adapter's steer also omitted the active `expectedTurnId` even though the context accepts it (`codex-context.ts:914-926`).

The adapter now passes the active receipt turn ID to `context.steer`. When steer is unavailable at the completion boundary, the budget callback uses the Codex handle's `queueForNextTurn` instead of generic queue routing. The handle holds one warning and prepends it to the next actual turn without initiating a turn. This preserves the round 3 order: accounting can fire on the completed turn before the lane has settled. The active steer and idle next-turn paths are covered in `codex-app-server-lane.adapter.spec.ts`.

## Defect 2: native child linkage

The previous context tried to link from `subAgentActivity` and `collabAgentToolCall` item fields (`codex-context.ts:443-515`). Its existing `thread/started` branch also required a parent spawn item to have arrived already, so an early child announcement was lost. The vendored protocol defines `thread/started` as a server notification at `libs/backend/codex-runtime/src/lib/protocol/codex-app-server-protocol.schema.json:4674-4680`; its `ThreadStartedNotification.thread` is defined at `:25341-25351`, and `Thread.parentThreadId` explicitly identifies a subagent's parent at `:21301-21306`.

The context now retains bounded early `thread/started` parent links and matches them when the parent spawn item arrives (`codex-context.ts:409-416,503-509`). It drops high-volume text/reasoning deltas from the early-event buffer, raises the named bounded event limit to 512, and emits one debug entry per unlinked notification method name, without payloads (`codex-context.ts:83-84,419-431,542-558`). `codex-context.spec.ts` covers child announcement before spawn, deltas before linkage, and the buffer cap.

## Resume gate note

The near-limit resume decision remains `fresh` as the implementation plan requires. Its reason now says `near-limit (warning reached)` separately from `budget stop` (`lane-resume-gate.ts:122-124`).

## Decisions

- Keep an idle Codex warning on its existing handle until the next real turn. Generic queue routing could create a turn during the completion race; the handle already owns the native turn state. Reversible.
- Use the vendored `thread/started.thread.parentThreadId` contract as the child-parent authority, while retaining the spawn item only to determine the parent tool ID. Reversible.

## Verification and remaining gaps

- Final `npm run verify -- -p shared,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: all 14 lint/typecheck tasks passed; 16 of 17 test tasks passed. The sole failing task was `platform-core:test`, containing exactly the two permitted known failures `control-endpoint.spec.ts` and `kernel-session-driver-lock.spec.ts`. Codex runtime and CLI agent runtime tests passed.
- Scoped `ptah_get_diagnostics` after edits: 0 errors, 0 warnings. `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL. `agent-process-manager.service.ts` has exactly 3675 nonblank lines.
- No live Ptah Dev run was performed. The next live test should confirm whether this Codex version emits `thread/started` for the child; the new method-only debug line records the order if it does not. Parent tool correlation remains dependent on a spawn item arriving, since the protocol's child notification names the parent thread but no parent tool ID.
