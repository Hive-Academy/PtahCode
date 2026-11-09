# Code logic re-review: MCP auth reject fix

Verdict: APPROVED
Score: 8/10
Review family: antigravity (implementers: codex, claude)

Scope: `git diff` of 10 files, plus `git diff -w`, plus a repo-wide grep for the changed and removed symbols. No tests, builds or diagnostics were run (the orchestrator owns `npm run verify`).

## Check results

1. **Accepted fixes are correct and complete.**
   - F1: `codex-chat-host-ports.ts` now only swaps the literal for `INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS` (import at `:27`, use at `:409`). The `CODEX_CHAT_MCP_TTL_MS` constant is gone. The `sessions` wrapper is not in the diff.
   - A repo grep finds no live reference to `pendingSubjects`, `sessionSubjects` or `MCP_SESSION_CREDENTIAL_INVALID_MESSAGE`.
   - The remaining `deps.sessions` hits are unrelated. `codex-chat-session-controls.ts` uses its own `deps.sessions` map. `codex-legacy-session-settings.ts:38` and `native-session-controls.ts:284` are existing `sessions` ports.
   - Electron's override at `apps/ptah-electron/src/di/codex-runtime-composition.ts:921-939` revokes `id` and `tabId(id)` inside try/finally, so the 7-day Codex token is revoked on close.
   - F5: `MCP_CREDENTIAL_INVALID_MESSAGE` (`mcp-caller-auth.types.ts:24`) is imported and used at `mcp-caller-token-registry.ts:363`. The wording covers session, lane and config tokens.
   - The 7-day constant sits in `platform-core` (`mcp-caller-credentials.interface.ts:28`) and is re-exported from `platform-core/src/index.ts:166`. Both consumers import it from the public alias, which is the allowed dependency direction.
2. **Prettier-only hunks.** I read the full `git diff -w -U2` of `mcp-caller-token-registry.ts` and `mcp-caller-auth.types.ts`. The only non-formatting changes are:
   - the added `MCP_CREDENTIAL_INVALID_MESSAGE` import;
   - `authRequiredFailure(MCP_CREDENTIAL_INVALID_MESSAGE)` at `:363`;
   - the new constant and the optional `message` parameter in the types file.

   Everything else is re-wrapping (parameters, chained `.map`, ternaries, the `persistQueue` then-callbacks). I found no behaviour change.
3. **Callers of changed exports.**
   - `authRequiredFailure(message = MCP_AUTH_REQUIRED_MESSAGE)`: the other callers (`mcp-caller-token-registry.ts:349,355` and `mcp-http-gate.ts:120`) pass no argument and keep the generic message. This is source and behaviour compatible.
   - `INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS`: used only at `sdk-query-options-builder.ts:2233` and `codex-chat-host-ports.ts:409`.
   - `MCP_CREDENTIAL_INVALID_MESSAGE`: used only in the registry.
   - Expiry is enforced at `mcp-caller-token-registry.ts:378` (`expiresAt <= now`). A longer TTL only delays natural expiry, and teardown revoke still applies.
4. **F2 and F3.**
   - F2 (deferral): I agree. The leak is pre-existing, and the record is in memory, bound to localhost and cleared at server stop. The window grows from 4 h to 7 d, so the follow-up should be tracked, not dropped.
   - F3 (dispute): I agree. `revokeSubject` (`mcp-caller-token-registry.ts:141`) is immediate, so the late-close-revokes-next-session race is independent of the TTL. It is not worsened by this diff.

## Findings

1. **Minor** — `mcp-caller-token-registry.ts:141`, `sdk-query-options-builder.ts:2233`, `codex-chat-host-ports.ts:409`.
   - **Defect:** the 7-day TTL raises the cost of the deferred F2 leak (failed-open credentials survive 7 d instead of 4 h) and of any unrevoked path.
   - **Fix:** the named follow-up should include revoke-on-`profile()`-failure and unique per-issue subjects, with a short comment pointing to it. Not a blocker for this change.

## Five logic questions

- **Does it do what was asked?** Yes. Long-lived interactive sessions no longer hit 401 after 4 h, and the rejection message is neutral.
- **Failure paths:** unrevoked failed-open tokens (F2) and the tab-keyed subject race (F3) are pre-existing and deferred.
- **Removed symbols and compile errors:** none found.
- **Callers:** all compatible.
- **Formatting-only claim:** verified.

Remaining uncertainty: I did not run the specs. I rely on the orchestrator's verify log for the agent-sdk, rpc-handlers and vscode-lm-tools targets.

## Decisions

- Approve despite the deferred F2 and F3. Options were to block until unique subjects land or to approve with a tracked follow-up. Evidence: both defects pre-date the diff, and revocation is immediate whatever the TTL. Reversible: yes.
