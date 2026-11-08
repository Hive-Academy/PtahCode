# CodeRabbit second-pass resolution

| Review location | Severity | Decision | Resolution and evidence | Spec |
| --- | --- | --- | --- | --- |
| `agent-sdk/compaction-config-provider.ts:103` | Minor | Already fixed in `a34117e92` | Null is unset and `parseAgentBudgetSetting` enforces descriptor limits; `compaction-config-provider.ts:97-102`. | `compaction-config-provider.spec.ts`, `agent-budget-policy.spec.ts` |
| `agent-sdk/compaction/subagent-resume-advice.ts:12` | Minor | Already fixed in `a34117e92` | Uses `state.warningRatio` and prints context figures only for a context warning; `subagent-resume-advice.ts:17-22`. | `subagent-resume-advice.spec.ts` |
| `cli-agent-runtime/cursor-cli.adapter.ts:499` | Minor | Already fixed in `a34117e92` | A rejected `run.wait()` is caught and stream or run usage remains available; `cursor-cli.adapter.ts:483-501`. | `cursor-cli.adapter.spec.ts` |
| `cli-agent-runtime/opencode-cli.adapter.ts:1074` | Major | Already fixed in `a34117e92` | Every `step_finish` is collected and valid step totals and costs are aggregated; `opencode-cli.adapter.ts:961-984,1090`. | `opencode-cli.adapter.spec.ts:1014` |
| `cli-agent-runtime/lane-budget-deadline.ts:27` | Minor | Already fixed in `a34117e92` | Timer delay is capped at Node's maximum and rearmed until the deadline; `lane-budget-deadline.ts:22-28`. | `lane-budget-deadline.spec.ts` |
| `cli-agent-runtime/copilot-sdk.adapter.ts:514` | Major | Fix | Collects all usage events, sums valid counters and complete costs, and preserves per-model totals; `copilot-sdk.adapter.ts:424-429,510-541`. | `copilot-sdk.adapter.spec.ts:681` |
| `cli-agent-runtime/opencode-cli.adapter.ts:962` | Major | Fix | Uses the selected model when supplied; when the stream and options omit it, retains validated token totals under the explicit `opencode/unknown` identity. No actual model is inferred; `opencode-cli.adapter.ts:775,883,961-984`. | `opencode-cli.adapter.spec.ts:1033` |
| `codex-runtime/codex-context.ts:436` | Minor | Fix | Terminal child usage resolves its known parent tool ID without relinking the child; `codex-context.ts:519-527`. | `codex-context.spec.ts:228-234` |

## PR thread replies

**Compaction config:** This was resolved in `a34117e92`. Null settings now retain the default, and each supplied value is checked against the settings descriptor limits before the final schema parse.

**Resume advice:** This was resolved in `a34117e92`. The refusal uses the configured warning ratio and shows context token figures only when context triggered the warning.

**Cursor wait:** This was resolved in `a34117e92`. A failed post-stream `wait()` is caught, and the completed turn still uses stream or run usage for telemetry.

**OpenCode step aggregation:** This was resolved in `a34117e92`. The adapter collects every step's usage and cost, reports totals only when the step counters are complete, and has a multi-step regression spec.

**Lane deadline:** This was resolved in `a34117e92`. The timeout delay is capped at Node's maximum and rearmed until the real deadline, preventing overflow from stopping a lane immediately.

## Decisions

- For OpenCode events with valid counters but no model identity, retained token accounting with an explicit `opencode/unknown` label. The alternatives were to make all telemetry unavailable or invent a concrete model. The shared turn usage contract accepts a provider-labelled unknown model; actual pricing remains based on reported cost only. Reversible.

## Verification

- Scoped Ptah diagnostics: zero errors and warnings.
- `npm run verify -- -p shared,agent-sdk,cli-agent-runtime,codex-runtime,ptah-electron,cli-engine`: all 12 lint/typecheck tasks passed. The test phase passed 4 project tasks and failed in `codex-runtime` and `cli-agent-runtime` on two spec expectations. An existing OpenCode expectation still required the old unknown-model label despite an explicit requested model; the new Codex fixture omitted a required usage counter. Both were corrected. `npm run verify -- -t test -p cli-agent-runtime,codex-runtime -- '--testPathPatterns=codex-context.spec.ts|opencode-cli.adapter.spec.ts|copilot-sdk.adapter.spec.ts'` then passed both project tasks.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL, 216 unsuppressed sites within baseline.
- Final scoped Ptah diagnostics: zero errors and warnings.
