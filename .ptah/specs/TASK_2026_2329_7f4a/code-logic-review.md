# Code-Logic Review — TASK_2026_2329_7f4a

**Verdict: PASS** · **Score: 8/10**

Independent review of `.nx/full-auto-review/production.diff` (base `6a99ab936` vs worktree), read against true file line numbers. I did not run tests, did not run builds, and made no changes. The scoped TypeScript diagnostics did not complete inside the lane window (three attempts, each cut at 45 s); the coordinator's `npm run verify` gate stays the authority for types.

---

## What I verified (with evidence)

**ACP / Antigravity live yolo (`acp-session-runtime.ts`)**
- The fast path at `acp-session-runtime.ts:568-580` runs only for a UI-bound chat (`config.approvals` set), only while `livePermission === 'yolo'`, and never for `switch_mode` — mode-switch confirmations stay interactive, as required.
- It fails closed: `decideAcpPermission` picks `allow_once`, else `reject_once`, else cancels with `refused` (`acp-permission-policy.ts:98-124`). A refused decision falls through to the UI sink at line 581 instead of silently cancelling the tool call.
- Live updates and downgrades: `trackPermission` (`acp-session-runtime.ts:1986-1988`) runs only after `acp.setMode` succeeds (`acp-provider-session-runtime.ts:343-360`); a failed mode switch throws first, so `livePermission` never diverges from the agent's mode. A yolo→ask/plan downgrade skips the fast path, and the sink path passes `permission: livePermission` into `approvalTitle` (`acp-session-runtime.ts:585-588`), so the Manual "Leave plan mode" card still renders. The per-turn plan reset for Manual chats uses the live level (`acp-session-runtime.ts:1646-1664`).
- Re-acquire after an idle close: `attach` re-applies `settings.permission` to the fresh process (`provider-session-chat-adapter.ts:384-387`), and setup now derives the mode from `livePermission` (`acp-session-runtime.ts:1412-1415`). No prompt runs in the window before the re-apply.

**Codex yolo and child approvals (`codex-runtime`)**
- The yolo line at `codex-permission-policy.ts:22` sits after the `userInput` and `plan` guards, so user input prompts and plan refusal are preserved; widened file-change grants now accept under yolo, per decision #4.
- Children now get the parent's policy with `ruleStoreHit` forced false (`codex-approval-bridge.ts:327-334`), so a child grant stays turn-scoped and consults no reusable rule. `userInput` still routes through `requestUserInput` regardless of policy (`codex-approval-bridge.ts:474-477`).
- Next-turn semantics hold: `turnPermissionLevel` freezes the level for the running turn (`codex-context.ts:322-330`), `setSessionPermissionLevel` writes `updateNextTurn` plus settings (`codex-chat-session-controls.ts:231,240`), and the bridge reads the level lazily per request — a mid-turn yolo→plan downgrade applies on the next turn.

**Per-session propagation and `config:autopilot-get`**
- `createProviderSessionChatSession` seeds `settings.permission` only for true Ptah levels (`provider-session-chat-session.ts:51-65`); `isPermissionLevel` drops SDK aliases such as `bypassPermissions`, and `setSessionPermissionLevel` keeps the settings in sync (`provider-session-session-controls.ts:204-207`). The readback `settings.permission ?? live.getPermission()` (`provider-session-chat-adapter.ts:216-223`) therefore tracks runtime changes.
- DI wiring resolves: `SDK_TOKENS.ROUTING_AGENT_ADAPTER` is registered by `registerCodexChatServices` (`register.ts:1180-1208`, called from `registerSdkServices` at `register.ts:276`); the factory is nullable and the handler is null-safe (`config-rpc.handlers.ts:136-139, 533-537`). The Claude lifecycle still takes precedence, and the local symbol in `ptah-api-builder.service.ts:630` matches `Symbol.for('ProviderSessionAdapter')` at `tokens.ts:73`. Both new constructor injects are optional and last, so existing positional calls keep compiling.

**Antigravity spawn/resume parent ID and level**
- `parentLanePermission` consults the provider-session adapter after Codex misses, with its own resolved session id (`cli-agent-runtime/.../parent-lane-permission.ts:36-45`). It is wired at lane spawn (`ptah-api-builder.service.ts:805-811`), at lane resume (`register-agent-messaging.ts:236-248`, `unknownParent: 'uncapped'` kept), and in `resolveNativeCallerId` (`ptah-api-builder.service.ts:1263-1267`) and `resolveCallerSdkSessionId` (`:1298-1299`). An unknown parent still caps to plan at spawn. The raw caller-supplied `parentLevel` is still dropped at `agent-namespace.builder.ts:758,778`; only the trusted lookup feeds the lane.

---

## Findings

**1. Low — child approvals in a plan-mode Codex session now auto-decline with no prompt** (behavior change, accepted)
`codex-approval-bridge.ts:327-334` and `:353-356`. Old code forced child requests to `'present'` and spared them from the plan auto-decline; new code applies the parent's plan level, so a child command or file-change request is declined without a card.
Trigger: plan-mode Codex chat → native child thread → child requests a command approval.
Assessment: consistent with the parent (parent requests in plan already declined) and with the pinned D17 rule "child no looser than parent". No code change needed. Document the change in the PR body so reviewers do not read it as a regression.

**2. Low — `RoutingAgentAdapter.getPermissionLevel` does not resolve tab-id callers**
`routing-agent-adapter.ts:242-247`. Every sibling port (`resolveLiveSessionId` in `ptah-api-builder`, `parentLanePermission`) resolves a tab id first; this method does a direct map lookup and returns `undefined` for a tab id. Its only current caller (`config-rpc.handlers.ts:536`) passes the resolved session id from the renderer, so the readback works today. A future caller passing a tab id gets a silent `null` instead of an error.
Fix if desired: try `this.resolveLiveSessionId(sessionId)` first, or keep as-is and note the contract "session id only" on the interface.

**3. Low — the `switch_mode` guard trusts `toolCall.kind`**
`acp-session-runtime.ts:568-571`. If Antigravity ever emits a mode-change permission request with a different shape (no `toolCall`), a yolo chat auto-approves it. The guard matches the vendor shape used by `approvalTitle` (`antigravity-acp-profile.ts:326-327`) and the recorded live probe. The pending live Electron verification is the remaining check for this.

**4. Info — verification not run in this lane**
No tests, no build, and the scoped type check did not complete. Static reading found no type or token mismatch (see DI evidence above), but the gate result is not yet in evidence for the working-tree (uncommitted) portion of the diff.

---

## The five logic questions

1. **Silent failure:** the new lookups are all optional DI. On a host where `ROUTING_AGENT_ADAPTER` or `PROVIDER_SESSION_CHAT_ADAPTER` is unbound, every new path degrades to the old behaviour (`sessionPermissionLevel: null`, parent capped to plan) with no error or log. The ACP yolo fast path also emits no `approvalRequested`/`approvalSettled` events, so an operator cannot audit auto-approved calls from the UI alone.
2. **Unexpected user action:** toggling Full Auto off mid-turn behaves differently per provider by design — ACP applies at the next permission request, Codex on the next turn. A user approving a child request "for session" in ask mode still records a reusable rule (`codex-approval-bridge.ts:376-385` has no `!isChild()` guard on record, only on lookup) — pre-existing, and safe-directional, since children never read rules.
3. **Wrong answer instead of error:** an ACP request with no `allow_once` option is refused and falls to the UI, not mis-answered. A `switch_mode` request with an unexpected shape would be auto-approved in yolo (finding 3). SDK alias levels (`bypassPermissions`) silently fall back to the live process policy instead of erroring — intended per the pinned spec.
4. **Dependency failure:** a failed `setMode` throws before `trackPermission` (no divergence); a missing sink falls to the headless policy; an unwritable bridge transport throws `'Approval transport unavailable'`; a rule-store miss degrades to a turn-scoped accept, never to a session grant.
5. **Missing from requirements:** the child-in-plan auto-decline (finding 1) is a real behaviour change that no requirement or decision records; there is also no telemetry line when the yolo fast path auto-approves, which the Electron verification may want for evidence.

---

## Paths inspected

Read in full or in the cited ranges: `acp-session-runtime.ts`, `acp-provider-session-runtime.ts`, `acp-permission-policy.ts`, `antigravity-acp-profile.ts`, `codex-permission-policy.ts`, `codex-approval-bridge.ts`, `codex-context.ts` (bridge wiring, `turnPermissionLevel`), `codex-chat-session-controls.ts`, `provider-session.types.ts`, `provider-session-chat-session.ts`, `provider-session-chat-adapter.ts`, `provider-session-session-controls.ts`, `routing-agent-adapter.ts`, `codex-chat-adapter.ts` (getPermissionLevel/resolveLiveSessionId), `register.ts` (DI factories), `tokens.ts`, `config-rpc.handlers.ts`, `parent-lane-permission.ts` (both copies), `register-agent-messaging.ts`, `ptah-api-builder.service.ts`, `agent-namespace.builder.ts`, `autopilot-state.service.ts`, `autopilot-popover.component.ts`; plus task docs (`context.md`, `batches.md`, `decisions.md`, batch reports).

**Score rationale:** 8/10 — the change set is fail-closed, honours every recorded decision, and preserves the pinned contracts (switch_mode, userInput, next-turn). It stays below 9 because one behaviour change (child-in-plan decline) is undocumented outside the code, one port accepts only session ids without saying so, and no gate or live run has yet confirmed the working-tree portion of the diff.

## Coordinator disposition

The requested Kimi Code lane reached its provider limit before giving a verdict. The independent report above came from the handoff's Ollama Code fallback.

- The Codex Plan decline for native child tool requests is intentional under D17. User input still uses the normal prompt.
- Live readback accepts a resolved session ID. The contract now says so on the adapter.
- ACP mode changes with an absent kind stay interactive, matching the existing Antigravity fixture. The fast path also cancels requests that arrive after a turn interrupt, session abort, or process retirement. Regression cases cover an absent kind and an interrupt in progress.
- DI token spelling in the reviewer text above is abbreviated. The actual key is `Symbol.for('ProviderSessionChatAdapter')` at both injection sites.

## Focused re-review

Ollama Code returned **PASS** on the ACP kind and cancellation guard and the resolved-ID contract note. It found no defect in the focused diff. This pass was static.
