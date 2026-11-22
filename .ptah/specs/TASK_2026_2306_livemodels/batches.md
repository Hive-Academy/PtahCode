# Batches - TASK_2026_2306_livemodels

Total tasks: 40 | Batches: 18 | Complete: 0/18

Worktree: `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists` (branch
`fix/live-only-model-lists`). All paths below are relative to it. Source of truth:
`implementation-plan.md` (Revision 2 overrides Revision 1 overrides the body), `decisions.md`
rows 6-12, `parity-inventory.md`, `plan-review-2.md` (minors applied below).

Plan batch order kept: B1 -> B2 -> B3 -> B4b -> B4a -> B5 -> B6 -> B7. Plan batches that exceed
one sitting are split into sequential sub-batches (`B2.1`, `B2.2`, ...). Each sub-batch is its
own commit and commits green under its own scoped checks; the plan batch's gate runs on its last
sub-batch. Every batch is sequential (one executor; lanes disabled).

## Execution defaults (recorded, not asked)

- Executors: built-in subagents. Lanes are disabled in this session (context.md Gate 0.1: no
  `ptah_agent_*` / `ptah_route_decide` tools). That is the `Subagent reason` on every batch.
- Review family: every implementer and reviewer is an in-process Claude subagent, so phase
  reviews are same-family. Exception reason: no other family is spawnable in this session. Each
  phase summary carries the label "same-family review (weaker evidence)".
- Weight: `ptah_count_tokens` is not available in this session, so estimated weight is given as
  a line-count proxy of the write set; actual lane tokens `unavailable` unless the executor
  reports them.
- File cap interpretation: at most 6 production files and 2 projects per batch; a spec rides
  with its source file. Two declared exceptions, both atomic by compiler rule: B2.2 (rename under
  `noImplicitOverride`) and B6.3 (required-field flip across producers).
- Verification (repo CLAUDE.md, never workspace-wide, never build/serve/e2e/package):
  inner loop `npm run verify -- --related -p <projects>` then
  `npm run verify -- -t lint,typecheck -p <projects>`; batch gate where stated. Output goes to
  `.ptah/tmp/<batch>.log` and is filtered with `tail`/`grep`. Template changes add
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview`. Backend gates add
  `npm run verify -- -t lint -p degradation-audit`. Executors may run the inner loop; the
  team-leader runs the gate before commit. No check of a project starts while another batch
  edits that project.
- Release rule (plan handoff note): no release is cut from this branch mid-run (between B2 and
  B4a, schema-2 records may hold static rows on a dev machine).

## Plan validation

Status: PASSED WITH RISKS

Stress-test corrections made while decomposing (the plan is not redesigned; these fix ownership
and ordering so each commit is green):

1. Revision 2 S-C says "B4b adds a spec case", but `child-model-admission.ts` and
   `chat-session.service.ts` are rpc-handlers files (Component 6 = B4a). The S-C pass-through and
   both spec cases are owned by B4a.2. B4b has no rpc-handlers file.
2. `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts` imports `KNOWN_CLOUD_MODELS`
   (`:29`) and `OPENCODE_MODEL_ROUTES` (`:24-25`). B3.1 deletes `KNOWN_CLOUD_MODELS`, so the old
   drift spec is deleted in B3.1, not B7, or B3.1's typecheck fails. B7 creates the replacement
   and edits the workflow. Between B3.1 and B7 the daily workflow pattern matches no spec; it is
   branch-internal only.
3. Eleven `ptah-cli-registry-*.spec.ts` / `.proxy-lease.spec.ts` files mock shared with
   `staticModels: [...]` rows and agent-sdk with `seedStaticModelPricing: jest.fn()` (grep). They
   are in B4b.2's write set, so B6's type deletion does not break cli-agent-runtime.
4. `config-rpc.handlers.spec.ts:141,1126`, `lane-model-listing.adapter.spec.ts`,
   `provider-rpc.handlers.spec.ts`, `ptah-cli-rpc.handlers.spec.ts` and the two auth-providers
   service specs carry `isStatic` literals. B4a/B2.3 rewrite their assertions to `source`; the
   last `isStatic` keys are removed in B6.3 together with the field.
5. Plan Minor 6: `rpc-agents.types.ts` is owned by B1.1 (the `isFallback` doc line moves there
   from B4b).
6. Comments citing `seedStaticModelPricing` must be gone before B6's grep gate:
   `config-rpc.handlers.ts:184` goes to B4a.2 (file already in its set),
   `libs/frontend/core/src/lib/services/model-state.service.ts:162` goes to B5.1.
7. `libs/backend/agent-sdk/src/lib/helpers/tier-capability-env.spec.ts` tests the old helper
   against Kimi static rows; B3.2 migrates it to `buildTierCapabilityEnv`, so B6.1 (row removal)
   stays green in agent-sdk.
8. B4b changes cli-agent-runtime code that rpc-handlers compiles (`chat/di.ts`,
   `chat-ptah-cli.service.ts`, `provider-session-open-request.ts`). B4b's gate adds
   `-t typecheck -p @ptah-extension/rpc-handlers`. Per Revision 2 S-B, B4b is verified and
   committed before B4a starts its checks.
9. `kimi-code-model-merge.spec.ts` asserts merges with the Kimi static rows, so the merge file
   and spec are deleted in B6.1 together with the rows.

Assumptions:

- A1 Anthropic `/v1/models` shape and headers - unverified; B2.3 Task 2.3.2 checks with a keyed
  call only if a key is available locally; otherwise the parser path yields `bad-response`, and
  B7's optional keyed case covers it.
- A2 Kimi `/coding/v1/models` row shape - unverified; B1.2 parser fails closed (`null`), B4a.1
  maps `null` to `bad-response`.
- A3 keyless `POST https://ollama.com/api/show` - verified once (plan); B7 live case 2 checks.
- A4 `ProviderModelsService` resolvable at first OpenCode request (lazy closure) - verified by
  B2.3 Task 2.3.3 (`container.smoke.spec.ts` through the `ptah-electron` typecheck/test in the
  B2 gate) and a live-routes spec case "store throws".
- A5 DECIDED (plan-review-2 minor 3): `ptahCli:listModels` reads the key with the same
  credential-source rule as `ptah-cli-registry.ts:331-333` (shared-connection ->
  `authSecrets.getCredential('apiKey')`, else `authSecrets.getProviderKey` for
  `${PTAH_CLI_KEY_PREFIX}.${agentId}`), precedent `lane-model-listing.adapter.ts:272`. B4a.1.
- A6 Z.AI/Sakana rows carry no tool flag - unverified; `toolUseUnknown` keeps rows; B7 optional
  keyed cases.
- A7 `agy models` lists `<base>-<effort>` ids - unverified; B4b.1 Task 4b.1.3 runs `agy models`
  once from PowerShell (not Git Bash) and pins the output as a fixture; if bases only, the
  `--effort` branch applies.
- Cursor `listModels()` callers (plan-review-2 minor 4): verified by grep - only
  `cli-detection.service.ts:488` (catch + Sentry at `:494`) and the generic provider-session /
  codex fetchers in `provider-rpc.handlers.ts:398,456`, which catch. A throw cannot escape.

| Risk | Severity | Mitigation |
| --- | --- | --- |
| B2 (services) and B3 (readers) share `@ptah-extension/auth-providers`; concurrent checks would read half-edited files | HIGH | Strictly sequential sub-batches; no check while another batch edits the project |
| B4a/B4b transitive compile (S-B) | HIGH | B4b gate includes rpc-handlers typecheck; B4b committed before B4a verifies |
| Native child spawn refused on an empty Claude catalog (S-C) | HIGH | B4a.2 Task 4a.2.4: native profiles pass the model through with one warn; spec cases for both paths |
| `source` made required breaks a typed literal not listed in the plan (S-A: 12 files) | HIGH | B5.2 Task 5.2.1 greps every `ProviderListModelsResult`/`PtahCliListModelsResult` literal and adds `source`; B6.3 full gate typechecks 17 projects + chat |
| Proxy base rename leaves an implementer with a dangling `override` | MEDIUM | B2.2 is atomic over all 7 implementers + 4 specs |
| Schema-2 records with static rows persisted on a dev machine between B2 and B4a (review minor 1) | MEDIUM | No release mid-branch; B7 / Mode 3 Electron check clears `provider.*.modelCatalog` first |
| agy effort silently dropped when live ids are unknown (review minor 2) | LOW | B4b.1: log at `warn`, not debug |
| New swallowing catches raise the degradation-audit ratchet | MEDIUM | Marker on every new catch; `-t lint -p degradation-audit` in every backend gate |
| Ollama Cloud enrichment adds network POSTs | LOW | Bounded by existing 5-concurrency, 10-min TTL and the new 1 MiB cap (B3.1) |
| Copilot CLI source returns `[]` after B4b.1 while the rpc static step still exists until B4a.1 | LOW | Branch-internal only; B4a.1 deletes the static step |

Edge cases:

- 30-day boundary (exactly 30 d kept, +1 ms ignored) - Task 2.3.1 chain spec
- Pre-version / malformed persisted record ignored - Task 2.3.1
- Credential reasons skip the persisted rung - Task 2.3.1
- `toolUseOnly` keeps `toolUseUnknown` rows; persisted list unfiltered - Task 2.3.1
- OpenCode cold cache + gateway down with / without persisted protocol - Task 2.1.3
- OpenCode non-chat-only or unroutable payload -> `bad-response` - Task 2.1.3
- Ollama: union de-dup via `toCloudId`, both sources fail, enrichment fail keeps row with 0 - Task 3.1.1
- Fetcher `[]` vs throw (`empty` vs classified) - Task 2.3.1
- Cursor no key / empty / throw - Task 4b.1.2
- agy retired id -> closest base; unknown base -> no suffix - Task 4b.1.3
- Native child: empty catalog -> pass-through; retired preference -> live successor - Task 4a.2.4
- Picker: persisted notice, live hidden, unavailable error, Retry - Task 5.1.1

---

## Phase map

| Phase | Batches | Phase review |
| --- | --- | --- |
| P1 Contracts and chain | B1.1, B1.2, B2.1, B2.2, B2.3 | code-logic + style (new public API in shared and the service) |
| P2 Readers | B3.1, B3.2, B3.3, B4b.1, B4b.2, B4a.1, B4a.2 | code-logic |
| P3 Renderer | B5.1, B5.2 | code-logic + style; visual (Electron, dark + light) |
| P4 Cleanup and probe | B6.1, B6.2, B6.3, B7 | code-logic |

---

## Batch B1.1: Shared RPC contracts and pure helpers — IN_PROGRESS

- Shape: contract
- Estimated weight (tokens): unavailable (proxy: rpc-providers.types 505 + rpc-agents.types 838 lines read; ~250 lines new)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/shared/src/lib/types/rpc/rpc-providers.types.ts`
  - `libs/shared/src/lib/types/rpc/rpc-agents.types.ts`
  - CREATE `libs/shared/src/lib/providers/model-list-failure.ts` + `model-list-failure.spec.ts`
  - CREATE `libs/shared/src/lib/providers/closest-live-model.ts` + `closest-live-model.spec.ts`
  - `libs/shared/src/lib/providers/index.ts`
- Read set: `implementation-plan.md:149-243`; `rpc-providers.types.ts:55-107`;
  `rpc-agents.types.ts:500-512,828-837`; `providers/index.ts:1-58`; precedent
  `file-settings-errors.ts` (grep for its path in `libs/shared`).
- Contract excerpts:
  ```ts
  export type ProviderModelListSource = 'live' | 'persisted' | 'unavailable';
  export type ModelListFailureReason =
    | 'no-key' | 'not-signed-in' | 'auth-rejected'
    | 'timeout' | 'network' | 'http-error' | 'bad-response'
    | 'empty' | 'no-live-source' | 'unexpected';
  // ProviderModelInfo += toolUseUnknown?: true; upstreamProtocol?: 'messages'|'chat/completions'|'responses';
  // ProviderListModelsResult += source?, failureReason?, savedAt?, notice?; error?, isStatic? kept
  // PtahCliListModelsResult += source?, failureReason?; isStatic becomes optional
  closestLiveModel(preferred: string, liveIds: readonly string[]): string | null
  ```
  Copy table and examples: plan `:189-212`. `types/rpc` keeps literal unions (no import from
  `providers/`).
- Verify: `npm run verify -- --related -p @ptah-extension/shared` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/shared`
- Acceptance: types compile; every existing shared spec green; `closestLiveModel` spec pins the
  four plan examples plus suffix re-append and "no version -> exact only"; failure-copy spec pins
  one sentence per reason and the UTC date in the notice; `isFallback` docs reworded
  (plan `:588-589`).
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned (no catalog skill matches plain TypeScript contracts)
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session (context.md Gate 0.1)
- Review family: same-family exception (see Execution defaults)
- Rationale: additive contracts every later batch compiles against; pure functions.
- Tasks: 3 | Depends on: none
- Phase: P1 | Phase review: deferred to end of P1

### Task 1.1.1: Add list-source, failure-reason and marker fields to RPC types — IN_PROGRESS

- File: `libs/shared/src/lib/types/rpc/rpc-providers.types.ts`, `rpc-agents.types.ts`
- Plan reference: implementation-plan.md:154-188, 588-589
- Pattern to follow: `contextLengthSource?: 'provider'` at `rpc-providers.types.ts:65`
- Quality requirements: all new fields optional; no existing field removed; `isStatic` on
  `PtahCliListModelsResult` made optional.
- Validation notes: owner of `rpc-agents.types.ts` for the whole run until B6.3 (plan-review-2
  minor 6); include the `isFallback` doc rewording here.
- Implementation details: literal unions only; JSDoc per field as in the plan.

### Task 1.1.2: Create `model-list-failure.ts` — IN_PROGRESS

- File: `libs/shared/src/lib/providers/model-list-failure.ts` (+ spec)
- Plan reference: implementation-plan.md:189-200
- Pattern to follow: `file-settings-errors.ts`
- Quality requirements: `CREDENTIAL_FAILURE_REASONS` readonly set of the three credential
  reasons; `describeModelListFailure`, `modelListErrorText`, `modelListNoticeText` fixed copy,
  never interpolating vendor text.
- Validation notes: date formatting UTC `YYYY-MM-DD`, no locale dependence.
- Implementation details: exhaustive `switch` with a `never` check.

### Task 1.1.3: Create `closest-live-model.ts` and export new symbols — IN_PROGRESS

- File: `libs/shared/src/lib/providers/closest-live-model.ts` (+ spec), `providers/index.ts`
- Plan reference: implementation-plan.md:201-212
- Pattern to follow: pure helpers in `libs/shared/src/lib/providers/`
- Quality requirements: total and deterministic; never throws on any string.
- Validation notes: ties by id ascending; suffix re-appended only when the suffixed id is live.
- Implementation details: tokenise on `-`, `.`, `:`, `/`, `_`; family = non-digit tokens;
  version vector = numbers from digit tokens; successor first, else greatest smaller.

### Batch B1.1 verification

- Every listed artifact exists with real code; verify commands pass (output tailed).
- No per-batch review (P1 review covers it).

## Batch B1.2: Registry fields, Kimi live parser, OpenCode type move — PENDING

- Shape: contract
- Estimated weight (tokens): unavailable (proxy: provider-registry 953 lines read; ~150 lines changed/new)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/shared/src/lib/providers/provider-registry.ts`
  - `libs/shared/src/lib/providers/entries/kimi-code-provider-entry.ts`
  - CREATE `libs/shared/src/lib/providers/entries/kimi-code-models.ts` + `kimi-code-models.spec.ts`
  - `libs/shared/src/lib/providers/entries/opencode-provider-entry.ts`
  - `libs/shared/src/lib/providers/entries/opencode-model-routes.ts`
  - `libs/shared/src/lib/providers/index.ts`
- Read set: `implementation-plan.md:213-231`; `provider-registry.ts:91-214,657-683,859-863,896-913`;
  `kimi-code-provider-entry.ts:43-62`; `kimi-code-model-merge.ts:8-19`; `opencode-model-routes.ts`
  (type declarations only).
- Contract excerpts:
  ```ts
  // AnthropicProvider +=
  modelsAuthScheme?: 'bearer' | 'anthropic';           // absent = Bearer; never set for custom entries
  liveModelCapabilities?: readonly ModelCapability[];  // Kimi SDK allowlist; never a list or tool flag
  export function getProviderLiveModelCapabilities(providerId: string): readonly ModelCapability[] | undefined
  export function parseKimiCodeModels(payload: unknown): ProviderModelInfo[] | null
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/shared` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/shared`; B1 gate
  `npm run verify -- -p @ptah-extension/shared`
- Acceptance: `customEntryToAnthropicProvider` never sets `modelsAuthScheme`;
  `getProviderLiveModelCapabilities` resolves through `getPtahCliLaneProvider`; Kimi parser
  returns `null` on bad envelope, skips bad rows, marks `toolUseUnknown` unless tools reported;
  `OpenCodeProviderId`/`OpenCodeProtocol`/`isOpenCodeProviderId` live in the entry and
  `opencode-model-routes.ts` imports them; static rows untouched; B1 gate green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: second half of the additive shared work; same project as B1.1, so after it.
- Tasks: 3 | Depends on: B1.1
- Phase: P1 | Phase review: deferred

### Task 1.2.1: Registry fields and capability lookup — PENDING

- File: `provider-registry.ts`, `kimi-code-provider-entry.ts`
- Plan reference: implementation-plan.md:213-220
- Pattern to follow: `getAnthropicProvider` beside it in `provider-registry.ts`
- Quality requirements: additive; Kimi entry sets `liveModelCapabilities: KIMI_CODE_MODEL_CAPABILITIES`.
- Validation notes: custom entries must not receive either field (S9).
- Implementation details: lookup via `getPtahCliLaneProvider` (`:859-863`).

### Task 1.2.2: `parseKimiCodeModels` — PENDING

- File: `entries/kimi-code-models.ts` (+ spec)
- Plan reference: implementation-plan.md:221-224
- Pattern to follow: zod per-row validation in `opencode-live-routes.ts:44-60` (read only)
- Quality requirements: live rows only; no static merge.
- Validation notes: A2 unverified; fail closed.
- Implementation details: capabilities from `liveModelCapabilities`.

### Task 1.2.3: Move OpenCode types and export — PENDING

- File: `opencode-provider-entry.ts`, `opencode-model-routes.ts`, `index.ts`
- Plan reference: implementation-plan.md:225-228
- Pattern to follow: existing re-exports in `index.ts`
- Quality requirements: no export moves twice; public names unchanged.
- Validation notes: auth-providers imports keep resolving through `@ptah-extension/shared`.
- Implementation details: routes file re-imports from the entry.

### Batch B1.2 verification

- Artifacts exist; B1 gate green; no per-batch review.

## Batch B2.1: Typed failure, models-API parser, OpenCode live routes — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: opencode-live-routes 210 + spec 255; service `:1303-1348` read)
- Actual weight (lane tokens): pending
- Write set:
  - CREATE `libs/backend/auth-providers/src/lib/model-list-error.ts` + `model-list-error.spec.ts`
  - CREATE `libs/backend/auth-providers/src/lib/models-api-parser.ts` + `models-api-parser.spec.ts`
  - `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts` + `opencode-live-routes.spec.ts`
- Read set: `implementation-plan.md:262-268,312-317,344-368,407-415`;
  `provider-models.service.ts:1242-1251,1303-1348` (to extract, not edit);
  `opencode-live-routes.ts:1-210`.
- Contract excerpts:
  ```ts
  export class ModelListError extends Error { constructor(readonly reason: ModelListFailureReason) }
  export function classifyModelListFailure(error: unknown): ModelListFailureReason
  export function parseModelsApiRows(rows: unknown[]): ProviderModelInfo[]
  // OpenCodeLiveRoutes:
  refresh(id, { force?: boolean }); list(id, { force }): Promise<rows> // throws ModelListError
  usePersistedCatalog(store: { read(id): { models; savedAt } | null; write(id, models): void }): void
  modelIds(id): Promise<readonly string[] | null>
  resolve(id, modelId) -> live | refreshed | persisted upstreamProtocol | { outcome: 'not-listed' | 'catalog-unavailable' }
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers`;
  `npm run verify -- -t lint -p degradation-audit`
- Acceptance: classification table pinned (401/403, other response, timeout codes, network
  codes, unknown); parser skips invalid rows, `toolUseUnknown` when no flag; live routes keep only
  `type === 'chat'` (missing kept) with a resolvable protocol, `recommended_api` first, multi-`api`
  rows, `force` skips backoff but joins in-flight, refresh writes through the store, store throws
  -> no catalog (marker `optional-capability`), static rung deleted from `resolve`, `modelIds`
  order, 2 MiB cap -> `bad-response`. The service keeps its own copies until B2.3 (no edit to
  `provider-models.service.ts` here).
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: leaf logic the service and proxy consume; keeps B2.3 to the chain itself.
- Tasks: 3 | Depends on: B1.2
- Phase: P1 | Phase review: deferred

### Task 2.1.1: `ModelListError` + classifier — PENDING

- File: `model-list-error.ts` (+ spec)
- Plan reference: implementation-plan.md:262-268
- Pattern to follow: axios error checks already in `provider-models.service.ts:558-566`
- Quality requirements: raw message only at debug in callers; never in the reason.
- Validation notes: non-axios timeout errors -> `timeout`.
- Implementation details: pure, no logger dependency.

### Task 2.1.2: `parseModelsApiRows` — PENDING

- File: `models-api-parser.ts` (+ spec)
- Plan reference: implementation-plan.md:312-317
- Pattern to follow: `transformApiModels` / `parsePricingField` (`provider-models.service.ts:1303-1348`)
- Quality requirements: name from `name` / `display_name` / `id`; tool flag from
  `supported_parameters` / `supports_tool_calling`.
- Validation notes: capabilities applied by the caller, not the parser.
- Implementation details: copy semantics; the service switches to it in B2.3.

### Task 2.1.3: OpenCode live routes - payload type/protocol, force, store, modelIds — PENDING

- File: `providers/opencode/opencode-live-routes.ts` (+ spec)
- Plan reference: implementation-plan.md:348-368, 407-415; failure-table rows 762-763
- Pattern to follow: existing per-row validation and own-property lookups in the same file
- Quality requirements: no cross-subscription lookup; own-property lookups.
- Validation notes: cold cache + gateway down with/without persisted protocol (spec cases); A4
  "store throws" case.
- Implementation details: row mapping per plan `:366-368`; `ModelListError` reason kept from
  the last failure.

### Batch B2.1 verification

- Artifacts exist; inner loop + degradation-audit green; no per-batch review.

## Batch B2.2: Proxy base hooks and the `getListedModels` rename — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: translation-proxy-base 1785 lines read at `:202-272,456-550`; 7 proxies small edits; opencode proxy 103 + spec 656)
- Actual weight (lane tokens): pending
- Write set (declared exception: 7 production files, one project - the rename must land in one
  commit because `noImplicitOverride: true` turns any un-renamed `override` into a compile error):
  - `libs/backend/auth-providers/src/lib/translation/translation-proxy-base.ts` + `translation-proxy-base.spec.ts`
  - `libs/backend/auth-providers/src/lib/providers/opencode/opencode-translation-proxy.ts` + `opencode-translation-proxy.spec.ts`
  - `providers/copilot/copilot-translation-proxy.ts`
  - `providers/kimi-code/kimi-code-translation-proxy.ts`
  - `providers/sakana/sakana-translation-proxy.ts` + `sakana-translation-proxy.spec.ts`
  - `providers/openrouter/openrouter-translation-proxy.ts`
  - `providers/local/local-model-translation-proxy.ts`
  - `providers/custom/custom-openai-translation-proxy.ts` + `custom-openai-translation-proxy.spec.ts`
  - `auth/curator-proxy-manager.spec.ts`
- Read set: `implementation-plan.md:369-394`; `translation-proxy-base.ts:202-272,456-473,530-550,694-712`;
  `opencode-translation-proxy.ts:22-108`; `model-tier-derivation.ts:113-157`;
  `libs/backend/auth-providers/tsconfig.lib.json:14`.
- Contract excerpts:
  ```ts
  protected getListedModels(): Array<{ id: string }> { return []; }          // was abstract getStaticModels
  protected async resolveRequestModelId(modelId: string): Promise<string>    // default normalizeModelId
  protected getUnsupportedModelMessage(modelId: string, outcome?: 'not-listed' | 'catalog-unavailable'): string
  // default: `Model '<id>' is not supported by <name>.`
  // OpenCode: not-listed `Model '<id>' is not offered by <name> as a chat model. Choose a model from the list.`
  //           catalog-unavailable `Couldn't load <name>'s model list to route '<id>'. Check your connection and retry.`
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers`
- Acceptance: no `getStaticModels` left in `libs/backend/auth-providers` (grep); custom proxy is
  the only `override getListedModels`; Copilot proxy `listModels()` and `staticModelsAsFull`
  deleted; OpenCode alias resolution: preference present, retired -> `closestLiveModel`, retired
  -> derived, warn once per provider+tier; both 400 texts pinned; Sakana `/v1/models` returns
  empty `data`.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: mechanical rename plus two hooks; atomic by compiler rule.
- Tasks: 3 | Depends on: B2.1 (`openCodeLiveRoutes.modelIds`)
- Phase: P1 | Phase review: deferred

### Task 2.2.1: Base hooks and concrete `getListedModels` — PENDING

- File: `translation-proxy-base.ts` (+ spec)
- Plan reference: implementation-plan.md:369-376
- Pattern to follow: existing protected hooks in the same class
- Quality requirements: `:535` awaits `resolveRequestModelId`; `:544-548` uses the message hook.
- Validation notes: "update Ptah" wording dropped.
- Implementation details: `/v1/models` (`:465-473`) calls `getListedModels`.

### Task 2.2.2: OpenCode proxy overrides — PENDING

- File: `opencode-translation-proxy.ts` (+ spec)
- Plan reference: implementation-plan.md:377-385
- Pattern to follow: warn-once map pattern used in `provider-models.service.ts` tier logging
- Quality requirements: delete `normalizeModelId`, `resolveUpstreamProtocol`, `getStaticModels`.
- Validation notes: `ids === null` -> preference unchanged (routing then yields catalog-unavailable).
- Implementation details: `default`/`sonnet`/`opus`/`haiku` -> `entry.defaultTiers`.

### Task 2.2.3: Remaining proxies and specs — PENDING

- File: copilot, kimi-code, sakana, openrouter, local, custom proxies; three specs listed above
- Plan reference: implementation-plan.md:386-394
- Pattern to follow: n/a (deletions)
- Quality requirements: custom keeps its user-config list as `protected override getListedModels()`.
- Validation notes: S3 resolved only if the grep is empty.
- Implementation details: `curator-proxy-manager.spec.ts:36` override deleted.

### Batch B2.2 verification

- Grep `getStaticModels` in auth-providers empty; inner loop green; no per-batch review.

## Batch B2.3: Model-list chain, versioned record, tier preferences, DI attach — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: provider-models.service 1432 + spec 2062 lines; new chain spec ~400)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/auth-providers/src/lib/provider-models.service.ts`
  - `libs/backend/auth-providers/src/lib/provider-models.service.spec.ts`
  - `libs/backend/auth-providers/src/lib/provider-models.opencode.spec.ts`
  - CREATE `libs/backend/auth-providers/src/lib/provider-models.fallback-chain.spec.ts`
  - `libs/backend/auth-providers/src/lib/di/register.ts`
  - `libs/backend/auth-providers/src/lib/providers/custom/custom-proxy.factory.ts`
  - `libs/shared/src/lib/providers/entries/anthropic-api-lane-entry.ts` (endpoint + scheme only)
- Read set: `implementation-plan.md:245-342,725-772`; `provider-models.service.ts:95-136,176-240,288-475,480-574,576-614,761-870,958-991,1106-1131,1212-1348`;
  `model-tier-derivation.ts:113-157`; `pricing.utils.ts:541-554`; `register.ts:53-75`;
  `custom-proxy.factory.ts:34-49`.
- Contract excerpts:
  ```ts
  export interface ProviderModelList {
    models: ProviderModelInfo[]; totalCount: number; source: ProviderModelListSource;
    savedAt?: number; failureReason?: ModelListFailureReason;
    /** @deprecated always false; deleted in B6.3 */ isStatic: false;
  }
  // persisted: { schema: 2, origin: 'live', models, timestamp }  (PERSISTED_CATALOG_SCHEMA = 2)
  getPersistedCatalog(providerId): { models; savedAt } | null
  savePersistedCatalog(providerId, models): void   // fire-and-forget, `degradation-audit: reported`
  ```
  Chain steps plan `:269-282`; tier ladder plan `:296-305`; deletions plan `:306-311`.
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers,@ptah-extension/shared`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers,@ptah-extension/shared`.
  B2 gate (team-leader, before commit):
  `npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/shared`, then
  `npm run verify -- -t typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/cli-engine,ptah-electron`,
  then `npm run verify -- -t lint -p degradation-audit`
- Acceptance: one chain case per failure-table row (`:748-767`) in the chain spec, including the
  30-day boundary, pre-version and malformed records, credential skip, `empty` vs throw,
  `unexpected`; persisted and memory cache hold the unfiltered list; `toolUseOnly` keeps unknown;
  `FILTERED_TIER_CATALOG_PROVIDERS` no longer lists opencode; tier replacement order family ->
  derived -> preference with one `warn` per provider+tier; header by `modelsAuthScheme`; API lane
  has the endpoint and `'anthropic'` scheme; `isStatic` assertions in both service specs
  replaced by `source` assertions; OpenCode merge branch, `mergeStaticMetadata`, static rung and
  static-capability fallback gone; DI attach is a lazy closure (nothing resolved at
  registration); `custom-proxy.factory.ts:47` line removed; rpc-handlers and cli-agent-runtime
  still typecheck.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: the core behaviour change; one owner file plus its specs.
- Tasks: 3 | Depends on: B2.1, B2.2
- Phase: P1 (last batch) | Phase review: code-logic + style, combined diff of B1.1..B2.3

### Task 2.3.1: Chain, versioned record, typed result, chain spec — PENDING

- File: `provider-models.service.ts`, both service specs, new chain spec
- Plan reference: implementation-plan.md:250-295, 306-317, 748-767
- Pattern to follow: existing persisted read `:212-240`
- Quality requirements: never throws for a vendor failure; unknown provider still throws
  `SdkError('Unknown provider')`; persisted read synchronous; no timer.
- Validation notes: B1 (versioning), S2 (credential skip), S6 (unfiltered persist); debug log
  once per provider for ignored old records.
- Implementation details: switch to `parseModelsApiRows` and `ModelListError`; capabilities
  from `getProviderLiveModelCapabilities`.

### Task 2.3.2: Header scheme and API-lane endpoint — PENDING

- File: `provider-models.service.ts`, `anthropic-api-lane-entry.ts`
- Plan reference: implementation-plan.md:318-324; A1
- Pattern to follow: `:525-532`
- Quality requirements: absent/`'bearer'` unchanged for every existing and custom provider.
- Validation notes: A1 - if a key is available locally, one call; otherwise record "A1
  unverified" in the report.
- Implementation details: `x-api-key` + `anthropic-version: 2023-06-01`.

### Task 2.3.3: Tier preferences, DI attach, factory line — PENDING

- File: `provider-models.service.ts`, `di/register.ts`, `custom-proxy.factory.ts`
- Plan reference: implementation-plan.md:296-305, 395-399
- Pattern to follow: `providerQuotaStore` attach at `register.ts:66-73`
- Quality requirements: lazy resolution of `AUTH_PROVIDERS_TOKENS.SDK_PROVIDER_MODELS`.
- Validation notes: A4 (container smoke runs under the `ptah-electron` typecheck in the gate).
- Implementation details: `closestLiveModel` -> `deriveTiersFromCatalog(...)[tier]` -> keep.

### Batch B2.3 verification

- Artifacts exist; B2 gate green; then `NEEDS REVIEW` for P1.

## Batch B3.1: Ollama Cloud and local discovery — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: ollama-model-discovery 765 + cloud-metadata 555 + spec 145)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/auth-providers/src/lib/providers/local/ollama-model-discovery.service.ts` + spec
  - `libs/backend/auth-providers/src/lib/providers/local/ollama-cloud-metadata.service.ts` + spec
  - DELETE `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts` (correction 2)
- Read set: `implementation-plan.md:423-464`; `ollama-model-discovery.service.ts:59-125,247-249,329-522,526-650,712-760`;
  `ollama-cloud-metadata.service.ts:1-20,66,81-96,171-275,504-548`;
  `libs/shared/src/lib/providers/ollama-cloud-model-id.ts`.
- Contract excerpts: `OllamaCloudTag.capabilities?: readonly string[]`; failure throws
  `ModelListError('http-error' | 'bad-response' | 'network' | 'timeout')`; successful empty stays
  `[]`; `httpRequest` 1 MiB cap -> `bad-response`; `parseShowResponse` reads `model_info` and
  `modelinfo`, any own key ending `.context_length` with a positive safe integer.
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers`;
  `npm run verify -- -t lint -p degradation-audit`
- Acceptance: `KNOWN_CLOUD_MODELS`, `buildCloudDescription` and the known-model shortcut deleted;
  union keyed by `toCloudId`, ollama.com fields win; `completion` filter; `toolUseUnknown` when
  no capabilities; enrichment failure keeps the row with `contextLength: 0` and no
  `contextLengthSource`; both sources fail -> throws with the ollama.com reason; local daemon
  unreachable -> `ModelListError('network')` with the Sentry capture kept; "bundled static
  catalog" wording removed; the old drift spec deleted; grep `KNOWN_CLOUD_MODELS` in `libs/` empty.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: self-contained provider; same project as B2, so after B2.3 commits.
- Tasks: 2 | Depends on: B2.3
- Phase: P2 | Phase review: deferred

### Task 3.1.1: Cloud list from ollama.com + local cloud tags, enrichment, cap — PENDING

- File: `ollama-model-discovery.service.ts` (+ spec)
- Plan reference: implementation-plan.md:432-450
- Pattern to follow: `getModelMetadata` with base URL parameter (`:550-607`)
- Quality requirements: enrichment failures never fail the list; existing 5-concurrency and
  10-min/1-min TTLs reused.
- Validation notes: network cost stated in the plan (`:457-459`).
- Implementation details: `getModelMetadata('https://ollama.com', tag)`.

### Task 3.1.2: Cloud tags metadata throws on failure; delete old drift spec — PENDING

- File: `ollama-cloud-metadata.service.ts` (+ spec); delete `model-lists.live.spec.ts`
- Plan reference: implementation-plan.md:427-431, 658
- Pattern to follow: n/a
- Quality requirements: failure no longer caches `[]`.
- Validation notes: correction 2 above (deleted here because it imports `KNOWN_CLOUD_MODELS`).
- Implementation details: copy `capabilities` only when it is a string array.

### Batch B3.1 verification

- Artifacts exist; inner loop + audit green; no per-batch review.

## Batch B3.2: Tier capability env from live declarations; resolver and stored-model readers — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: sdk-model-service `:160-191`, resolvers `:430-450,850-915`, stored-model-offer 60 lines)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts` + `tier-capability-env.spec.ts`
  - `libs/backend/agent-sdk/src/lib/helpers/index.ts`
  - `libs/backend/agent-sdk/src/index.ts`
  - `libs/backend/auth-providers/src/lib/auth/provider-auth-resolver.ts`
  - `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.ts` + spec
  - `libs/backend/auth-providers/src/lib/auth/stored-model-offer.ts` + CREATE `stored-model-offer.spec.ts`
  - `libs/backend/auth-providers/src/lib/auth/model-resolver.spec.ts` (if it asserts static rows)
- Read set: `implementation-plan.md:466-497`; `sdk-model-service.ts:160-191`;
  `helpers/index.ts:220-235`; `agent-sdk/src/index.ts:505-530`;
  `provider-auth-resolver.ts:1-20,430-450`; `workspace-provider-profile-resolver.ts:55-65,850-915`;
  `stored-model-offer.ts:1-60`; `libs/shared/src/lib/types/auth-env.types.ts` (`ModelCapability`).
- Contract excerpts:
  ```ts
  export function buildTierCapabilityEnv(providerId: string, tiers: ...): Record<string,string>
  // reads getProviderLiveModelCapabilities(providerId); writes only a non-empty list
  ```
  Old `buildStaticTierCapabilityEnv` and the `seedStaticModelPricing` re-export STAY (read by
  `ptah-cli-registry.ts:50,52` until B4b.2).
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk`
- Acceptance: callers use `buildTierCapabilityEnv`; `staticModels[0]` rung deleted (ladder:
  snapshot tiers -> requested alias); `isOfferedBy` uses `cachedModelIds` only; new spec pins the
  M8 regression case (never-listed provider keeps the saved id); `tier-capability-env.spec.ts`
  tests the new helper against `liveModelCapabilities` (correction 7); agent-sdk never imports
  auth-providers.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: additive helper plus its two callers and the stored-model check.
- Tasks: 3 | Depends on: B3.1
- Phase: P2 | Phase review: deferred

### Task 3.2.1: `buildTierCapabilityEnv` in agent-sdk — PENDING

- File: `sdk-model-service.ts`, `helpers/index.ts`, `src/index.ts`, `tier-capability-env.spec.ts`
- Plan reference: implementation-plan.md:470-474
- Pattern to follow: `buildStaticTierCapabilityEnv` at `sdk-model-service.ts:173-191`
- Quality requirements: same env-key rule; additive export.
- Validation notes: `deleted-exports.contract.spec.ts` lists removed names; do not add the new
  name there.
- Implementation details: n/a.

### Task 3.2.2: Resolvers switch and `staticModels[0]` rung removal — PENDING

- File: `provider-auth-resolver.ts`, `workspace-provider-profile-resolver.ts` (+ spec), `model-resolver.spec.ts`
- Plan reference: implementation-plan.md:475-477
- Pattern to follow: n/a
- Quality requirements: alias ladder ends at the requested alias.
- Validation notes: no capabilities -> env key unset.
- Implementation details: n/a.

### Task 3.2.3: Stored-model check from catalog only — PENDING

- File: `stored-model-offer.ts` + new spec
- Plan reference: implementation-plan.md:478-481
- Pattern to follow: existing `cachedModelIds` param
- Quality requirements: documented M8 regression pinned.
- Validation notes: no catalog -> stored model kept.
- Implementation details: drop the registry static lookup.

### Batch B3.2 verification

- Artifacts exist; inner loop green; no per-batch review.

## Batch B3.3: Remove static price seeding from auth strategies — PENDING

- Shape: mechanical
- Estimated weight (tokens): unavailable (proxy: 3 strategies, ~10 call/import sites)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/auth-providers/src/lib/auth/strategies/api-key.strategy.ts`
  - `libs/backend/auth-providers/src/lib/auth/strategies/cli.strategy.ts` + `cli.strategy.spec.ts`
  - `libs/backend/auth-providers/src/lib/auth/strategies/oauth-proxy.strategy.ts`
- Read set: `implementation-plan.md:482-484`; `api-key.strategy.ts:40-50,435-450,605-660`;
  `cli.strategy.ts:10-20,60-75`; `oauth-proxy.strategy.ts:40-45,160-170,255-262`.
- Contract excerpts: Claude prices stay in `ANTHROPIC_RATE_CARD` (`anthropic-rate-card.ts:9-18`);
  Z.AI cost becomes unknown (D7).
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk`.
  B3 gate: `npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/agent-sdk`, then
  `npm run verify -- -t typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime`,
  then `npm run verify -- -t lint -p degradation-audit`
- Acceptance: no `seedStaticModelPricing` import or call left in `libs/backend/auth-providers`
  (grep); B3 gate green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: mechanical removal, closes plan B3.
- Tasks: 1 | Depends on: B3.2
- Phase: P2 | Phase review: deferred

### Task 3.3.1: Delete seeding imports and calls — PENDING

- File: three strategies + `cli.strategy.spec.ts`
- Plan reference: implementation-plan.md:482-484
- Pattern to follow: n/a
- Quality requirements: no other behaviour change.
- Validation notes: spec mocks of `seedStaticModelPricing` removed.
- Implementation details: n/a.

### Batch B3.3 verification

- Grep empty; B3 gate green; no per-batch review.

## Batch B4b.1: CLI adapters - Copilot SDK, Cursor, agy, interface docs — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: antigravity adapter 1983 lines read at `:150-380,830-920,1160-1170`; cursor `:300-350`; copilot-sdk `:110-125,240-250`)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts` + spec
  - `.../cli-adapters/cursor-cli.adapter.ts` + `cursor-cli.adapter.spec.ts`
  - `.../cli-adapters/antigravity-cli.adapter.ts` + `antigravity-cli.adapter.spec.ts` + `antigravity-cli.adapter.acp.spec.ts`
  - `.../cli-adapters/cli-adapter.interface.ts` (doc lines `:63-69`)
- Read set: `implementation-plan.md:557-589`; `copilot-sdk.adapter.ts:110-125,240-250`;
  `cursor-cli.adapter.ts:300-350`; `antigravity-cli.adapter.ts:150-380,830-920,1160-1170`;
  `cli-detection.service.ts:480-500`; `libs/shared/src/lib/providers/closest-live-model.ts`.
- Contract excerpts:
  ```ts
  agyModelId(value: string, liveIds: ReadonlySet<string> | null): string
  agyModelWithEffort(model: string, effort: AgyEffort | undefined, liveIds: ReadonlySet<string> | null): string
  buildAntigravityArgs(options, prompt, useStreamInput, liveIds)
  // adapter: last ids { ids: ReadonlySet<string>, at } 10-min freshness; currentModelIds() probes once (8 s, shared in-flight)
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime`;
  `npm run verify -- -t lint -p degradation-audit`
- Acceptance: `COPILOT_MODELS`, `FALLBACK_MODELS`, `AGY_EFFORT_MODEL_BASES`, `AGY_STALE_MODEL_IDS`
  deleted; no `isFallback: true` literal in `cli-adapters/` (grep); Cursor: no key -> `[]` (debug),
  empty -> `[]` (warn without "fallback"), throw -> redacted `Error('Cursor models.list() failed')`;
  agy: suffix chosen from live ids, retired id -> closest base (warn), no live ids -> unchanged,
  unknown base -> no suffix logged at `warn` (review minor 2); `agy models` output pinned as a
  fixture (A7); `AGY_EFFORTS` kept.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: adapter-local changes; first of the cli-agent-runtime pair (B4b before B4a, S-B).
- Tasks: 3 | Depends on: B3.3
- Phase: P2 | Phase review: deferred

### Task 4b.1.1: Copilot SDK adapter list — PENDING

- File: `copilot-sdk.adapter.ts` (+ spec)
- Plan reference: implementation-plan.md:562-563
- Pattern to follow: n/a
- Quality requirements: `listModels()` returns `[]`; doc names the host LM API and account `/models`.
- Validation notes: rpc copilot fetcher still has its static step until B4a.1 (branch-internal).
- Implementation details: n/a.

### Task 4b.1.2: Cursor live-only — PENDING

- File: `cursor-cli.adapter.ts` (+ spec), `cli-adapter.interface.ts`
- Plan reference: implementation-plan.md:564-569, 588-589
- Pattern to follow: reported path `cli-detection.service.ts:486-500`
- Quality requirements: no key material in the rethrown error.
- Validation notes: callers verified to catch (see Assumptions).
- Implementation details: `sdk.Cursor.models.list({ apiKey })` is the only source.

### Task 4b.1.3: agy derivation from live ids — PENDING

- File: `antigravity-cli.adapter.ts` (+ two specs)
- Plan reference: implementation-plan.md:570-586; A7
- Pattern to follow: `parseAgyModels` `:302-322`, `listModels` `:909-916`
- Quality requirements: at most one 8 s probe per spawn when no ids are cached.
- Validation notes: run `agy models` once from PowerShell (local, not billed; do not use Git
  Bash) to pin the fixture; if agy is not installed, use the format the old table encoded and
  state "A7 unverified" in the report.
- Implementation details: both readers (`:839`, `:1165`) await `currentModelIds()`.

### Batch B4b.1 verification

- Artifacts exist; greps empty; inner loop + audit green; no per-batch review.

## Batch B4b.2: Ptah CLI registry and lane-routing readers — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: ptah-cli-registry 1845 lines read at listed sites; 12 registry specs one-line mock edits)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts`
  - registry specs (mock edits: drop `staticModels` rows and `seedStaticModelPricing` mocks; add
    `buildTierCapabilityEnv` / `getCachedModelIds` mocks): `ptah-cli-registry-{auto-compact-argv,capabilities,harness-preflight,inbound-peer,kimi-code-signin,lmstudio-proxy,off-thread-spawn,output-style,permission-routing,plan-limits,sakana-proxy,spawn-model}.spec.ts`, `ptah-cli-registry.proxy-lease.spec.ts`
  - `libs/backend/lane-routing/src/lib/child-session/child-model-tier.ts` + spec
  - `libs/backend/lane-routing/src/lib/matrix/seed-matrix.ts` + spec
- Read set: `implementation-plan.md:590-599`; `ptah-cli-registry.ts:40-60,325-350,450-465,610-620,680-695,885-895,1560-1575,1700-1770`;
  `child-model-tier.ts:30-55`; `seed-matrix.ts:25-35`; `seed-matrix.spec.ts:20-35`;
  `pricing.utils.ts:556-563`; `provider-models.service.ts` `getCachedModelIds` / `resolveEffectiveTiers` signatures.
- Contract excerpts:
  ```ts
  modelCount = this.providerModels.getCachedModelIds(providerId)?.length ?? 0
  childModelWindow(model) = getDiscoveredContextWindow(model, 'claude-cli') || (/\[1m\]$/i.test(model) ? 1_000_000 : 0)  // then existing 200k regex; else undefined
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing`.
  B4b gate: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing`,
  then `npm run verify -- -t typecheck -p @ptah-extension/rpc-handlers,@ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron`
  (rpc-handlers added, correction 8), then `npm run verify -- -t lint -p degradation-audit`
- Acceptance: registry uses `buildTierCapabilityEnv`, no `seedStaticModelPricing`, no
  `staticModels` read; `resolveEffectiveTiers` output replaces `defaultSonnet`; doc `:1757-1766`
  fixed; no registry spec carries `staticModels` or `seedStaticModelPricing` (grep, correction 3);
  `seed-matrix.spec.ts:28-30` static-membership assertion dropped; B4b gate green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: registry readers + lane-routing; committed before B4a verifies (Revision 2 S-B).
- Tasks: 2 | Depends on: B4b.1
- Phase: P2 | Phase review: deferred

### Task 4b.2.1: Registry readers and spec mocks — PENDING

- File: `ptah-cli-registry.ts` + 13 specs
- Plan reference: implementation-plan.md:590-595
- Pattern to follow: `this.providerModels` already injected (`:1714`)
- Quality requirements: no catalog -> `modelCount` 0.
- Validation notes: specs must still assert their original behaviour; only the mock surface changes.
- Implementation details: n/a.

### Task 4b.2.2: lane-routing context window and seed matrix — PENDING

- File: `child-model-tier.ts` (+ spec), `seed-matrix.ts` (+ spec)
- Plan reference: implementation-plan.md:596-599
- Pattern to follow: `getDiscoveredContextWindow` (`pricing.utils.ts:556-563`)
- Quality requirements: `seed-matrix.ts:31-32` comment only.
- Validation notes: n/a.
- Implementation details: n/a.

### Batch B4b.2 verification

- Artifacts exist; B4b gate green; commit before B4a's checks start.

## Batch B4a.1: Provider and Ptah CLI list handlers, lane listing — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: provider-rpc.handlers 1153 lines read at listed sites; ptah-cli-rpc `:290-360`; lane adapter `:30-305`)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts` + spec
  - `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts` + spec
  - `libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts` + spec
  - `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts` (comments only)
- Read set: `implementation-plan.md:499-526,542-543`; `provider-rpc.handlers.ts:140-150,295-380,440-550,630-690,710-805`;
  `ptah-cli-rpc.handlers.ts:290-360`; `lane-model-listing.adapter.ts:30-75,190-305`;
  `cli-model-list.service.ts:55-170`; `ptah-cli-registry.ts:325-345` (A5 pattern).
- Contract excerpts:
  ```ts
  // provider:listModels mapping
  live        -> { models, totalCount, source }
  persisted   -> + failureReason, savedAt, notice: modelListNoticeText(reason, name, savedAt)
  unavailable -> { models: [], totalCount: 0, source, failureReason, error: modelListErrorText(reason, name) }
  // ptahCli:listModels -> { models, source, failureReason?, error? }; "Agent not found"/"Provider not found" keep text with source 'unavailable'
  // lane port returns source (+ deprecated isStatic until B6.3); unavailable -> {kind:'error', reason:'threw'}; persisted -> 'fallback'; live -> 'reported'
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/rpc-handlers` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers`;
  `npm run verify -- -t lint -p degradation-audit`
- Acceptance: no-key pre-check and string-matched auth branch deleted; `isStatic` no longer set
  by either handler; Copilot static step deleted, `not-signed-in` vs classified reason; Kimi uses
  `parseKimiCodeModels` (`null` -> `bad-response`); claude-cli empty stays `[]`; `ptahCli:listModels`
  injects `SDK_PROVIDER_MODELS` and reads the key per A5; `isPurelyDynamic` and its `skipped` path
  deleted; unknown-provider Sentry capture kept; spec `isStatic` assertions replaced by `source`.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: the RPC mapping layer; starts its checks only after B4b.2 is committed.
- Tasks: 3 | Depends on: B4b.2
- Phase: P2 | Phase review: deferred

### Task 4a.1.1: `provider:listModels` mapping and fetchers — PENDING

- File: `provider-rpc.handlers.ts` (+ spec)
- Plan reference: implementation-plan.md:504-517
- Pattern to follow: existing Sentry capture `:791-799`
- Quality requirements: a vendor failure never becomes an RPC failure envelope.
- Validation notes: `reapplyTiersForWarmedCatalog` only when `totalCount > 0`.
- Implementation details: `ModelListError` from the fetchers.

### Task 4a.1.2: `ptahCli:listModels` through the chain — PENDING

- File: `ptah-cli-rpc.handlers.ts` (+ spec)
- Plan reference: implementation-plan.md:518-522; A5 decision
- Pattern to follow: injection at `provider-rpc.handlers.ts:143-144`
- Quality requirements: no key material in errors or logs.
- Validation notes: A5 decided (credential-source rule of `ptah-cli-registry.ts:331-333`).
- Implementation details: n/a.

### Task 4a.1.3: Lane listing port and CLI model list comments — PENDING

- File: `lane-model-listing.adapter.ts` (+ spec), `cli-model-list.service.ts`
- Plan reference: implementation-plan.md:523-526, 542-543
- Pattern to follow: existing `runDiscovery`
- Quality requirements: comments no longer describe a curated list.
- Validation notes: keep deprecated `isStatic` on the port until B6.3.
- Implementation details: n/a.

### Batch B4a.1 verification

- Artifacts exist; inner loop + audit green; no per-batch review.

## Batch B4a.2: Config readers and native child admission (incl. Revision 2 S-C) — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: config files ~200 lines; child-model-admission 60; chat-session.service `:1490-1525`)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/backend/rpc-handlers/src/lib/handlers/config-saved-model-option.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/config-provider-session-models.ts` + CREATE `config-provider-session-models.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts` (caller at `:538`, comment `:184`) + `config-rpc.handlers.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/chat/session/child-model-admission.ts` + spec
  - `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts` (`:1492-1525`)
- Read set: `implementation-plan.md:527-541`, Revision 2 S-C (`:991`); `config-saved-model-option.ts:30-60`;
  `config-provider-session-models.ts:15-85`; `config-rpc.handlers.ts:180-190,530-545`;
  `child-model-admission.ts:1-60`; `chat-session.service.ts:1485-1525`.
- Contract excerpts:
  ```ts
  type ProviderCatalogReader = (...) => Promise<{ models; source; failureReason? }>
  nativeChildModelIds(catalog): string[]                       // catalog ids only
  resolveNativeTierAlias(model: string, catalogIds: readonly string[]): string
  // S-C: native profile && acceptedModels.length === 0 -> pass the model through unchanged,
  //      warn once, let the Claude runtime validate; 'model-catalog-unavailable' only for non-native
  ```
- Verify: `npm run verify -- --related -p @ptah-extension/rpc-handlers` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/rpc-handlers`.
  B4a gate: `npm run verify -- -p @ptah-extension/rpc-handlers`, then
  `npm run verify -- -t typecheck -p ptah-electron`, then `npm run verify -- -t lint -p degradation-audit`
- Acceptance: saved-model option only when `cachedModelIds?.includes(saved)`, name = id, no
  registry import; `unavailable` takes the `catalogFailed` path with
  `onCatalogFailure(new ModelListError(reason))`; native aliases: preference if live, else
  `closestLiveModel`, else newest `claude-<tier>-*`, else alias; `fable` newest `claude-fable-*`;
  spec cases: retired preference admits the successor; native + empty catalog passes through with
  one warn (S-C); non-native + empty catalog still `model-catalog-unavailable`;
  `seedStaticModelPricing` comment gone from `config-rpc.handlers.ts`; B4a gate green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: carries the S-C behaviour decision (decisions.md 11) in the files that own it.
- Tasks: 4 | Depends on: B4a.1
- Phase: P2 (last batch) | Phase review: code-logic, combined diff of B3.1..B4a.2

### Task 4a.2.1: Saved-model option from catalog only — PENDING

- File: `config-saved-model-option.ts`
- Plan reference: implementation-plan.md:527-528
- Pattern to follow: n/a
- Quality requirements: `description: ''`.
- Validation notes: n/a.
- Implementation details: drop registry import.

### Task 4a.2.2: Provider-session composer reader (M9) — PENDING

- File: `config-provider-session-models.ts` + new spec, `config-rpc.handlers.ts` (+ spec)
- Plan reference: implementation-plan.md:529-532
- Pattern to follow: existing `catalogFailed` path
- Quality requirements: new spec: unavailable -> default + saved.
- Validation notes: keep `isStatic: false` in existing spec mocks until B6.3 (correction 4).
- Implementation details: caller passes the chain result through.

### Task 4a.2.3: Native alias resolution against the live catalog (S4) — PENDING

- File: `child-model-admission.ts` (+ spec)
- Plan reference: implementation-plan.md:533-541
- Pattern to follow: numeric compare used for `fable` today
- Quality requirements: replacement logs `warn` with preferred and resolved ids.
- Validation notes: D6 - tiers never admit models.
- Implementation details: n/a.

### Task 4a.2.4: Native pass-through on an empty catalog (Revision 2 S-C) — PENDING

- File: `chat-session.service.ts`, `child-model-admission.spec.ts` (or the chat-session spec that
  covers admission)
- Plan reference: implementation-plan.md:991; decisions.md 11; correction 1
- Pattern to follow: existing warn at `chat-session.service.ts:1500-1502`
- Quality requirements: pass-through is not a repo literal; warn once.
- Validation notes: refusing all native spawns on a fetch failure would be a regression.
- Implementation details: branch on `native` before the empty-catalog refusal.

### Batch B4a.2 verification

- Artifacts exist; B4a gate green; then `NEEDS REVIEW` for P2.

## Batch B5.1: Picker saved-list notice — PENDING

- Shape: logic
- Estimated weight (tokens): unavailable (proxy: picker 800 lines read at `:130-150,320-345,750-800`; spec)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts` + spec
  - `libs/frontend/core/src/lib/services/model-state.service.ts` (comment `:162`, correction 6)
- Read set: `implementation-plan.md:621-651`; picker `:136-148,324-343,751-799`;
  `provider-models-loader.port.ts:40`; `model-state.service.ts:155-170`.
- Contract excerpts: `result.source === 'persisted'` -> `notice`; notice row `role="status"`,
  `class="text-xs text-warning"`, `data-testid="provider-model-picker-notice"`, Retry
  `data-testid="provider-model-picker-notice-retry"` `(click)="refreshCatalog()"`, disabled when
  `disabled()`, `min-h-9`; error row unchanged (`role="alert"`).
- Verify: `npm run verify -- --related -p @ptah-extension/ui,@ptah-extension/core` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/ui,@ptah-extension/core`, then
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: spec: notice for persisted, hidden for live, error for unavailable, Retry re-calls
  the loader; `_modelsNotice` cleared beside `_modelsError`; fixtures in this spec move
  `isStatic` -> `source` (`:52,333`); theme tokens only (light + dark).
- Recommended executor: frontend-developer (subagent)
- Required Skills: angular-frontend-patterns, angular-developer
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session; UI work
- Review family: same-family exception
- Rationale: one component signal + template row.
- Tasks: 1 | Depends on: B1.1 (contract); scheduled after B4a.2 to keep plan order
- Phase: P3 | Phase review: deferred

### Task 5.1.1: Notice signal, row and Retry — PENDING

- File: picker component (+ spec), `model-state.service.ts` comment
- Plan reference: implementation-plan.md:625-631
- Pattern to follow: existing error row `:324-343`
- Quality requirements: real `button`, 36 px min height; `role="status"`.
- Validation notes: RPC envelope failure keeps the existing catch (`:783-792`).
- Implementation details: signal-based, OnPush as the component already is.

### Batch B5.1 verification

- Artifacts exist; inner loop + typecheck-templates green; no per-batch review.

## Batch B5.2: Fixtures and specs carry `source` — PENDING

- Shape: test
- Estimated weight (tokens): unavailable (proxy: ~10 one-field fixture edits)
- Actual weight (lane tokens): pending
- Write set (declared exception to the 2-project cap: fixture/spec-only edits of one field, no
  production behaviour; must all land before B6.3 makes `source` required):
  - `libs/frontend/memory-curator-ui/.../memory-diagnostics-rpc.service.spec.ts` (`:271,287`)
  - `libs/frontend/memory-curator-ui/.../memory-diagnostics-accordion.component.spec.ts` (`:134`)
  - `libs/frontend/skill-synthesis-ui/.../skill-synthesis-rpc.service.spec.ts` (`:45`)
  - `libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.spec.ts` (`:17-23`)
  - `libs/frontend/chat/.../main-agent-reassign-popover.component.spec.ts` (`:87`)
  - `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts` (`:143`)
  - `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts` (`:231`)
  - `apps/ptah-electron-e2e/src/specs/thoth/skills.spec.ts` (`:109-110`)
  - any further typed `ProviderListModelsResult` / `PtahCliListModelsResult` literal found by Task 5.2.1
- Read set: `implementation-plan.md:635-642`, Revision 2 S-A (`:989`); `plan-review-2.md` S-A.
- Contract excerpts: `isStatic: true|false` -> `source: 'live'` (or `'unavailable'` +
  `failureReason` where `error` is set); keep `isStatic` keys out (field deleted in B6.3).
- Verify: `npm run verify -- --related -p @ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/chat`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/chat,@ptah-extension/webview-e2e-harness,ptah-electron-e2e`
  (`ptah-electron-e2e` may define no typecheck target; confirm per-target counts), then
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview`
- Acceptance: grep `isStatic` in `libs/frontend` and `apps/ptah-electron-e2e` empty; every typed
  literal of the two result types under `libs/` and `apps/` sets `source` (grep listed in the
  report); no e2e target run.
- Recommended executor: frontend-developer (subagent)
- Required Skills: angular-developer (spec conventions)
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: makes B6.3's required-field flip compile everywhere (S-A).
- Tasks: 1 | Depends on: B5.1
- Phase: P3 (last batch) | Phase review: code-logic + style; visual review (Electron, dark +
  light) of the picker notice/error rows

### Task 5.2.1: Repo grep and fixture migration — PENDING

- File: the files above
- Plan reference: implementation-plan.md:635-642, 989
- Pattern to follow: n/a
- Quality requirements: assertions keep their intent.
- Validation notes: plan-review-2 S-A counted 12 files with typed literals; list each one found.
- Implementation details: grep `ProviderListModelsResult|PtahCliListModelsResult` under `libs/`, `apps/`.

### Batch B5.2 verification

- Greps clean; checks green; then `NEEDS REVIEW` for P3 (incl. visual).

## Batch B6.1: Delete shared static rows and the Kimi merge — PENDING

- Shape: mechanical
- Estimated weight (tokens): unavailable (proxy: ~400 deleted lines across entries)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/shared/src/lib/providers/provider-registry.ts` (z-ai rows `:257-414` incl. every Z.AI price field)
  - `libs/shared/src/lib/providers/entries/claude-cli-provider-entry.ts` (`:42-136`)
  - `entries/copilot-provider-entry.ts` (`:13-73,113`)
  - `entries/kimi-code-provider-entry.ts` (`:64-121,141`)
  - `entries/sakana-provider-entry.ts` (`:25-46,88`)
  - `entries/local-provider-entry.ts` (`:30-32,47-83`)
  - DELETE `entries/kimi-code-model-merge.ts` + `kimi-code-model-merge.spec.ts`; `index.ts` drops
    `mergeKimiCodeModels`, `isKimiCodeModelsPayload` (correction 9)
  - specs: `provider-registry.spec.ts`, `provider-lookup.spec.ts`,
    `entries/provider-session-provider-entries.spec.ts`, `utils/pricing-review-regressions.spec.ts`
    (Z.AI cost unknown), `utils/anthropic-spend-regressions.spec.ts`
- Read set: `implementation-plan.md:694-723`; the line ranges above.
- Contract excerpts: `defaultTiers` stay (D6); `liveModelCapabilities` stays on Kimi; no
  `ZAI_RATE_CARD` (D7).
- Verify: `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/agent-sdk` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/agent-sdk`
- Acceptance: none of the six files declares `staticModels`; Kimi merge gone; Z.AI pricing spec
  asserts unknown cost; agent-sdk tests green (correction 7).
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: row deletion while the optional field still exists keeps every reader compiling.
- Tasks: 1 | Depends on: B5.2 (every reader moved: B2-B5)
- Phase: P4 | Phase review: deferred

### Task 6.1.1: Delete rows, prices, merge; update entry docs and specs — PENDING

- File: as above
- Plan reference: implementation-plan.md:698-710, 718-721
- Pattern to follow: `codex-provider-entry.ts:28` doc ("No `staticModels`")
- Quality requirements: entry doc comments updated.
- Validation notes: D7 Z.AI cost unknown.
- Implementation details: n/a.

### Batch B6.1 verification

- Artifacts gone/updated; checks green; no per-batch review.

## Batch B6.2: Delete static symbols in shared and agent-sdk — PENDING

- Shape: mechanical
- Estimated weight (tokens): unavailable (proxy: 3 deleted files, ~8 edited sites)
- Actual weight (lane tokens): pending
- Write set:
  - `libs/shared/src/lib/providers/provider-registry.ts` (`ProviderStaticModel`, `staticModels?`,
    `getStaticModelCapabilities` `:896-913`, `seedStaticModelPricing` `:930-953`, imports `:26-27`)
  - DELETE `libs/shared/src/lib/providers/static-model-pricing.ts`
  - DELETE `libs/shared/src/lib/providers/entries/opencode-model-routes.ts`
  - `entries/opencode-provider-entry.ts` (`:20-27,58-102,123,148`), `entries/anthropic-api-lane-entry.ts` (`:18`)
  - `libs/shared/src/lib/providers/index.ts` (drop `OPENCODE_MODEL_ROUTES`, `getOpenCodeModelProtocol`,
    `OpenCodeModelRoutes`, `getStaticModelCapabilities`, `seedStaticModelPricing`)
  - `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts`, `helpers/index.ts:228`,
    `src/index.ts:513,527` (delete `buildStaticTierCapabilityEnv` and the re-export)
  - specs: `anthropic-api-lane-entry.spec.ts`, `entries/codex-provider-entry.spec.ts`,
    `entries/opencode-provider-entry.spec.ts`; agent-sdk `deleted-exports.contract.spec.ts`
    (add the removed names if that spec's convention lists removed exports)
- Read set: `implementation-plan.md:694-723`; the ranges above;
  `agent-sdk/src/lib/__contracts__/deleted-exports.contract.spec.ts`.
- Contract excerpts: after this batch no `libs/` or `apps/` file names `staticModels`,
  `ProviderStaticModel`, `OPENCODE_MODEL_ROUTES`, `getOpenCodeModelProtocol`,
  `seedStaticModelPricing`, `getStaticModelCapabilities`, `buildStaticTierCapabilityEnv` (except
  the custom proxy config field).
- Verify: `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/agent-sdk` then
  `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/agent-sdk`, then
  `npm run verify -- -t typecheck -p @ptah-extension/auth-providers,@ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing`
- Acceptance: symbol grep clean; downstream typecheck green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: shared and agent-sdk symbol deletion must be one commit (agent-sdk re-exports the
  shared helper).
- Tasks: 1 | Depends on: B6.1
- Phase: P4 | Phase review: deferred

### Task 6.2.1: Delete symbols, files and re-exports — PENDING

- File: as above
- Plan reference: implementation-plan.md:698-713
- Pattern to follow: n/a
- Quality requirements: no shim, no re-export left.
- Validation notes: grep before reporting.
- Implementation details: n/a.

### Batch B6.2 verification

- Grep clean; checks green; no per-batch review.

## Batch B6.3: `source` required, `isStatic` deleted; full gate — PENDING

- Shape: contract
- Estimated weight (tokens): unavailable (proxy: ~15 one-line edits)
- Actual weight (lane tokens): pending
- Write set (declared exception: 3 projects; the required-field flip and the field deletion
  must land in the same commit as their last producers and spec literals):
  - `libs/shared/src/lib/types/rpc/rpc-providers.types.ts`, `rpc-agents.types.ts`
  - `libs/backend/auth-providers/src/lib/provider-models.service.ts` (drop deprecated `isStatic: false`)
    + `provider-models.service.spec.ts`, `provider-models.opencode.spec.ts` (any leftover key)
  - `libs/backend/rpc-handlers/src/lib/services/lane-model-listing.adapter.ts` (port field) + spec
  - rpc-handlers specs with `isStatic` literals: `config-rpc.handlers.spec.ts`,
    `provider-rpc.handlers.spec.ts`, `ptah-cli-rpc.handlers.spec.ts`
- Read set: `implementation-plan.md:694-723,898-915`; grep `isStatic` output.
- Contract excerpts: `ProviderListModelsResult.source: ProviderModelListSource` (required);
  `PtahCliListModelsResult.source` (required); no `isStatic` anywhere.
- Verify: inner `npm run verify -- --related -p @ptah-extension/shared,@ptah-extension/auth-providers,@ptah-extension/rpc-handlers`
  then `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/auth-providers,@ptah-extension/rpc-handlers,@ptah-extension/chat`.
  FULL gate (team-leader, before commit):
  `npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/auth-providers,@ptah-extension/rpc-handlers,@ptah-extension/cli-agent-runtime,@ptah-extension/lane-routing,@ptah-extension/ui,@ptah-extension/memory-curator-ui,@ptah-extension/skill-synthesis-ui,@ptah-extension/chat,@ptah-extension/core,@ptah-extension/webview-e2e-harness,ptah-electron-e2e,@ptah-extension/cli-engine,@ptah-extension/platform-cli,ptah-electron,ptah-extension-webview`
  (header "for 17 projects"; per-target counts match), then
  `npm run verify -- -t typecheck-templates -p ptah-extension-webview`, then
  `npm run verify -- -t lint -p degradation-audit`
- Acceptance: grep gate (plan `:899-903`) returns no match in `libs/` and `apps/` except the custom
  proxy config field and C# `isStatic` in `libs/backend/workspace-intelligence`; no
  `isFallback: true` under `cli-adapters/`; full gate green.
- Recommended executor: backend-developer (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session
- Review family: same-family exception
- Rationale: the only commit whose type change reaches every downstream project.
- Tasks: 1 | Depends on: B6.2
- Phase: P4 | Phase review: deferred to B7

### Task 6.3.1: Flip `source` to required, delete `isStatic` — PENDING

- File: as above
- Plan reference: implementation-plan.md:710-715
- Pattern to follow: n/a
- Quality requirements: no transitional field left.
- Validation notes: correction 4; S-A.
- Implementation details: n/a.

### Batch B6.3 verification

- Grep gate and full gate green; no per-batch review.

## Batch B7: Live parser and tier-preference probe — PENDING

- Shape: test
- Estimated weight (tokens): unavailable (proxy: new spec ~250 lines; workflow 4 strings)
- Actual weight (lane tokens): pending
- Write set:
  - CREATE `libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts`
  - `.github/workflows/model-lists-probe.yml` (`:57,63,70`, `name:`)
- Read set: `implementation-plan.md:653-692,916-920`; old spec in git history
  (`git show main:libs/backend/auth-providers/src/lib/model-lists.live.spec.ts`, gating at `:31-32`);
  `model-lists-probe.yml:1-118`.
- Contract excerpts: cases 1-5 of plan `:659-679`; never asserts a specific id or count; the
  retired-preference failure text plan `:671-673`.
- Verify: `npm run verify -- --related -p @ptah-extension/auth-providers` (spec skipped without
  the env flag); live run (team-leader) under the lock, PowerShell:
  `$env:PTAH_LIVE_PROBES = '1'; node scripts/verify.mjs --exec --task live-model-parsers -- npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts`
- Acceptance: unit run skips cleanly; live run passes, or fails only with a named retired
  preference / vendor outage (reported, not suppressed); workflow names the new spec and title.
- Recommended executor: senior-tester (subagent)
- Required Skills: none assigned
- Parallel-safe: no | Execution mode: sequential
- Fallback order: other family same capability -> same family other model -> subagent
- Subagent reason: lanes disabled in this session; live network test
- Review family: same-family exception
- Rationale: final shapes exist after B6.3.
- Tasks: 2 | Depends on: B6.3
- Phase: P4 (last batch) | Phase review: code-logic, combined diff of B6.1..B7

### Task 7.1: Live spec — PENDING

- File: `vendor-model-parsers.live.spec.ts`
- Plan reference: implementation-plan.md:658-682
- Pattern to follow: env gating of the deleted spec
- Quality requirements: production classes, in-memory `ConfigManager` stub, real HTTP.
- Validation notes: A3, A1/A2/A6 optional keyed cases skip without keys.
- Implementation details: log kept/skipped row counts.

### Task 7.2: Workflow strings — PENDING

- File: `.github/workflows/model-lists-probe.yml`
- Plan reference: implementation-plan.md:683-686
- Pattern to follow: existing file
- Quality requirements: schedule, permissions, issue mechanics unchanged.
- Validation notes: n/a.
- Implementation details: n/a.

### Batch B7 verification

- Live run evidence recorded; then `NEEDS REVIEW` for P4.

## Mode 3 completion notes (for the final invocation)

- Parity: verify every `keep`/`move` row of `parity-inventory.md` against the build with a passing
  test; `remove-proposed` rows are user-approved (decisions.md 3, 7, 8, 12).
- Visual: Electron screenshots, dark + light, of the model picker: OpenCode Zen (live), a
  provider with no key (error row + Retry), a persisted notice (clear `provider.*.modelCatalog`
  first, review minor 1); before screenshots from base `6fb8d480c`.
- Write-path trace: `provider.<id>.modelCatalog` writer (`persistCatalog`, schema 2) to its
  readers (`readPersistedCatalog`, OpenCode store closure, tier resolution, `getCachedModelIds`).
- Runtime: one agy lane and one Cursor lane spawn.
