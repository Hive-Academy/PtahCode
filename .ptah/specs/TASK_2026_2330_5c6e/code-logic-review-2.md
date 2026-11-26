# Code Logic Review 2 — `TASK_2026_2330_5c6e`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 6/10 |
| Verdict | REVISE |
| Blocking | 1 |
| Serious | 1 |
| Moderate | 2 |

The live Electron path and model mapping have useful coverage. The score stays below 7 because an admitted lane skill can become a successful ordinary model turn. It stays above 4 because the primary live/resumed resolution path is implemented and the earlier compaction findings remain fixed.

## Five logic questions

### 1. How does this fail silently?

A raw lane skill with no fresh resolution still reaches `startTurn` without `skill` (`codex-app-server-lane.adapter.ts:834-841`). The receipt therefore reports a started turn although Codex received plain text.

### 2. What user action produces unexpected behaviour?

Start a new main chat with an enabled skill. `startSession` launches the prompt directly (`chat-session.service.ts:1187-1245`), and `open` supplies only text and attachments (`codex-chat-adapter.ts:502-507`). The new lookup runs only for follow-ups (`chat-slash-command-router.service.ts:402-417`).

### 3. What input data produces a wrong answer?

Lane admission is case-insensitive (`lane-command-filter.ts:57-64`), but skill resolution uses case-sensitive `includes` (`codex-context.ts:996-1000`). `/SESSION-HANDOFF` can be admitted raw and then sent as plain text. A stale cached name has the same result (`agent-message-coordinator.service.ts:602-610`).

### 4. What happens when a dependency fails?

Unsupported `skills/list` correctly returns an empty catalog (`codex-context.ts:1018-1021`). Other failures propagate. Both lane catalog reads use `Promise.all`, so a skill failure also discards a successful model read (`codex-app-server-lane.adapter.ts:996-1012`, `codex-app-server-lane-catalog.ts:33-37`). Main-chat lookup failures become `runtime-failed` through `safe` (`codex-chat-adapter.ts:998-1000`, `codex-chat-adapter.ts:1367-1375`).

### 5. What is missing that the requirements never mentioned?

Add first-message main-chat coverage, stale/disabled and case-variant lane tests, and a built-in collision matrix. The current tests cover only the happy-path skill name and fresh resolution.

## Findings

### Blocking — An admitted lane skill falls back to a plain model turn

- **Files:** `agent-message-coordinator.service.ts:602-610`, `lane-command-filter.ts:57-64`, `codex-context.ts:996-1000`, `codex-app-server-lane.adapter.ts:834-841`
- **Trigger:** Use different letter case, or disable/remove a skill after the lineage catalog was cached.
- **Impact:** Raw admission succeeds. Fresh resolution returns `undefined`, and the adapter starts an ordinary turn. The user sees a successful response instead of a refusal or native skill execution.
- **Fix:** Make admission and resolution use the same case rule. Reject an admitted raw skill before `startTurn` when fresh resolution fails. Do not persist a raw retry decision that can bypass a changed catalog.

### Serious — A skill used as the first main-chat message is not resolved

- **Files:** `chat-session.service.ts:1187-1245`, `codex-chat-adapter.ts:502-507`, `chat-slash-command-router.service.ts:402-417`
- **Trigger:** Open a Codex chat and send `/orchestration` as its first message.
- **Impact:** The initial `turn/start` lacks structured skill input. Only follow-up and resumed-session commands use the new path.
- **Fix:** Resolve an enabled skill before the initial turn and attach it to `CodexTurnInput`. Add a `chat:start` regression test.

### Moderate — A skill can shadow an unsupported built-in

- **Files:** `chat-slash-command-router.service.ts:403-417`, `slash-command-interceptor.ts:8`
- **Trigger:** Advertise an enabled skill named `review`, then send `/review`.
- **Impact:** The skill runs because only `model`, `status`, and `clear-style` are excluded. The documented `/review` built-in no longer keeps its typed refusal. Other built-ins have the same gap.
- **Fix:** Apply a complete shared built-in collision policy. Keep the unqualified built-in refusal and allow a plugin-qualified skill name where available.

### Moderate — Optional skill discovery can remove working model options

- **Files:** `codex-app-server-lane.adapter.ts:996-1012`, `codex-app-server-lane-catalog.ts:33-37`
- **Trigger:** `skills/list` rejects or returns an invalid result while `model/list` succeeds.
- **Impact:** Live and stopped lane option reads fail as a whole. Existing models and efforts disappear behind the generic catalog error.
- **Fix:** Settle model and skill reads independently. Preserve successful model data and report skill discovery as unavailable.

## Confirmed sound paths

- Disabled skills are filtered, and plugin-qualified aliases resolve to `{ type: 'skill', name, path }` (`codex-context.ts:1007-1017`).
- `resolveCodexModel` has only Codex callers. Existing `CODEX_DEFAULT_TIERS` consumers are unchanged (`codex-provider-entry.ts:20-27`, `codex-chat-session-controls.ts:243-251`, `workspace-provider-profile-resolver.ts:427-455`). Claude, ACP, agy, and provider-session routing do not call the new helper.
- The preamble mark occurs after turn admission, and the second stream-liveness recheck precedes non-Codex teardown (`codex-app-server-lane.adapter.ts:875-894`, `chat-session.service.ts:3707-3715`).

## Verification

Read the uncommitted production diff, changed specs, prior reviews, and relevant dispatcher, process, and initial-start paths. No tests ran; CI verifies. Scoped `ptah_get_diagnostics` was unavailable: the first request exceeded 45 seconds and the retry exceeded its 1024 MB limit. The implementer reports 551 passing tests before the follow-up and 110 passing tests after it (`skill-fix-and-live-test.md:9-15`). Those results do not cover the findings above.
