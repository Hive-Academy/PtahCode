# Batch report: P6 "Chat foundation C" (TASK_2026_2295_p6, program TASK_2026_2288_acp1)

Worktree `D:/projects/PtahCode/.claude-worktrees/provider-session-p6`, branch `feat/provider-session-p6`,
base HEAD `85bd83f99` (P4 + P5). Nothing staged or committed.

Nothing new is reachable. The registry still has no `providerSession` entry. The resolver refuses
any provider-session profile that the host does not list, and bootstrap still lists none. The
routing adapter (P5) also refuses when no provider-session adapter is bound.

## Delivered, mapped to Component 7 (B-1)

| Plan item | Delivered |
|---|---|
| `chat-session.service` `:1145` carry-over `served` | Already generalised in P4 (`execution.seed.providerId` for every non-Claude arm). No change. |
| `:1876-1885` `withCodexStartLineage`: Codex only; provider sessions get a plain start config | The start is now an exhaustive `switch` with three arms. Codex wraps `nativeStartConfig` in `withCodexStartLineage`, as before. The new `provider-session` arm calls `startChatSession(nativeStartConfig)`, which sets `pluginConfigAncestorRoots: undefined` and has no lineage wrapper. Claude uses `startConfig`, as before. P4's `refuseProviderSessionExecution` call is removed. |
| Pending lineage after a native start | Generalised. The tab's `pendingLineage` entry is deleted after any native start, because the native identity is written before the start returns. This was already the Codex behaviour (see Decisions). |
| `publishRuntimeNotices`: Codex only | Still guarded by `execution.runtime === 'codex-app-server'` at start and at resume. The slash router keeps its Codex-only guard too. |
| `:2141-2142,3196,3217-3227,3251,3274-3276`: native resume starts the turn; `commitAdmission` / `acceptResumed` receipts; `pluginConfigAncestorRoots: undefined` | Generalised with `execution.runtime !== 'claude-sdk'`. This covers: the follow-up `nativeId` (commit before the resume; accept after it, or reject on failure); the resume config without plugin roots; and `promptDelivered`. The files/images arm was already the non-Claude `else` branch, and only its comment changed. P4's up-front continue refusal (`PROVIDER_SESSION_UNAVAILABLE`) is removed. |
| `:3315` skip the legacy plugin-root upgrade | Generalised. `upgradeLegacyLineage` returns early for a `codexExecution` or `providerSessionExecution` row. |
| `providerSessionFailure()` next to `codexFailure()`, wired at every call site | New `RH/chat/session/provider-session-failure.ts`. A private `nativeFailure(error) = codexFailure(error) ?? providerSessionFailure(error)` replaces `codexFailure` at all 7 call sites: start, carry-over start, agent child, handoff, continue send, resume RPC, and continue resume. Codex runs first, then provider sessions, then the existing generic path, in the same order as before. |
| Mapping | `cancelled` gives `{ success:false, cancelled:true }`. `auth-required` gives `{ success:false, errorCode:'AUTH_REQUIRED', providerId?, error: signInHint }`, with fixed fallback text when the hint is blank. The other codes map as follows: `busy` to `PROVIDER_SESSION_BUSY`, `limit` to `PROVIDER_SESSION_LIMIT`, `unavailable` to `PROVIDER_SESSION_UNAVAILABLE`, `resume-failed` to `PROVIDER_SESSION_RESUME_FAILED`, `runtime-failed` to `PROVIDER_SESSION_RUNTIME_FAILED`, and `unsupported-option` to `PROVIDER_SESSION_UNSUPPORTED_OPTION` (with the option name). All of these use fixed text, so a runtime cause is never shown to the user. Any other error gives `undefined`. |
| `ProviderSessionChatAdapterError` | New `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error.ts`, at the path Component 8 names, exported from the agent-sdk barrel. It has `code`, `operation`, and the optional `providerId`, `signInHint` and `option`, plus `isProviderSessionChatAdapterError`. See Deviations. |
| `session-rpc.handlers` `:601,657` list: generalised, stored count, no transcript scan | `nativeExecutionOf(s)` now decides both the transcript-scan skip and the count source. The count comes from `storedNativeMessageCount`: the Codex row's stored count, and 0 for a provider session (see Deviations). |
| `:1366-1375` `session:validate` | A provider session exists when `providerSessionExecution` parses through the shared `parseSessionRuntimeIdentity` as `runtime:'provider-session'` for this `sessionId`, and `parseProviderSessionThreadRecord(providerSessionThread)` is defined (`nativeSessionId` is non-empty). Then validate returns `{ exists:true }` with no JSONL lookup. Otherwise it falls through to the existing JSONL lookup. The Codex branch is unchanged and runs first. |
| `chat-slash-command-router` `:372-444` | `/compact` on a provider session returns `{ success:false, sessionId, errorCode:'PROVIDER_SESSION_UNSUPPORTED_OPTION', error:'This chat provider does not support /compact.' }`. This happens right after `prepare`, before any manual-compact reservation, resume or adapter call. The slash model is `execution.seed.model` for both native runtimes. Runtime notices stay Codex only. In the catch, `providerSessionFailure` maps a coded adapter error to `{ ...failure, sessionId }`, after the Codex branch and before the account / RpcUserError / generic paths. P4's `refuseProviderSessionExecution` is removed. |
| `subagent-rpc.handlers.ts:191` | Left unchanged, as the plan says. |
| `worker-runtime/session-driver.ts:25,281,297` | Assumption checked: `DriverErrorCode` is local to worker-runtime. The structural `SessionRuntimeMetadata` type gains `providerSessionExecution?`. A local `nativeRuntimeOf` (the structural twin of `nativeExecutionOf`; worker-runtime does not depend on agent-sdk) sets the transcript-attach native flag for both runtimes. `continue` throws the new `PROVIDER_SESSION_UNAVAILABLE` for provider sessions and keeps `CODEX_UNAVAILABLE` for Codex. The worker wire maps both codes to `INTERNAL`, as it already did for `CODEX_UNAVAILABLE` (`connection.ts` allow-list). |
| Interim refusals | `refuseProviderSessionExecution` and `PROVIDER_SESSION_CHAT_UNAVAILABLE` are deleted from `chat-runtime-profile.service.ts`, since nothing uses them after P6. agent-sdk's `PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE` (the P5 router refusal) is unchanged. |

### Specs (P6 verification row)

| Required | File / cases |
|---|---|
| validate | `session-rpc.handlers.spec.ts`, new cases: an existing provider session gives `exists:true` with no fs access. Each of these falls through to the JSONL lookup: a missing thread, an empty native id, a binding for another session, and a malformed binding (`it.each`). |
| list | `session-rpc.handlers.spec.ts`, new case: a provider-session row lists count 0, even with a stray `codexMessageCount`, and its JSONL is never read. The Claude row in the same list still counts from its transcript. |
| resume follow-up | `chat-continue.provider-session.spec.ts` (rewritten from P4's refusal case). Cases: one resume carries the prompt, files, images and seed model, with no plugin roots, no providerProfile, no second send and no Codex notice. An attachment-only follow-up is one turn. A queued follow-up runs `commitAdmission`, then the resume, then `acceptResumed`, and gets `queueState:'admitted'`. `resume-failed` gives `PROVIDER_SESSION_RESUME_FAILED`, then `rejectAdmission(..., 'SESSION_CHANGED')`, and the cause is not leaked. `cancelled` gives a cancelled result. A provider-session row skips the legacy-lineage upgrade. |
| start | new `chat-session.provider-session.spec.ts`. Cases: a plain native config with the seed model, no `withCodexStartLineage` and no notice; pending lineage cleared; `limit` gives `PROVIDER_SESSION_LIMIT`; `auth-required` gives `AUTH_REQUIRED` with the hint and providerId. |
| slash | new `chat-slash-command-router.provider-session.spec.ts`. Cases: `/compact` is unsupported, with no reservation, compact, resume or launch. `/review` relaunches with the seed model and no notice. `busy`, `unavailable` and `runtime-failed` are mapped, and the cause is not leaked. |
| each error-code mapping | new `provider-session-failure.spec.ts`. It covers all 8 codes, the option name, the blank-hint fallback, and the `undefined` result for Codex, plain and non-error values. |
| worker refusal | new `worker-runtime/src/lib/session-driver.provider-session.spec.ts`. Cases: attach is native; continue refuses with `PROVIDER_SESSION_UNAVAILABLE` before `chat:continue`; a Codex row keeps `CODEX_UNAVAILABLE`; an unknown runtime value is treated as Claude. |
| Codex cases unchanged | `chat-session.native.spec.ts`, `chat-continue-codex-resume-once.spec.ts`, `session-driver.spec.ts`, and the existing validate/list cases are unmodified and pass. |

## Files

Created:
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter-error.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/provider-session-failure.ts` (+ `.spec.ts`)
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.provider-session.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.provider-session.spec.ts`
- `libs/backend/worker-runtime/src/lib/session-driver.provider-session.spec.ts`

Modified (production):
- `libs/backend/agent-sdk/src/index.ts` (barrel export only)
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-runtime-profile.service.ts` (interim refusal deleted)
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts`
- `libs/backend/worker-runtime/src/lib/session-driver.ts`

Modified (specs):
- `chat-continue.provider-session.spec.ts`: P4's refusal spec, rewritten for the real path.
- `chat-runtime-profile.provider-session.spec.ts`: P4 spec; the `refuseProviderSessionExecution` block is removed along with the function.
- `chat-slash-command-router.native.spec.ts`: one test removed, `4651900766: keeps the PROVIDER_SESSION_UNAVAILABLE code of a provider-session refusal`. It pinned P4's interim refusal, which P6 replaces. Its other case (an RpcUserError is rethrown and the compact reservation is still released) is kept unchanged.
- `session-rpc.handlers.spec.ts`: new cases only; no existing case changed.

## Deviations, each with its reason

1. **`ProviderSessionChatAdapterError` is created in P6, not P7.** The plan's mapping consumes the error's `.code`, but no lib declared the type. I created it at the exact path Component 8 lists for P7, with the codes the mapping needs. Its `providerId`, `signInHint` and `option` fields carry the auth-required hint and the option name. P7 throws it. If P7 adds codes, the exhaustive `switch` in `providerSessionFailure` fails typecheck until each new code is mapped.
2. **The sign-in hint travels in `error`.** `ChatStartResult` / `ChatContinueResult` have no `signInHint` field. The plan says "the existing auth-required result with signInHint", so the result is the existing `AUTH_REQUIRED` + `providerId` shape, and the hint is the user-facing `error` text. A dedicated field and the banner action belong to the P9 renderer work.
3. **The list count is 0 for provider sessions.** The plan says "stored count". There is no stored provider-session count field yet, and the metadata store only preserves `codexMessageCount` on Codex rows. So the list never scans a transcript for these rows, and it lists 0, which hides "N msgs", until a stored count is added (P7 adapter / metadata). `codexMessageCount` is not read for provider-session rows.
4. **"/compact unsupported result".** No existing unsupported result exists for slash commands, so I used the closest coded shape: `PROVIDER_SESSION_UNSUPPORTED_OPTION` with fixed text, the same kind as `CODEX_UNSUPPORTED_OPTION`.
5. **The worker driver uses a local structural helper instead of `nativeExecutionOf`.** worker-runtime does not depend on agent-sdk. Adding that edge for one `??` would pull agent-sdk into the worker bundle.
6. **Three P4 provider-session spec sites changed** (listed above). They asserted the interim refusals that the task says P6 replaces. No Codex or Claude assertion changed.

## Decisions

- Pending lineage is cleared after a provider-session start, the same as Codex. Options: keep it until `sessionIdResolved` or session end, or delete it now. Evidence: the native identity write happens before the start returns (Component 8). `pendingLineage` is keyed by tab, while session end deletes by session id, so a native adapter that never fires `sessionIdResolved` with a tab id would leak the entry. Reversible.
- Provider-session failure text is generic ("This chat provider ..." / "The provider session ..."), not the provider's name. A name would need a registry lookup that has no entries until P9. Reversible.

## Checks (lane-focused; no `npm run verify`, no nx)

Jest (`npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath ...`). The `node_modules` junction was present.
- worker-runtime: `session-driver.provider-session.spec.ts`, `session-driver.spec.ts`. Result: `Test Suites: 2 passed, 2 total; Tests: 28 passed, 28 total`.
- rpc-handlers batch 1: `provider-session-failure`, `chat-session.provider-session`, `chat-slash-command-router.provider-session`, `chat-slash-command-router.native`, `chat-runtime-profile.provider-session`. Result: 4 suites passed, 32 tests passed. `provider-session-failure.spec.ts` failed to load with "tsyringe requires a reflect polyfill". I added `import 'reflect-metadata'` and reran it in batch 2.
- rpc-handlers batch 2: `provider-session-failure`, `chat-continue.provider-session`, `session-rpc.handlers`. Result: `Test Suites: 3 passed, 3 total; Tests: 193 passed, 193 total`. After a spec-only lint fix, `session-rpc.handlers` alone gave `Tests: 176 passed, 176 total`.
- rpc-handlers Codex/Claude regression: `chat-session.native`, `chat-continue-codex-resume-once`, `chat-session.carry-over-launch`, `chat-session-agent-child`, `chat-carry-over.provider-session`, `chat-session.follow-up-queue`. Result: `Test Suites: 6 passed, 6 total; Tests: 160 passed, 160 total`.
- rpc-handlers regression 2: `chat-continue-slash-before-resume`, `chat-session-policy-roots`, `chat-session-resume-activate`, `chat-session-provider-profile`, `chat-runtime-profile.service`, `chat-slash-command-persona`, `chat-session-auth`. Result: `Test Suites: 7 passed, 7 total; Tests: 124 passed, 124 total`.

Typecheck (`npx tsc --noEmit --project ...`, `NODE_OPTIONS=--max-old-space-size=4096`; the heavier ones under `node scripts/verify.mjs --exec`). All exited 0:
- `libs/backend/agent-sdk/tsconfig.lib.json`
- `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/rpc-handlers/tsconfig.spec.json` (25.3 s under the lock)
- `libs/backend/worker-runtime/tsconfig.lib.json`, `libs/backend/worker-runtime/tsconfig.spec.json`
- `apps/ptah-electron/tsconfig.app.json`
- `libs/backend/cli-engine/tsconfig.lib.json`, `libs/backend/platform-cli/tsconfig.lib.json`, `libs/backend/worker-host/tsconfig.lib.json`

ESLint (`npx eslint <16 changed/new files>`): exit 0, `0 errors`. The warnings left are already in the code: `preserve-caught-error` at existing throw sites in `session-rpc.handlers.ts`, and `max-lines` on `chat-session.service.ts` / `session-rpc.handlers.ts`. My two `no-non-null-assertion` warnings in the new spec cases are fixed. `@nx/enforce-module-boundaries` was skipped ("No cached ProjectGraph"). The new imports follow existing edges: rpc-handlers to agent-sdk and shared/schemas; agent-sdk to shared.

`node scripts/check-home-paths.mjs <changed files>`: exit 0. Fixture paths use `dev`.

Degradation audit: the diff adds no `catch`.

Not run (by rule): `npm run verify`, nx targets, full project suites, the Electron live check "Codex reopen + follow-up unchanged" (the coordinator's live item).

## Out-of-scope observations

- `/clear` on a provider session only interrupts. Only the Codex `nativeAdapter.owns()` path also closes the native thread. P7 may want a provider-session close there (the plan does not list it for P6).
- `ChatRuntimeAdmissionError` (the P5 router refusal) is not exported from agent-sdk, so if it ever reaches chat:start it lands on the generic uncoded path. Today the resolver refuses first.
