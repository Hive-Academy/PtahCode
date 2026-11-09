# Code logic review: MCP auth reject fix

Verdict: REVISE
Score: 5/10
Review family: antigravity (implementer: codex)

Scope: the full `git diff` (10 files), `codex-chat-host-ports.ts` in full, the consumers `codex-chat-adapter.ts`, `codex-chat-session-controls.ts`, `apps/ptah-electron/src/di/codex-runtime-composition.ts`, `mcp-caller-token-registry.ts`, `sdk-query-options-builder.ts` and `session-control.service.ts`. No tests were run (read-only). The implementer reports Jest cannot start in this worktree because of the `marked` mapping, so none of the new specs have executed. Prettier flags all 8 changed source and spec files.

## Five logic questions

1. **Does it do what was asked?** The 7-day constant is shared and the 401 message is changed. The Claude path is correct. The Codex revoke does not run in the shipping host (Electron); see finding 1.
2. **Failure at each boundary?** An open that fails after `profile()` and before `sessions.opened` leaks a 7-day token (finding 2). A throwing `revokeSubject` skips the downstream `closed` (finding 4).
3. **Concurrency and re-entry?** A same-tab re-open followed by an old-session close revokes the new token (finding 3).
4. **Is the new message true?** It is wrong for persistent `.mcp.json` and lane tokens (finding 5).
5. **Do the tests prove the criteria?** Partly (finding 6).

## Findings

1. **Serious** — `codex-chat-host-ports.ts:297-314` with `apps/ptah-electron/src/di/codex-runtime-composition.ts:921-939`.
   - **Defect:** Electron is the only caller of `createCodexChatHostPorts` outside specs. It spreads `...ports` and then overrides `sessions` with its own `{opened, closed}`. That override calls `sessions.closed(id)` (its own adapter-level port) and never calls `ports.sessions.closed`. The new `pendingSubjects`/`sessionSubjects` revoke logic is therefore dead code in production. The implementation report's claim that the Codex teardown "now revokes the matching subject" is only true for the spec.
   - **What does revoke today:** Electron already revokes `id` and `tabId(id)` itself, so the 7-day Codex token is revoked on close. The behaviour is correct by accident of the override, but the duplicated, untested logic is misleading.
   - **Fix:** Pick one owner. Either delete the new wrapper and keep the Electron revoke (add a spec in the composition), or have the Electron override delegate to `ports.sessions.closed`, and drop its own revoke. The second option removes the duplication.

2. **Serious** — `codex-chat-host-ports.ts:422-431, 558-560`; `codex-chat-adapter.ts:~386, ~456`.
   - **Defect:** The token is issued in `profile()`, but revocation is tied to `sessions.opened` and `closed`. The adapter calls `closed(stagedId)` only when `stagedId` is set, and that happens just before `opened`. If anything fails between `profile()` returning and `opened` (admission rejected, identity mismatch, `checkOpening` cancellation), or `profile()` throws after the issue (resume mismatch at `:543-550`, `resolveBillingMode`, `realpath` errors), the token is never revoked. Before this change the leak lasted 4 h. Now it lasts 7 days or until server stop. The entry in `pendingSubjects` is also GC'd silently.
   - **Fix:** Revoke in `profile()` on its own failure path (try/catch around the part after issue, rethrow). For failures after `profile()` returns but before `opened`, add a `profileDiscarded` callback or have the adapter call `closed` for any prepared profile that never reaches `opened`.

3. **Serious** — `codex-chat-host-ports.ts:429, 306-311` (and Claude `sdk-query-options-builder.ts:2232, 1079` for the same reason).
   - **Defect:** The subject is keyed by `routingId` (the tab id), not by the session id. Revocation removes every record with that subject. If a tab closes session A and opens session B (or the old session's `closed` runs late after B's `profile()`), A's close revokes B's fresh token. B's tool calls then return 401 immediately, which is the symptom being fixed. Claude has the same shape with `claude-interactive:<tab>`. Electron's `closed` is also called twice for the same subject via `id` and `routingId`.
   - **Subject collision:** a bare `routingId` has no prefix, unlike `claude-interactive:<id>`. It can match a lane `agentId` subject, or a Claude tab that uses the same string.
   - **Fix:** Make the subject unique per issue (include the session or context id, or a counter), and prefix it (`codex-chat:`). Revoke only that exact token, or revoke the subject only if no newer session still holds it. This needs a test with an old close after a new open.

4. **Moderate** — `codex-chat-host-ports.ts:306-312`.
   - **Defect:** `closed` calls `revokeSubject` before `deps.sessions?.closed`, without try/finally. If revoke throws (lazy resolve in `register.ts:128`), the downstream `closed` is skipped. The Electron override uses try/finally; this wrapper does not. `opened` has the mirror problem: if `deps.sessions.opened` throws, `pendingSubjects` is not cleaned up.
   - **Fix:** `try { revoke } finally { deps.sessions?.closed }`.

5. **Moderate** — `mcp-caller-token-registry.ts:349`; `mcp-caller-auth.types.ts:19-20`.
   - **Defect:** Every well-formed token that misses lookup now returns "Ptah session credential expired or was revoked. Recreate the affected session". That branch also covers unknown persistent `.mcp.json` tokens (stale hash after a state reset) and lane tokens. For those, "recreate the session" is wrong; the recovery is to regenerate the config or restart the lane. For an external client the message mentions a session it never had.
   - **Checked:** no consumer matches the old string for the unknown-token case. `http-server.handler.ts:417, 456` keep the generic message, and the other `Authentication required` hits are unrelated.
   - **Fix:** Reword to be neutral: "Ptah credential is unknown, expired or was revoked. Reconnect or recreate the session or config that issued it." Alternatively, distinguish a lane or session record that has expired or was revoked from a hash that never existed. The registry cannot tell revoked from unknown, so neutral wording is the realistic option.

6. **Moderate** — specs.
   - **Codex close test (`codex-chat-host-ports.spec.ts:~527-530`):** it covers only the happy path in the unused wrapper. It does not cover open failure, a same-tab reopen, or the Electron composition path (findings 1-3), and it cannot catch finding 1.
   - **Registry test:** it proves 4 h + 1 min accepted, exactly 7 days rejected, revoke rejected, and the message. The handler spec asserts the 401 body contains the message and not the token.
   - **Execution:** none of these have run (`marked` mapping). The Codex fix for TS2345 and the handler assertion were not re-run. Treat the criteria as unproven until verify is green.
   - **Fix:** add the missing cases and get the specs to execute.

7. **Minor** — formatting and style.
   - Prettier warns on all 8 changed source and spec files. `authRequiredFailure(message = MCP_AUTH_REQUIRED_MESSAGE)` at `mcp-caller-auth.types.ts:61` exceeds the line width. Several imports are unsorted or over long. Run `prettier --write` on the changed files.

## Claude path (question 2)

- `session-control.service.ts:242,336,405` call `revokeMcpSubject`, which revokes `claude-interactive:<tab>`. Teardown revocation is present on session end paths.
- `buildMcpServers` runs once per `build()`, which `executeQuery` calls once per session start or resume (`session-query-executor.service.ts:1809`), not per turn. Tokens per session are therefore bounded and revoked at teardown. A resume that does not tear down first leaves an extra record until teardown, which is minor.
- Expired records are never pruned in `lookup` (`mcp-caller-token-registry.ts:357-375`). Only revoke and server stop clear them. Combined with finding 2, abandoned sessions retain records for the life of the server.

## Imports and typing (question 5)

- No `any`, `@ts-ignore` or `as unknown as` added. No `console`. Only public `@ptah-extension/platform-core` imports. No new Nx edge, because rpc-handlers, agent-sdk and vscode-lm-tools already depended on platform-core.

## Decisions

- **Score 5/10 (REVISE):** the age fix and the 401 split are sound, but the Codex revoke path is dead in Electron (1), leaks on failed open (2), and can revoke a newer token on tab reuse (3). Those are real gaps, so the review falls in the 5-6 band. It would reach 7 once 1-3 are fixed or shown to be out of scope.
- **Same-tab re-open and the Electron double revoke were treated as pre-existing design** for Claude. It is reported as one finding because the 7-day lifetime makes the survivor window much worse than 4 h.
- **Reversible:** all of the above are code-only changes.
