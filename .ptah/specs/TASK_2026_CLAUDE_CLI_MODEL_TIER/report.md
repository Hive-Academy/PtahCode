## Root cause

`ptah_agent_spawn` forwards `model` and `modelTier` separately (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1329-1330`). `modelTier` applies only to `ptahCliId` lanes (`tool-description.builder.ts:709-721`); a system `cli: "claude"` lane uses `model`. The process manager resolves that explicit model (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:925-926,1062`), and the adapter passes it to SDK options (`cli-adapters/claude-cli.adapter.ts:184,209-225,253`). Native model discovery only gates effort (`claude-cli.adapter.ts:522-529`), not the chosen model. Thus an explicit `model: "haiku"` is not silently replaced with Sonnet by Ptah.

If the caller supplied `modelTier: "haiku"` with `cli: "claude"`, that tier was ignored by the documented system-CLI contract; the SDK then used the configured Claude model or its default, which can explain Sonnet usage. The configured `provider.claude-cli.cliAgent.modelTier` mapping belongs to configured Ptah CLI lanes, not the system Claude lane. If the caller supplied `model: "haiku"`, Ptah passed Haiku to the SDK, so the observed $0.14 Sonnet charge alone cannot prove the main query was Sonnet; SDK subagents or fallback calls may contribute usage. The original spawn arguments and SDK `modelUsage` keys are needed to distinguish those cases.

There is a separate usage attribution defect: `PtahCliStreamLoop.turnUsage` summed `result.modelUsage` across model keys, then labeled all tokens and cost with the last top-level stream model (`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:795-829`). That label could misidentify the SDK usage.

## Fix

`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:797-820`: label usage with the SDK's `modelUsage` key when exactly one model was billed. Leave aggregate mixed-model usage unlabeled.

## Tests

`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.spec.ts:326`: requested `haiku` reaches SDK runner options.

`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.spec.ts:670-724`: mixed-model aggregate has no model label; a single Haiku SDK usage key reports Haiku even when a stale stream event says Sonnet.

## Verification

Initial unquoted PowerShell test command failed before Nx started because `|` was interpreted as a pipeline. The corrected `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- '--testPathPatterns=claude-cli.adapter.spec.ts|ptah-cli-stream-loop.service.spec.ts'` passed: Nx reported 1 task succeeded, 0/1 cache hits, exit code 0. `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime` passed: Nx reported 2 tasks succeeded, 0/2 cache hits, exit code 0. The runner used dynamic output, so it did not print `Running target ... for N projects` headers; the task counts confirm one project. No suite failed. `ptah_get_diagnostics` timed out after 45 seconds and returned unchecked coverage; scoped typecheck subsequently passed.

## Live check needed

Coordinator: spawn one `cli: "claude"` lane with `model: "haiku"` and a one-word response task. Check the lane policy log says `model: haiku`, the SDK session start reports a Haiku model, and the completion usage model matches the SDK `modelUsage` key. This is a paid call; do it only if a live check is warranted.

## Decisions

- Apply `modelTier` to configured `ptahCliId` lanes and system Claude lanes. System Claude uses the tier as a native SDK alias when no explicit model is supplied; other system CLIs ignore it. Reversible.
- For mixed SDK usage, omit a single model label because no one model owns the aggregate. Reversible.

## Round 1 fixes

- `AgentSpawnEnvironment.resolveModel` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts`) now treats `modelTier` as a Claude request alias only when `model` is absent. `AgentProcessManager.doSpawnSdk` passes the tier to that resolver, then passes the resolved model to the adapter. This is the minimal change to the manager; it avoids the other batch's `lane-completion-outcome.ts` work.
- `ClaudeCliAdapter.runSdk` (`cli-adapters/claude-cli.adapter.ts`) uses `modelTier` before its configured default. Its spec now tests tier-only Haiku in SDK options and explicit-model precedence. `agent-spawn-environment.service.spec.ts` tests the system Claude resolution and confirms Codex ignores the tier.
- `tool-description.builder.ts` describes the new system Claude contract; `protocol-dispatcher.ts` logs `unset` instead of a fabricated Sonnet tier. The shared `SpawnAgentRequest` comment matches the contract.
- `addCliUsage` (`libs/shared/src/lib/utils/cli-usage.utils.ts`) clears an earlier model label when a later unlabeled usage report carries aggregate cost. Its spec covers the stale-label regression.
- Follow-up owned by another batch: `lane-completion-outcome.ts:157` can still assign mixed-model aggregate cost to `info.model`; this round does not edit that file.
- Live check for the coordinator: make one cheap `cli: "claude"`, `modelTier: "haiku"` spawn with no `model` and a one-word reply task. Confirm the lane reports model `haiku`, the SDK session uses Haiku, and usage is labeled by its SDK `modelUsage` key. Do not start the paid check from this lane.
- The original root-cause section above describes the pre-fix contract. After this round, `modelTier: "haiku"` with system `cli: "claude"` and no explicit `model` resolves to the Haiku SDK alias. An explicit `model` still wins.
- Initial verification: `npm run verify -- -t lint,typecheck,test -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/shared` passed lint/typecheck (6/6 tasks), then failed these suites: `cli-usage.utils.spec.ts` (old stale-model expectation), `claude-cli.adapter.spec.ts` (widened tier literal), `agent-spawn-args.schema.spec.ts` (old tool contract text), and `mcp-contract.sweep.spec.ts` (description 1574 characters, limit 1568). All four have been corrected. `ptah_get_diagnostics` timed out after 45 seconds with unchecked coverage.
- Final verification: `npm run verify -- -t lint,typecheck,test -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools,@ptah-extension/shared` exited 0. Lint/typecheck: 6/6 tasks succeeded, 0 cache hits. Tests: 3/3 project tasks succeeded, 0 cache hits. No suite failed in the final run. The verifier used dynamic output, so it reported scoped task counts rather than a `Running target ... for N projects` header. A second scoped `ptah_get_diagnostics` request again timed out with unchecked coverage; the project typechecks provide the completed check.

## Round 2 fixes

- `agent-process-manager.service.ts:810,812-817`: the SDK-handle preflight accepts and passes `modelTier` into `resolveModel` before its blocked-model check. This is the only Round 2 change to that file. `agent-process-manager.service.spec.ts:1862` verifies the tier is passed and a tier-resolved blocked model is refused before SDK spawn. The production SDK-handle caller at `agent-namespace.builder.ts:423` currently supplies `cli: 'ptah-cli'`; the normal Claude spawn already checks the resolved tier in `doSpawnSdk`.
- `cli-usage.utils.ts:67,79`: an unlabeled report clears a prior model only when it carries token usage. A cost-only update retains the label. `cli-usage.utils.spec.ts:36,94,103` covers an unlabeled token turn, mixed tokens, and cost-only updates. Producer search: Codex's `codex-lane-events.ts:249` can include cost without a model; Copilot's `copilot-sdk.adapter.ts:755-760` emits model and tokens/cost as available; OpenCode's `opencode-cli.adapter.ts:1130-1134` and Antigravity's `antigravity-cli.adapter.ts:1367-1371` emit tokens without a model. The Claude stream-loop emits the mixed-model aggregate without a model. Cursor and Grok adapter source searches found no direct `CliOutputSegment.usage` emission.
- `claude-cli.adapter.ts:184` and `cli-adapter.interface.ts:77`: removed the unused adapter-level tier fallback and field. The manager resolves the tier once and supplies `model`. `claude-cli.adapter.spec.ts:325` now pins that resolved Haiku reaches SDK options. A tier on a resumed Claude lane also sets SDK `options.model`; this is intended and matches explicit-model resume behavior.
- First verification: `npm run verify -- -t lint,typecheck,test -p @ptah-extension/cli-agent-runtime,vscode-lm-tools,shared` passed lint/typecheck (6/6) and vscode-lm-tools tests, but failed `shared` and `cli-agent-runtime` tests. The only shared failure was `cli-usage.utils.spec.ts`'s old latest-model expectation after an unlabeled token turn; the expectation is corrected. The only cli-agent-runtime failure was unrelated `claude-approval.reader.spec.ts`, where a real Git subprocess returned `failed` instead of `exited` outside a worktree. All other 161 cli-agent-runtime suites passed, including the changed preflight and adapter specs. Scoped `ptah_get_diagnostics` timed out after 45 seconds with unchecked coverage.
- Final verification: reran `npm run verify -- -t lint,typecheck,test -p @ptah-extension/cli-agent-runtime,vscode-lm-tools,shared`; exit 0. Lint/typecheck: 6/6 tasks succeeded (2 cached). Tests: 3/3 tasks succeeded (1 cached). No suite failed in the final run. Nx flagged `cli-agent-runtime:test` as flaky after the first run's real-Git failure. The verifier used dynamic output, so it showed scoped task counts instead of a `Running target ... for N projects` header.

## CI fix (PR #1000)

- `libs/shared/src/lib/utils/cli-usage.utils.ts`: restored the latest reported model across later usage reports that omit a model, including token reports. Removed the now-unused token-detection helper. Tier resolution, preflight, stream-loop usage labeling, dispatcher log, and contract text were left intact.
- `libs/shared/src/lib/utils/cli-usage.utils.spec.ts`: updated the unlabeled-token and incremental-fold expectations. A later labeled report still replaces the prior label.
- Consumer check: searched `addCliUsage`, `cliUsageTokenTotal`, and `hasReportedCliCacheTokens` in `libs/frontend` and `libs/backend`. The fold is called by chat stats, CLI output, and chat-streaming's agent output frame; no backend caller was found. The chat stats-bar test expects `latest-model` after an unlabeled token segment.
- Accepted display limit: a mixed-model turn now shows the last known model in the stats bar. Cost attribution of mixed usage remains for #986 batch D.
- Verification command: `npm run verify -- -t lint,typecheck,test -p shared,chat,@ptah-extension/cli-agent-runtime`. The verifier selected exactly the three named projects in its start line (six lint/typecheck tasks and three test tasks; dynamic output showed task counts rather than a project-count header). First run: lint/typecheck 6/6 passed; chat and cli-agent-runtime tests passed; shared tests failed on one old incremental-fold model expectation. That expectation was corrected. Final rerun exited 0: lint/typecheck 6/6 succeeded (2 cached), tests 3/3 succeeded (2 cached).
- Scoped `ptah_get_diagnostics` did not complete (TypeScript worker timed out); project typecheck passed in the first verify run.
