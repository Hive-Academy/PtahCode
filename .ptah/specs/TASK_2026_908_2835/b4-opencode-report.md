## Live source finding

Public GET `https://opencode.ai/zen/v1/models` and `https://opencode.ai/zen/go/v1/models` return `{data:[...]}`. Each model has `id`, optional `name`, `limit.context`, `capabilities.tools.supported`, and an `api` object with one protocol key (`messages`, `responses`, `chat-completions`, or unsupported `generate-content`). Nested `api.*.sdk.aisdk` also names the npm package. These gateway payloads settle routes directly, so no models.dev request is needed. `https://models.dev/api.json` supplies corroborating `provider.npm` values used by the drift check.

## Changes

- `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.ts`: Zod-validated public catalog, protocol mapping, 6-hour per-provider cache, 5-minute failed-refresh interval, shared in-flight refresh.
- `libs/backend/auth-providers/src/lib/providers/opencode/opencode-live-routes.spec.ts`: route mapping, priority, refresh, retention, and metadata cases.
- `libs/backend/auth-providers/src/lib/providers/opencode/opencode-translation-proxy.ts`: request route lookup uses live source after static lookup.
- `libs/backend/auth-providers/src/lib/translation/translation-proxy-base.ts`: lines 539 and 706-710 add async route hook; default delegates to original synchronous hook for every other proxy.
- `libs/backend/auth-providers/src/lib/provider-models.service.ts`: import lines 40-47, OpenCode branch lines 287-327, and removal of old OpenCode-only ID fetcher at former lines 458-494; settings list now includes routed live IDs and retains static fallback.
- `libs/backend/auth-providers/src/lib/provider-models.service.spec.ts`: OpenCode settings-list regression around line 892.
- `libs/backend/auth-providers/src/lib/provider-models.opencode.spec.ts`: existing OpenCode settings-list tests now mock the shared live source rather than the removed ID-only axios path; changed after the full verification failure exposed stale mocks.
- `libs/shared/src/lib/providers/entries/opencode-model-routes.ts`, `opencode-provider-entry.ts`: comments updated for reviewed first-priority table and live additions.

## Decisions

- Gateway protocol versus models.dev lookup: use gateway `api` key first, known nested npm package only when the key is unknown. Evidence: both live gateway lists contain explicit protocol keys. Reversible: yes.
- Shared plain-class singleton versus DI registration: use a plain class consumed by the proxy and settings service. Evidence: no new host resource or credential dependency. Reversible: yes.
- Unknown protocol: leave unrouted. Evidence: Google and Jev have no Ptah translator. Reversible: yes.

## Verification

`npm run verify -- -p @ptah-extension/auth-providers,@ptah-extension/shared` (one foreground run, piped to `tail -60`): **exit 1**. Header listed exactly the two requested projects. Lint/typecheck: 4/4 tasks passed (1 cached). Tests: shared passed; auth-providers failed, 88 suites passed, 3 failed, 1 skipped (91/92 run); 2,652 tests passed, 5 failed, 10 skipped. Two failures came from `provider-models.opencode.spec.ts` mocking the old axios ID-only path; that spec was updated after this run. Three failures were outside this lane: two in `codex-account-usage.service.spec.ts` and one in `plan-usage.service.spec.ts`. Final output: `NX 2 tasks: 1 succeeded, 1 failed`; `@ptah-extension/auth-providers:test`; `lock released after 521.4s, exit code 1`. The full log is `C:\Users\dev\.nx\d60e02896ae18ad9\cache\terminalOutputs\9269713312747407384`.

## Extra reads

`context.md` Scope extension; `model-lists.live.spec.ts`; shared OpenCode entries; translation base and OpenCode proxy/spec; `provider-models.service.ts` OpenCode path and settings spec; live public gateway and models.dev payloads. Ptah symbol index had zero hits, so native text search was used. No skill-loading tool or skills catalog was available to this lane.

## Open items

The two OpenCode settings tests were fixed after the one prescribed verification run; that fix has not had a full verify rerun. The three Codex/quota test failures are unrelated to the B4 write set and remain for their owners. Other lanes own tier logic and unrelated changed files.
