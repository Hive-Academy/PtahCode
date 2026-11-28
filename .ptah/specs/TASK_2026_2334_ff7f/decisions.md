# Decisions — TASK_2026_2334_ff7f

| # | Decision | Source | Evidence / reason | Reversible |
|---|---|---|---|---|
| 1 | Type FEATURE, depth Partial | orchestrator | Requirements are known from task 1; the plan narrowed the design. | yes |
| 2 | Executors pinned: codex `gpt-6-luna`, antigravity `gemini-4-hydrogen-high` | user pin (task 1) | Same pin as TASK_2026_2332_5b4f. | yes |
| 3 | Plan gate 2: REVISE -> phased. The plan's option (b) (runtime JSONL recorder with hooks in five lane adapters and the main chat) is NOT approved for this pull request. | cross-side review by the orchestrator (in-process) of the codex plan | The plan marks the ACP, Claude lane, Ptah CLI and main-chat collection points as NOT CONFIRMED, and finds no shared completion point. Six unconfirmed hook points in vendor adapters is a large change with risk for every lane. | yes |
| 4 | Phase A (this pull request): a report script that derives the numbers at read time from data Ptah already saves — the session blob `agent-output.<agentId>.json` for lanes and the Claude transcripts for the main chat. No runtime change. | orchestrator | Task 1 counted two lanes from the session blob and matched the completion-signal totals (codex 23, antigravity 49). The script stores no payload; it reads local files and prints only counts and classes. Known limits are reported by the script, not hidden: outcome `unknown` where the vendor gives no error flag, possible truncation of a bounded blob, no build identity. | yes |
| 5 | Phase B (separate task, not started): a metadata-only runtime recorder, only if Phase A shows gaps that matter (truncated blobs, missing outcomes). | orchestrator | Decide from Phase A coverage numbers, not in advance. | yes |
| 6 | The script does not edit `libs/shared/src/lib/tool-guidance/tool-substitutions.ts`. | orchestrator | Pull request #1522 changes that file. The script imports the rows through the shared public entry point and keeps its class mapping beside the script. | yes |
| 7 | Regeneration of `.claude/agents/*.md` is out of scope. | orchestrator | It needs the rule text of #1522 and waits for that merge. | yes |
