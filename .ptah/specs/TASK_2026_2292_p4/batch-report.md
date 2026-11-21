# Batch report: P4 "Chat foundation A" (TASK_2026_2292_p4, program TASK_2026_2288_acp1)

Worktree `D:/projects/PtahCode/.claude-worktrees/provider-session-p4`, branch `feat/provider-session-p4`,
base HEAD `61cec87d9`. Nothing staged or committed.

No provider id selects the new runtime: the registry has no `providerSession` entry (pinned by
`provider-session-registry.entries.spec.ts`). Every new arm is unreachable at runtime, and every
site that cannot serve it yet refuses explicitly instead of falling through to the Claude SDK.

## Delivered, mapped to the plan (Component 5 + R2-2 + M-4)

| Plan item | Delivered |
|---|---|
| `SessionRuntimeKind += 'provider-session'`; identity variant; mismatch field `'profile'` | `session-runtime.types.ts`. The identity arm is `{ runtime:'provider-session'; providerSession:{ profile; normalizedHome? }; codex?: never }`, and the Claude and Codex arms gained `providerSession?: never`. `sessionRuntimeIdentityMismatch` returns the exported `SessionRuntimeIdentityMismatchField` (the order is providerId, workspaceId, runtime, profile, normalizedHome). Codex comparisons are unchanged. |
| `RuntimeHostCapabilities.providerSessions?` | Added: `readonly ProviderSessionProfileId[]`. |
| `ProviderSessionSeed` (credential-free) | Added: providerId, profile, `consumer:'chat'`, workspacePath, workspaceId (normalized key), optional `model` (absent means the provider default), optional existingIdentity. |
| `session-runtime.schemas.ts` strict variant + spec | Strict `provider-session` variant (profile enum; optional normalizedHome reuses `isNormalizedHomeKey`). The file stays zod-free on the types side (`index.zod-free.spec.ts` passes). |
| `PROVIDER_SESSION_*` error codes | Six codes added after the `CODEX_*` codes in `rpc-error-codes.types.ts`. |
| `providerSessionStatus?` (type only) | `rpc-auth.types.ts`: `Partial<Record<ProviderSessionProfileId, ProviderSessionAuthStatus>>` and the new `ProviderSessionAuthStatus` row type. |
| Registry `providerSession?` + `providerRuntimeFor` | `provider-registry.ts`: the `providerSession?` field, the `ProviderSessionProviderId` type (`antigravity-cli` / `grok-cli` / `opencode-cli`), `getProviderSessionProfile`, `isProviderSessionProviderId` and `providerRuntimeFor`. No entries added. |
| Metadata `providerSessionExecution?` / `providerSessionThread?` and `updateProviderSessionExecution` | `session-metadata-store.ts`. The method is parallel to `updateCodexExecution` and has its own `ProviderSessionMetadataError`. It enforces: runtime is `provider-session`, sessionId matches, the binding is immutable (provider, workspace key, profile, home), refusal of legacy or Codex conversion, refusal of account linkage, the foreign-workspace check, and thread schema validation. The caller path is kept in the detail row. `_saveInternal` refuses direct writes of both fields and preserves them across ordinary saves. The shared detail read was extracted into `readRuntimeWriteDetail` and is reused by the Codex writer, with identical behaviour. |
| `nativeExecutionOf(metadata)` | Exported next to the store and used by the identity cache. |
| Generic workspace normaliser | `normalizeProviderSessionWorkspaceKey`: accepts absolute paths only, then applies platform-core `normalizeWorkspaceRoot`. Not `normalizeCodexWorkspaceKey`. |
| Identity cache reads the new field | `session-runtime-identity-cache.ts` uses `nativeExecutionOf`. `releaseSession` keeps provider-session bindings, as it does for Codex. |
| `CX/session-runtime-identity.ts` | No change needed. It compares through `sessionRuntimeIdentityMismatch`, which now covers `profile`. |
| Resolver branch | `workspace-provider-profile-resolver.ts`. A stored provider-session identity, or a new session whose active provider has a profile, resolves to `{ runtime:'provider-session', seed }`. Conditions: the host lists the profile in `providerSessions`; consumer `gateway`/`lane` gets `AuthRequiredError` with providerId (A9); tiers and `default` give the provider default (no `model`), never a Claude id; on resume the stored provider must still map to the same profile; mismatch text is `Cannot resume <name> session: <field> changed.`. `buildProfile` rejects provider-session ids, like `rejectLegacyCodexProfile`. |
| Chat runtime profile third branch | `chat-runtime-profile.service.ts`. `ResolvedChatExecution` has a provider-session arm carrying workspacePath, cwd and config. `storedChatRuntimeIdentity` reads `providerSessionExecution`. |
| S-2 refusal module | New `provider-session-runtime-refusal.ts` exporting `providerSessionNativeRuntimeRequired(providerId)`, which builds `AuthRequiredError("<Name> runs only as a chat or agent runtime; it cannot serve Ptah's internal model calls.", { providerId, recoveryHint })`. |
| S-2 call sites | `provider-auth-resolver.ts` (`resolve` and `buildDraftOverride`), `curator-proxy-manager.ts`, `provider-proxy-pool.ts` (M-4 confirmed site), `workspace-llm-resolver.ts` (rethrow like Codex), and `sdk-internal-query.curator-llm.ts` (`unsupported-provider` providerId widened to `'openai-codex' \| ProviderSessionProviderId`; detection via `isNativeRuntimeRefusal`). `sdk-query-runner.service.ts` is unchanged. |
| R2-2: AuthManager / codex refusal | `codex-native-runtime-refusal.ts` adds `isNativeRuntimeAuthIntent(providerId, context?)` (provider-session ids always; Codex rule unchanged) and `nativeRuntimeOwnedDetail`. `auth-manager.ts` uses both, so a provider-session active provider tears down any previous strategy and returns `configured:false`, "owned by its native runtime". |
| R2-2: OAuthProxyStrategy | Provider-session ids return the unconfigured, native-owned result before the Kimi, Codex and Copilot branches. |
| R2-2: draft verification | `classifyDraftProbeFailure` rule 3 and `preFlightDetail` cover the provider-session refusal. The detail is rebuilt from the provider id and never quoted from the error. |
| Gateway: no change (A9) | Not quite: a compile fix was needed (see Deviations). The specs show the refusal reaches the turn as `AuthRequiredError`, which the bridge maps to `auth-required`. |
| Exhaustive-switch fixes | `routing-agent-adapter.ts`, `gateway-turn-preparation.ts`, `codex-chat-host-ports.ts`, `chat-session.service.ts`, `chat-slash-command-router.service.ts` (details below). |

### Specs added (P4 verification row)

| Required spec | File |
|---|---|
| Schema round-trip | `libs/shared/src/lib/types/session-runtime.provider-session.spec.ts` |
| Mismatch `profile` | same file, plus the resolver spec (`profile changed`) |
| Registry lookups / none shipped | `libs/shared/src/lib/providers/provider-session-registry.spec.ts`, `provider-session-registry.entries.spec.ts` |
| Resolver branch | `libs/backend/auth-providers/src/lib/auth/workspace-provider-profile-resolver.provider-session.spec.ts` |
| Refusal spec per S-2 / R2-2 site | `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.spec.ts`: provider-auth-resolver (resolve, inherited, draft), curator-proxy-manager, provider-proxy-pool, workspace-llm-resolver, draft-verification (classifier + verify), OAuthProxyStrategy, AuthManager |
| "active provider = provider-session id; configureAuthentication does not start a Copilot flow" | same file, `AuthManager with a provider-session active provider` (also the teardown-on-switch case) |
| `sdk-query-runner` never reached | `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.provider-session.spec.ts` (internal query `execute` is never called on the pinned and inherited refusals) |
| Metadata round-trip / immutability / direct-write guard / identity cache | `libs/backend/agent-sdk/src/lib/session-metadata-store.provider-session.spec.ts` |
| Router refusal | `libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.provider-session.spec.ts` |
| Chat runtime profile branch | `libs/backend/rpc-handlers/src/lib/chat/session/chat-runtime-profile.provider-session.spec.ts` |
| Gateway turn ends with auth-required | `libs/backend/gateway-chat-bridge/src/lib/gateway-turn-preparation.provider-session.spec.ts` |

No existing spec file was modified.

## Files

All paths are relative to the worktree.

Created:
- `libs/backend/auth-providers/src/lib/auth/provider-session-runtime-refusal.ts`
- the 11 spec files listed above (`*.provider-session.spec.ts`, `provider-session-registry*.spec.ts`, `provider-session-runtime-refusal.spec.ts`)

Modified:
- shared: `libs/shared/src/lib/types/session-runtime.types.ts`, `session-runtime.schemas.ts`, `rpc/rpc-error-codes.types.ts`, `rpc/rpc-auth.types.ts`, `libs/shared/src/lib/providers/provider-registry.ts`
- agent-sdk: `src/index.ts`, `src/lib/errors/{auth-required.error,index}.ts`, `src/lib/session-metadata-store.ts`, `src/lib/wiring/session-runtime-identity-cache.ts`, `src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts`, `src/lib/codex-app-server/routing-agent-adapter.ts`
- auth-providers: `src/lib/auth/{workspace-provider-profile-resolver,provider-auth-resolver,curator-proxy-manager,workspace-llm-resolver,provider-proxy-pool,auth-manager,codex-native-runtime-refusal,draft-verification.service}.ts`, `src/lib/auth/strategies/oauth-proxy.strategy.ts`
- rpc-handlers: `src/lib/chat/session/{chat-runtime-profile.service,chat-session.service,chat-slash-command-router.service}.ts`, `src/lib/chat/codex-host/codex-chat-host-ports.ts`
- gateway-chat-bridge: `src/lib/gateway-turn-preparation.ts`

## Deviations from the plan

1. **`isProviderSessionProviderId` lives in `@ptah-extension/shared`** (beside `getProviderSessionProfile` and `providerRuntimeFor`), not in the auth-providers refusal file. agent-sdk (curator, router, error detection) needs it too, and agent-sdk cannot import auth-providers. The refusal file keeps the error factory. The message builder and detection (`providerSessionNativeRuntimeRequiredMessage`, `isProviderSessionNativeRuntimeRefusal`, `isNativeRuntimeRefusal`) sit in agent-sdk next to `CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE`, so the builder and the detector cannot drift.
2. **`ProviderSessionProviderId`** is the union of the three ids the plan names for P9/P10/P11c. It is declared now so the curator's widened type has a name. No entry uses it yet.
3. **Workspace key normaliser.** There was no neutral lexical key, so I added `normalizeProviderSessionWorkspaceKey` in agent-sdk: absolute paths only, then platform-core `normalizeWorkspaceRoot`, the documented canonical key. The absolute check avoids `path.resolve` against cwd. It keeps segment case on Windows, unlike the Codex key. The resolver and the store share this one function. Reversible until the first persisted session (P9).
4. **Router guards (P5 scope, minimal).** `routing-agent-adapter.ts` needed a `provider-session` case for its exhaustive switch. It refuses with `ChatRuntimeAdmissionError(PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE)`. Both start paths also refuse when `servingProviderId` is a provider-session id, so such a provider never reaches the legacy SDK adapter. P5 replaces these with the real third arm.
5. **rpc-handlers consumers (P5/P6 scope, minimal).** The new `ResolvedChatExecution` arm broke four sites at compile time.
   - Admission (`createCodexRuntimeAdmission.servingProviderId`) and the carry-over provider pin now read `seed.providerId` for any non-Claude arm. This is the correct value, and Codex behaviour is identical.
   - `chat-session.service` (start) and `chat-slash-command-router.service` call the new `refuseProviderSessionExecution`, which throws `RpcUserError('…', 'PROVIDER_SESSION_UNAVAILABLE')` until P6 generalises them.
   - `storedChatRuntimeIdentity` reads the two fields inline rather than through `nativeExecutionOf`. Existing rpc-handlers specs mock `@ptah-extension/agent-sdk` wholesale, and calling a new agent-sdk function there would have broken them.
6. **Gateway compile fix.** `gateway-turn-preparation.ts` throws `AuthRequiredError` for a `provider-session` decision (defence in depth; the resolver already refuses gateway consumers). This is not a behaviour change for any reachable path.
7. **Seed `model`** is optional (absent means the provider default) rather than a substituted id. The provider catalog does not exist until P7/P8, so no `modelSubstitution` is reported.
8. **Resume home check.** P4 computes no current `normalizedHome` (D10: shared profile). A stored identity that carries a home therefore mismatches as `normalizedHome`. Nothing writes a home in P4.

## Decisions

- Error class: a new `ProviderSessionMetadataError` rather than reusing `CodexSessionMetadataError` (P12 renames Codex-named neutral types; a provider-session write should not report a Codex error). Reversible.
- The provider-session native-auth intent needs no host flag (unlike `hostNativeCodex`), because provider sessions have no legacy SDK route to fall back to. Evidence: plan A9/S-2; R2-2 fix text.

## Checks (lane-focused; no `npm run verify` / nx)

Environment note: the worktree has no `node_modules`, and `jest.preset.js` maps `marked` to `<worktree>/node_modules/marked/...`, so the first auth-providers jest run failed with a module-mapping error. I created a temporary junction `node_modules` -> `D:/projects/PtahCode/node_modules` (git-ignored) for the jest runs and removed it afterwards. The coordinator's gate may hit the same mapping issue in this worktree.

Typecheck (`npx tsc --noEmit --project …`):
- `libs/shared/tsconfig.lib.json`: exit 0
- `libs/backend/agent-sdk/tsconfig.lib.json`: exit 0
- `libs/backend/auth-providers/tsconfig.lib.json`: exit 0
- `libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0
- `libs/backend/gateway-chat-bridge/tsconfig.lib.json`: exit 0
- `libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0
- `libs/backend/cli-engine/tsconfig.lib.json`: exit 0
- `libs/backend/platform-cli/tsconfig.lib.json`: exit 0
- `apps/ptah-electron/tsconfig.app.json`: exit 0
- spec tsconfigs: shared 0, agent-sdk 0, auth-providers 0, gateway-chat-bridge 0
- **`libs/backend/rpc-handlers/tsconfig.spec.json`: not completed.** Node ran out of heap at its default ~2 GB ("FATAL ERROR: Ineffective mark-compacts near heap limit"). I did not retry with a larger heap (memory rules). ts-jest type-checked every rpc-handlers spec I ran (below). The coordinator's `typecheck` target should cover this.
- Frontend / renderer typecheck not run. The shared changes there are additive optional fields only, and no frontend file references the changed unions (grep).

Jest (`npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath …`):
- shared (7 suites: the 3 new ones + `session-runtime.types.spec`, `provider-registry.spec`, `codex-provider-entry.spec`, `index.zod-free.spec`): `Test Suites: 7 passed, 7 total; Tests: 133 passed, 133 total`
- agent-sdk (9 suites: the 3 new ones + `session-metadata-store.spec`, `routing-agent-adapter.spec`, `sdk-internal-query.curator-llm.spec`, `auth-required.error.spec`, `session-runtime-identity-cache.spec`, `codex-thread-identity-store.spec`): `Test Suites: 9 passed, 9 total; Tests: 337 passed, 337 total`
- auth-providers (10 suites: the 2 new ones + the resolver, auth-manager, provider-auth-resolver, curator-proxy-manager, provider-proxy-pool, workspace-llm-resolver, draft-verification and oauth-proxy.strategy specs): `Test Suites: 10 passed, 10 total; Tests: 385 passed, 385 total`
- rpc-handlers (8 suites: the new one + `chat-runtime-profile.service`, `codex-chat-host-ports`, `codex-chat-host-ports.resume-permission`, `chat-session.native`, `chat-session.carry-over-launch`, `chat-slash-command-router.native`, `chat-carry-over.service`): `Test Suites: 8 passed, 8 total; Tests: 250 passed, 250 total`
- gateway-chat-bridge (the new one + `gateway-turn-preparation.spec`): `Test Suites: 2 passed, 2 total; Tests: 10 passed, 10 total`

ESLint (`npx eslint <all changed and new .ts files>`): exit 0, no errors or warnings from rules. The `@nx/enforce-module-boundaries` rule printed "No cached ProjectGraph is available. The rule will be skipped." on each file, so boundaries were not checked here. They should be checked by the coordinator's lint target. The new imports follow existing edges: agent-sdk to shared and platform-core; auth-providers to agent-sdk and shared.

Not run (by rule or scope): `npm run verify`, nx targets, full project test suites, the Electron live boot ("Electron boots; Codex + Claude chat unchanged" is the coordinator's live check).

## Out-of-scope observations

- `libs/backend/memory-contracts/src/lib/curator-llm.port.ts:48` documents `provider-unsupported` as "the deliberate Codex native-runtime refusal". It now also covers provider sessions; the doc comment is stale (not edited: outside the file list).
- `normalizeCodexWorkspaceKey` / `normalizeCodexHomeKey` are generic lexical normalisers with Codex names. They are candidates for the P12 consolidation together with `normalizeProviderSessionWorkspaceKey`.
- Bash heredocs with large bodies failed in this environment ("unexpected EOF while looking for matching `''"), and one embedded a raw NUL byte into `session-metadata-store.ts`. I found and fixed it (the file now has the `'\0'` escape; zero NUL bytes, `git diff` shows it as text). Later edits used script files written with the Write tool.

## Fix round 1 (code-logic-review.md: APPROVED, 5 moderate)

Same worktree (`provider-session-p4`); nothing staged or committed. The host's later "primary working directory" note named `provider-session-p3`; I followed the coordinator's "same worktree" instruction, and every edit and check used absolute `provider-session-p4` paths. The round-0 note that `normalizeProviderSessionWorkspaceKey` is a P12 candidate no longer applies: that helper is deleted (M-1).

### Fixes

| Finding | Fix |
|---|---|
| **M-1** workspace key (win32 case, roots, drive-less rooted paths) | Deleted `normalizeProviderSessionWorkspaceKey`. The store and the resolver use the existing `normalizeCodexWorkspaceKey(path, process.platform)`, which already: lower-cases the whole path on win32 (`D:\Proj` and `d:\proj` give `d:/proj`); keeps roots (`C:\` gives `c:/`, POSIX `/` gives `/`); refuses `\foo`, `/foo` and `C:` on win32, so the cwd's drive is never used; and is idempotent. Both libs already depended on codex-runtime, so no new import edge. This follows the review's "reuse the Codex helper", which overrides the plan's earlier "not `normalizeCodexWorkspaceKey`". The Codex name is a P12 rename item. |
| **M-2** carry-over probe | `chat-carry-over.service.ts` `newSessionReady` returns `false` for a `provider-session` execution, before the Codex check. |
| **M-3** model passthrough | `providerSessionModel`: blank, Claude aliases and Claude ids (via `isClaudeModel` from `stored-model-offer.ts`, now exported; it covers tiers, `opusplan`, `claude-*` and `[1m]`) give the provider default. With a cached catalog (`getCachedModelIds`) only an offered id passes. With no catalog, an explicit choice passes and a stored setting (`requestedModelIsStored`) gives the provider default. |
| **M-4** agent-sdk runtime hazard | Moved `providerSessionNativeRuntimeRequiredMessage` to `@ptah-extension/shared`, and the key to codex-runtime (M-1). For this feature, auth-providers' only runtime import from agent-sdk is now `AuthRequiredError`, the same import the Codex refusal already had (checked in `git diff`). agent-sdk no longer exports the builder; its detector imports it from shared. Every spec that mocks agent-sdk wholesale in agent-generation (3), cli-agent-runtime (15) and auth-providers (1) is green with no change. |
| **M-5** workspace-invalid `providerId` | Dropped `providerId` from the workspace-invalid and resume-mismatch errors, matching the Codex equivalent. The consumer (A9) and host-capability refusals keep it, as the plan specifies. |
| Minor FM-4: late, uncoded resume refusal | `chat-session.service.ts` `continueSession` returns `{ success:false, errorCode:'PROVIDER_SESSION_UNAVAILABLE', error }` right after `prepare`, before `assertDriveHeld` and any resume call. The text comes from the shared constant `PROVIDER_SESSION_CHAT_UNAVAILABLE` (`chat-runtime-profile.service.ts`), which `refuseProviderSessionExecution` also uses. |
| Minor: cross-runtime store specs | Added three cases: a provider-session write over a Codex row, and a Codex write over a provider-session row (both `legacy-conversion`); a Codex row unchanged after a save carrying provider-session fields (`direct-runtime-write`). |
| Minor: draft-verification match rule | `providerSessionRefusalProviderId` now also requires the exact refusal text, the same rule as `isProviderSessionNativeRuntimeRefusal`. |
| Minor: closed-union predicate | New `PROVIDER_SESSION_PROVIDER_IDS` const (the type derives from it). `getProviderSessionProfile` answers only for reserved ids, so the predicate, `providerRuntimeFor` and the resolver all agree. The entries spec asserts that every `providerSession` entry uses a reserved id. |
| New warning I introduced (resolver `max-lines`, 715 > 700) | Extracted the branch to `auth/provider-session-execution.ts` (`providerSessionTargetOf`, `resolveProviderSessionExecution`, `providerSessionModel`). The resolver only delegates now, and the warning is gone. |

Unchanged (the review marks these as later phases): FM-5, the identity-cache write-through (P6/P7); FM-6, the runtime router and history readers (P5/P6); the frontend `PROVIDER_SESSION_*` mapping (P9).

### Files in this round

Created:
- `libs/backend/auth-providers/src/lib/auth/provider-session-execution.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-carry-over.provider-session.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-continue.provider-session.spec.ts` (harness derived from `chat-continue-codex-resume-once.spec.ts`; only the prepared execution differs)

Modified (production):
- `libs/shared/src/lib/providers/provider-registry.ts`
- `libs/backend/agent-sdk/src/{index.ts,lib/errors/index.ts,lib/errors/auth-required.error.ts,lib/session-metadata-store.ts}`
- `libs/backend/auth-providers/src/lib/auth/{workspace-provider-profile-resolver,provider-session-runtime-refusal,draft-verification.service,stored-model-offer}.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/{chat-runtime-profile.service,chat-carry-over.service,chat-session.service}.ts`

Modified (my P4 specs only; no pre-existing spec edited):
- `provider-session-registry{,.entries}.spec.ts`
- `session-metadata-store.provider-session.spec.ts`
- `sdk-internal-query.curator-llm.provider-session.spec.ts`
- `workspace-provider-profile-resolver.provider-session.spec.ts`
- `provider-session-runtime-refusal.spec.ts`

### Specs added in this round

- **M-1** (store spec):
  - one key per pair: `D:\Proj` / `d:\proj`, `D:\Proj\` / `d:/proj`, `C:\` / `c:\`, and UNC case variants;
  - idempotent on win32 (`D:\Proj`, `C:\`, UNC) and on POSIX (`/`, `/home/User/proj`);
  - refuses `\foo`, `/foo`, a relative path, `''` and `C:` on win32;
  - two spellings of one folder write the same binding, and the caller's spelling is kept;
  - a filesystem-root workspace is accepted and re-reads unchanged.
- **M-1** (resolver spec): a resume across win32 case spellings succeeds; a drive-less rooted path is refused.
- **M-2:** `chat-carry-over.provider-session.spec.ts`. A provider session is not eligible and no Codex auth check runs; a Claude control on the same harness is eligible.
- **M-3:** six cases, explicit or stored crossed with catalog offers / catalog lacks / no catalog. Also `opusplan`, `claude-sonnet-4-5` and `opus[1m]` give the provider default.
- **M-5:** the workspace-invalid (relative, `''`, drive-less on win32) and profile-mismatch errors have `providerId: null` and `recoveryHint: null`.
- **FM-4:** `chat-continue.provider-session.spec.ts` returns `errorCode: 'PROVIDER_SESSION_UNAVAILABLE'` with no resume, send or stream call.
- **Cross-runtime:** three store cases.
- **Registry:** a profile on a non-reserved id is ignored; a reserved id with no entry is not a provider session; refusal text with a name and with the id fallback; every entry uses a reserved id.

### Checks (exact outputs)

Jest (`npx jest --runInBand --coverage=false --runTestsByPath <specs> --config <project>/jest.config.ts`, one project at a time, with the coordinator's `node_modules` junction):

```
shared exit=0
Test Suites: 7 passed, 7 total
Tests:       137 passed, 137 total
agent-sdk exit=0
Test Suites: 9 passed, 9 total
Tests:       351 passed, 351 total
auth-providers exit=0
Test Suites: 11 passed, 11 total
Tests:       456 passed, 456 total
cli-agent-runtime exit=0
Test Suites: 15 passed, 15 total
Tests:       118 passed, 118 total
agent-generation exit=0
Test Suites: 3 passed, 3 total
Tests:       196 passed, 196 total
rpc-handlers exit=0
Test Suites: 11 passed, 11 total
Tests:       264 passed, 264 total
gateway exit=0
Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

- The first pass had `agent-sdk exit=1` and `auth-providers exit=1`. Each was `TS2724` in one of my specs, still importing the moved builder from agent-sdk. I repointed the imports to shared and re-ran both (outputs above).
- `auth-providers` was re-run after the extraction with the same result: 11/11 suites, 456/456 tests.
- Suites run:
  - cli-agent-runtime: all 15 `ptah-cli-registry*` / `ptah-cli-spawn-options.role` specs that mock agent-sdk wholesale;
  - agent-generation: all 3 such specs (`multi-phase-analysis`, `enhanced-prompts`, `content-generation`);
  - auth-providers: its one such spec, `codex-account-usage.service`;
  - rpc-handlers: the 8 round-0 suites, the 2 new ones and `chat-continue-codex-resume-once`;
  - shared, agent-sdk and gateway: the same sets as round 0.

Typecheck (`npx tsc --noEmit --project …`):

```
libs/shared/tsconfig.lib.json tsc=0
libs/shared/tsconfig.spec.json tsc=0
libs/backend/agent-sdk/tsconfig.lib.json tsc=0
libs/backend/agent-sdk/tsconfig.spec.json tsc=0
libs/backend/auth-providers/tsconfig.lib.json tsc=0
libs/backend/auth-providers/tsconfig.spec.json tsc=0
libs/backend/rpc-handlers/tsconfig.lib.json tsc=0
libs/backend/gateway-chat-bridge/tsconfig.lib.json tsc=0
libs/backend/gateway-chat-bridge/tsconfig.spec.json tsc=0
libs/backend/cli-agent-runtime/tsconfig.lib.json tsc=0
libs/backend/cli-engine/tsconfig.lib.json tsc=0
libs/backend/platform-cli/tsconfig.lib.json tsc=0
libs/backend/agent-generation/tsconfig.lib.json tsc=0
apps/ptah-electron/tsconfig.app.json tsc=0
```

After the extraction, auth-providers `tsconfig.lib.json` and `tsconfig.spec.json` were re-checked: both exit 0. I did not re-attempt the rpc-handlers spec tsconfig: in round 0 it ran out of Node's default heap, and I will not raise it under the memory rules. ts-jest type-checked all 11 rpc-handlers suites above.

ESLint (`npx eslint <all 42 changed and new .ts files>`): exit 0, `0 errors, 3 warnings`. The same three show when I lint the `HEAD` versions, so all exist on main:
- `session-metadata-store.ts` `max-lines` (2224 on main);
- `chat-session.service.ts` `max-lines` (2755 on main);
- `gateway-turn-preparation.ts:204` `no-useless-assignment` (`:195` on main, untouched code).

The module-boundary rule was still skipped ("No cached ProjectGraph"). No new import edge was added.

Byte check: 0 NUL bytes across every modified and untracked file.

### Decisions (this round)

- Reuse `normalizeCodexWorkspaceKey` instead of a new normaliser. Shared cannot use `node:path`, the Codex key already meets every M-1 requirement, and both callers already depend on codex-runtime. Reversible until P9 persists a session; rename in P12.
- With no catalog, a stored model gives the provider default and an explicit model passes. The stored value was saved for another provider's slot; an explicit pick is the user's, and the provider is the authority on it, as for Codex. Once P7/P8 supply a catalog, the catalog rule decides both cases.
