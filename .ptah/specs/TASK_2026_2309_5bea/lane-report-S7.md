# S7 AGENTS section and agent row

## Files changed

Within `libs/frontend/chat/src/lib/components/organisms/session-inspector/`:

- `inspector-agents-section.component.ts` migrates to S3, renders the roster and details, and retains the request and tray wiring.
- `inspector-agent-row.component.ts` renders the four-column row, share meter, inline context/cache cues, timer and full metric description.
- `inspector-agent-actions-menu.component.ts` adjusts the trigger and icon size.
- `inspector-agents-section.component.spec.ts` preserves coverage for existing behavior and replaces conflicting legacy order, duration and subtotal expectations with S7 expectations.

## Selectors and contracts

### `ptah-inspector-agents-section`

```ts
readonly tabId = input.required<string>();
readonly selectedAgentKey = input<string | null>();
readonly sessionId = input<string | null>(null);
readonly agents = input.required<SectionState<InspectorAgentsData>>();
readonly laneRuns = input<readonly InspectorLaneRunDetail[]>([]);
readonly orchestrator = input<OrchestratorCardModel | null>(null);
readonly projection = input<InspectorAgentRows | null>(null);
readonly cache = input<NonNullable<SessionStatsEntry['cache']> | null>(null);
readonly contextUsed = input<number | null>(null);
readonly compactionCount = input<number | null>(null);
readonly sessionTokens = input<SessionTokenSplit | null>(null);
readonly hasLaneSurface = input<boolean>(false);
readonly staggerStart = input<number>(0);
readonly laneRequested = output<string>();
readonly agentSelected = output<string>();
readonly answerRequested = output<string>();
readonly announced = output<string>();
```

S8 should pass its `InspectorAgentRows` object through `[projection]`, the current store card through `[orchestrator]`, the same cache entry as SESSION through `[cache]`, the known context token numerator through `[contextUsed]`, and the recorded count through `[compactionCount]`. `[agents]` and the optional `[sessionTokens]` binding preserve compatibility with the current inspector template. The underlying source of displayed rows and totals is S3. The heading focus target is `[data-inspector-section="agents"] h3`.

### `ptah-inspector-agent-row`

```ts
readonly row = input.required<AgentListRow>();
readonly detailId = input.required<string>();
readonly current = input(false);
readonly expanded = input(false);
readonly tokenTotal = input<UsageTotal | null>(null);
readonly usageAmounts = input<Readonly<{ tokens: UsageAmount; cost: UsageAmount }> | null>(null);
readonly orchestratorDurationMs = input<number | null>(null);
readonly role = input<string | null>(null);
readonly context = input<AgentRowContext | null>(null);
readonly cache = input<AgentRowCache | null>(null);
readonly selected = output<void>();
```

`AgentRowContext` has `percent: number | null`, `text: string`, `description: string` and `warning: string | null`. `AgentRowCache` has `time: string`, `description: string` and `warning: string | null`. The section provides the detail region with the matching ID and uses the row's computed `metrics()` for the visible figures and accessible description.

### `ptah-inspector-agent-actions-menu`

```ts
readonly name = input.required<string>();
readonly ctx = input.required<TrayAgentContext>();
readonly open = input<boolean>(false);
readonly openChange = output<boolean>();
readonly action = output<AgentTrayAction>();
```

## Acceptance and parity

| Batch acceptance and S3 handoff | Focused spec evidence |
| --- | --- |
| Roster caption and S1 share bars | The order/caption case covers Orchestrator first and labelled running, asking, sub and CLI counts. Fixture store count is intentionally unrelated. Separate cases cover loading, exact ordinary CLI splits with a 100% sum and no SDK duplication, the provider-total-only and missing-token-class lower bounds with preserved meter space, retention after removing a lane from the monitor, estimated totals, zero-width fills, missing row amounts and zero/unknown denominators. |
| S4 cache API | Orchestrator expands a real `ptah-inspector-cache-tile` in detail mode and exposes the estimate explanation. That case also checks the inline context ring, context warning, exact long duration, full token count, input/output split and compaction count. |
| CLI action eligibility | A stoppable-only context exposes Stop. A running monitored CLI lane without tray actions exposes the labelled composer after row activation. The legacy tray Steer route still opens the CLI composer. |
| Keyboard and reduced motion | Specs cover native row/request buttons, menu ArrowDown and Escape focus return, `aria-describedby`, `aria-controls`, expansion and Escape back to the row, stale request Escape to the row, motion-reduced loading classes and unanimated share fills. Agent-lane-stats specs are outside the requested Jest path. |
| Item 1, removed `agentListTotal` | Section consumes `injectInspectorAgentRows` or S8's supplied projection. Exact aggregate and disclosure tests exercise the real S3 factory and verify the roster has no Total row. |
| Item 2, unknown row time | Unknown Orchestrator-time cases check the muted `--:--` and the accessible “Duration not available” reason. |

| Parity capability | Coverage |
| --- | --- |
| Labelled caption, loading, empty, accessible column header | Roster-count, loading/skeleton, empty-copy and four-column header assertions. |
| Orchestrator, order, and agent row contents | Exact aggregate and missing SDK data cases cover the S3-derived Orchestrator. Ordering covers the Orchestrator, waiting, active and finished rows. Avatar, model, cost, tokens, status, and known/unknown time remain covered. |
| CLI role, start time, live refresh | Role disclosure case, valid/invalid start tooltip cases, and fixed-clock Jest case with live elapsed refresh and clock release. |
| Row VM, estimate and lower bound | Exact/estimate, detected CLI gaps, retained segment usage, unknown SDK lane and zero figure cases. The section takes accuracy from the projection and adds no A9 recovery marker. |
| Selection and thread opening | Local, controlled and normalized selection, lane emission, conditional Orchestrator open, selected row kept below the fold and disclosure count. |
| Request focus, action menu, request and steer outputs | Stale permission Escape restores row focus, question activation forwards the answer request, and existing permission outputs remain wired. Tray menu cases cover the SDK menu actions and CLI eligibility. Separate steer/composer tests and a failed-send retry case cover the two input surfaces. |
| Total row | No second whole-session total renders, including after Show more. |

## Checks

- PASS, 43 tests in one suite. `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.spec.ts`
- PASS, zero errors and three pre-existing non-null assertion warnings in the spec. `npx eslint libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.spec.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-row.component.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-actions-menu.component.ts`
- Scoped `ptah_get_diagnostics` reported the TypeScript compiler result unavailable after 45 seconds for all four changed TypeScript files. Used the permitted native Angular check.
- Initial `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json` reported TS2345 in the separate task-reader batch. The parent received the location and the contract above. PASS on two reruns of the same command after the task-reader change landed in the worktree. The final run exited 0 with zero errors and zero diagnostics in S7 files. Six warnings remain outside S7 in HunkToolbarComponent, PeerSessionSendDialogComponent, LanesTableDetailComponent, VscodeLmConfigComponent, SystemPromptDrawerComponent and ElevenlabsPanelComponent.

## Decisions

- Accept the S8 projection as a single optional object so all inspector surfaces can share the same retained contributions and totals. Existing callers construct the same projection at initialization. Keeping the legacy bindings lets S8 roll integration forward in place. The fallback can be removed once all callers supply the object.
- Keep row activation as the native keyboard and pointer path for both detail and the existing conditional thread open. Default Orchestrator selection starts collapsed. This preserves the current entry point and follows the screenshots' selected inline detail. The disclosure behavior is local to the section and reversible.
- Use retained CLI contribution values only for keys still present in the projected roster. S3 owns roster membership and tells the section which rows exist. The monitored-lane removal test keeps a roster entry and checks that its retained width survives. If S3 drops the entire roster entry, there is no row to render.
- Keep the existing request-lines component mounted over an open request's pending-state transition. When the request leaves the roster, its existing closed-elsewhere panel can release focus to the row. The existing request component emits the focus release.
- The row's timer renders static durations. S3 continues to own the shared live-clock subscription, with the local duration adapter supplying the exact clock text from the same timestamps.

## Extra reads and remaining work

- Read the requested plan/batch ranges, handoff sections and parity rows. Reviewed the bounded prototype roster excerpt and both supplied 400 px screenshots for column alignment, small status cues and inline request/composer placement. Electron rendering and independent visual review are coordinator work under the requested check limits.
- Loaded repository instructions from `CLAUDE.md` and the filesystem skills `angular-frontend-patterns` and `ui-ux-designer` from `.claude/skills/`. A dedicated session skill loader was absent. The Ptah file search located the workspace Angular skill. It returned no hit for the hidden batch document, so native range reads used the supplied path. The task's supplied worktree and no-git constraint governed the lane.
- Read source signatures and templates of the S3 projection and its related `inspector-agent-list.ts` and `inspector-agent-usage.ts`, S1 `session-usage-totals.ts`, `session-usage-format.ts` and `orchestrator-usage.ts`, and S4 `session-stats-view.ts` and `inspector-cache-tile.component.ts`. Read the named request/menu components in the allowed write set and left the request-panel file intact.
- Verified public component and type contracts in the UI/chat-ui barrels, `meter.component.ts`, `ring.component.ts`, `chart.types.ts`, `timer.component.ts`, `format-duration.ts`, `clock.token.ts`, and `rpc-session.types.ts`. Focused source lookups also checked `session-inspector.types.ts`, `session-inspector.store.ts` and matching lines in its spec for the card/context shape, `agent-duration.ts`, `lane-composer.component.ts`, `agent-steer-input.component.ts`, `lane-stats.adapters.ts` and the `MonitoredAgent` signature in `agent-monitor.store.ts` and its status type in `agent-process.types.ts`. Read the failing call line in `session-task-reader.ts` after the compiler diagnostic.
- S8 owns integration and the coordinator owns broader verification, including the agent-lane-stats suites and rendered Electron review.
