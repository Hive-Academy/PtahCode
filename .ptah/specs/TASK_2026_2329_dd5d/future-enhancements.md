# After-QA modernization scan — TASK_2026_2329_dd5d

This scan covers the implemented flows, accepted phase and cross-family reviews, the scoped test logs, and the renderer configuration reached by the banner fix. Observed local tooling versions were Angular 22.2.7, Nx 24.0.6 and Tailwind CSS 3.4.19.

| # | Opportunity | Priority | Effort | Source files evidenced |
| --- | --- | --- | --- | --- |
| 1 | Stabilize harness skill search pagination | Medium | Medium | 2 |
| 2 | Isolate the plugin session-notice test from ancestor directories | Medium | Small | 1 |
| 3 | Close Electron DI fixtures after background SQLite reconciliation | Medium | Medium | 3 |
| 4 | Improve resume discovery and watcher recovery | Medium | Medium | 2 |
| 5 | Share the default install-count comparator | Low | Small | 4 |
| 6 | Simplify analysis workspace-switch reset guards | Low | Small | 1 |
| 7 | Audit state opacity utilities during the renderer’s Tailwind migration | Low | Medium | 3 |

## 1. Stabilize harness skill search pagination

Backend review M1 identified one prefix-sorting implementation at `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts:148`. Its only production `searchPage()` caller is `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/harness-namespace.builder.ts:693`. Growth of the upstream prefix can move an entry across page boundaries after sorting when upstream relevance order differs from download order. Evaluate caching a single upstream window of up to 200 rows per query, sorting once, and enriching only the visible page. This depends on retaining the existing upstream cap and cache invalidation semantics. Test unsorted fixtures across consecutive pages, duplicate prevention, and the unknown-total contract at the ceiling.

## 2. Isolate the plugin session-notice test from ancestor directories

The fixture hard-codes its project below `/tmp` at `libs/backend/rpc-handlers/src/lib/handlers/plugin-rpc.handlers.session-notice.spec.ts:43` and asserts the selected root at line 130. The focused rerun picked `/tmp` because that directory contains `.ptah` on this host. Use a deterministic filesystem boundary for ancestor discovery or a fixture that controls the policy-root markers seen by that lookup. Exercise root selection with and without an ancestor marker. The prior task documents the host failure in [decision D27](../TASK_2026_2325_899d/decisions.md).

## 3. Close Electron DI fixtures after background SQLite reconciliation

The passing Electron run logged two late SQLite requires from `apps/ptah-electron/src/di/container.smoke.spec.ts` and `apps/ptah-electron/src/di/workspace-state-storage-single-instance.spec.ts`. Both stacks reached `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:186`. A Jest worker also needed forced exit. Trace the fixture-owned startup and shutdown promises, then await reconciliation or stop it at the existing lifecycle boundary. Validate the two suites in isolation and with the Electron target. The causal link between the two stacks and the worker exit remains to be tested.

## 4. Improve resume discovery and watcher recovery

The frontend re-review warns that `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:395` returns the same empty shape for an RPC error that legacy callers can receive on success. The runner treats a missing active flag as transient, stops after bounded failures, and preserves the last known state at `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:427`. Add a typed read outcome or dedicated status API before changing the retry policy. The cross-family review also found that the completion poll at line 394 consumes analysis state while one-shot discovery at line 567 supplies the generation resume offer. Exercise a new generation offer during a watched run, plus an exhausted burst of transport errors followed by completion or reconnection. Retain legacy response compatibility and workspace isolation.

## 5. Share the default install-count comparator

Frontend review m2 recorded duplicate comparison in `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts:79` and `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:177`. The scan found the same default normalization and tie order in `libs/backend/cli-agent-runtime/src/lib/skills-directory/skills-sh-api-client.ts:92` and `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:81`. Move the four default comparisons to shared code near the shared entry contract. Preserve recommendation-specific description tie-breaks and the judge-specific candidate representation. Cover invalid counts and ties at the shared boundary.

## 6. Simplify analysis workspace-switch reset guards

The second frontend re-review recorded nested live-state guards at `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts:80`. Express the reset rule as one named predicate after checking its optional runner compatibility and the handling of local, hydrated, and cancelling runs. Retain the multi-workspace navigation tests so cleanup cannot clear another workspace’s analysis state.

## 7. Audit state opacity utilities during the renderer’s Tailwind migration

The final review’s resume-banner finding is resolved in this task. Two neighboring uses of `border-state-need/70` remain at `libs/frontend/onboarding/src/lib/shared/recovery-screen.component.ts:59` and `libs/frontend/onboarding/src/lib/shared/owner-conflict-banner.component.ts:18`. The renderer configuration at `apps/ptah-extension-webview/tailwind.config.js:2` imports the Nx dependency glob helper, which emitted a deprecation warning during the focused CSS check. Verify emitted rules and light/dark contrast when adjusting the state color tokens. Test content discovery across renderer imports as part of a separately scoped Tailwind upgrade.

## Additional review observation

The cross-family review noted that `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:916` can stamp an active list row only once the run has a slug. The review found no visible impact before the checkpoint exists. A future change to checkpoint creation should cover the pre-slug window in the list handler regression tests.
