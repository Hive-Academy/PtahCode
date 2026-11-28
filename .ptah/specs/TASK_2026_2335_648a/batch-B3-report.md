# Batch B3 report

## Revise round 1

- **Defect 1 — stale spawn text assertions:** updated role, force, effort, account, modelTier, CLI, route, and transport assertions to match the concise live contract in `tool-description.builder.spec.ts:364-399,418-425`, `agent-spawn-surface-parity.spec.ts:108-123`, and `agent-spawn-args.schema.spec.ts:405-457`. The HTTP 45-second cap remains asserted on the wait tool, where it is implemented.
- **Defect 2 — force safety:** restored the condition that force is for a reported limit known to be wrong, and that it always starts a new lane: `tool-description.builder.ts:932`; both skill copies document it in Advanced spawn controls (`.claude/skills/agent-lanes/SKILL.md:139`).
- **Defect 3 — accountSelection and effort:** added concise call-time behavior to the parameter lines (`tool-description.builder.ts:865,898`); added the complete account refusal cases and effort levels/override behavior to both byte-identical skills (`.claude/skills/agent-lanes/SKILL.md:54-55`).
- **Defect 4 — transport naming:** stdio now uses `agent_list`/`agent_wait`/`agent_read`, while HTTP uses the `ptah_agent_*` names (`tool-description.builder.ts:808-810`); parity assertions cover both in `agent-spawn-surface-parity.spec.ts:108-123`.
- **Rendered measurement:** spawn is **3,819 characters**; eager set is **20,214 characters** across 19 tools. The guarded budget is **21,225** (measured set + 5%, rounded up) at `eager-tool-definitions.budget.spec.ts:22,84`.
- **Specs:** 5 files, **277 passed, 0 failed**: `tool-description.builder.spec.ts`, `agent-spawn-surface-parity.spec.ts`, `agent-spawn-args.schema.spec.ts`, `eager-tool-definitions.budget.spec.ts`, and `vendor-roster-drift.spec.ts`.

## Before/after character counts

The original full-definition measurement is the task-provided 8,721 characters. The revised definition was measured from the rendered eager tool list using the same definition size contract as the eager budget (`name + description + JSON.stringify(inputSchema)`).

| Part | Before | After |
|---|---:|---:|
| Main description (HTTP; stdio) | 1,417 | 548 (533) |
| `task` | 114 | 34 |
| `cli` | 452 | 75 |
| `ptahCliId` | 284 | 52 |
| `workingDirectory` | 87 | 61 |
| `timeout` | 138 | 68 |
| `files` | 39 | 27 |
| `taskFolder` | 110 | 60 |
| `deliverables` | 488 | 76 |
| `model` | 218 | 55 |
| `modelTier` | 542 | 73 |
| `resume_session_id` | 237 | 50 |
| `accountSelection` | 550 | 97 |
| `permission` | 229 | 57 |
| `network` | 144 | 54 |
| `role` | 256 | 51 |
| `phase` | 124 | 36 |
| `skills` | 138 | 49 |
| `effort` | 198 | 70 |
| `taskKind` | 61 | 41 |
| `routingSource` | 46 | 37 |
| `route` | 223 | 45 |
| `force` | 196 | 80 |
| `idempotencyKey` | 245 | 58 |
| Parameter descriptions total | 5,119 | 1,306 |
| Full definition (name + description + schema) | 8,721 | **3,819** |

The eager set measures 20,214 characters across 19 tools. Its guard is 21,225 (measured total plus 5%, rounded up), in `eager-tool-definitions.budget.spec.ts`.

## New description text

HTTP: “Spawn an independent headless lane for a task. Call ptah_agent_list first: the cli enum lists supported adapters, not installed agents; choose a listed system CLI or ptahCliId. Declare every required file in deliverables so completion verifies it was written. Spawn is asynchronous: continue work, then use the completion signal or ptah_agent_wait; read finished output with ptah_agent_read. Resume with resume_session_id. modelTier selects capability tier; model is a CLI-specific model ID. Follow the agent-lanes skill for the full lane contract.”

Stdio uses `agent_list`, `agent_wait`, and `agent_read` in those three transport-specific positions; HTTP uses the matching `ptah_agent_*` names.

## Removed guidance locations

- Lane discovery, async completion, deliverables, resume, and model selection remain in the concise tool description; the complete lane contract lives in `.claude/skills/agent-lanes/SKILL.md` and the shipped `plugins/ptah-core/skills/agent-lanes/SKILL.md`.
- Detailed account-selection behavior and refusal cases, and accepted effort levels/override semantics, are in the skill’s Address table and Advanced spawn controls. Both skill files are byte-identical.
- The 45-second HTTP wait cap and recovery procedure remain in the lane skill and `agent_wait` tool descriptions; the spawn description directs callers to the matching wait/read tools by transport.
- Role template and delivery reporting details remain in the lane skill.
- Validation schema and enum constraints were not changed.

## Focused checks

- Jest with the specified absolute Jest entry point, config, `--runInBand --coverage=false`, and the five specs below: **5 suites passed, 277 tests passed, 0 failed**.
  - `tool-description.builder.spec.ts`
  - `agent-spawn-surface-parity.spec.ts`
  - `agent-spawn-args.schema.spec.ts`
  - `eager-tool-definitions.budget.spec.ts`
  - `vendor-roster-drift.spec.ts`
- An earlier run of the four spawn/budget specs exposed three stale assertions (2 suites failed, 3 tests failed); those assertions were updated to the concise contract and transport naming, then all five suites passed.
- Skill copies compared byte-for-byte: **identical, 37,896 bytes**.
- No tsc or eslint run was required for this revise round; schema validation and production behavior were unchanged.

## Proposed Removals

- Keep detailed refusal cases and provider-specific account resolution in the agent-lanes skill instead of repeating them in the tool parameter text.
- Keep the full effort semantics and provider-specific support details in the skill while the tool line names valid levels and states that it overrides the CLI setting.
- Keep lane execution, completion recovery, and reporting mechanics in the skill instead of expanding the eager description.

## Decisions

- `force` now says to override a reported limit only when known to be wrong and that it always starts a new lane.
- `accountSelection` and `effort` each retain concise call-time semantics; the skill adds full behavior and both copies remain identical.
- Stdio uses `agent_list`/`agent_wait`/`agent_read`; HTTP uses `ptah_agent_list`/`ptah_agent_wait`/`ptah_agent_read`.
- The rendered spawn definition is 3,819 characters, under the 4,500-character cap. Eager budget remains a measured guard with a 5% margin.

## Unknown

- The original 8,721-character full definition was supplied in the task; it was not reconstructed from the pre-edit source in this revise round. The revised value and eager set total were measured from the rendered tool definitions.
