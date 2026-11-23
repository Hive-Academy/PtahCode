# Plan Review 2 - TASK_2026_2306_livemodels

Round 2 (final). Reviewed `implementation-plan.md` (Revision 1, 984 lines, read in full), `decisions.md` rows 5-9, `plan-review.md`, against the worktree.

Verdict: **REVISE** (3 Serious, 0 Blocking). All round-1 findings are resolved in the plan text except the gaps below. The user rule holds: I found no new repo-literal model list or fallback. Each fix is a small plan edit, not a redesign.

## Round-1 findings: resolution check

| Id | Status | Evidence |
| --- | --- | --- |
| B1 | Resolved | Component 2 versioned record `{schema:2, origin:'live'}`; reader returns null otherwise; failure-table rows for pre-version and malformed records; chain-spec case. Testable. The branch-internal window (B2 writes schema-2 records while Kimi/Copilot fetchers still return static rows until B4a, Ollama until B3) is stated; see Minor 1. |
| S1 | Resolved | `settings-lanes.fixtures.ts:231` is in Component 8 and B5. The full gate now has 17 projects; I counted 17. Exception: S-A below (two chat specs). |
| S2 | Resolved | Credential reasons skip persisted. Closed enum; the string match at `provider-rpc.handlers.ts:769-789` is deleted. Failure table is consistent with the chain. |
| S3 | Resolved | Verified by grep: `getStaticModels` appears only in auth-providers (7 proxies, 5 specs). Copilot and Kimi have no spec reference. All are in B2's list. The copilot `listModels`/`staticModelsAsFull` has no caller outside its own file. |
| S4 | Resolved in design, with a gap, see S-B. |
| S5 | Resolved | `toolUseUnknown`; no declared default. |
| S6 | Resolved | Persist the full list, filter the returned copy; chain-spec case. |
| S7 | Resolved | The table now has rows for the 30-day boundary, malformed records, timeout vs network vs HTTP, cold OpenCode cache, `[]` vs throw, and unclassified errors. |
| S8 | Resolved | D8 honoured. Cursor `FALLBACK_MODELS` and the agy tables are deleted. Pi, Grok, OpenCode CLI and Codex lanes have no literal (`cursor-cli.adapter.ts:310-347` is the only `isFallback: true` literal in adapters, verified). |
| S9 | Resolved | `modelsAuthScheme` field; the custom entry never sets it. |
| M1-M11 | Resolved or consistently deferred | `getPersistedCatalog` has a defined return type. The OpenCode closure writes on a routing refresh. The Ollama `/api/show` cost is stated honestly. The degradation-audit target is in every backend gate. |

Line claims spot-checked and correct: `translation-proxy-base.ts:535,541`, `opencode-translation-proxy.ts:60-74`, `child-model-admission.ts:22-51`, `chat-session.service.ts:1498-1513`, `cursor-cli.adapter.ts:309-347`.

## Serious

### S-A. B6 makes `source` required, but two chat specs type a literal without it, and B6 lists no chat files

- Evidence: `libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.spec.ts:17-23` and `main-agent-reassign-popover.component.spec.ts:87` declare `const CATALOGUE: ProviderListModelsResult = { models, totalCount }`. Neither sets `source`.
- Plan: Component 10 makes `source` required. The plan lists fixtures only for the ui, memory-curator-ui, skill-synthesis-ui, e2e and harness projects. B6's project list has no `@ptah-extension/chat`; Component 8 says "no change to chat consumers".
- Impact: B6 typecheck (chat is in the full gate) fails on those two specs. This contradicts "each batch commits green".
- Fix: add both specs to Component 8 (B5) or to B6's file list. Add `@ptah-extension/chat` to B5's `-t lint,typecheck` project list or to B6's inner loop. Then grep again for every typed `ProviderListModelsResult` / `PtahCliListModelsResult` literal; this repo-wide grep lists 12 files.

### S-B. B4a and B4b are not independent in one worktree: rpc-handlers compiles and tests cli-agent-runtime source

- Evidence: `libs/backend/rpc-handlers/src/lib/chat/di.ts`, `chat/ptah-cli/chat-ptah-cli.service.ts` and `provider-session-open-request.ts` import `@ptah-extension/cli-agent-runtime`. B4b edits `ptah-cli-registry.ts` (about six sites), `cursor-cli.adapter.ts` and others in that lib.
- Impact: B4a's Jest and tsc runs, and B4b's `ptah-electron` and `cli-engine` typecheck, read half-edited files of the other batch. A transient red shows up as a false failure, or hides a real one. CLAUDE.md says "do not start a check of a project while a lane edits files of that project"; B2/B3 have this rule written down, B4a/B4b do not. There is no source-level API dependency: the files are disjoint, and B4b changes no export that rpc-handlers consumes.
- Fix: say they are file-disjoint but must run their gates sequentially (B4a, then B4b, or the reverse), or in separate worktrees. They may be edited in parallel but not checked in parallel.

### S-C. Native child admission: "an empty catalog keeps `model-catalog-unavailable`" misstates today's behaviour and removes native spawns whenever the SDK catalog is empty

- Evidence: `child-model-admission.ts:23-34` is a union with `staticModels` and `defaultTiers`, so `acceptedModels` for native profiles is never empty today. `chat-session.service.ts:1499-1507` therefore does not fire for native. After Component 6, `nativeChildModelIds(catalog)` returns catalog ids only. An empty or failed Claude SDK catalog refuses every native child with `model-catalog-unavailable`.
- Impact: it matches the user's rule (no literal admits models), but it is a new refusal on the core Claude path. The plan calls it "keeps".
- Fix: state it as a deliberate behaviour change and add a spec case. Decide one path: either refuse with the fixed copy (consistent with the rule), or, for native profiles only, pass the alias or model unchanged and let the Claude SDK reject it. Do not describe it as unchanged.

## Batch order and independence

- B1 types -> B2 chain+OpenCode -> B3 Ollama+auth readers -> B4a/B4b -> B5 -> B6 delete -> B7: the order is sound. Every removal happens after its last reader moves. Verified readers of `staticModels`: all outside the shared entries are moved by B2-B4. `codex` and `requesty` entries mention it only in comments.
- File-disjoint: yes between B2 and B3, and between B4a and B4b (see S-B for the transitive compile).
- Green under scoped checks: yes, provided S-A is fixed. B2 keeps `isStatic: false` so rpc-handlers compiles. B3 keeps the old agent-sdk names for `ptah-cli-registry.ts`.
- B5 is independent of B2-B4 after B1.

## Deferrals

- Keyed live coverage (Z.AI, Sakana, Anthropic): accepted. The repo holds no CI secrets, and the parser plus the `bad-response` path cover a wrong shape.
- Per-CLI `error` field on `agent:listCliModels`: accepted. D8 asks to delete lists, not to add a contract. The Cursor failure still reaches `cli-detection.service.ts:486-500` (log plus Sentry; the CLI is omitted).

## Minor (one line each)

1. Between B2 and B3/B4a a developer machine can persist `schema: 2` records holding static rows (Kimi, Copilot, Ollama Cloud), and they survive for 30 days; the B7 live Electron check should clear `provider.*.modelCatalog` first.
2. `agyModelWithEffort` drops the user's chosen effort without a visible signal when live ids are unavailable (debug log only); consider a warn.
3. A5 (how `ptahCli:listModels` reads the agent key) is left as "check or use `authSecrets.getProviderKey`"; pick one before B4a.
4. Component 7b changes `CursorCliAdapter.listModels()` from returning a fallback to throwing; confirm it has no caller besides `cli-detection.service.ts` (the plan asserts it, I did not trace the spawn path).
5. `ptah-electron-e2e` may define no `typecheck` target; the full-gate note about per-target counts covers it.
6. Component 7 lists `rpc-agents.types.ts` under B4b although B1 also edits it; the "one owner per file" sentence resolves it, so say B1 owns it.

## Decisions

None taken by the reviewer.
