# Decisions — TASK_2026_2322_4ba4

| # | Date | Decision | Evidence | Source | Reversible |
|---|---|---|---|---|---|
| 1 | 2026-11-23 | Type REFACTORING, removal of agy stream-json approved | user: "remove agy stream-json completely and rely only on acp", "just remove completely" | user | no |
| 2 | 2026-11-23 | Proposed Removals P1 (agy < 1.5.1 lanes fail with upgrade error) and P2 (no auto-fallback from ACP to stream-json) are direct consequences of the approved complete removal; treated as covered by the user's instruction and reported in the PR | parity-inventory.md Proposed Removals; user instruction | orchestrator, under user instruction | yes (re-add transport) |
| 3 | 2026-11-23 | Full auto: Gate 2 approved by orchestrator on an APPROVED review; document review same-side (no lane tools) | user "full auto mode"; no ptah_* tools | user / orchestrator | yes |
| 4 | 2026-11-23 | Keep agy stderr secret/mcpToken redaction: port it to the ACP path (review F1, security) — not a removal | implementation-plan-review.md F1; antigravity-cli.adapter.ts:1690-1695 | orchestrator (evidence) | yes |
| 5 | 2026-11-23 | Gate 2 approved (orchestrator, full auto) on APPROVED review r1; R1-R3 carried into batch briefs | implementation-plan-review.md | orchestrator | yes |
