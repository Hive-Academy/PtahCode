# Code Logic Review: P6 Chat foundation C (TASK_2026_2295_p6, program TASK_2026_2288_acp1)

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 4        |
| Failure modes found | 5        |

Scope: `git diff` plus the untracked files in the worktree (base `85bd83f99`). I read the full changed regions of `chat-session.service.ts` (start 1840-1930, continue 2340-2410, resume 3085-3360), the slash router (230-520), `session-rpc.handlers.ts` (list, validate), `session-driver.ts`, `provider-session-failure.ts`, the adapter error type and `nativeExecutionOf`. Nothing here is reachable yet: the registry has no provider-session entry, so every finding is latent. I did not run tests. I relied on the batch report's check results and on reading the specs' diffs.

## Five logic questions

### 1. How does this fail silently?
- No new `catch` swallows an error and returns a literal. The only new handlers map a typed error to a coded result (`provider-session-failure.ts:17-60`), or fall through to the old generic path when it returns `undefined`.
- List shows `messageCount: 0` for provider sessions (`session-rpc.handlers.ts:226-232`). This is documented. The user sees "no count", not a wrong count, and nothing is claimed.
- `cancelled` maps to `{ success:false, cancelled:true }` with no `errorCode` (`provider-session-failure.ts:23-24`). This is identical to `codexFailure` (`chat-session.service.ts:1018-1020`). The follow-up queue then receives `followUpRefusalCode = undefined` (`:2369`), also the same as Codex.

### 2. What user action produces unexpected behaviour?
- `/clear` on a provider session only interrupts it (`chat-slash-command-router.service.ts:245-253`). Only `nativeAdapter.owns()` closes the native session, and that is Codex-only. The provider-session process and its pool slot stay open until the tab or app closes. Combined with `PROVIDER_SESSION_LIMIT`, repeated `/clear` can exhaust slots (M-1).
- `/compact` returns the coded `PROVIDER_SESSION_UNSUPPORTED_OPTION`. This is placed before the reservation and the adapter call (`:350-361`), so there is nothing to release.

### 3. What input data produces a wrong answer?
- A session row with a `codexExecution` of an unrecognised `runtime` value is native for `nativeExecutionOf` (a plain `??`, `session-metadata-store.ts:236-246`). The list therefore skips the transcript scan and shows 0 (`session-rpc.handlers.ts:636,692`, `storedNativeMessageCount`). Before P6 the strict literal compare scanned it. The worker driver uses a strict compare and treats the same row as Claude. Only corrupt rows are affected; see M-3.
- `session:validate` accepts a provider-session binding by `sessionId` and thread record only. It does not compare the binding's `workspaceId` with `params.workspacePath` (`session-rpc.handlers.ts:236-253, 1411`). The Codex branch (`:1403-1409`) does not compare either, so this is parity with Codex, not a regression. The workspace is gated by `isAuthorizedWorkspace` (`:1396`), and the real resume goes through `storedChatRuntimeIdentity` and `prepare`, which are workspace-aware. The worst case is a session of another authorised workspace reporting `exists:true` (M-2).

### 4. What happens when a dependency fails?
- The adapter `resumeSession` throws a `resume-failed` error. `commitAdmission` was done, so the `finally` runs `rejectAdmission(..., 'SESSION_CHANGED')` (`chat-session.service.ts:3254-3267`). The coded result then comes back through `nativeFailure` (`:3299-3300`). Correct.
- The adapter throws `auth-required`. The result is `AUTH_REQUIRED` with the hint and `providerId`; the hint can only travel in `error` (M-4).
- An adapter throws an error that is not a `ProviderSessionChatAdapterError`. It lands on the old generic path, which returns `error.message` raw (`:3315-3326`). This is existing behaviour for Claude and is not changed. P7 must throw only the typed error.

### 5. What is missing that the requirements never mentioned?
- No `ChatRuntimeAdmissionError` mapping (M-5). The error is not exported, so `chat-session.service` cannot match it.
- No stored message count for provider sessions.
- The resumed turn is not covered by an "already active" case. `wasActive` is used only for child tool profiles (`:3243`); this is the same as Codex.

## Failure modes

### Provider session stays open after /clear
- Trigger: `/clear` on a live provider session.
- Symptom: the UI says "cleared", but the provider process and pool slot persist; later `chat:start` can hit `PROVIDER_SESSION_LIMIT`.
- Evidence: `chat-slash-command-router.service.ts:245-253`. `closeSession` runs only when `this.nativeAdapter?.owns()`, and `owns` is implemented only by the Codex adapter and the routing adapter (`routing-agent-adapter.ts:380-381`).
- Current handling: interrupt only.
- Recommendation: add the provider-session close in P7 when the adapter exists. Not reachable now.

### Validate accepts another workspace's binding
- Trigger: `session:validate` for a provider session id whose `providerSessionExecution.workspaceId` differs from `params.workspacePath`.
- Symptom: `exists:true`. The tab reopens and the real resume then fails or resumes in the stored workspace.
- Evidence: `session-rpc.handlers.ts:236-253`; Codex parity at `:1403`.
- Recommendation: optionally compare the binding's workspace id with the normalised `workspacePath`, for both natives together.

### Native detection differs between list and worker
- Trigger: malformed row with a `codexExecution` object but a wrong `runtime`.
- Symptom: list shows 0 and skips the scan, while the worker driver treats it as Claude.
- Evidence: `session-rpc.handlers.ts:636` and `:692` (truthy test through `nativeExecutionOf`) against `session-driver.ts:36-45` (strict literal).
- Recommendation: make `storedNativeMessageCount` and the list use the same strict check, or accept the difference as corrupt-data only.

### Sign-in hint and option text go to the renderer unbounded
- Trigger: an adapter sets `signInHint` or `option` to long or odd text.
- Symptom: arbitrary provider-supplied text in the error box. It is not a raw runtime cause, but it is not sanitised either.
- Evidence: `provider-session-failure.ts:26-31` (`error.signInHint?.trim()`) and `:35-37` (`error.option` in the template).
- Recommendation: cap length (for example 200 chars), drop control characters, and reject a hint that looks like a path or token. The credential-free rule rests only on the P7 adapter contract (`provider-session-chat-adapter-error.ts:19-21`), and nothing here enforces it.

### Admission mismatch is uncoded
- Trigger: the P5 routing adapter throws `ChatRuntimeAdmissionError` (not exported, `routing-agent-adapter.ts:20`) with a provider-session execution.
- Symptom: generic uncoded error text. The message is fixed text, so there is no leak.
- Recommendation: export it and map it in a later phase.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

- M-1: `/clear` does not close a provider session. The out-of-scope note is correct and fair to defer to P7. It must land before any registry entry; add it to the P7 checklist. `chat-slash-command-router.service.ts:245`.
- M-2: validate does not compare workspace. Parity with Codex. `session-rpc.handlers.ts:236-253`.
- M-3: strict versus truthy native detection (see above). `session-rpc.handlers.ts:636,692`.
- M-4: hint length and content are not bounded at the mapping boundary. `provider-session-failure.ts:26-31`. The hint also travels in `error`, not a dedicated field; P9 is expected to fix that. `AUTH_REQUIRED` carries a provider-session provider id, so the P9 renderer must not treat it as an auth-providers id.
- M-5 (minor): `ChatRuntimeAdmissionError` unexported. Assessment: deferral is acceptable because the resolver refuses first today.
- Minor: stale comment at `chat-slash-command-router.service.ts:479-481` still cites `PROVIDER_SESSION_UNAVAILABLE` as the typed-refusal example.
- Minor: `PROVIDER_SESSION_COMPACT_UNSUPPORTED` is exported from a service file, and the text is generic rather than provider-named (a reasoned decision in the report).

## Data flow

1. chat:start, provider session: `prepare` returns the provider-session execution (OK). The start switch has three arms and is exhaustive (`:1884-1896`). The Codex arm is unchanged: it still wraps `nativeStartConfig` (plugin roots undefined) in `withCodexStartLineage`. The Claude arm still uses `startConfig`. The provider arm starts plain (OK). `pendingLineage` is deleted after any native start (`:1903`). For Codex this was already the behaviour; it is now the same for provider sessions. Notices stay Codex-only (OK).
2. Failure at start: `nativeFailure` is `codexFailure ?? providerSessionFailure` at all 7 sites. Order is Codex first, so Codex behaviour is unchanged (OK).
3. chat:continue resume: `nativeId` is computed for any non-Claude runtime (`:3236-3239`). `commitAdmission` runs before the resume. `acceptResumed` runs after it. `rejectAdmission` runs on failure. `promptDelivered` is true for both natives (`:3295-3296`). The Claude resume is unchanged because every changed condition is `!== 'claude-sdk'`, and `ResolvedChatExecution` has exactly three runtimes, so Codex gets the same result as before (OK).
4. Legacy lineage upgrade is skipped for both natives (`:3335-3340`) (OK).
5. Slash: `/compact` refused for provider sessions before the reservation (OK). Model for both natives is `seed.model` (OK). The Codex compact path is untouched (OK). The catch maps provider failures after the Codex branch and before account and generic paths; the reservation is released in `finally` (OK).
6. list and validate: native rows skip the transcript scan; validate needs a parsed binding for this session plus a parsed non-empty thread record (OK, with M-2 and M-3).
7. Worker driver: attach is native for both. `continue` refuses provider sessions with a new code that the wire maps to `INTERNAL`, as for `CODEX_UNAVAILABLE` (OK).

## Focus checks, answered

1. Codex and Claude identical: yes. The three-arm switch is exhaustive and Codex keeps its own arm. The generalised conditions are all `!== 'claude-sdk'`, which differs from the old `=== 'codex-app-server'` only for `provider-session`. Plugin roots, lineage, notices and follow-up receipts for Codex are unchanged.
2. Resume and follow-up: correct order, and no double send because `promptDelivered` is set. One accepted item: `cancelled` gives an undefined refusal code, as for Codex.
3. `providerSessionFailure`: fixed text for every code. No cause or `operation` text reaches the user. `auth-required` carries the provider and the hint. The hint is unbounded (M-4); it is the only provider-supplied text.
4. validate and list: see M-2 and M-3. Sessions of other profiles are shape-validated by the schema, but the profile is not matched against the host's list. That is fine because the resolver refuses unlisted profiles at resume.
5. Worker helper: logically the same as `nativeExecutionOf` for valid rows. It is stricter on corrupt rows (M-3). A comment says it is the "structural twin"; there is no test that ties the two together.
6. Removed specs: `4651900766 ... PROVIDER_SESSION_UNAVAILABLE` only built `provider-session` through `harness(...)` and asserted the `refuseProviderSessionExecution` throw. That function no longer exists, so the removal is right. The CodeRabbit fix is still pinned by the kept case `still releases the compact reservation when a typed refusal is rethrown` (`chat-slash-command-router.native.spec.ts:344`), and the production `if (slashError instanceof RpcUserError) throw slashError;` plus the `finally` release are intact (`chat-slash-command-router.service.ts:482-483, 507-518`). The deleted `refuseProviderSessionExecution` spec block is also correct to remove.
7. Degradation audit: no new catch. Clean.
8. Out-of-scope notes: both are valid, neither blocks P6. `/clear` is the more important one (M-1).

## Requirements fulfilment

| Requirement                                      | Status   | Gap                                                |
| ------------------------------------------------ | -------- | -------------------------------------------------- |
| Native conditions generalised, Codex-only kept   | COMPLETE | None                                               |
| `providerSessionFailure` at every call site      | COMPLETE | Hint bounds (M-4)                                  |
| validate (exists / missing thread)               | COMPLETE | Workspace not compared (Codex parity)              |
| list: stored count, no scan                      | PARTIAL  | Count is 0 (no stored field yet; documented)       |
| `/compact` unsupported, notices Codex-only       | COMPLETE | None                                               |
| Worker refusal with new code                     | COMPLETE | None                                               |
| Specs for each row of the verification table     | COMPLETE | Codex "live reopen" item is the coordinator's      |

Implicit requirements not addressed: provider-session close on `/clear` (P7); `ChatRuntimeAdmissionError` mapping.

## Edge cases

| Case                                           | Handled | How                                          | Concern                                  |
| ---------------------------------------------- | ------- | -------------------------------------------- | ---------------------------------------- |
| Resume fails after a committed follow-up       | YES     | `finally` rejects the admission              | None                                     |
| Empty prompt with attachments only             | YES     | One native turn                              | None                                     |
| Blank sign-in hint                             | YES     | Fixed fallback text                          | None                                     |
| Unknown or Codex error through the mapping     | YES     | Returns `undefined`                          | None                                     |
| Binding for another session id                 | YES     | `sessionId` equality, falls to JSONL         | None                                     |
| Binding for another workspace                  | NO      | Not compared                                 | M-2                                      |
| Corrupt native row shape                       | PARTIAL | Different checks in list and worker          | M-3                                      |
| `/clear` on a provider session                 | PARTIAL | Interrupt only                               | M-1                                      |

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH for Codex and Claude parity (the diff is small and the conditions are exhaustive); MEDIUM for provider-session behaviour, which cannot be exercised until P7.
- Top risk: a provider session left open by `/clear` once a registry entry makes the runtime reachable.
- What a robust implementation would add: provider-session close on `/clear`; a length cap and control-character strip on `signInHint` and `option`; a shared strict native check for list and worker with a consistency test; a workspace comparison in validate for both natives; an exported and mapped `ChatRuntimeAdmissionError`; fix the stale comment at `chat-slash-command-router.service.ts:479`.
