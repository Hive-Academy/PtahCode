# Lane-router root-cause analysis, part A

Code citations use paths relative to `libs/backend/lane-routing/src/lib/` unless prefixed with `MCP/` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/`) or given from the workspace root. Findings are verified from source and existing specs. Incident-specific inferences are labeled. The November 24 reproduction and earlier timeouts are recorded in `.ptah/specs/TASK_2026_2326_5d16/context.md:12` and `:33`.

This lane did not expose `ptah_grep` or `ptah_read_symbol`. Reads used Ptah AST and file slices, with `rg` for literal searches and line-numbered native excerpts where needed.

## A1 — Timeout

### Finding

1. **No end-to-end server deadline.** `MCP/protocol-dispatcher.ts:2927` dispatches to `:3399`, which awaits `MCP/route-tool-handlers.ts:108`. The handler awaits the namespace with no timer or abort signal. The HTTP handler also awaits dispatch (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:597`). The documented gate budget of **8.5 s** (2 s gather + 2 × [3 s + 250 ms]) is unenforced (`routing-constants.ts:137`).
2. **Partial budgets.** Pre-flight can reuse a cached result or make one two-question model request. It skips candidate gather (`route-decide.service.ts:146`, `:186`, `pipeline/preflight-answer.ts:61`). Gate lists agents first (CLI detection then the Ptah CLI registry), then concurrently reads limits, roles, model lists, the matrix and rotation. Model listing is raced per row at **2 s**. The aggregate has no deadline (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:921`; `pipeline/gather.ts:77`, `:117`, `:179`, `:204`). `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/route-namespace.builder.ts:104` calls agent limits without an override. Production limit reads run concurrently at **3 s per row**, **12 s** for Codex, Antigravity, Kimi Code and Grok. A missed read becomes unknown (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-lookup.service.ts:161`, `:295`; `libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:16`).
3. **Model budgets apply per request.** Gate runs non-review then review, at most one request per pass with up to 32 questions each (`route-decide.service.ts:272`, `:279`, `:386`). Structured calls signal at **3 s** and return on a **3.25 s** race (`decision-model/decision-caller.ts:72`, `pipeline/model-call.ts:119`, `:259`). System One aborts fetch/body at **3 s** local or remote by default, or a configured **1–60 s**. An unsaved local daemon timeout permits a **1 s** residency probe then **60 s** if known cold (`routing-constants.ts:110`, `decision-model/decision-model.target.ts:201`, `pipeline/model-refine.ts:115`, `decision-model/system-one.client.ts:176`, `:253`, `decision-model/system-one.residency.ts:26`; `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:303`).

### Root cause

The timed portions alone can consume 3.25 s structured or 61 s cold in pre-flight, and 18.5 s structured or 134 s with two cold requests in gate when the slow limit class applies. These are component sums. The true worst case has **no finite server-enforced bound**. Target resolution, other gather work, phase/tool lookup and the awaited rotation write can extend it. A live 404/405 can also trigger a separate recheck with a 1.5 s probe budget (`route-decide.service.ts:236`, `:312`, `:450`, `decision-model/decision-caller.ts:50`, `:104`, `decision-model/decision-model.config.ts:178`, `:440`, `decision-model/decision-model.types.ts:174`).

A **model timeout** returns a successful tool response when the remaining pipeline completes. Gate uses deterministic spread ranking with `fallbackCause: timeout` for an ordinary scored shortlist. An alternate-only request suppresses the cause. Pre-flight returns null classifications with `source: skill-table` and `fallbackCause: timeout`, leaving classification to the caller (`pipeline/model-call.ts:68`, `:129`, `pipeline/phase-resolve.ts:37`, `pipeline/preflight-answer.ts:132`, `route-decide.gate.spec.ts:455`, `route-decide.preflight.spec.ts:405`). A **client timeout of the whole call** yields the client's timeout and no roster. The HTTP transport drops the late reply when the connection is gone, and route dispatch does not pass disconnect cancellation into the service. A service rejection instead produces MCP `isError: true` and `ptah_route_decide failed: …` (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:612`, `MCP/protocol-dispatcher.ts:3387`, `:3399`, `MCP/route-tool-handlers.ts:79`, `:130`). Ptah's Codex config sets a 960 s client timeout. The incident record supplies no client deadline (`libs/backend/codex-runtime/src/lib/codex-ptah-mcp.ts:17`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-config.builder.ts:151`).

### Fix proposal

Pass a stage deadline from `MCP/route-tool-handlers.ts` through the namespace to `route-decide.service.ts`. Reserve response time and use remaining budget for gather, phase/tool lookup, each model pass and rotation persistence. In `pipeline/gather.ts`, retain completed inputs and degrade stalled enrichments to explicit missing facts. Use existing ranking or skill-table fallback when inference cannot fit. Add fake-timer coverage for a stuck gather dependency, unknown limits, two sequential passes sharing a deadline and pre-flight returning fallback before the handler deadline.

## A2 — Preferences

### Finding

1. **Exact candidate ID matching.** Gate accepts up to 32 strings and forwards them unchanged into spread. First occurrence wins and comparisons are case-sensitive with no normalization (`contracts/route-decide-args.schema.ts:56`, `pipeline/phase-plan.ts:162`, `ranking/spread.ts:207`, `:227`, `:278`). System CLI uses `cli`, Ptah CLI uses `ptahCliId` when present, subagents use `subagent:<role>`, and child sessions use `child-session`. Ptah CLI name and family confer no match (`ranking/candidate.types.ts:65`, `:98`, `:120`, `pipeline/phase-plan.ts:301`).
2. **Zero score boost.** Keep eligible candidates within five points of the highest score, then keep the best limit class (confirmed room, unknown, near limit). Hard constraints exclude at-limit lanes and same-family reviewers where the reviewer rule applies. Non-lanes inherit the pool class. Inside the pool, order by explicit preference, configured positive `preferredRank`, executor kind (lane, subagent, child session), then ordinal ID. Rotation can advance past the first entry. A lower score can win within these constraints (`ranking/hard-constraints.ts:140`, `routing-constants.ts:32`, `:59`, `ranking/spread.ts:87`, `:167`, `:207`). The agent lister sets `preferredRank` separately from the caller's preference strings (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:967`).

### Root cause

In the reproduction, `kimi code` and `Ollama Code` are display names, while `antigravity` and `codex` are valid system IDs (context lines 35–48 and 58–61). **Inference:** Antigravity's unknown limit state would lose to a confirmed-room lane if both were in the band. Its exact score and elimination step are absent. The counterfactual compares the spread pick against the same pool and rotation cursor ordered by kind/ID alone, removing both explicit and configured preferences. The text is negative whenever picks agree, on pins or absent spread, and when a model chooses a different executor from spread (`ranking/spread.ts:93`, `:117`, `:221`, `pipeline/assemble-gate.ts:161`, `reasons/compile-reasons.ts:284`). It can be negative even when a preferred candidate wins.

### Fix proposal

Document canonical IDs in `contracts/route-decide-args.schema.ts`. In `pipeline/gather.ts` and `pipeline/phase-plan.ts`, resolve unique display names once, prefer exact IDs and report unknown or ambiguous aliases. Preserve the current spread policy pending product direction. Extend `spread.spec.ts` and `route-decide.gate.spec.ts` for ID/name ordering, ambiguity, score gaps of five versus six, limit class and rotation.

## A3 — Tier and effort

### Finding

1. **Fixed thresholds.** The table below transcribes the first-match policy in `pipeline/tier-effort-policy.ts:11`.

| Rule | Condition | Returned tier/effort |
| --- | --- | --- |
| R1 | plan, architecture, batch | opus/high, opus/xhigh at ≥8,000 |
| R2 | review, document-review, visual-review, completion | opus/high, opus/xhigh at ≥8,000 |
| R3 | shape contract or logic | sonnet/high, opus/xhigh at ≥8,000 |
| R4 | shape mechanical, test or docs | haiku/low below 4,000, sonnet/medium from 4,000 to 11,999 or when omitted, opus/high at ≥12,000 |
| R5 | remaining phases | sonnet/medium, opus/high at ≥8,000 |

### Root cause

Both shape and weight go into policy before candidate scoring (`pipeline/phase-plan.ts:130`). The reported implement/logic at 12,000 hits R3, research at 14,000 without an R3/R4 shape hits R5, review at 15,000 hits R2 and tests/test at 10,000 hits R4. Kind alone does not imply those outputs for implement, research or tests. Weight is a bucket selector. For logic, 8,000 and 12,000 receive the same maximum effort irrespective of scope depth, lane score or model confidence. Policy tier also supplies the non-lane scoring model. The roster uses policy effort and permits a subagent tier override (`pipeline/phase-plan.ts:343`, `pipeline/assemble-gate.ts:358`).

### Fix proposal

Represent policy thresholds as ordered data in `pipeline/tier-effort-policy.ts` and carry the matched condition and cutoff into the reason. Add boundary cases for 3,999/4,000, 7,999/8,000, 11,999/12,000 and omitted weight in `tier-effort-policy.spec.ts`. Calibrate effort thresholds before changing them.

## A4 — Scoring

### Finding

1. **Matrix score, then selection policy.** For family/model/task kind, take the first value in user → local → seed order. `lane-default`, `auto` and missing exact model profiles use the family profile. An unknown cell scores 50. Seed labels strong/good/weak are 80/65/35. Staleness is metadata (`matrix/capability-matrix.store.ts:204`, `:468`, `routing-constants.ts:16`, `:164`). For non-system CLI candidates the highest promotable exact listed model must beat baseline by >5, with listing order breaking ties. Otherwise use configured model/tier or lane default. System CLIs skip promotion. An accepted explicit pin can override the model. Design/visual-review subagents get 100 for spread ordering, with the underlying score still reported (`ranking/score.ts:92`, `:116`, `pipeline/phase-plan.ts:172`, `:376`).
2. **Local formula.** Use unique runs in the trailing 90 days by family/model/task kind. For delivery, count delivered over delivered + non-capacity no-deliverable/failed. Capacity failures here are usage-limit, auth and timeout. For review, count approved over approved + rejected + unresolved revise. For each available rate compute `(100*s + 10*p)/(n + 10)`, where `s` is successes, `n` is eligible observations and `p` is the exact seed prior or 50. Average available rates equally and round once. “Local, sample count 18” counts 18 distinct contributing runs across the included rates, excluding the prior (`matrix/local-derivation.ts:49`, `:72`, `:136`, `:179`, `:273`, `:285`, `:345`, `:380`, `routing-constants.ts:168`, `reasons/compile-reasons.ts:237`).

### Root cause

Score and spread are deterministic for fixed snapshots. Repeated requests can read changed history, matrix overrides, model lists, limits and rotation. Rotation advances cyclically within the pool, keyed by `phaseId|taskKind`. Gate persists final choices, including model picks, in global storage, capped at 200 keys (`ranking/spread.ts:97`, `:123`, `ranking/rotation.store.ts:96`, `routing-constants.ts:76`, `route-decide.service.ts:434`). The model shortlist applies the band to raw scores over ranked rows, so it can include an executor outside the spread pool's best limit class. The model receives scores and available aggregate outcome figures, and can choose any offered option that passes validation (`pipeline/phase-plan.ts:229`, `pipeline/phase-resolve.ts:51`, `decision-model/decision-payload.ts:89`).

### Fix proposal

Expose score components and profile identity from `matrix/local-derivation.ts` and retain them through `ranking/score.ts`. Test one/two-rate blends, exact versus family profiles and identical inputs under fixed versus advanced rotation in the matrix and spread specs.

## A5 — Tool schema text

### Finding

1. Optional gate-only fields have zero entries in the required-owner map, yet `flattenStageUnion` sends the empty list to `withStageNote`, rendering “Required when stage is .” (`MCP/route-tools.ts:34`, `:54`, `:69`; `contracts/route-decide-args.schema.ts:56`).
2. The args schema only caps `preferenceSource` at 200 characters. Reason compilation trims it, drops blanks and rejects remaining semicolons, CR or LF to protect clause formatting. That late assertion is outside the Zod schema used to generate MCP descriptions (`reasons/compile-reasons.ts:188`, `:202`, `:284`; `MCP/route-tools.ts:92`).

### Root cause

Schema flattening tracks required ownership only. The text constraint lives at the output formatter boundary, so chosen-row assembly can fail after routing.

### Fix proposal

Generate required notes only for nonempty proper owner subsets. Describe optional gate-only properties. Validate and describe the trimmed source in the args schema before routing. Extend `route-tools.spec.ts`, `route-tool-handlers.spec.ts` and schema snapshots for optional fields and invalid source punctuation.

## A6 — Explanation

### Finding

1. `pipeline/assemble-gate.ts:67` collects facts for `compileGateReasons`. Chosen and unavailable strings come from `reasons/compile-reasons.ts:342`, `:364`, `:435`. Roster assembly adds policy fields and conditional eligibility or capability notes (`pipeline/assemble-gate.ts:248`, `:288`, `:316`, `:349`, `:387`). `reasons/decision-summary.ts:46` emits log metadata.
2. Chosen reasons omit runner-up identity/score, score gap, pool membership, the policy step that decided the comparison, why preferences lost and the model's comparative rationale. “Pruned” only identifies a ranked lane missing from a sent shortlist. With zero requests, eligible losers are absent from `excluded` (`pipeline/assemble-gate.ts:206`, `:236`). “Models unknown” is a model-list input warning (`reasons/compile-reasons.ts:86`).

### Root cause

Reason facts retain only the winner and boolean effects. Shortlist tracking records final offered IDs without individual pruning causes.

### Fix proposal

In `pipeline/phase-plan.ts`, `ranking/spread.ts` and `pipeline/assemble-gate.ts`, retain the strongest eligible unchosen alternative and per-preference disposition. Format the deciding rule and score gap in `reasons/compile-reasons.ts`. Test ranking-only omissions, shortened model shortlists, model override and the existing result budget.

## Decisions

- Evaluated preserving the existing ordering and thresholds with clearer diagnostics versus changing winner policy. The reproduction identifies display-name mismatches and missing comparative facts, while it leaves the losing scores unknown. Proposals cover reversible parsing and diagnostic changes. Winner policy remains an open product choice.

## Open questions

- Which client deadline and server timing applied to the earlier timeouts?
- What were Antigravity's phase scores and exact elimination steps in the reproduction? The returned roster cannot establish them.
- Should a preference remain an in-band ordering input, or may it override a score or limit-class advantage?
