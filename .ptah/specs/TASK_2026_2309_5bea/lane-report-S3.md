# S3 lane report

## Files changed

- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.ts` provides the injection-context projection for the shared rows, usage, totals, caption counts, and CLI coverage.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.spec.ts` exercises the projection in a TestBed host.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts` removes `agentListTotal` and `AgentListTotal`, updates sorting, and exposes unknown duration and marked-usage formatting to the factory.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.spec.ts` covers the new order and duration and retains the applicable row and selection assertions. Aggregate assertions move to the projection spec.
- This lane report.

## Exported signatures

```ts
export interface InspectorAgentRows {
  readonly rows: Signal<readonly AgentListRow[] | null>;
  readonly contributions: Signal<readonly UsageContribution[]>;
  readonly totals: Signal<Readonly<Record<UsageMetric, UsageTotal>>>;
  readonly orchestratorUsage: Signal<Readonly<Record<UsageMetric, UsageAmount>>>;
  readonly captionCounts: Signal<{
    readonly running: number | null;
    readonly needsYou: number;
  }>;
  readonly cliCoverage: Signal<Readonly<Record<UsageMetric, CliCoverage>>>;
}

export function injectInspectorAgentRows(
  tabId: Signal<string>,
  sessionId: Signal<string | null>,
  laneRuns: Signal<readonly InspectorLaneRunDetail[]>,
): InspectorAgentRows

export const UNKNOWN_AGENT_DURATION = '--:--';

export interface AgentRowInput {
  readonly agent: SessionAgent;
  readonly name?: string;
  readonly secondary: string;
  readonly secondaryTitle: string | null;
  readonly usage: AgentUsageFigures;
  readonly durationMs: number | null;
  readonly usageAmounts?: {
    readonly tokens: UsageAmount;
    readonly cost: UsageAmount;
  };
  readonly requests: readonly InspectorRequest[];
  readonly tray: TrayAgentContext | null;
  readonly hasActions: boolean;
}

export function orderAgentList(
  orchestrator: AgentListRow | null,
  lanes: readonly AgentListRow[],
): AgentListRow[]
```

## Acceptance and A9

| Requirement | Evidence |
| --- | --- |
| A9 and no recovery-failure marker | **None**. `services/chat-store/session-loader.service.ts:1545–1554` applies references it received. At lines 1823–1859 a failed `session:cli-sessions` call resets a private retry guard and logs a warning. The output paging state and halt map at lines 306–309 are private. The empty history test checks the resulting visible state when there is no lane reference or exposed failure. |
| History with no CLI lanes and restored CLI with usable figures are unmarked | Tests cover a resumed tab with no references and a restored card with input/output and cost in persisted output. |
| Restored lane without usage marks the missing metric and clears | Parameterized tests remove either cost or tokens independently, verify that only that total is a lower bound, then supply usable data and check the cause clears. |
| Fresh tab gives no mark and there is no `hasLiveSession` latch | The fresh-tab fixture checks unknown SDK totals and complete CLI coverage. Restored and no-lane fixtures use the same false `hasLiveSession` value and have different marks according to their observed usage. The factory never reads the flag. |
| `sub:` and `bg:` represent one lane | The alias fixture supplies matching tool IDs to the real roster builder, checks the selected alias and one subtraction, and repeats after moving the subagent to the background. |
| Existing usage figures | `inspector-agent-usage.ts` and `inspector-agent-usage.spec.ts` are unchanged. S3 calls the same SDK lane usage adapter. The untouched spec is outside the authorized Jest paths. |
| Retention and scoping | Four store snapshot transitions model eviction, explicit removal, completed clear, and force clear. Additional cases cover retained exact and already-marked values, one missing metric, both missing metrics, reparenting, session change, and same-session remount. |
| Orchestrator, loading, duration, and order | Projection cases cover one subtraction, excessive child usage, missing child cost, absent and errored SDK snapshots, loading, and the unknown duration string. List cases cover needs-you and live priority and preserve input order within the remaining bucket. |

## Checks

- PASS, 2 suites and 25 tests. The initial run exposed an incorrect expected position for the running background alias. The corrected fixture passed. Both suites also passed after typing the branded IDs in the alias fixture.
  ```sh
  npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.spec.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.spec.ts
  ```
- FAIL, one integration diagnostic, TS2305 at `inspector-agents-section.component.ts:41`. The existing AGENTS component still imports `agentListTotal`, whose removal is required by S3. No diagnostics pointed to S3 files.
  ```sh
  npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
  ```
- PASS.
  ```sh
  npx eslint libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.spec.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-rows.spec.ts
  ```
- `ptah_get_diagnostics` on the four absolute changed source/spec paths also checks sibling specs. The first result found two branded ID errors in the alias fixture. Both fixture values were given the corresponding `BackgroundAgentEntry` field types and Jest and ESLint passed again. A follow-up initially timed out at 45 seconds. The cached retry reported no diagnostics in the four requested files and 376 errors in sibling files. The focused library command above reports the integration error relevant to this handoff.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Read the session snapshot and the live model through the tab manager, matching the SDK session ID for the snapshot | Read tab-owned stats or require a fourth factory input | `SessionInspectorStore` already obtains SDK stats from the tab, and the plan fixes the factory at three inputs | Yes, via an adapter input if integration later requires one |
| Keep prior CLI contributions in an inspector-local linked signal | An inspector-local linked signal or an additional store lifecycle signal | The plan forbids a monitor-store change and requires synchronous per-session totals. The linked signal uses only observed store snapshots and a mount-scoped effect. | Yes |
| Treat a usable restored split/cost as reported, and mark explicit output loss when figures were recovered from output | Carry the fallback adapter's blanket partial flag or use the observable fields and loss evidence | The binding trust rule and Gate 2 round 3 leave an ordinary split unmarked. The monitor documents `outputLostAfter` as missing output. | Yes |
| Preserve the original scope of the input/output tooltip when SDK children exist | Show a session-wide split alongside the residual or only show the split when it describes the Orchestrator | The residual helper subtracts a token total. The session split can contain subagent input and output and would misstate the row. | Yes, if disjoint per-child classes become available |
| Reuse roster alias suppression and S1's subtraction helper | Deduplicate the rendered roster upstream or add a second alias resolver | The roster already suppresses matching background records and S1 understands both aliases defensively. | Yes |

## Extra reads

Beyond the enumerated task excerpts and files in the write set, the reads below verified existing wiring and source contracts. The Ptah file search returned zero matches for the task path, so the exact Markdown excerpts were read with `sed`. Ptah AST analysis confirmed the existing list and AGENTS component symbols. Source snippets and signatures were then inspected as needed. `ptah_code_search_symbols` returned zero hits for branded ID constructors, so a single text search checked those names in the already inspected background store.

- `.claude/skills/angular-frontend-patterns/SKILL.md`.
- The plan-named `inspector-agents-section.component.ts`, `inspector-agent-usage.spec.ts`, `session-inspector.component.ts`, `agent-monitor.store.ts`, `session-loader.service.ts`, `session-stats-source.ts`, `session-agent-roster.ts`, and `session-agent-roster.service.ts`.
- `inspector-agent-usage.ts`, `inspector-agent-actions-menu.component.ts`, `inspector-agent-row.component.ts`, and `compact-lane-rows.ts` call sites/signatures for the moved lane projection and rendering handoff.
- `services/session-inspector/index.ts`, `session-inspector.store.ts`, and `session-inspector.types.ts` for the model, request metadata, loading semantics, and snapshot source.
- `services/session-agents/session-agent-tray.service.ts`, `owned-by-session.ts`, `utils/lane-stats.adapters.ts`, and `components/molecules/agent-card/stats-bar.utils.ts` for tray extras, ownership, reported usage, and restored usage.
- `chat-types.ts`, `rpc-session.types.ts`, `background-agent.store.ts`, `wall-clock.service.ts`, and `stats-limit-view-model.types.ts` for snapshot, fixture, clock, and role signatures.
- S1's `session-usage-totals.ts`, `session-usage-format.ts`, and `orchestrator-usage.ts` implementation excerpts were inspected to verify how the exported APIs handle omitted values, aliases, and formatting.

## Remaining work

The AGENTS and parent inspector owners wire the factory outputs into their surfaces, migrate the old AGENTS `agentListTotal` caller, and apply muted ink when the row time is `UNKNOWN_AGENT_DURATION`. The projection returns `null` rows and a `null` running count for an unavailable roster. No Electron visual review applies to this TypeScript-only batch.
