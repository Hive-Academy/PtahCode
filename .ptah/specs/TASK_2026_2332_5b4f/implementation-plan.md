# Implementation plan — TASK_2026_2332_5b4f

## Verified contracts

Audit evidence caveat: the two supplied audit paths are outside this worktree (`ptah_read_symbol` rejected them as outside the workspace), and no in-worktree copies exist. Their numerical baseline and scope are available in `context.md`; audit-specific claims below are confirmed against current code where possible. Any audit finding not independently visible is labeled **NOT CONFIRMED**.

| Scope | Current code contract (line references are current worktree) | Audit lead |
|---|---|---|
| 1 Grep aliases | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts:46-74`: `GrepArgsSchema` accepts `pattern`, `path`, `glob`, `regex`, `caseSensitive`, `context`, `maxMatches`, `includeIgnored`, `inlineBody`, `workspaceRoot`, then `.strict()`. `handleGrep` parses via `safeParse` at :477 and chooses explicit root/default at :485. Native aliases absent. | `.strict()` at line 74 **CONFIRMED**. Alias rejection is consequently current behavior; audit occurrence counts **NOT CONFIRMED**. |
| 2 Eager lifecycle | `protocol-dispatcher.ts:672` declares `ALWAYS_EAGER_TOOLS`; eager marking at :765. `effective-tool-list.ts` assembles and filters definitions. `eager-tool-definitions.budget.spec.ts:21-23` requires 15 tools and caps name+description+JSON schema at 22,080 chars, based on a 21,029-character measurement plus 5%; nominal headroom 1,051 chars. | Four requested tools missing from set needs exact list verification in dispatcher :672. Budget and headroom **CONFIRMED**. Four definitions' combined size **NOT CONFIRMED** pending runtime measurement in implementation. |
| 3 Root guidance/scope | Grep schema has optional `workspaceRoot` (:72). `nav-workspace-path.ts:44-104` validates absolute roots, resolves real paths and rejects traversal/symlink escape; error at :87 names canonical root. Lane policy starts at `cli-adapter.utils.ts:442`; task-prompt byte accounting uses `Buffer.byteLength(..., 'utf8')` at :653-654. | Current policy cap value and full guidance **NOT CONFIRMED**; require read around policy boundary/cap before editing. Existing containment error confirms canonical root is already reported for nav handlers. |
| 4 Substitution guidance | `libs/shared/src/lib/tool-guidance/tool-substitutions.ts:113-123` includes `ptah_get_diagnostics`; :136 explains `ptah_grep` with `includeIgnored` and scoped `path`. | Requested `tsc --noEmit`, log read, and `ptah_run_check` rows not found by targeted search, **NOT CONFIRMED** (search found only the diagnostics and grep rows). |
| 5 Read bound | `nav/read-symbol.limits.ts:6-16`: default 200 lines, hard max 400, result budget 16,000 chars/6,000 tokens, own output 15,000 chars, files capped at 5 MiB. Handler supports maxLines and range; renderer footer already says how to continue (`read-symbol.ts:79-100`). | 400-line lead **CONFIRMED**, existing continuation hint **CONFIRMED**. |
| 6 Agent files | `.claude/agents/` contains 14 generated-looking markdown role files. `ptah-core-prompt.ts:96-99` says lanes receive `PTAH_LANE_POLICY`; `renderAgentToolingRules` was not located in these limited reads. | Generator and whether all files are generated **NOT CONFIRMED**; identify generator before regeneration. |
| 7 Ledger | `agent-output-journal.service.ts:1-16` documents bounded running-output journal; prefix `ptah:agent-output-checkpoint:v1:` at :27; journal copies live process output (:62). `wiring/agent-events.ts` is the likely event composition boundary. | Existing journal is payload-oriented, so reuse only its persistence/lifecycle if it can store metadata independently; exact event shape/provider coverage **NOT CONFIRMED**. |
| 8 New batch tool | Existing `ptah_search_files`, `ptah_read_symbol`, `ptah_grep`, and git tools are separately exposed. `grep.ts` and `read-symbol.ts` have bounded handlers and path validation through `nav-workspace-path.ts`. | Audit tool-chain counts are inaccessible; context says baseline main chat 28.6% (62/217), lanes 57.0% (2,020/3,541; Codex 56.1%, Grok 70.3%, Kimi 39.0%). Proposed batch is grounded in stated chained-inspection problem, but comparative audit frequency **NOT CONFIRMED**. |

## Design

1. **Grep compatibility.** Extend the input schema to normalize before strict validation: `head_limit` → `maxMatches`; `type` → `glob` (extension shorthand becomes a safe glob, e.g. `ts` → `**/*.ts`); `output_mode` → `content` (normal grouped matches), `files_with_matches` (file names), or `count` (per-file counts). Preserve existing canonical fields. If alias and canonical form are both supplied with different values, return a typed validation error. Unknown keys return an error explicitly listing accepted keys and aliases, with no silent stripping. Include a short result note that native aliases were accepted and normalized. Tests cover alias mapping, conflict, invalid output mode, and unknown-key key list.
2. **Eager lifecycle tools.** Add the requested `ptah_agent_read`, `ptah_agent_wait`, `ptah_agent_status`, and `ptah_session_handoff_ack` names to the eager set only if measured definitions fit remaining 1,051-char headroom. Measure actual definitions by extending the existing budget assertion or a focused measurement in its spec. If all four do not fit, prefer `ptah_agent_status` and `ptah_agent_read` (most reusable inspection), then `ptah_agent_wait`, then handoff ack; include only definitions fitting the strict existing cap and trim verbose descriptions of already-eager tools only with equivalent safety/semantics preserved. Record measured per-tool sizes and final total. Never raise cap absent a separately measured reason.
3. **Root guidance and typed scope error.** State that every path operation must use the active registered worktree as `workspaceRoot`; don't `cd` around scope. In CLI policy ensure this instruction stays within 3,500 UTF-8 bytes and is present on initial and resumed prompts. Replace free-form out-of-root failure with a stable typed/code-bearing error whose message identifies the registered canonical root. Keep existing realpath containment and apply one boundary contract across nav handlers. Add tests for registered-root error, traversal and symlink escape.
4. **Substitutions.** Add concrete rows: `tsc --noEmit` → `ptah_get_diagnostics` (scoped changed files); log inspection → `ptah_grep` with `includeIgnored:true` and a scoped path; checker/test commands → `ptah_run_check` where its project/check contract matches. Preserve existing rows and renderer ordering. Do not claim arbitrary commands can be run by `ptah_run_check`.
5. **Read continuation.** Keep max 400 pending measured need; continuation footer already exists. Add clear `next startLine`/remaining-range hint whenever output truncates by lines or chars. Honor native Read aliases `offset` → `startLine`, `limit` → `maxLines` before strict validation; report accepted aliases. Keep the existing result/file caps.
6. **Agent rules generation.** Find canonical generator and make all committed `.claude/agents/*.md` tooling-rule blocks generated from `renderAgentToolingRules`; preserve hand-authored content outside those blocks. Add deterministic generation/check mode and test exact generated section consistency. Do not regenerate unrelated role prose.
7. **Metadata call ledger.** Add one normalized record for every Ptah and vendor tool call: timestamp, run/lane id, provider, tool name, outcome (`success|error|cancelled`), operation class (`ptah|substitutable-native|other-native|discovery`), optional error code, and serving build id. No arguments, result text, paths, snippets, transcript, or payload-derived strings. Store a bounded append-only metadata stream in an existing journal only if storage is independent from output segments and available to every vendor; otherwise add a small dedicated ledger at the shared event boundary. Use `wiring/agent-events.ts` for normalized event intake and persist through the existing lane journal store only if the boundary supports per-call records. Script computes per lane: Ptah share = Ptah/(Ptah + substitutable-native), substitutable-native count, Ptah error count, discovery count, calls to first Ptah success, total calls, and tokens when provider usage exists. Missing token counts are null, not zero. Redact/allowlist fields at collection boundary; no vendor transcript required.
8. **New tool: `ptah_inspect`.** One bounded batch of read-only operations, all against one required `workspaceRoot`, returning one response with ordered per-operation sections and partial success/failure. Operations: `read` with `path` and either line range or symbol; `grep` with pattern plus optional path/glob; `list` with glob; `git` with action restricted to `status`, `diff_stat`, or bounded `log` (no patch/body). Reuse existing nav handlers and validation; compose through their service/handler boundaries, not duplicate file search logic. Suggested caps: 8 ops, each result 8 KiB, total UTF-8 output 24 KiB, read max 200 lines, grep max 50 matches, list max 100 paths, log max 10 entries; explicit truncation markers. Per-op errors do not abort siblings. Name and arguments are intuitive; schema rejects writes and arbitrary commands. Support reading in-workspace `.ptah/tmp` logs through ordinary `read` or `grep` only after verifying existing ignored-file controls; no special bypass. **Not eager** initially: batch schema and output can be large; expose by discovery and substitution guidance. Substitution row: chained `cd; cat/sed; grep/rg; find; git status/diff --stat/log` → one `ptah_inspect` call. This addresses the objective's exact multi-command inspection chain; live ledger determines whether usage justifies retaining it.

### Cross-cutting boundaries

- Electron is the priority host. MCP tool composition and filesystem/git access remain in backend `vscode-lm-tools`; shared guidance stays in `libs/shared` public entry points. No renderer imports of Node/Electron and no CLI/provider dependency on renderer libraries.
- `platform-cli` and `cli-engine` remain unaffected by renderer/main integrations; preserve provider adapters and CLI lane event collection.
- New batch handlers depend on existing nav abstractions through public Nx entry points. Validate `workspaceRoot` at each external entry; all git calls use argument arrays with explicit timeouts; status/diff-stat/log are read-only and bounded.

## Batches

Files below are disjoint write sets; implementation owners must re-check line ranges against HEAD. No batch exceeds six files or two Nx projects. Focused verification only; no `nx`, build, serve, dev, e2e, package targets, or workspace-wide verification.

### B1 — Grep aliases and validation

- **Write set (1 file):** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts`.
- **Read set:** `grep.ts:46-100, 450-510`; `grep.spec.ts` schema/handler cases (locate current exact lines).
- **Contract:** currently strict schema, canonical keys listed in Verified contracts; unknown keys rejected by Zod parse.
- **Depends on:** none.
- **Focused verify:** `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.spec.ts`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts`.
- **Acceptance/tests:** aliases normalize; output modes have documented nearest behavior; alias conflicts and bad aliases fail; unknown key diagnostic enumerates valid keys; regression cases preserve canonical calls and containment.

### B2 — Eager lifecycle selection and budget

- **Write set (2 files):** `protocol-dispatcher.ts`; `eager-tool-definitions.budget.spec.ts`.
- **Read set:** dispatcher `550-580, 660-780`; spec `9-23, 45-80`; `effective-tool-list.ts` tool composition and metadata marking.
- **Contract:** measured 21,029 / cap 22,080 / headroom 1,051 chars, eager count 15.
- **Depends on:** none.
- **Focused verify:** `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/eager-tool-definitions.budget.spec.ts` plus focused protocol-dispatcher spec; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`; eslint changed files.
- **Acceptance/tests:** chosen definitions marked eager; tool count and actual serialized chars assert the cap; report which requested names fit and measured headroom. If all fail fit, use priority/trim policy above.

### B3 — Worktree root guidance and diagnostics

- **Write set (3 files):** `libs/shared/src/lib/tool-guidance/tool-substitutions.ts`; `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts`.
- **Read set:** shared substitutions `100-155`, render implementation and tests; cli utils `430-465, 600-670`; `nav-workspace-path.ts:44-104` (read only; owner coordinates a separate handler change if typed error required).
- **Contract:** root must be absolute and realpath-contained; lane policy byte count uses UTF-8. Confirm its current cap and existing error type before implementation.
- **Depends on:** none.
- **Focused verify:** `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/tool-guidance/tool-substitutions.spec.ts libs/shared/src/lib/tool-guidance/tool-guidance.render.spec.ts`; CLI runtime focused adapter spec by path; changed-project `tsc --noEmit`; eslint changed files.
- **Acceptance/tests:** substitutions say use registered `workspaceRoot`; exact policy ≤3,500 UTF-8 bytes; typed error conveys registered canonical root; outside-root/symlink tests; existing prompt byte-budget tests pass.

### B4 — Read aliases/continuation and tool descriptions

- **Write set (3 files):** `nav/read-symbol.ts`; `nav/read-symbol.limits.ts`; matching `nav/read-symbol.spec.ts`.
- **Read set:** handler `25-110, 150-355`; limits `1-16`; tool definition in `tool-description.builder.ts` around `buildReadSymbolTool` (read-only contract; if schema must change, add it to this batch, keeping four files).
- **Contract:** default 200, hard 400, 15,000 output chars, continuation footer already implemented.
- **Depends on:** none.
- **Focused verify:** Jest runTestsByPath read-symbol spec, `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`, eslint changed files.
- **Acceptance/tests:** offset/limit aliases normalize and conflicts error; truncation footer points to next line; output and file bounds unchanged.

### B5 — Generated agent rules

- **Write set (max 6):** canonical `renderAgentToolingRules` source, generator script, and only generated `.claude/agents/*.md` files whose tooling sections differ (maximum four per batch; split further if needed, preserving file-disjoint ownership).
- **Read set:** source definition and callsites for `renderAgentToolingRules`; generator target; each generated file's tooling block. Current exact generator is **NOT CONFIRMED** and is a pre-implementation discovery gate.
- **Contract:** generated blocks equal renderer output; hand-authored surrounding content preserved.
- **Depends on:** B3 if rule text references updated substitutions.
- **Focused verify:** generator's documented check command if it is script-scoped; otherwise focused Jest generator spec, `npx tsc --noEmit --project` for owning project, eslint changed TS files.
- **Acceptance/tests:** determinism and parity test for every regenerated file; no unrelated markdown drift.

### B6 — Metadata ledger

- **Write set (max 6):** `wiring/agent-events.ts`; existing output journal only if safe metadata storage can be separate; focused service/specs; one analysis script under `scripts/agent-usage/`.
- **Read set:** event adapters and provider normalization; `agent-output-journal.service.ts:1-80, 128-`; persistence store interface; `scripts/agent-usage/` current scripts.
- **Contract:** one record per tool call, no payload, common normalized categories/outcomes, lane/provider/build identity; existing journal is output-segment based and may not be suitable.
- **Depends on:** none, but coordinate event shape with B7 integration.
- **Focused verify:** Jest specs for event normalization and journal/ledger service via `--runTestsByPath`; `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`; eslint changed files; script unit fixture test if present.
- **Acceptance/tests:** fixtures for all vendors, errors/cancelled/discovery, null tokens, and per-lane aggregate metrics; serialized records prove no payload fields; bounded retention/cleanup.

### B7 — `ptah_inspect` batch tool

- **Write set (max 6; max 2 Nx projects):** new handler, schema/limits, focused tests, MCP registration/description integration, substitution row. Keep nav reuse through public exports.
- **Read set:** `effective-tool-list.ts` tool assembly; dispatcher operation routing; search/read/grep handlers and schemas; git read-only handlers; MCP public entry points; shared substitution renderer.
- **Contract:** one root, max 8 operations, total 24 KiB, partial errors; no writes/shell; bounded git status/diff-stat/log. Not eager. `.ptah/tmp` only within registered root and existing ignored-file policy.
- **Depends on:** B3 root guidance; B6 ledger only for usage telemetry, not to enable function.
- **Focused verify:** new and existing nav Jest specs via explicit `--runTestsByPath`; `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` and shared project only if substitution edit; eslint changed files.
- **Acceptance/tests:** cap, timeout, partial failure, traversal/symlink, git argument safety, output truncation, ignored `.ptah/tmp` behavior, and Electron MCP registry integration. Existing individual tools remain usable.

### B8 — Live lane measurement and release evidence

- **Write set:** none beyond the above batches; measurement report goes to the task's designated test evidence owner, not this plan.
- **Read set:** ledger schema and usage script; lane launch instructions and installed Electron build id reporting.
- **Depends on:** B1–B7; all implementation and focused tests complete.
- **Focused verify:** no broad test command; use only the fixed probe protocol below and focused script checks.
- **Acceptance:** thresholds below met per fix; report raw ledger aggregates, tool/build identity, and model/run identifiers.

## Live measurement

Use 3–5 fixed read-heavy probes, exactly the same workspace snapshot, prompt, lane settings, and file contents before/after. Run each on codex `gpt-6-luna` and antigravity `gemini-4-hydrogen-high`; one run per probe/model per phase, then repeat once if flaky. Do not score tool calls by transcript inspection: aggregate ledger records.

| Probe | Fixed questions/task |
|---|---|
| P1 repository map | “List the files implementing `ptah_read_symbol`, identify its max line limit and continuation behavior, and report the current git status.” |
| P2 targeted search | “Find the `GrepArgsSchema`, show its recognized keys, then find every use of `workspaceRoot` in the nav layer.” |
| P3 lane guidance | “Find the CLI lane policy, state its byte cap, and locate the rule that says how to scope file reads to a worktree.” |
| P4 recent activity | “Show the latest three commits, changed-file summary, and whether `.ptah/tmp` contains a matching usage log; report only paths and counts.” |
| P5 compiler/check guidance | “Find how to run a scoped TypeScript diagnostic and the closest existing checker-tool contract; identify the relevant substitution rows.” |

Metrics per lane and probe from ledger: Ptah share = Ptah calls / (Ptah + substitutable-native calls); substitutable-native call count; Ptah error count; ToolSearch/discovery calls; tool calls to first successful Ptah call; total calls; input/output tokens when provider reports them. Also report raw denominators and missing token values. Compare paired model/probe results, then pooled counts.

**Thresholds:** (1) Grep: zero native-key rejection errors for valid aliases and at least 80% fewer Grep-substitutable native calls on P2; (2) eager lifecycle: no increase in total definition cap and ≥25% fewer discovery calls before first lifecycle tool call on relevant prompts; (3) root guidance: zero out-of-root attempts in probes and ≥50% reduction in worktree-scope fallback calls; (4) substitutions: zero `tsc --noEmit`/log/check substitutes where matching Ptah tool succeeds and ≥50% reduction in those native calls; (5) Read: zero repeated same-prefix reads caused by truncation and fewer follow-up read calls on P1/P2; (6) generated rules: no drift between generator/rendered rules; usage effect measured but no call-share threshold alone; (7) ledger: 100% capture on synthetic success/error/cancelled cases and metadata-only schema; (8) batch: on P1/P4, median substitutable-native tool calls reduced by at least 2 per task, with no Ptah errors from exceeded caps. Overall adoption gate: Ptah share improves against baseline in both providers without increase in Ptah error rate; report if sample is too small to distinguish.

**Installed build identity:** the running Electron app serves MCP from its installed build. For each phase, stop the app and CLI lane processes; build/package/install the Electron app through the team's existing release workflow, then start that installed app and reconnect lanes. A live source edit or CLI restart alone does not update the Electron-served MCP server. Record a build id (commit plus build/version metadata) in each ledger event and verify it against the app's startup/build diagnostic and ledger; discard any call whose build id does not match the phase. CLI lanes using independently launched server binaries must likewise restart against the same build id. Do not use workspace-wide build targets under this plan's focused-check restriction; the release owner must provide the installed build artifact.

## Risks

- Eager-tool budget likely excludes all four additions; measuring definitions may force prioritization and descriptions trimmed elsewhere.
- Native tool keys vary subtly; alias semantics must be explicit and conflict validation must prevent silent behavior changes.
- `workspaceRoot` may represent multiple registered roots; errors must identify the specific allowed root without exposing unrelated paths.
- Agent markdown may mix generated rules with manually maintained role content; generator must preserve non-generated prose.
- Existing output journal contains content-bearing segments; putting metadata into it carelessly could violate the no-payload ledger contract or grow memory/storage unboundedly.
- Vendor integrations differ in cancellation and discovery events; missing hook coverage would bias share metrics. Explicitly report denominator/capture coverage.
- The batch tool risks duplicating nav logic or bypassing ignored-file/security rules; compose existing handlers and test boundary escapes.
- `.ptah/tmp` logs may contain sensitive material. The batch only reads in-root content under existing permission/ignore semantics; ledger never stores it.
- Electron installed-build mismatch invalidates before/after comparison; build id is mandatory in every event.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Accept native Grep aliases and normalize | Reject unknown native keys; accept aliases | Explicit requirement; current strict schema at `grep.ts:46-74` causes alias errors. Normalization preserves current canonical API. | Yes |
| Alias Read offset/limit | Add aliases; keep Ptah-only names | Native Read semantics map directly to range start and max line count; existing handler is bounded and continuation-aware (`read-symbol.ts:79-100`, limits 7-14). | Yes |
| Eager policy | All four if fit; otherwise ordered subset | Current 1,051-char headroom. Runtime measurement is authoritative; do not inflate budget. | Yes |
| New tool name/shape | `ptah_inspect` bounded operation batch; single operation wrapper or arbitrary shell-like input | Objective directly describes chained read/search/list/git inspection; existing nav handlers should be composed. Read-only typed operations are auditable and bounded. | Yes |
| Batch eager status | Eager; discovered/deferred | Batch schema adds per-turn definition cost; measurement objective prioritizes lifecycle tools and budget. Start deferred. | Yes |
| Ledger storage | Reuse output journal; dedicated metadata stream | Existing journal's documented purpose is output content and bounded lane tails; metadata purity favors separate records unless store supports physically separate metadata-only stream. | Yes |
| `.ptah/tmp` coverage | Reject ignored files; permit in-root reads by explicit target | Task asks to consider logs; existing `includeIgnored` pattern for grep is explicit. Permit explicit scoped reads only if caller permissions and realpath containment hold; no global ignored bypass. | Yes |

## Proposed Removals

None. No capability removal or public break is proposed. Existing native aliases and individual Ptah navigation tools remain supported.
