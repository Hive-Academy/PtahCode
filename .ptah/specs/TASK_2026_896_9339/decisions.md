# Decisions — TASK_2026_896_9339

| # | Decision | Evidence | Step | Reversible |
| --- | --- | --- | --- | --- |
| 1 | Type FEATURE, depth Partial. The plan existed; it was re-validated against `main`. | Session objective | evidence | yes |
| 2 | Lanes `enabled`. Implementer: `codex` (forced past a 5% limit flag). Reviewer: `Claude Api` ptah-cli lane (family `anthropic-api`). | `ptah_agent_list` on 2026-11-10: grok, Glm, kimi at limit; antigravity quota exhausted | evidence | yes |
| 3 | No tier-to-model map for system CLIs. Tiers stay a Ptah CLI concept (ptah-cli providers and `cli: "claude"`). The router chooses a concrete model id from the live catalog; the orchestrator passes it as the per-call `model`. | User correction, 2026-11-10 | user | no (user) |
| 4 | Precedence does not change: request `model` > `agentOrchestration.<cli>Model` > native CLI default. A user-pinned spawn args line wins over the routed model. | User correction; `resolveLaneModel` | user | no (user) |
| 5 | Withdrawn: tier policy, tier catalog service, `CLI_TIER_CATALOG` token, `tier-map` model source, and the cost options A/B/C. Their files are removed. | User correction | user | no (user) |
| 6 | Only `reported` catalog rows can become a routed model of a system CLI lane. A curated fallback row is not live evidence. | `copilot-sdk.adapter.ts` `COPILOT_MODELS`; `cursor-cli.adapter.ts` `FALLBACK_MODELS` | evidence | yes |
| 7 | The router offers at most 2 alternate models per lane (`LANE_MODEL_ALTERNATES_CAP`), in catalog order, after the primary options. | Keeps the decision prompt bounded; the byte cap and the 3,000 ms timeout do not change | evidence | yes |
| 8 | Deterministic code keeps the present default. An alternate is chosen only by a valid decision-model label. | User constraint: the model picks only from supplied options | user | no (user) |
| 9 | Alternates count toward the question threshold, so one lane with a live catalog can get a model question. | Without this, a single eligible lane can never get a routed model | evidence | yes |
| 10 | Cursor rows keep their own fallback flag. OpenCode rows are `reported` when the adapter returned rows. | `opencode models` is a live probe that returns an empty list on failure | evidence | yes |
| 11 | `cli: "claude"` keeps its tier alias above the setting. | A change is a behavior change of an existing default (user-reserved) | user | yes |
| 12 | `actualModel` is `unobserved` without runtime evidence. The selected model is never copied into it. | No adapter reports the model for all CLIs | evidence | yes |
| 13 | Review fix: the deterministic row of a system CLI lane (not `claude`) always has `model: lane-default`. `score()` does not promote a listed model for such a lane. A reported id reaches the row only through a valid decision-model answer (`source: model`). This replaces the promotion part of row 6. | Review finding 1: a promoted id in the row overrides `agentOrchestration.<cli>Model` without a choice; user rule "keeps the default unless there is a reason to choose" | peer | yes |
| 14 | Review fix: alternates are filtered by the closeness band, sorted by score (ties in catalog order), then capped. Alternates never cost a primary option or the request: the fit drops all alternates before it reduces the primary width. | Review findings 2 and 5 | peer | yes |
| 15 | Review fix: a phase that is sendable only because of alternates resolves with `source: ranking`, `cause: null` when no valid answer exists. | Review finding 4: no new fallback cause or confidence change for a one-lane phase | peer | yes |
| 16 | The model log covers system CLI lanes (`doSpawnSdk`). Ptah CLI lanes resolve the model in the provider tier mapping and get no model log in this task. | Review finding 3; scope of the user request is system CLIs | evidence | yes |
| 17 | The routed row `effort`, when the orchestrator passes it, overrides `agentOrchestration.<cli>ReasoningEffort` for that call. This is the existing `resolveLaneEffort` order. | Review finding 9; `lane-spawn-policy.ts` | evidence | yes |
| 18 | An OpenCode row is `reported` only when its id has the `provider/model` shape. `actualModel` is cut to 128 characters. | Review findings 10 and 11 | peer | yes |
