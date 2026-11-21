# Plan Review, Gate 2 round 2 - TASK_2026_2288_acp1

Scope: `plan-review.md` round 1, `## Revision 1 responses` and the revised sections of
`implementation-plan.md`, checked against the worktree code (read-only). Paths are relative to the worktree.

## Verdict: REVISE

0 Blocking, 2 Serious, 5 Moderate. Round-1 B-1, S-1, S-3, S-4, S-5 and S-6 are resolved by the revision.
S-2 is only partly resolved. P1 is not yet specific enough to implement: it omits files that make the
pre-push gate and commit hook fail.

## Round-1 Blocking and Serious findings

| Finding | State | Evidence |
|---|---|---|
| B-1 chat session / session RPC / slash router | Resolved | Component 7 (plan 597-634) lists every site with generalise vs Codex-only, `providerSessionFailure()`, and `PROVIDER_SESSION_*` codes in P4 (Component 5, plan 484-487). |
| S-1 composition independence | Resolved | A13/A14 and Component 6 (plan 539-595): core binding, nullable `native`, guard regroup, spec "Codex failed, provider sessions bound". |
| S-2 non-chat guards | **Partly resolved, see R2-2** | Component 5 plan 507-520. |
| S-3 history and process model | Resolved | Component 2 replay capture, Component 10 pool with mutex, timeout, history-then-adopt, no-`load` fallback. The user-turn projection target is still unverified (M-3 below). |
| S-4 shutdown, crash, cap | Resolved | Component 11 (plan 713-749) and Component 10: shutdown step, pid ledger plus orphan sweep, `maxLiveSessions=3`, credential revoke, honest limit. |
| S-5 dead cards | Resolved | A5 + Component 12: one entry per admitting phase, hidden when the status row is absent. |
| S-6 live verification matrix | Resolved | Verification matrix (plan 178-200) with fixture / live-here / user, and `blocked-pending-user` for P11. |

## Serious (unresolved or new)

### R2-1 P1 file list is incomplete and would fail the commit hook and the Electron bundle gate

Plan Components 1 and 2 (plan 325-330, 390-400) say the new libs copy the layout of
`libs/backend/codex-runtime`. Checking everything that mentions `codex-runtime` shows the plan misses:

- `apps/ptah-electron/tsconfig.build.json:19-23`. Its `paths` map replaces the base paths, and every
  backend lib is listed there (`codex-runtime`, `cli-agent-runtime`, ...). The plan modifies only
  `tsconfig.base.json`. `acp-runtime` and `provider-session-contracts` will not resolve in the Electron
  bundle. This breaks `ptah-electron:validate-deps`, which the pre-push hook runs (`.husky/pre-push:56`).
  P1 puts `ptah-electron` in its gate, so this is a P1 defect.
- `.commitlintrc.json:51` is a scope enum that lists each lib (`codex-runtime`, ...). Commits scoped
  `acp-runtime`, `provider-session-contracts` and `opencode-runtime` are rejected until it is updated
  (CLAUDE.md says to read this config before committing).
- `package.json` files. `codex-runtime/package.json` exists, and `cli-agent-runtime/package.json:12` and
  `auth-providers/package.json:16` declare it as a dependency. New libs need a `package.json`. Moving
  the `@agentclientprotocol/sdk` import (`cli-agent-runtime/package.json:9`) into `acp-runtime` needs
  the dependency declared there, and `cli-agent-runtime` needs `acp-runtime` and
  `provider-session-contracts` added.
- `acp-runtime/jest.config.ts` cannot copy `codex-runtime`'s. `cli-agent-runtime/jest.config.ts:17-18`
  sets `transformIgnorePatterns: ['node_modules/(?!@agentclientprotocol/)']`, because the SDK is ESM
  only. Without it, every moved spec that imports `acp-sdk-loader` fails. The plan does not mention it.
  `setupFiles: ['reflect-metadata']` and the `vscode` mapper are also worth stating (the lib no longer
  imports `vscode-core`, so decide).
- The `nx` tsconfig set: the plan lists `tsconfig.json/lib/spec`, which matches. State the `build`
  and `typecheck` targets (codex-runtime's `project.json` has an esbuild `build` and a `typecheck`
  `run-commands` target) so `verify -t typecheck` runs on the new projects.

Fix: add these files to Components 1 and 2 `Files` and to the P1 PR scope. Spell out the `project.json`
targets and the jest `transformIgnorePatterns`.

### R2-2 S-2 still misses the AuthManager and OAuth strategy path for an active provider-session provider

The plan guards `provider-auth-resolver.ts:160,548`, `curator-proxy-manager.ts:66`,
`workspace-llm-resolver.ts`, the curator adapter and `provider-proxy-pool.ts`. A provider-session entry is
specified with `authType:'oauth'` and `baseUrl:''` (plan 757). Two more Codex-aware sites in `auth-providers`
are not listed:

- `libs/backend/auth-providers/src/lib/auth/strategies/oauth-proxy.strategy.ts:67-77`. `configure()`
  routes `openai-codex` to its own path and sends every other id to `configureCopilotOAuth`. When
  `antigravity-cli` or `grok-cli` is the saved active provider and `AuthManager.configureAuthentication`
  runs (startup, provider switch), this starts the Copilot OAuth proxy flow for an unrelated provider.
- `auth-manager.ts:34,167,253` and `codex-native-runtime-refusal.ts:11-18`. Codex gets a native-owned
  short-circuit (`isNativeCodexAuthIntent`: "authentication is owned by the native runtime").
  Provider sessions have no equivalent, so `configured:false` is never returned for them.
  `draft-verification.service.ts:759` also special-cases the Codex refusal by `providerId`.

Impact: selecting a provider-session provider as the active provider can trigger a Copilot OAuth
configuration (or a failed auth configure shown to the user) before any chat starts. The plan's claim that
the runner is unreachable (plan 515-517) covers `sdk-query-runner` only.

Fix: add these three files to Component 5 `Files` (P4). Add `isNativeProviderSessionAuthIntent` (or
generalise the existing helper) and a provider-session branch in `OAuthProxyStrategy.configure` that
returns an unconfigured, native-owned result. Make `isCodexRuntimeRefusal` in `draft-verification` cover
the new ids. Add a spec "active provider = provider-session id; configureAuthentication does not start
a Copilot flow".

## Moderate (max 5)

- M-1 Cross-references point at the wrong component. The orphan sweep is "Component 13" (plan 29, 92),
  but Component 13 is Grok main chat; the sweep is in Component 11. "chat composition (13)" in
  Component 2 (plan 379) should read 11. Rename before the team-leader decomposes by component number.
- M-2 P1 is called "behaviour-identical" (plan 164) but Component 2 swaps `spawnCli` +
  `resolveDirectSpawn` for `IProcessSpawner`, retargets the mapper to `ProviderSessionEvent` and rewrites
  `acp-session-handle.ts` into `acp-session-runtime.ts`. Only the Grok specs prove it, and Grok live
  stays "User". State the P1 acceptance honestly as "fixture-identical", and keep the `spawnCli`
  transport until the P2 spawner path passes the same fixtures, or accept the change explicitly.
  The 1.8k estimate "mostly moves" is optimistic with the rewrite.
- M-3 The user-turn projection target is unverified. Component 1 (plan 315-318) assumes
  `FlatStreamEventUnion` has a user-message member and a fallback. Grepping `stream-background.ts` found none
  of `user_message`/`UserMessage`/`'user'`. Resolve this in P1 (before the P2 replay capture), not at
  projector time.
- M-4 Component 5 still carries "provider-proxy-pool.ts (Assumption ... confirm the site)". The check
  exists there (`provider-proxy-pool.ts:66,228-229`); change the assumption to a fact.
- M-5 Component 12 lists `message-sender.service.ts` with "Assumption on path". Locate it by name
  in P9 planning, and add `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts`
  (confirmed to import the Codex refusal path) to the M-7 list as already named.

## P1 and P2 specificity

- P1 move list matches the code. `CA/acp/` holds `acp-permission-policy`, `acp-process-transport`,
  `acp-sdk-loader`, `acp-session-handle`, `acp-session-update-mapper`, `acp-vendor-profile`, `index.ts`,
  their specs, and `__fixtures__/` (`fake-acp-agent.ts`, 11 `.ndjson`). `CA/grok/` holds the Grok profile
  and spec. The plan's claim that only `grok-cli.adapter.ts` (+ its spec) imports them is true; the
  `grok-account-plan-usage.reader.ts` hit is an unrelated string. `acp/index.ts` is not named in the MOVE
  list. Say whether it is deleted or becomes `acp-runtime/src/index.ts`.
- Import rewrites are described by direction (lane handle imports the runtime) but not enumerated. The
  existing handle imports `Logger` from `vscode-core`, `buildTaskPrompt`/`createBufferedEmitter` from
  `../cli-adapter.utils`, and `classifyCliStderr` (`acp-session-handle.ts:30-55`). The plan routes these
  to the lane handle; adding a short "import map" table would remove guesswork.
- Gate command for P1 and P2 uses valid names (`@ptah-extension/cli-engine`, `platform-cli`,
  `cli-agent-runtime`, `shared`, `ptah-electron` verified). Add `-t typecheck` for the new projects
  explicitly once R2-1 gives them a `typecheck` target.
- P2 is specific enough once P1 is fixed: each item has a fixture or spec name.

## Decisions

- None taken; the review is document-only.
