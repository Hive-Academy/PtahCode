# Independent logic review — rpc-handlers, shared entries, copilot adapter

Worktree: `D:\projects\ptah-extension\.claude-worktrees\model-catalog-refresh`
Branch: `fix/model-catalog-refresh`, base `main`. Read-only review of uncommitted
changes. No tests, builds or checks were run (hard rule); the coordinator's verify
runs are the verification record.

## Verdict

REVISE — all seven requirements are implemented and no medium or high defect was
found, but two low findings need a one-line response each: the grouping rule
contradicts its own doc comment for one-alias catalogs (RS-1), and a 2xx Kimi
payload with an unrecognized shape degrades to the static list with no log line
anywhere (RS-2).

## Findings

| ID | Severity | file:line | Finding | Failure scenario (concrete input and state) | Suggested fix |
| -- | -------- | --------- | ------- | ------------------------------------------- | ------------- |
| RS-1 | low | `libs/backend/rpc-handlers/src/lib/handlers/model-picker-groups.ts:16` | The `aliases.length >= 2` guard makes a catalog with exactly one alias row entirely `'primary'`, which contradicts the file's own doc comment ("Use the final SDK alias as the boundary between current and pinned rows", line 7). With fewer than two detected aliases the boundary is discarded, not moved. | Direct-Anthropic `supportedModels()` returns `[{value:'default', resolvedModel:'claude-fable-5-2'}, {value:'claude-fable-5-2', resolvedModel:'claude-fable-5-2'}, {value:'claude-opus-5-5', resolvedModel:'claude-opus-5-5'}]` — one alias plus two pinned rows. The comment's rule gives `'primary','other','other'`; the code gives `'primary','primary','primary'`, so the pinned versions render outside the closed "Other versions" section (flat, pre-task behaviour). No observed CLI catalog has exactly one alias (2.1.318 and 2.1.321 both return five), so today's users are unaffected; the single-alias shapes the spec codifies (`model-picker-groups.spec.ts:41-47`, `:49-55`) cannot reach this code in production because the handler gates on `isDirectAnthropic` (`config-rpc.handlers.ts:571`). | Either change the guard to `aliases.length >= 1` (zero-alias catalogs stay flat through the `rows.length - 1` fallback and the single-alias catalog gets its documented boundary), or document the "fewer than two aliases → flat" exception in the doc comment so code and contract agree. |
| RS-2 | low | `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:456` + `libs/shared/src/lib/providers/entries/kimi-code-model-merge.ts:28-29` | A 2xx Kimi response whose payload fails `liveModelsSchema` returns the static list with no log line anywhere: `response.json()` succeeds, the merge's `safeParse` rejects the shape silently, and the fetcher has neither a `catch` nor a status to log on that path. The degraded result is indistinguishable from a fetch that found nothing new. | The live payload shape was never observed (coordinator-review B3: only HTTP 401 was seen, without a credential). If the endpoint answers `{"models":[{"id":"kimi-k4"}]}` (wrapper key other than `data`), a bare array, or `context_length` as a non-integer, then every fetch "succeeds", no live id is ever appended, and no debug log exists — an operator cannot distinguish "the service lists no new models" from "the schema guess is wrong", so a wrong guess stays undiagnosable in the field. | Export the parse outcome (for example `mergeKimiCodeModels` returning `{ rows, liveAccepted }`, or a separate `isKimiLiveModelsPayload(payload)` helper) and log one debug line in the fetcher when a 2xx payload fails the schema. |

No other finding with a concrete failure scenario was found in the scoped files.

## Method — five logic questions

1. **Silent failure.** RS-2 is the one: a 2xx-with-wrong-shape Kimi fetch
   produces a complete-looking static list with zero log evidence. The
   one-alias catalog (RS-1) also fails silently — the "Other versions" section
   just never appears.
2. **User action with unexpected behaviour.** A user on a direct Anthropic
   catalog whose SDK emits a single alias row sees pinned versions in the
   primary list. A Kimi Code user whose provider ships a new model never sees
   it when the payload wrapper differs from `{data:[...]}` — no error anywhere.
3. **Input data producing a wrong answer, not an error.** A catalog with
   exactly one alias row (RS-1). A 2xx Kimi payload with an unexpected wrapper
   key or non-integer `context_length` (RS-2 — `z.number().int().nonnegative()`
   at `kimi-code-model-merge.ts:14-15` rejects the whole payload, not one
   entry). A live Kimi id differing from a static id by other than one trailing
   `[...]` group is appended (per requirement, by design).
4. **Dependency failure, timeout, wrong shape.** The Kimi fetcher covers all
   six required failure paths and returns the static list on each
   (`provider-rpc.handlers.ts:429, 431, 432→catch, 447-455, 440→catch,
   456→catch`); the fetcher never rejects, so no unhandled rejection can reach
   the dynamic-fetcher service. Timeout is 10 s (`AbortSignal.timeout(10_000)`,
   line 444). `modelPickerGroups` is pure; a row missing `value` would throw,
   but the persisted-catalog schema requires `value` with `min(1)`
   (`sdk-model-service.ts:269`), so a restored row cannot trigger it, and the
   handler's try/catch would surface any other producer defect as an RPC error
   rather than a wrong list.
5. **Missing from the requirements.** (a) Rows from `getApiModels()` never
   receive a `group` even for the direct Anthropic catalog — they render in the
   primary section; the spec codifies this (`config-rpc.handlers.spec.ts:950-966`),
   and in practice API rows only appear for API-key users, whose SDK list has
   no aliases and is flat anyway. (b) No models-list test exercises a
   non-direct provider, so the `groups = null` branch is untested (verified by
   reading only). (c) The requirements never said who logs a schema-valid-but-
   unrecognized 2xx payload — RS-2.

## Requirements check

**R1 — met, with the RS-1 deviation.**
`modelPickerGroups` maps every row to `'primary'` or `'other'`
(`model-picker-groups.ts:17`), uses only structure and order (`resolvedModel`
comparisons, lines 9-15), and contains no model name or model family literal —
the only literal is `'default'` (line 10), the SDK's fixed structural alias id,
not a model name or family; the structural check alone already classifies every
observed `default` row, the literal only covers a `default` row without
`resolvedModel`. Zero-alias catalogs are flat (line 16 falls back to
`rows.length - 1`; the empty catalog yields `[]`). The default row can never
land in `'other'`: the literal check marks it an alias, and an alias index is
always ≤ `lastAlias`. With two or more aliases the implementation is exactly
the comment (boundary at the last alias, rows between aliases stay primary —
`model-picker-groups.spec.ts:26-39` covers the CLI 2.1.318 interleaving).
Restored persisted catalogs keep `value` and `resolvedModel`
(`sdk-model-service.ts:269-270`, the C1 fix), so grouping works before the
revalidation fetch. Deviation: exactly-one-alias catalogs are flat against the
comment (RS-1).

**R2 — met.** Groups are computed only when `isDirectAnthropic(resolutionEnv)`
(`config-rpc.handlers.ts:571-573`; definition `auth-env.utils.ts:3-6`), applied
per SDK row index (line 596) and omitted entirely for every other provider
(`groups = null` → the spread adds no `group` key). `isRecommended` is removed
from `SdkModelInfo` (`rpc-config.types.ts:106-119`, replaced by `group?`) and
from all three row-producing sites in the handler (diff removes
`config-rpc.handlers.ts:593, 614, 785` occurrences); a repo-wide grep finds the
identifier only in the spec asserting its absence
(`config-rpc.handlers.spec.ts:965`). The response keeps SDK order: the loop at
line 575 pushes rows in `sdkModels` order, API rows are appended after
dedupe (602-620), and nothing sorts `models` before the return (657). The
frontend keeps the field end to end: `model-state.service.ts:317` stores the
RPC rows verbatim and `updateSelectionState` spreads them (379-384).

**R3 — met.** `mergeKimiCodeModels` (`kimi-code-model-merge.ts:22-53`) returns
the union: static models first in entry order with a fresh `capabilities` array
per row (lines 24-27; live rows likewise, line 47 — no shared mutable array
with the entry), then each live id that matches no static id, also after
removal of one trailing `[...]` suffix from the static id (lines 31-37; for
Kimi, `k3.1-pro[1m]` also seeds `k3.1-pro`). Duplicate live ids are appended
once (line 39/49; spec `kimi-code-model-merge.spec.ts:38-48`). Accepted shapes:
`{ data: [{ id } ] }` with optional `name` and integer non-negative
`context_length`/`contextLength`, at least one entry; unknown keys are
ignored. Every other input — wrong type, no list, empty list, entries without
a string id, non-integer context lengths — fails `safeParse` and yields the
static copy (lines 28-29). **No input throws**: `safeParse` guards the parse,
and no other statement in the function can throw for any `unknown` payload
(verified statement by statement; the Kimi entry always defines `staticModels`).

**R4 — met.** `registerKimiCodeDynamicFetcher`
(`provider-rpc.handlers.ts:426-465`): URL from
`getAnthropicProvider('kimi-code')?.baseUrl` plus `/v1/models` with trailing
slashes stripped (line 441; the spec pins the exact resolved URL
`https://api.kimi.ai/coding/v1/models`, `provider-rpc.handlers.spec.ts:1006`);
credential from `kimiAuth.resolveRequestCredential()` (line 432 — throws
`KimiCodeAuthUnavailableError` when neither CLI login nor stored key is usable,
`kimi-code-provider.types.ts:58-60`, so the no-credential case flows through
the catch); OAuth sends `Authorization: Bearer <token>` and `x-api-key:
<token>`, a stored key sends `x-api-key` only (lines 433-439, matching the
discriminated union `kimi-code-provider.types.ts:29-31` and C18); timeout 10 s
(line 444). All six failure paths return `mergeKimiCodeModels(undefined)`:
no auth service (429), no base URL (431), credential error (432 → catch 457),
HTTP not ok (447-455), network error (440 → catch), invalid JSON — `response.json()`
is inside the `try` (line 456, so a parse error reaches the catch). Logs are
debug-level and carry only `status` (451) or `error.message` (460); headers,
tokens and keys never reach a log line or a returned value (the spec asserts
the token never appears in log calls, `provider-rpc.handlers.spec.ts:1038-1040`).
Note: the two pre-flight guards (no auth service, no base URL) return silently —
no status or error exists to log there, and the four paths that produce one all
log. Residual gap on the 2xx-shape-mismatch path: RS-2.

**R5 — met.** `claude-cli-provider-entry.ts:74-80` adds `claude-fable-5-2`
with `id`, `name`, `description`, `contextLength: 1000000`,
`supportsToolUse: true` — the same field set as its siblings (pricing fields
are optional and omitted where unpublished, exactly like `claude-haiku-5-5`
at lines 67-73 and per the updated comment at 42-43; the description matches
the Fable 5.1 sibling wording). All three `defaultTiers` ids still exist in
the list: `claude-opus-5-5` (38 → 46), `claude-sonnet-5-5` (39 → 57),
`claude-haiku-5-5` (40 → 68). The insertion after `claude-haiku-5-5` changes
neither the first nor the last entry, so no position-dependent consumer
changes behaviour.

**R6 — met.** `COPILOT_MODELS` is derived:
`COPILOT_PROVIDER_ENTRY.staticModels.map(({ id, name }) => ({ id, name }))`
(`copilot-sdk.adapter.ts:119-121`). The entry file's diff against `main` is
comment-only, so the id list is unchanged; the removed adapter literal
(old lines 119-155 of `main`) and the entry list
(`copilot-provider-entry.ts:39-72`) hold the same 34 ids in the same order with
the same display names (checked pair by pair, dot-form Claude ids included).
The shape is unchanged: `CliModelInfo` is `{ readonly id; readonly name }`
(`cli-adapter.interface.ts:63-66`) and the old literals had exactly those two
fields. The only runtime consumer is `listModels()` (adapter line 241; the
class-only re-export `cli-adapters/index.ts:22` and the spec are the other
references). No model-id literal remains anywhere in the adapter (grep for
`claude-|gpt-|gemini-|grok-|kimi-|mai-` finds nothing). The adapter defines no
default model id — it passes `options.model` through (`--model`, lines 340-341);
the provider entry's `COPILOT_DEFAULT_TIERS` ids `gpt-5.4` and `gpt-5-mini`
are rows of the derived list (`copilot-provider-entry.ts:57`, `:61`).

**R7 — met.** `model-selector.component.ts`: a module-level counter gives each
instance a distinct `instanceId` (lines 35, 237); the toggle and section ids
are per-instance (238-239) and bound in the template (175, 201); each option row
id is `'model-' + instanceId + '-' + rowIndex` (132), where `rowIndex` is
unique across the primary range and the "Other" range (`primaryModels().length + i`),
so no option id collides within an instance. `aria-controls` of each toggle is
bound to `otherVersionsSectionId` of the same instance (179). Field
initializers run in declaration order, so `instanceId` precedes its dependants.
Two instances in one document therefore get different toggle, section and
option ids, and each `aria-controls` resolves to its own section; the spec
asserts exactly this for two mounted pickers
(`model-selector.component.spec.ts:466-473`).

## Not checked / extra reads

Not run, by the hard rules of this review:

- No tests, `npm`, `nx`, build, lint or typecheck. The coordinator's verify
  runs (rpc-handlers + shared, cli-agent-runtime, chat, Electron typecheck;
  all exit 0 per `coordinator-review.md`) are the only verification evidence,
  and they do not exercise the two RS findings (no test produces a
  one-alias direct catalog or a 2xx Kimi payload with an unrecognized shape).

Out of my assigned scope, covered by the coordinator review (C1-C22) and not
re-reviewed here: `sdk-model-service.ts` (beyond the schema lines cited),
`provider-models.service.ts`, `provider-auth-resolver.ts`,
`draft-verification.service.*`, the OpenCode batch (`opencode-live-routes.ts`,
`opencode-model-routes.ts`, `opencode-provider-entry.ts`,
`opencode-translation-proxy.ts`, `translation-proxy-base.ts`), and
`kimi-code-provider-entry.ts` changes (the file is unchanged from `main`).
The model-selector component beyond the per-instance id change already has an
independent review (`code-logic-review-b2.md`, findings B2-1 to B2-3).

Extra reads used as evidence (all read-only):

- `model-picker-groups.spec.ts`, `kimi-code-model-merge.spec.ts`,
  `config-rpc.handlers.spec.ts` (models-list section),
  `provider-rpc.handlers.spec.ts` (Kimi fetcher section),
  `model-selector.component.spec.ts` (grep only) — adjacent specs, context.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts` (persisted
  schema lines 266-282 and row producers — proves restored rows keep
  `value`/`resolvedModel`).
- `libs/shared/src/lib/utils/auth-env.utils.ts` (`isDirectAnthropic`).
- `libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts` and
  `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (`ModelInfo.resolvedModel`
  is optional).
- `libs/shared/src/lib/providers/entries/copilot-provider-entry.ts` (R6 source
  list; diff is comment-only) and `kimi-code-provider-entry.ts` (R3 static
  list, unchanged from `main`).
- `libs/backend/auth-providers/src/lib/providers/kimi-code/kimi-code-provider.types.ts`
  (credential union; `resolveRequestCredential` throws when unavailable) and a
  grep of `kimi-code-auth.service.spec.ts` (credential shape).
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`
  (`CliModelInfo`), plus greps of `cli-detection.service.ts` and
  `cli-adapters/index.ts` (COPILOT_MODELS consumers).
- `libs/frontend/core/src/lib/services/model-state.service.ts` (the `group`
  field survives the store and the selection update).
- `D:\projects\ptah-extension\.claude\agents\code-logic-reviewer.md`
  (the five-questions Method section of this role).

Residual uncertainty (no counter-evidence available offline, not scored as a
finding): the grouping assumes pinned SDK rows carry `resolvedModel` equal to
their own `value` or none at all — every spec in the change encodes that
assumption. If a real CLI ever emits a pinned row with a `resolvedModel`
differing from its `value` after suffix removal, that row would be misdetected
as an alias; when it is also the last such row, rows before it that the
comment calls pinned would render as primary. The live Kimi payload shape is
likewise unobserved (see RS-2).
