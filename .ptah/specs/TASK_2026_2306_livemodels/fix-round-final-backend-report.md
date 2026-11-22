# Fix round (final) - backend report - `TASK_2026_2306_livemodels`

Base: HEAD 381e8bfdf, worktree `D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`. No git
actions (no commit, stash or push). `libs/frontend/**` was not touched.

The rule applied in every fix: a credential failure (missing or rejected key, signed out) returns
`unavailable` with a credential reason. It never shows a list and never saves one.

## S1 - invalid or revoked Anthropic API key was listed and saved as live

**Change**
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts`
  - `:57-77` adds the exported type `ApiModelsRead<T>`, which is `{ok:true, models}` or
    `{ok:false, reason: ModelListFailureReason}`. It also adds `classifyApiModelsError`, which
    maps these errors:
    - `TimeoutError`/`AbortError` (read structurally, because the DOMException is not an `Error`
      in every realm) -> `timeout`
    - `SyntaxError` -> `bad-response`
    - undici `TypeError` "fetch failed" -> `network`
    - anything else -> `unexpected`
  - `:1528-1658`: the body of `fetchApiModels` moves into the private `readApiModels`, which keeps
    the failure reason:
    - 401/403 -> `auth-rejected`, any other non-OK status -> `http-error`
    - no `data` array -> `bad-response`
    - no `claude-` rows -> `empty`
    - no credential -> `no-key`
    - local proxy -> `no-live-source`
    - a thrown error is classified as above

    `fetchApiModels` keeps its old contract (`[]` on any failure) for its existing callers: the
    profile probe, the SDK `fetchModelsForApiKey` chain and `config-rpc`. A response with no
    Claude rows is no longer cached as `[]`.
  - `:1539` adds the public `getLiveApiModels()`, which returns the `ModelInfo` rows or the reason.
- `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:927` adds `getLiveApiModels()`, which
  delegates to the service. The type is exported through `lib/helpers/index.ts:234` and
  `src/index.ts:518`.
- `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:666-725` rewrites the
  `registerAnthropicDirectFetcher`:
  - With a direct-Anthropic key it calls only `getLiveApiModels()`. Any `ok:false` result throws
    `ModelListError(reason)`. There is no SDK fall-through, so the tier aliases are never returned,
    cached or persisted on that path.
  - The old catch/retry block and the dead `CREDENTIAL_FAILURE_REASONS` branch are removed (the
    import is gone too).
  - With no key, an empty SDK answer throws a classified reason (see M2) instead of returning `[]`.
  - The doc comment of the cascade is updated.

**Pinning specs**
- `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.spec.ts`
  - `it.each` over `auth-rejected`/`network`/`timeout`/`http-error`/`bad-response`/`empty` uses
    the real shape: the read resolves with `{ok:false, reason}` and does not throw, while the SDK
    mock resolves the alias rows (`default`, `sonnet`). The fetcher rejects with
    `ModelListError(reason)` and `getLiveSupportedModels` is never called. This replaces the old
    spec, whose mock threw where the real service never throws.
  - The `'fallback'` case is dropped from the capacity `it.each`, because that path no longer
    exists.
  - The mock adapter now exposes `getLiveApiModels` instead of `getApiModels`.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.spec.ts`, new describe
  `SdkModelService — getLiveApiModels`, uses a stubbed `global.fetch`:
  - 401/403 -> `auth-rejected`, 500 -> `http-error`
  - `TypeError` -> `network`, `DOMException('TimeoutError')` -> `timeout`
  - a body with no data -> `bad-response`, a body with no Claude rows -> `empty`
  - a good body returns the rows
  - no credential -> `no-key` and fetch is not called

## M2 - signed-out claude-cli showed the previous login's saved list

**Signal used**: `ClaudeAmbientLoginStatusReader.read()` from `@ptah-extension/auth-providers`. It
is the bounded `claude auth status --json` reader that `provider:listAccounts`
(`provider-account-rpc.handlers.ts:248`) and the auth credential probe already use. It returns
`signed-out` or `connected`, or `unknown` with `cli-missing`/`timeout`/`unreadable`. Its child env
drops `ANTHROPIC_*`, so it reports the native login, which is the credential behind `claude-cli`.
It is registered for both hosts: `registerAuthProvidersServices` -> `registerProviderAccountServices`
(`auth-providers/src/lib/di/register.ts:171,206`). The Electron and cli-engine containers both call
it.

**Change** (`provider-rpc.handlers.ts`)
- `:184-185` injects the reader with `@inject(ClaudeAmbientLoginStatusReader)`, a class token that
  is already used the same way. It is a required parameter placed after `lmStudioProxy`.
- `:768-780` adds `nativeClaudeFailureReason()`:
  - `signed-out` -> `not-signed-in`
  - `unknown/cli-missing` -> `not-signed-in` (there is no Claude to sign in with, and a saved list
    for it is never right)
  - `unknown/timeout|unreadable` -> `unexpected` (this proves nothing about the login, so the
    saved list stays allowed)

  The reader runs only after the bridge answered `[]`, so a successful list costs nothing extra.
- `:746`: the `claude-cli` fetcher throws `ModelListError(await this.nativeClaudeFailureReason())`.
- `:701-710`: the `anthropic` fetcher with no API key applies the same rule when the env carries no
  `ANTHROPIC_AUTH_TOKEN`, because the credential is then the native login. An OAuth/token env keeps
  `unexpected` and does not read the login.

**Pinning specs** (`provider-rpc.handlers.spec.ts`; the harness exposes `ambientLogin.read`, which
defaults to `connected`)
- claude-cli tests:
  - signed out -> `not-signed-in`
  - `cli-missing` -> `not-signed-in`
  - `unknown/timeout` -> `unexpected`
  - signed in with `[]` -> `unexpected`
- anthropic tests:
  - no key, signed out -> `not-signed-in`
  - `ANTHROPIC_AUTH_TOKEN` with an empty answer -> `unexpected` and the reader is not called
- `provider-rpc.custom-entries.spec.ts` passes `{ read: jest.fn() }` in the new position.

## M3 - `ptahCli:listModels` dropped `savedAt` and `notice`

**Change**
- `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:848-851` adds `savedAt?` and `notice?` to
  `PtahCliListModelsResult`, with the same doc text as `ProviderListModelsResult`.
- `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts:376-391`: a persisted list
  now carries `savedAt` and `notice: modelListNoticeText(reason, provider.name, savedAt)` when
  `savedAt` is set. This mirrors `provider-rpc.handlers.ts toListModelsResult`.

**Pinning spec**: `ptah-cli-rpc.handlers.spec.ts`, "returns a persisted list with its failure
reason", now also asserts `savedAt === 1` and
`notice === modelListNoticeText('network', 'OpenRouter', 1)`.

## Live copy bug - "add your Claude API API key"

**Change**: `libs/shared/src/lib/providers/model-list-failure.ts:31-33`. `no-key` now reads
`add an API key for ${providerName} in Settings`. The display name never sits directly before
"API key", so a name that ends in "API" reads correctly ("add an API key for Claude API in
Settings").

**Pinning spec**: `libs/shared/src/lib/providers/model-list-failure.spec.ts:10` expects
`'add an API key for Z.AI in Settings'`. The error and notice wrappers are covered by the same
`it.each`. A grep found no other literal of the old copy in `libs` or `apps` (backend and shared
specs build it through `modelListErrorText`).

## Checks (focused, one at a time; logs in `.ptah/tmp/`)

| Check | Result |
| --- | --- |
| `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath .../sdk-model-service.spec.ts` | 65/65 passed (`fr-agentsdk.log`). On the first run 1 unrelated test timed out: "persisted catalog > does not let one auth identity answer for another" makes a real `/v1/models` network call with a 5 s fetch timeout inside a 5 s test timeout. It is network-flaky and unchanged by this round, and it passed on the rerun. |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts ... provider-rpc.handlers.spec.ts provider-rpc.custom-entries.spec.ts ptah-cli-rpc.handlers.spec.ts` | 3 suites, 148/148 passed (`fr-rpc.log`) |
| `npx jest --config libs/shared/jest.config.ts ... model-list-failure.spec.ts` | 13/13 passed (`fr-shared.log`) |
| `npx tsc --noEmit -p libs/shared/tsconfig.lib.json` | exit 0 |
| `npx tsc --noEmit -p libs/backend/agent-sdk/tsconfig.lib.json` | exit 0 |
| `npx tsc --noEmit -p libs/backend/rpc-handlers/tsconfig.lib.json` | exit 0 |
| `npx tsc --noEmit -p libs/backend/agent-sdk/tsconfig.spec.json` | exit 0 |
| `npx tsc --noEmit -p libs/backend/rpc-handlers/tsconfig.spec.json` | **not completed**: V8 ran out of heap (exit 134). I did not retry with a larger heap because memory is tight. The rpc-handlers specs above compiled and ran under ts-jest. The coordinator's gate should cover this check. |
| `npx eslint <changed backend/shared files>` | 0 errors, 8 warnings, all existing (`max-lines`, `no-useless-assignment`, an unused `store` in custom-entries spec line 240) |

- Prettier was applied only to the changed lines. It had reformatted unrelated parts of
  `sdk-agent-adapter.ts` and `ptah-cli-rpc.handlers.ts`. I restored both files from HEAD and
  reapplied only this round's edits, so the diff has no formatting churn.
- I did not run these checks, because they are outside the focused-check list:
  - di-lint (`tools/di-lint/check-injects.ts`): the new constructor parameter has an explicit
    `@inject`.
  - degradation audit: this round removes one justified catch from the handler and changes the
    `readApiModels` catch comment to `reported`, because it now returns a classified reason.
  - Electron `expected-resolvable` / `rpc-surface`: no new service or RPC method was added.

## Deferred Moderates

- **M1** (one failing CLI disables the `listCliModels` cache for all CLIs): this is a caching
  redesign in `cli-agent-runtime` (cache per CLI, negative cache, Sentry dedupe) and is outside
  this round's credential rule. It is a cost and noise issue, not wrong data.
- **M4** (the first list per boot waits for one SDK probe): this is a documented B6 trade-off (a
  restored entry must not be re-saved as fresh). S1 removes the second `/v1/models` call on the
  failure path.
- **M5** (a native child model passes unchecked on an empty catalog): this is an accepted design
  trade-off (revision 2 S-C). The runtime rejects a bad id at launch.
- **M6** (a stable catalog ages out without a `savedAt` refresh): this has low impact, and one
  probe repopulates it. It needs a decision on whether a confirmed-unchanged revalidation counts
  as a fresh save.
- **S2** (three renderer consumers ignore `source`/`notice`): this is renderer work in
  `libs/frontend/**`, owned by the concurrent frontend developer.

## Decisions

- **The API-key path fails closed for every reason, not only for credential reasons.** The
  options were (a) fall to the SDK on network/http errors or (b) always throw. The evidence is
  that the SDK under an API key whose `/v1/models` failed returns only tier aliases, and the
  SDK's own `isDegradedApiKeyFallback` guard refuses to cache them. If they reach the chain they
  are saved as live. With (b) the chain shows the saved list for non-credential reasons and
  `unavailable` for credential ones. The change is reversible.
- **`cli-missing` maps to `not-signed-in`, and `timeout`/`unreadable` map to `unexpected`.** With
  no CLI there is no login the saved list could belong to, so the safest choice skips the saved
  list. A status that could not be read is not proof of a signed-out login, and treating it as
  one would drop a valid saved list on a slow machine. The change is reversible.
- **The reader is a required constructor parameter**, not optional. Both composition roots
  register it, so an optional parameter would hide a missing registration.
