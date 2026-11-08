# CodeRabbit review resolution

| Review location | Severity | Decision | Resolution and evidence | Spec |
| --- | --- | --- | --- | --- |
| `.gitignore:232` | Minor | Fix | Moved `.opencode/agent/` outside the reconciler-owned block; `.gitignore:233`. | Reconciler behavior inspected; no executable spec for this ignore rule. |
| `agent-sdk/compaction-config-provider.ts:103` | Minor | Fix | Null is unset, and external settings now use descriptor bounds via `parseAgentBudgetSetting`; `compaction-config-provider.ts:97`, `agent-budget-policy.ts:17`. The policy's smaller internal thresholds remain valid for deterministic unit tests. | `compaction-config-provider.spec.ts`, `agent-budget-policy.spec.ts` |
| `agent-sdk/compaction/subagent-resume-advice.ts:12` | Minor | Fix | Refusal uses the configured warning ratio and prints context figures only for a context warning; `subagent-resume-advice.ts:17`. | `subagent-resume-advice.spec.ts` |
| `cli-agent-runtime/agent-process-manager.service.ts:2583` | Minor | Fix | Continuation now rejects any budget stop while release is in progress; `agent-process-manager.service.ts:2581`. | `agent-process-manager.service.spec.ts` budget-stop continuation regression. |
| `cli-agent-runtime/agent-spawn-environment.service.ts:283` | Minor | Fix | Valid settings survive an unrelated invalid setting; each key validates independently; `agent-spawn-environment.service.ts:277`. | `agent-spawn-environment.service.spec.ts` |
| `cli-agent-runtime/acp/acp-session-handle.ts:778` | Major | Fix | ACP turn IDs now include the run identity, with a random per-handle fallback; `acp-session-handle.ts:263,780`. | `acp-session-handle.spec.ts` checks the same session resumed in two runs. |
| `cli-agent-runtime/cursor-cli.adapter.ts:492` | Minor | Fix | A failed post-stream `wait()` retains stream or run usage and reports successful completion; `cursor-cli.adapter.ts:483`. | `cursor-cli.adapter.spec.ts` |
| `cli-agent-runtime/opencode-cli.adapter.ts:1060` | Major | Fix | Aggregates all step totals and cost, retaining per-step models; incomplete step usage becomes unavailable; `opencode-cli.adapter.ts:958,1087`. | `opencode-cli.adapter.spec.ts` |
| `cli-agent-runtime/lane-budget-deadline.ts:25` | Minor | Fix | Timer delay is capped at Node's maximum and rearmed until the actual deadline; `lane-budget-deadline.ts:22`. | `lane-budget-deadline.spec.ts` |
| `cli-agent-runtime/lane-completion-notifier.service.ts:860` | Minor | Fix | Progress pointer selects a nonempty deliverable written by this run; `lane-completion-notifier.service.ts:859`. | `lane-completion-notifier.service.spec.ts` empty and stale deliverable regressions. |
| `cli-agent-runtime/lane-resume-gate.ts:124` | Major | Fix | Gate checks elapsed lifetime, and manager supplies settings for every stored budget record; `lane-resume-gate.ts:125`, `agent-process-manager.service.ts:724`. | `lane-resume-gate.spec.ts` |
| `codex-runtime/codex-context.ts:435` | Major | Fix | Unlinked trailing notifications no longer re-add completed children; child turns relink on `turn/started`; `codex-context.ts:433,499`. | `codex-context.spec.ts` |
| `shared/agent-turn-usage.types.ts:62` | Major | Fix | Fallback IDs include a run identity; Pi, OpenCode, ACP, Copilot, Antigravity and Ptah CLI supply one; `agent-turn-usage.types.ts:57,62`. | `agent-turn-usage.types.spec.ts` |

## Decisions

- Kept the policy's internal positive token thresholds to support small deterministic policy tests, while enforcing the contributed settings' tighter bounds at both external configuration readers. The alternative was tightening the policy schema globally; the descriptor and test usage show these are distinct boundaries. Reversible.
- Capped and rearmed the lifetime timer because the internal coordinator permits a longer duration than the contributed settings UI. Reversible.

## Verification

- `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,platform-core,ptah-electron,cli-engine,platform-cli`: all 16 lint/typecheck tasks passed. Six project test tasks passed. The test phase failed in platform-core (the two known session-driver-lock failures) and cli-agent-runtime (one new fixture error and one timing-sensitive lane integration assertion). The fixture was corrected, both affected specs passed focused reruns, and the complete cli-agent-runtime test set passed a subsequent `npm run verify -- -t test -p cli-agent-runtime -- --testPathPatterns=.` run.
- Focused OpenCode, Codex context, and ACP specs passed. The new manager and notifier regressions passed together; the spawn-environment and lane terminal outcome specs passed on rerun.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL; 216 unsuppressed sites within baseline.
- Scoped Ptah diagnostics after final spec edits: zero errors and zero warnings. The selected projects' lint and typechecks passed in the full verification.
- `agent-process-manager.service.ts`: 3,671 nonblank lines, below the 3,675 limit.

No review comment was disputed, so there are no PR-thread dispute replies.
