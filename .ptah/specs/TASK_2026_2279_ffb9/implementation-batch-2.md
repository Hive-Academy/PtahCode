# TASK_2026_2279_ffb9 ? implementation batch 2

Batch 2 implements root-cause items 4 and 5 on top of batch 1 (6e9d3c2e7). No commit, push or PR was performed. Existing unrelated untracked task artifacts were left alone.

## Item 4: model-relative handoff context

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-context-limit.ts:12` collects verified native SDK `modelUsage[model].contextWindow` evidence. `:27` resolves per-model, per-route provider catalog capacity through the existing shared `resolveContextCapacity`, then computes `min(settingH, max(1, floor(0.90 * verifiedWindow)))`. Missing capacity falls back to the user setting. Changing models clears the previous model's state. SDK capacity from a proxy is not treated as native capacity. Cache entries are bounded.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:545` accepts an optional route; `:570` applies the effective settings to actual policy evaluation and warning delivery. State queries, cooperative handoffs, timeout stops and stop retries report the effective handoff limit. Independent weighted/raw, duration and missing-telemetry safety rules remain intact.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:255`, `:342`, `:364`, `:1929` forward the captured query route and result capacity evidence into the monitor. This is the host-neutral SDK execution path used by Electron. The monitor's third observe argument is optional; existing two-argument callers retain setting-based fallback. No constructor, DI or composition-root API changed. No platform-cli or cli-engine edits were needed.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-context-limit.spec.ts:1` covers the 200k window => 180k effectiveH / 153k warning example, smaller user cap, provider isolation, native result evidence, proxy/unknown fallback, model changes, real policy warning evaluation and streamed-block deduplication.

Decision: use the root cause's proposed 90% fraction as a named policy in the helper, without adding a new setting. Warning remains `warnRatio * effectiveH`. Native SDK evidence can arrive only at a result; until evidence is available, the explicit unknown-window fallback applies. No model-family capacity inference is introduced.

## Item 5: durable successor lineage and relaunch guard

- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-request-accounting.ts:42` captures initial request context and the deduplicated first request-to-warning count. The counter does not terminate a notes turn.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-successor-lineage.ts:7` defines Zod-validated durable metadata: explicit predecessor record path, current notes path, warning reached, request-to-warning count, initial context, effectiveH, completed deliverable and exhaustion. `:22` marks equal/faster unproductive successors exhausted; predecessor request3 / successor request4 is not exhausted. Unknown ancestry creates no failure history.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:1770` appends the lineage metadata to the durable handoff record and the parent handoff. The immutable record link leads back to predecessor notes. Existing record persistence, publication and rekey mechanics carry the metadata without a new persistence format or shared type.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-successor-lineage.ts:27` reads an explicitly linked predecessor record under the workspace with existing real-path containment checks, parses external JSON with Zod, and treats missing/malformed/outside-workspace ancestry as unknown. It selects the final host-appended metadata marker, avoiding earlier quoted metadata. No in-memory lineage map is required, so record links survive monitor restarts and session rekeys.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts:128` tells the parent to include `Ptah predecessor handoff: <record path>` verbatim in the successor Agent/Task prompt and preserve the notes link.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:685` enforces the guard for Agent/Task through the existing PreToolUse hook, including parent calls without agent_id. `subagent-successor-lineage.ts:44` rejects a linked exhausted relaunch with an actionable reason. The parent can finish the work itself or explicitly declare `Ptah reduced scope: <concrete reduction>`; such a declaration resets the comparison history while preserving the predecessor path in the new record.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-deliverables.ts:60` recognizes successful mutations of explicitly declared deliverables. `subagent-budget-monitor.ts:702` retains successful writes during the notes phase; `:782` preserves that evidence until normal handoff preparation and still cleans up immediately on a normal end outside the gate. Attempted/failed mutations and writes to unrelated paths do not count as declared deliverable progress.
- `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-successor-lineage.spec.ts:1` covers request3/request4, equal/faster exhaustion, productive/non-warning/unknown ancestors, explicit notes links loaded from disk after restart, Agent PreToolUse denial, explicit scope reduction, unrelated prompts/agents, containment, malformed records, final metadata selection and deliverable tracking through rekey/release.

Decisions and limits: ancestry is explicit, never inferred from teammate names. A launch without an explicit predecessor link remains unknown rather than being associated with unrelated work. Scope reduction is an explicit model/parent declaration, not a semantic verifier of prompt size. A successful Write/Edit to a declared deliverable is the available completion evidence; the monitor cannot assess document quality. These are intentional limits, not outstanding approval questions.

## Validation

Only the authorized Jest, TypeScript and ESLint check families were used, one heavy check at a time. No npm verify, Nx, build, serve, dev, e2e or package targets were run.

1. `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the seven specs below: **7 suites passed, 332 tests passed**, exit 0 (54.305 s).
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-context-limit.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-successor-lineage.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-hooks.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-deliverables.spec.ts`
   - `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.spec.ts`
2. Following the final record-parser and timeout/retry review, the same Jest command with context-limit, successor-lineage, budget-monitor and stop-cause specs: **4 suites passed, 270 tests passed**, exit 0 (41.178 s). Counts overlap with the preceding run. The existing notes-gate regression coverage verifies completion-based behavior without a fixed turn/denial count.
3. `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit 0** on the final production logic.
4. `npx eslint` on all ten changed/new TypeScript files: **exit 0, zero errors, five existing warnings**. Monitor: max-lines and unused captureProgress argument. Executor: max-lines. Executor spec: existing unused messageFactory and existing non-null assertion, neither introduced by this batch. Final focused lint of the two new specs after their last assertions also passed with no output.

The initial test run caught and was followed by fixes for a redundant settings read, cleanup outside the notes gate, outdated route-argument expectations and two new fixture typing errors. All final runs above are green. Jest emits an existing config ESM warning before running successfully.

## Scope, tools and open questions

- No `libs/shared` edits: the existing route-aware resolver and budget policy accept everything required. No new dependency, export, registration or host composition contract was added.
- All four new TypeScript files are under 700 lines (40, 43, 57 and 57). Existing oversized files did not grow: budget-monitor 1,977 => 1,977; session-query-executor 2,101 => 2,101; executor spec 1,947 => 1,947. Bringing these pre-existing files below 700 would require a separate refactor; this batch respects the explicit no-growth requirement on the monitor and puts new policy logic in small files.
- No new any, double unknown casts, non-null assertions, untyped catches, or Windows home-path literals were introduced.
- Ptah AST and dependent tools were available and invoked. Dependency results were partial, so native `rg` and focused reads supplied the fallback impact/caller search. The user-authorized native tsc check supplied diagnostics; no additional diagnostic/check command was run.
- No CLI-native skill-loading/discovery mechanism was exposed. The local humanize-library skill was inspected and excludes bug fixes, so it was not applied to this feature/fix batch.
- No live Electron/provider session was launched under the allowed check contract. Electron's host-neutral lifecycle wiring is covered by its related SDK lifecycle specs; CLI callers remain compatible through the optional route argument.
- No open implementation decision or required user input remains. The intentional fallback and ancestry limits above are recorded for review.
