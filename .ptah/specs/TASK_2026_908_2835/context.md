# TASK_2026_908_2835 — Refresh the saved Claude model catalog

Worktree: `D:\projects\ptah-extension\.claude-worktrees\model-catalog-refresh`
Branch: `fix/model-catalog-refresh`

## Problem (verified on the user's machine, 2026-11-09)

- The chat model picker showed `Fable 5.1` and `Default = Opus 5.5`. A live
  `supportedModels()` probe returned `fable -> claude-fable-5-2 (Fable 5.2)` and
  `default -> claude-fable-5-2`.
- `SdkModelService` persists the catalog under the state key
  `ptah.sdk.modelCatalog` (TASK_2026_383). The entry has no refresh. The last
  real fetch in the Electron logs was 2026-10-22; every later
  `config:models-list` was answered from the saved copy.
- The catalog is server-driven: the SDK-bundled binary 2.1.318 contains no
  "Fable 5.2" text, yet returned a `claude-fable-5-2` row. A CLI-version key is
  therefore not a sufficient validity token.
- The meaning of the alias `fable` depends on the CLI version (2.1.318: Fable
  5.1; 2.1.321: Fable 5.2).
- `supportedModels()` returns 14 rows: 5 alias rows (`default`, `opus`, `fable`,
  `sonnet`, `haiku`) and 9 pinned rows (older versions). The SDK has no "old"
  flag. Ptah shows all rows flat.
- `config-rpc.handlers.ts` sets `isRecommended` for every value that contains
  `sonnet` (hardcoded name heuristic).
- `claude-cli-provider-entry.ts` `staticModels` (fallback list) stops at
  Fable 5.1.

## Decisions (user approved 2026-11-09)

1. Stale-while-revalidate: keep the saved catalog for a fast first answer, and
   start one background fetch per process per cache key. Replace the saved
   copy when the result is different.
2. Group rows: alias rows first; rows after the last alias row go into a
   closed "Other versions" section. The rule uses SDK order, not model names.
   It applies to the direct-Anthropic catalog only.
3. Remove the `isRecommended` name heuristic and its badge. The SDK row
   `Default (recommended)` already names the recommended model.
4. Add Fable 5.2 to the `staticModels` fallback.

## Contract set by the coordinator

`SdkModelInfo` (`libs/shared/src/lib/types/rpc/rpc-config.types.ts`):
`isRecommended` removed, `group?: 'primary' | 'other'` added.

## Batches

| Batch | Lane | Write set |
| ----- | ---- | --------- |
| B1 backend | codex | `sdk-model-service.ts` (+spec), `config-rpc.handlers.ts` (+spec), new `model-picker-groups.ts` (+spec), `claude-cli-provider-entry.ts` |
| B2 frontend | Glm | `model-selector.component.ts` (+spec) |
| R1 research | Glm | `provider-catalog-research.md` (read-only on code) |

Review family: B1 (codex) reviewed by ollama-cloud (Glm); B2 (Glm) reviewed by codex.

## Scope extension (user request 2026-11-10: "fix them all in one PR")

Source: `provider-catalog-research.md` (R1), recommendations 2 to 6. All go
into this branch and this pull request.

| Batch | Lane | Item | Write set (owner) |
| ----- | ---- | ---- | ----------------- |
| B3 | Glm | Kimi Code settings list is static only | `kimi-code-provider-entry.ts`, `provider-rpc.handlers.ts`, Kimi auth/proxy files, `provider-registry.ts` type if needed |
| B4 | codex | OpenCode: new model is unlisted and gets HTTP 400 | `opencode-model-routes.ts`, `opencode-provider-entry.ts`, `opencode-translation-proxy.ts`, `translation-proxy-base.ts` |
| B5 | Glm | Static `defaultTiers` outrank live tiers | `provider-auth-resolver.ts`, `provider-models.service.ts` |
| B6 | Glm | Copilot list is kept in two files | `copilot-provider-entry.ts`, `copilot-sdk.adapter.ts` |
| B7 | codex | Dead persisted catalog keys | `sdk-model-service.ts` (after B1) |

Decisions of the coordinator (the user's standing preference is: live lists,
no hardcoded lists as the primary source):

- A static list stays as a fallback and as a metadata source. A live source,
  when it answers, decides which ids exist.
- No rule may guess from a model name. An id whose protocol or capability no
  live source settles keeps the current safe behaviour.
- B4: the static route table keeps priority. A route for an unknown id comes
  only from an authoritative live source (the gateway `/models` payload if it
  carries the protocol, else models.dev `provider.npm`, the same rule the
  manual sync used). Google generateContent and Jev stay excluded.
- B5: an explicit user override always wins. A static default yields to the
  live-derived tier only when a live catalog is present and does not contain
  the static default.
- B7: a persisted key is non-restorable when its base URL is a loopback URL
  that is not the provider's registered base URL (an ephemeral proxy port).
  Ollama's fixed `127.0.0.1:11434` must stay restorable.

Review family: Glm batches (B2, B3, B5, B6) reviewed by codex; codex batches
(B1, B4, B7) reviewed by Glm.

## Lane limits in this run

- `Glm` (ptahCliId `pc-355b645d-...`, family ollama-cloud): usage limit reached
  2026-11-09 22:55 UTC (HTTP 429, session window 100%). Reset 2026-11-10
  02:00 UTC. B3 ended with a skeleton report and no source change. B2 and R1
  were stopped by the per-lane budget (3 000 000 weighted tokens) after they
  wrote their code or report; B2 did not run its verification.
- `antigravity` (cli, family antigravity): quota reached 2026-11-09 22:56 UTC
  (HTTP 429 RESOURCE_EXHAUSTED, "Resets in 139h49m"). B6 failed after 10 s
  with no change. Do not use in this run.
- `Glm` B5 also ended at the limit with a skeleton report and no source change.
- Fallback: B3, B4, B5, B6, B7 go to `codex`. Review of codex work needs another
  family: `antigravity` (limit unknown) or `Glm` after its reset.

## Write-set changes during the run

- B4 (codex) reported that the OpenCode settings list is built in
  `provider-models.service.ts` (lines ~280-320, `fetchOpenCodeLiveIds`
  ~451-494). No B5 writer was live, so the coordinator extended the B4 write
  set to the OpenCode settings-list path of that file (+spec). Tier logic in
  the file stays with B5. B5 starts only after B4 completes.

## Not done by design

- No Electron run and no screenshots: the project rules forbid `serve`/`build`
  targets unless the user asks.

## Lane limits recorded in this run (review step)

- `antigravity` (family antigravity): two review lanes failed at start on
  2026-11-10T00:55Z with `RESOURCE_EXHAUSTED (code 429): Individual quota
  reached`, reset in about 137 h 50 min (near 2026-11-15T18:45Z). Do not
  use this lane in this run.
- `Glm` (family ollama-cloud): session window 100 %, reset 2026-11-10
  02:00 UTC. Next reviewer choice after a new `ptah_agent_list` row shows
  room.
- `grok`: weekly limit until 2026-11-12 20:04 UTC. `kimi code`: monthly
  limit until 2026-11-25.
- `codex` wrote the batches B1, B3, B4, B5, B6, B7 and the B2 fix, so it
  cannot review them.
