# Implementation plan

## Verified contracts

1. **Normalization and fields.** Shared contract `libs/shared/src/lib/types/agent-process.types.ts:727-789`: segment kinds `tool-call`, `tool-result`, `tool-result-error`; fields `toolName`, `toolCallId`, content and optional `toolArgs`/`toolInput`; no normalized start/end time or outcome/error flag fields. Outcome is partly implied by segment kind, while text is payload content. Codex app-server emits call at `cli-adapters/codex/codex-lane-events.ts:124-134` and completion at 138-170; it has id/name, completion status, error text/output and can distinguish cancelled. OpenCode maps `tool-use` to call/result at `opencode-cli.adapter.ts:1254-1302`, with callID/name and error result type, no timestamps. ACP antigravity/Grok use `provider-session-lane-handle.ts` via respective adapters (`grok-cli.adapter.ts:281-290`; antigravity ACP manifest `antigravity-acp-lane.ts:52-103`); exact normalized result name/id/outcome fields: **NOT CONFIRMED**. Claude SDK lane delegates to `ClaudeSdkLaneRunner` from `claude-cli.adapter.ts:265-291`; exact emitted tool-call/result mapping: **NOT CONFIRMED**. Ptah CLI lane event mapping: **NOT CONFIRMED**. Codex fields are better than shared type; do not generalize them to all vendors. For outcome/error text availability per ACP, Claude lane and Ptah CLI: **NOT CONFIRMED**.
2. **Output persistence.** `agent-output-journal.service.ts:26-58` stores bounded checkpoint (`IStateStorage`; key prefix `ptah:agent-output-checkpoint:v1:`), 7-day retention, 15-second interval, max 200 segments/256KiB plus stdout 64KiB. `AgentOutputJournal.read` 205-226; prune 229-249. Separately `SessionMetadataStore.saveAgentOutput` writes `agent-output.<agentId>` blob at `session-metadata-store.ts:2533-2544`; basename builder 827-829; paged reader 2616-2637 and delete 2740. Session blob path contract from task context is `%USERPROFILE%/.ptah/state/sessions/<sessionId>/agent-output.<agentId>.json`. Journal wiring in `AgentProcessManager` is optional (`agent-process-manager.service.ts:151,536`); whether every vendor and terminal failure/stopped path checkpoints: **NOT CONFIRMED**.
3. **Shared completed-call point.** None confirmed: adapters translate distinct provider events, and normalized segment has no stable outcome/time. Collect at each adapter result boundary; share recorder/classifier only. Codex event map provides paired events but is not common to others.
4. **Main chat and stores.** Main Claude Agent SDK stream/history has tool-use/result handling in `agent-sdk/src/lib/helpers/history/session-replay.service.ts:499,838-884`; for durable history `session-history-reader.service.ts:931-936` reads transcript projection. Live event dispatch point and cancellation coverage: **NOT CONFIRMED**. Existing usage analytics consumes `SessionStatsRepository` (`usage-analytics/src/lib/usage-summary.service.ts:4`) and records session aggregates, not rows per call. Session metadata blob store supports arbitrary per-agent output (`session-metadata-store.ts:2533-2544`), but is not an evident append-only per-call ledger. No existing per-session per-call store confirmed.
5. **Build identity.** Electron config `apps/ptah-electron/src/config/build-identity.ts:12,29` parses optional `ptahBuildIdentity` from package metadata. Runtime app version comes from package metadata, but no host-neutral backend accessor confirmed. Backend must accept optional injected identity from Electron composition; do not import Electron. Other hosts can set null.
6. **Usage reader.** `scripts/agent-usage/lane-metrics.ts:102-115` computes request statistics; 162-213 has date/formatting helpers. Existing readers: `claude-transcript.reader.ts:143,282`, `codex-rollout.reader.ts:150,347`, `opencode-db.reader.ts:251`; none reads normalized journal or gives every vendor. Extend `lane-metrics.ts` aggregation/output utilities and add one ledger reader/CLI rather than extending a vendor transcript reader.

## Design

- **Choose (b): metadata-only append JSONL per session beside session agent output.** Option (a), read-time journal derivation, is zero runtime change but reads persisted payload text, has incomplete outcomes, bounded tails can omit earlier calls, and no build identity. Option (c), SQLite, gives queryability but requires schema/migration and more coupling; existing `usage-analytics`/`lane-outcomes` are session/outcome summaries, no call rows confirmed. JSONL can cover lane and main chat, preserves metadata purity, and keeps CLI/Electron/VS Code compatible if accessed via host-neutral session blob interface. Match journal 7-day retention, bound file size, serialize append. Write failures are logged and cannot change tool execution outcome.
- Record schema: timestamp (completion ISO), sessionId, agentId|null, vendor, model|null, toolName, server (`ptah`|`native`|`mcp:<server>`), outcome (`success`|`error`|`cancelled`|`unknown`), operationClass (`ptah`|`native-substitutable`|`native-other`|`discovery`), substitutableClass (`text-search`|`file-read`|`path-listing`|`git-read`|null), short errorClass enum|null, buildIdentity|null. No arguments, result text, paths or command text. Call ID used only transiently to pair start/result; no ID stored absent a dedup need.
- Collection: hook normalized completion in Codex app-server mapper, provider-session ACP normalization, OpenCode handler, Ptah CLI and Claude SDK lane event output, plus Claude main-agent SDK tool event boundary (`agentId:null`). Current evidence does not establish one shared point. Derive outcome from explicit status/error signal; classify abort as cancelled; otherwise unknown.
- **Shell classification location:** adapter collection point, while tool input is in memory: read only first command word, normalize executable basename, match against canonical substitution rows, discard immediately, and persist class only. Native tool-name classification also uses those rows. `libs/shared/src/lib/tool-guidance/tool-substitutions.ts:56-74,84` documents itself as sole source and rows have `shell` command arrays (`66-67`); extend rows with typed class as needed, never duplicate a mapping table. Discovery is a separately defined Ptah-tool allowlist.
- Add a script reader/CLI in `scripts/agent-usage/`: group per lane and vendor; report total, Ptah, native, Ptah share, Ptah errors, discovery calls, calls before first Ptah success, and substitutable native by class. JSON and small table; `--since`/`--until`; nonzero exit and clear message on empty window. Build identity injected optionally by Electron composition; null from other hosts. Use public Nx entry points; do not alter platform-cli or cli-engine contracts.

## Batches

### 1. Lane recorder and normalized hooks
- Write set ≤6: new recorder/service and tests; selected Codex, ACP, OpenCode, Ptah CLI and Claude lane adapter files (split into file-disjoint sub-batches where needed); shared substitution classifier/export. ≤2 Nx projects per sub-batch.
- Read set: `agent-output-journal.service.ts:26-58,127-226`; `agent-process.types.ts:727-789`; Codex mapper 115-170; OpenCode handler 1254-1302; provider-session handle and vendor adapters; `claude-cli.adapter.ts:263-291`; `tool-substitutions.ts:56-74,84`.
- Contract: one metadata record per completion, correlate in memory, omit raw payload, logging failure does not escape.
- Tests to add: classification, privacy, exact-once pairing, success/error/cancelled/unknown at each adapter boundary.
- Focused verify only: `npx.cmd jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx.cmd tsc --noEmit -p <tsconfig>`, `npx.cmd eslint <files>`. Never `npm run verify`, `nx`, build, serve, dev, e2e or package targets.
- Acceptance: every scoped lane vendor records sanitized metadata and correct outcomes; provider tooling remains functional.

### 2. Main chat, storage and identity
- Write set ≤6: typed JSONL store behind existing session blob boundary/public API; main Claude chat event integration; Electron identity composition; focused specs. Keep each batch ≤2 Nx projects.
- Read set: `session-replay.service.ts:499,838-884`; `session-metadata-store.ts:827-829,2533-2544,2616-2637`; `build-identity.ts:1-35`; session blob interface and DI composition.
- Contract: same record schema, main-chat agentId null, host-neutral API; absent identity null; bounded serialized write; failures isolated.
- Tests: chat success/error/cancel; host identity provided/absent; append ordering, size/retention and write failure.
- Focused verify only: `npx.cmd jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx.cmd tsc --noEmit -p <tsconfig>`, `npx.cmd eslint <files>`. Never `npm run verify`, `nx`, build, serve, dev, e2e or package targets.
- Acceptance: main chat and all supported hosts can write same schema; Electron identity populated, other hosts operate null.

### 3. Usage report script
- Write set ≤6: new ledger reader and CLI, `lane-metrics.ts`, focused specs; scripts project plus shared utility project at most.
- Read set: `lane-metrics.ts:102-115,162-213`; reader patterns `jsonl-files.ts:65`, existing Claude/Codex/OpenCode reader APIs.
- Contract: deterministic per-lane/vendor counts, time window, JSON and compact table, clear nonzero no-data exit.
- Tests: totals, shares, errors, discovery, calls-before-first-success, substitutable classes, window and no-data.
- Focused verify only: `npx.cmd jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`, `npx.cmd tsc --noEmit -p <tsconfig>`, `npx.cmd eslint <files>`. Never `npm run verify`, `nx`, build, serve, dev, e2e or package targets.
- Acceptance: report covers every required measure by lane/vendor and handles empty window as specified.

## Risks

- Need verify public session blob API supports bounded append/atomic update; no private deep imports. Use serialized read-modify-write if there is no append primitive.
- ACP/Claude lanes may lack explicit error outcomes; map only evidenced status and retain unknown when ambiguous.
- Main chat live boundary may be outside history replay; identify during implementation before fixing write set.
- Shell command first-word extraction is sensitive; persist only class and discard input; conservatively classify unmatched commands.
- Optional model/build identity can be absent. Retention should align with journal (seven days) and size bound to be selected from existing blob constraints.
- No file removals planned; protect `platform-cli` and `cli-engine` consumers with focused boundary checks only.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Storage | journal derivation / metadata JSONL / SQLite | Journal stores payload, bounded tails and uneven outcomes; analytics is session-level; session blob API exists. JSONL gives metadata purity and chat/lane coverage without DB migration. | Yes |
| Collection | shared segment point / vendor hooks | shared segment lacks outcome/time; Codex/OpenCode and ACP use different event mappings. | Yes |
| Build identity | Electron import / injection / omit | `ptahBuildIdentity` currently Electron package metadata only. | Yes |
| Substitution classes | new table / canonical guidance rows | `tool-substitutions.ts` is documented single source, shell lists already exist. Extend that data. | Yes |
| Error detail | free text / short enum | constraint forbids tool text; enum is aggregatable and private. | Yes |

## Proposed Removals

None.
