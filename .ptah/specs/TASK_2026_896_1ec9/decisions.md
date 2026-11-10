# Decisions — TASK_2026_896_1ec9

| # | Decision | Evidence | Reversible |
|---|----------|----------|------------|
| D1 | Type BUGFIX, depth Partial. | `ptah_route_decide` pre-flight: BUGFIX (source model, confidence 0.86), Partial (source model, confidence 0.53, overall 0.53). | yes |
| D2 | Review lanes use the same rules as the agent list: drop `disabledClis`, add enabled Ptah CLI agents that have a key, sort by `preferredAgentOrder`. | `agent-namespace.builder.ts:664-729` already applies these rules for `ptah_agent_list`. | yes |
| D3 | The review lane preference is the existing `agentOrchestration.preferredAgentOrder` setting. No new UI and no new review setting. | Setting already exists with a settings UI (`cli-matrix-rows.ts:197`); a new surface would need a design gate. `fallbackFamilies` stays unused (out of scope). | yes |
| D4 | Copilot detection reports `installed: false` when the `--version` probe exits 127. Other adapters are unchanged. | horus shim exits 127; changing every adapter widens blast radius with no evidence. | yes |
| D5 | Large review prompts are written to a file inside the attempt folder and the lane receives a short pointer task, so argv lanes can start. | `CliCommandLineTooLongError` at 158-159 KB vs 131071 limit; `buildArgvTaskPrompt` only bounds the preamble, not the task. | yes |
| D6 | Orchestrator writes the single batch directly, no team-leader decomposition. | One batch, 2 Nx projects, contracts verified by reading the code. | yes |
| D7 | Implementer: codex lane; reviewer: Claude code-logic-reviewer subagent. | Memory preference + codex is the only lane with confirmed room. Different family. | yes |
| D8 | Fix round (orchestrator edits, bounded and local; re-reviewed by the same Claude reviewer): fix review findings 1, 2, 4, 5, 6, 8. Prompt file goes to a fresh `mkdtemp(<cwd>/task-)` dir with flag `wx`; getters and registry failure log a warning. | code-logic-review.md: 1 Serious; 2 can re-enable disabled CLIs (lane config); 4-6, 8 are local to the gateway. | yes |
| D9 | Record, do not fix: finding 3 (zod `prompt.max(200_000)` stays, a pre-existing contract) and finding 7 (Windows shim exit 9009 not covered; the failure was seen on Linux only). | Out of the reported bug's scope; no evidence of prompts above 200 K characters. | yes |
