# Batch B7 report: live parser and tier-preference probe

## Files changed

- CREATED `libs/backend/auth-providers/src/lib/vendor-model-parsers.live.spec.ts` (14 tests, gated by `PTAH_LIVE_PROBES=1`).
- MODIFIED `.github/workflows/model-lists-probe.yml`: `name: Live Model Parser Probe`; step name and `--testPathPatterns vendor-model-parsers.live`; issue title `[model-lists-probe] A live model parser or tier preference failed`; issue body sentence names the new spec; header comment reworded (no "fallback ID"). Schedule, permissions and issue mechanics unchanged.
- No other references to the deleted `model-lists.live.spec.ts` remain outside task specs/analysis (grep of libs, apps, .github). The copilot entry comment noted in the B3 report no longer matches anything.

## Spec design

Real HTTP, production classes: `ProviderModelsService.fetchModels(id, null)` with `createMockConfigManager` and the DI-equivalent `openCodeLiveRoutes.usePersistedCatalog` store wiring (OpenCode Zen/Go: source live, protocols in the 3 literals, config holds `schema: 2, origin: 'live'`); `OllamaModelDiscoveryService.listCloudModels()` with the daemon URL set to `127.0.0.1:1`; `parseModelsApiRows` on keyless OpenRouter and Requesty `/v1/models`; tier-preference check for opencode-zen, opencode-go, ollama-cloud (fails with the plan's text incl. `closestLiveModel`); keyed cases for `anthropic-api`, `z-ai`, `sakana` skipped unless `PTAH_LIVE_ANTHROPIC_KEY` / `PTAH_LIVE_ZAI_KEY` / `PTAH_LIVE_SAKANA_KEY`. No specific id or count asserted.

## Checks

- `tsc --noEmit -p libs/backend/auth-providers/tsconfig.spec.json`: clean. `eslint` on the spec: clean.
- Unflagged jest run: 1 suite skipped, 14 tests skipped (skips cleanly).
- Live run `PTAH_LIVE_PROBES=1 npx jest ... --runInBand --coverage=false --runTestsByPath <spec>`: **11 passed, 3 skipped (keyed, no keys), 0 failed.** Log: `.ptah/tmp/b7-live.log`.

## Live output summary

| Provider | Rows parsed | Protocols resolved | Tier preferences |
| --- | --- | --- | --- |
| opencode-zen | 73 routable chat models | all in the 3 literals | sonnet claude-sonnet-5, opus claude-opus-5, haiku claude-haiku-4-5: all listed |
| opencode-go | 29 routable chat models | all in the 3 literals | glm-5.3, kimi-k3, glm-5.3-flash: all listed |
| ollama-cloud | 24 chat models | n/a | kimi-k2.6:cloud, glm-5.3:cloud, gpt-oss:20b-cloud: all listed; 3/3 sampled tags had a positive context length |
| openrouter | 476 kept, 0 skipped | n/a | n/a |
| requesty | 787 kept, 0 skipped | n/a | n/a |

No tier preference is missing live; nothing to escalate.

## Deviations

- "Chat rows" per OpenCode provider: `fetchModels` returns only the routable chat rows (the gateway's raw row count is internal to `openCodeLiveRoutes`), so the log shows kept counts only; skipped counts are logged for OpenRouter and Requesty where the spec calls the parser directly.
- Ollama tier ids are compared after normalising through `toCloudId` (the list spells ids with the cloud suffix).
- Keyed provider ids used: `anthropic-api`, `z-ai`, `sakana` (registry ids).
