# Code Logic Review — TASK_2026_951_0539

Verdict: APPROVED (no blockers, no should-fix). Read-only; no tests run.

## Checked
- linkedSignal (session-stats-source.ts): the source now carries mainProviderId; a change of main provider recomputes and drops a stale other-provider owner. Resolved host owner still wins. OK.
- injectMainProviderId in every caller: injectSessionStatsSource is used by chat-view.component.ts (spec provides AuthStateService stub, spec:692), canvas-inspector-dock.component.ts (spec provides none; AuthStateService is providedIn root and the function already injects the real ChatStore/PlanLimitsStore there, so the extra root service is the same class of dependency), and session-stats-source.spec.ts (provides stub). No missing-provider path found.
- OWNER_PROVIDER_NAMES vs provider-owner.resolver.ts PROVIDER_DISPLAY_NAMES: same ids (anthropic, openai-codex, ollama-cloud, kimi-code, opencode, opencode-go, opencode-zen, antigravity, grok). Match. Fallback is owner.label, never Claude; Object.hasOwn guards prototype keys.
- Other Claude assumptions in the session stats UI: grep of chat-ui molecules/session finds only a comment and types doc; no remaining hard-coded label.

## Notes (non-blocking)
1. note — session-stats-source.ts unresolvedSessionOwnerKey, unknown main provider (undefined/null): keeps the last shown owner, whereas the plan ring (usage-vitals.model.ts ~300) shows nothing for null. A Claude owner can therefore remain visible while auth is loading or failed to load, until activeProviderId resolves (then it is dropped). Consistent with the stated design, brief window only; null (auth failed) keeps it indefinitely.
2. note — "same rule as the ring" compares activeProviderId to QuotaOwnerRef.providerId. If a main provider id has no owner of the same id (e.g. an Anthropic-compatible provider whose owner is 'anthropic'), the unresolved session shows no limits. Same behaviour as the ring, so consistent.
3. note — stats-limit-view-model.ts: sessionProviderLabel is only set when session.owner exists; otherwise the row label is 'Session'. Acceptable.
4. note — tests: the session-stats-source.spec regression (Claude last shown, then Codex main, unresolved s2 -> plan:c:weekly + label 'Codex') and the lanes spec (render with Codex owner, no 'Claude' text) do prove the regression. The backend plan-limit-ledger spec test was not examined beyond confirming it is test-only.
