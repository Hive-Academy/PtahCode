# Batch 4 report: stopped-lane efforts (Components 5 and 6)

## Files (W = `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups`)

Only Batch 4 edits these files:
- W/libs/backend/acp-runtime/src/index.ts: exports the `AcpSessionConfigInput` type.
- W/libs/backend/acp-runtime/src/lib/profiles/antigravity-acp-profile.ts: the `sessionConfig` parameter type narrows to `AcpSessionConfigInput`. The suffix rule is unchanged.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts:
  - `laneEfforts?(model?: string)`, where the model is the lane record's model;
  - new optional `stoppedLaneCatalog?(): Promise<StoppedLaneCatalog>`;
  - new exported `StoppedLaneCatalog` interface.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/grok-cli.adapter.ts: `laneEfforts(model)` returns `acpProfileEfforts(grokAcpProfile, model)`.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts (+ `.spec.ts`): `laneEfforts(model)` returns `acpProfileEfforts(antigravityAcpProfile, model)`.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-models.ts: new `codexAdvertisedEfforts(catalog)`, the validated union of every model's `supportedEfforts`.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts (+ `.spec.ts`):
  - `stoppedLaneCatalog()` makes one `readCodexLaneCatalog` call and returns `codexLaneModels` plus `codexAdvertisedEfforts`;
  - `listModels()` delegates to it, so the warn-and-empty failure handling stays in one place;
  - the live `listTurnOptions` uses `codexAdvertisedEfforts`.
- W/libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-coordinator.service.ts (+ `agent-message-coordinator.lane-messaging.spec.ts`):
  - a stopped lane with no cache uses `stoppedLaneCatalog`, bounded at 5 s, when the adapter has it;
  - otherwise it calls `laneEfforts(info.model)`, and the error path does the same;
  - a new `stoppedLaneView` helper builds the result and its reason;
  - with a cache, behaviour is unchanged.

These files are shared with Batch 3. See the Batch 3 report for the split:
- acp-vendor-profile.ts (`AcpSessionConfigInput`, and `sessionConfig` takes it)
- grok-acp-profile.ts (`sessionConfig` parameter type)
- grok-cli.adapter.spec.ts (`laneEfforts` case)
- provider-session-lane-handle.ts (+ `.spec.ts`). Batch 4 adds the exported pure `acpProfileEfforts(profile, model?)`, which the live handle now uses with `options.model` (same list as before), and the "acpProfileEfforts" describe block.

## Behaviour
- A stopped Grok lane gets all five `EFFORT_LEVELS` and the reason "Commands and skills appear when the lane is running."
- A stopped agy lane gets its thought levels. A model id with an effort suffix (for example `...-high`) gets `[]` and keeps the "Effort levels, commands and skills appear…" reason. The agy rule holds.
- A stopped Codex lane makes one catalog read and gets its models plus the advertised efforts.
- No static Codex list is used. `codexAdvertisedEfforts` returns only what the live catalog advertises. A catalog that advertises none gives `[]` and the reason text.
- The live Codex handle keeps its fallback to `CLI_REASONING_EFFORT_VALUES` when the catalog advertises nothing, so live behaviour is unchanged.

## Checks
- Focused jest, run through the scratchpad config that maps `marked` because the worktree has no `node_modules`: 5 suites, 256 tests, all passing.
  - codex adapter spec
  - grok adapter spec
  - agy adapter spec
  - lane-handle spec
  - coordinator lane-messaging spec
- `npx tsc --noEmit --project` on `tsconfig.lib.json` for acp-runtime, then cli-agent-runtime: both exit 0.
- `npx eslint` on the changed files: 0 errors. One warning is old: `max-lines` in `codex-app-server-lane.adapter.ts`.
- `check-degradation.ts`: TOTAL 0 unsuppressed sites.

## Decisions and open items
- `codexAdvertisedEfforts` leaves out the static fallback that the plan's extract carried, because of the brief's rule: live catalogs only for a stopped Codex lane. The live handle adds the fallback itself, so it behaves as before. Removing that live fallback too would be a separate decision.
- The coordinator bound (5 s) is shorter than the Codex catalog bound (8 s). This is old behaviour and was left alone, as the plan says.
