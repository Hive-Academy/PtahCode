# Code logic review — round 7

**Verdict: CHANGES_REQUESTED. Score: 5/10.** The complete read fixes the stale `closePending` authorization from round 6, and a successful close now returns `closed` when the completion write rejects. Two remaining state handling defects prevent approval. This is in the 5–6 band because the primary stale successor safety guard works, but recovery and concurrent completion still give incorrect outcomes; it is below 7–8 because both occur on supported failure paths.

## Confirmed defects

1. **Serious — `already` admits a current `closeCompleted` record and calls the closer again.** After the initial partial lookup, another service instance can finish the same acknowledgement and persist `closeCompleted`. The first instance then calls `transition` (`session-handoff.service.ts:396-401`). `transition` checks the same successor but returns `already` for **every** state other than `recorded`, including `closeCompleted` and `starting` (`session-handoff-ack.store.ts:398-403`). The service treats `already` as `closePending` and proceeds to `closer.close` (`session-handoff.service.ts:392-395,410-442`). A real closer can return `absent`, which becomes `refused` (`session-handoff-close-result.ts:24-27`), even though the handoff completed. Require the transition result to distinguish `closePending`, `closeCompleted`, and other states; return `already-closed` for completed and retry/refuse for nonclosable states. The `starting` case is admitted by the API, though a normal same-successor transition to it was not established here.

2. **Moderate — a failed completion write is reported accurately once but is not recoverable through the documented repeated acknowledgement path.** When `compareAndSet` rejects after a successful close, the handler logs and returns `closed`, leaving `closePending` (`session-handoff.service.ts:441-456`). The next acknowledgement invokes the closer before it can retry the completion write; any `absent` response returns `refused` early (`session-handoff.service.ts:441-445`; `session-handoff-close-result.ts:24-27`). The modified recovery spec expects the second acknowledgement to persist `closeCompleted` (`session-handoff-ack.service.spec.ts:192-214`), but its closer always returns `closed`, even on the second call (`:39-42`). Thus it proves a repeatable mock response, not recovery after an actual closed tab. Preserve the truthful first `closed` response, and provide a way to settle `closePending` after a confirmed earlier close without requiring the tab to close again. Test the second call with `absent`.

## Round 6 findings and requested checks

| Check | Result | Evidence |
| --- | --- | --- |
| Stale `closePending` copy with unreadable newer document | Fixed | Every closable lookup reaches `transition` (`session-handoff.service.ts:392-409`), which calls complete `stateForPredecessor` (`session-handoff-ack.store.ts:395,209-216`); any failed candidate read rejects (`:185-198`) before `closer.close` (`session-handoff.service.ts:441-442`). |
| Successful close followed by rejected completion write | First response fixed; recovery remains defective | The catch returns `closed` (`session-handoff.service.ts:445-456`); subsequent `absent` returns `refused` before persistence (`:441-450`). |
| Partial read reaching the closer | No remaining partial-read bypass confirmed | The successor check and transition precede the closer (`session-handoff.service.ts:396-442`); the transition's complete read either selects the newest available record or rejects. |
| `already` state safety | Defective | It means any state other than `recorded` for the same successor (`session-handoff-ack.store.ts:398-403`), while the caller assumes `closePending` (`session-handoff.service.ts:392-410`). |
| Changed recovery spec contract | Unsound | The second call succeeds only because the mock returns `closed` repeatedly (`session-handoff-ack.service.spec.ts:39-42,192-214`). |

## Five logic questions

1. **How does this fail silently?** The failed completion write is logged, but the record remains `closePending` while the caller sees `closed` (`session-handoff.service.ts:445-456`). The later refusal does not explain that persistence is still incomplete.
2. **What user action produces unexpected behaviour?** Repeating an acknowledgement after a successful close and failed completion write can yield `refused` because the tab is absent (`session-handoff.service.ts:441-445`; `session-handoff-close-result.ts:27`).
3. **What input produces a wrong answer?** A current same-successor `closeCompleted` record reached between lookup and transition yields `already`, then can produce a refusal instead of `already-closed` (`session-handoff-ack.store.ts:398-403`; `session-handoff.service.ts:410-445`).
4. **What happens when a dependency fails?** An unreadable candidate prevents the close through the complete read (`session-handoff-ack.store.ts:185-198,209-216`). A completion write rejection is logged and the first response is `closed`, but the persisted state is not reconciled (`session-handoff.service.ts:445-456`).
5. **What requirement is missing?** The guarded transition needs a state-specific outcome, and the already-closed predecessor needs an explicit completion reconciliation path (`session-handoff-ack.store.ts:403`; `session-handoff.service.ts:441-450`).

## Data flow and decisions

Partial `findByPredecessor` (`session-handoff-ack.store.ts:219-228`) → caller/path checks on that snapshot (`session-handoff.service.ts:357-383`) → complete, serialized transition with successor check (`:396-409`; `session-handoff-ack.store.ts:395-409`) → **gap:** `already` does not establish `closePending` → closer (`session-handoff.service.ts:410-444`) → **gap:** rejected completion write leaves `closePending` with no reliable absent-tab reconciliation (`:445-456`).

**Decision:** Request changes. Accepting the new guard would address the dangerous stale-copy close, but would leave incorrect results for a completed concurrent ack and failed persistence. This decision is reversible after state-specific transition handling and a recovery test with an absent second close.

## Verification and scope

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` — **PASS**, 3 suites, 110 tests.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — **PASS**, exit 0.
- Ptah tools, including `ptah_get_diagnostics`, were not listed in this lane; native read-only inspection and the permitted scoped compiler check were used.

Reviewed commit `05ee51522`, the acknowledgement service and store control flow, the changed specs, the close result mapping, the task context, round 6 review, and repository instructions. No source or spec files were edited. No claim is made about races between the complete read and external writes; the confirmed race above concerns the state already observed by `transition`.
