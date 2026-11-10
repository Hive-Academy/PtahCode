# Claude API: connect only + CLI lane — summary

Branch: `fix/claude-api-connect-only-2`. Base: `main` at `58359e22b`.

## What changed

### Defect A: "Connect only" for Claude API

- New RPC `auth:setDirectAnthropicApiKey`. Params `{ apiKey: string | null }`, parsed with a strict
  Zod schema (trimmed, non-empty, maximum 512 characters; `null` deletes the key).
- The RPC writes or deletes only the direct Anthropic key in secret storage. It does not change
  `authMethod`, `anthropicProviderId`, the adapter route or `process.env`. It returns fixed error
  text and logs only the error type.
- The provider setup wizard permits "Connect only" for Claude API. The default is connect-only
  when a main route exists. Activation of the main agent stays an explicit choice.
- Credentials tab (later key edit):
  - Claude API is not the main-agent route: replacement and deletion use the secret-only RPC.
    The route does not change.
  - Claude API is the main-agent route: replacement uses the `auth:saveSettings` path (same
    route, adapter refresh). Deletion is blocked in the tab and in the service until the user
    selects another route.

### Defect B: Claude API as a Ptah CLI agent instance

- New lane-only provider `anthropic-api` (`ANTHROPIC_API_LANE_ENTRY`): official base URL,
  `authType: 'apiKey'`, `authEnvVar: 'ANTHROPIC_API_KEY'`, `requiresProxy: false`. The model tiers
  come from the existing `claude-cli` entry. The virtual main-agent ID `anthropic` is unchanged.
- `PtahCliRegistry` resolves the lane through `resolveLaneProvider`. All other providers still
  resolve through `getAnthropicProvider`.
- New typed field `credentialSource: 'instance' | 'shared-connection'`. A Claude API instance uses
  the shared connection key by default. The registry reads the key from secret storage at spawn,
  profile and test. It does not copy the key into settings or per-instance secrets.
- A per-instance key is optional. A switch to the shared key deletes the instance secret and
  restores the configuration if that deletion fails.
- The "Add Ptah CLI Agent Instance" dialog shows Claude API with the two credential choices.

## Files

- `libs/shared`: `rpc.types.ts`, `rpc/host-source-registry.baseline.ts`, `rpc/rpc-agents.types.ts`,
  `ptah-cli.types.ts`, `providers/index.ts`, `providers/provider-registry.ts`,
  `providers/entries/anthropic-api-lane-entry.ts` (+ spec).
- `libs/backend/rpc-handlers`: `auth-rpc.schema.ts`, `auth/api-key-methods.ts`,
  `auth-rpc.handlers.ts` (+ spec), `ptah-cli-rpc.handlers.ts` (+ spec).
- `libs/backend/cli-agent-runtime`: `ptah-cli/ptah-cli-registry.ts`,
  `ptah-cli/helpers/ptah-cli-credential-source.ts`, `ptah-cli-registry-anthropic-api.spec.ts`,
  `ptah-cli-registry-credential-source.spec.ts`.
- `libs/frontend/core`: `providers-connection-setup.service.ts` (+ spec),
  `providers-settings-state.service.spec.ts`.
- `libs/frontend/chat`: `provider-setup-wizard.component.ts` (+ spec),
  `connection-drawer/credentials-tab.component.ts` (+ spec),
  `add-cli-instance-modal.component.ts` (+ spec).

## Verification

- `npm run verify -- -p chat,core,shared,cli-agent-runtime,rpc-handlers` (before the review
  corrections): 10 lint/typecheck tasks and 5 test tasks succeeded.
- `npm run verify -- -t test -p ptah-electron,cli-engine --
  "--testPathPatterns=(rpc-surface|surface-composition|container.smoke)"`: 12 tasks succeeded.
- `npm run verify -- -p chat,core,cli-agent-runtime` (after the review corrections, the only
  projects changed since the first run): 6 lint/typecheck tasks and 3 test tasks succeeded.
- Not run: build, serve, e2e, package (prohibited). No rendered UI inspection in Electron.

## Review

Three independent codex review lanes examined the full diff by Git SHA (`code-review-head.md`
holds the last one).

- Head `339e0e02d`: CHANGES_REQUIRED (2 Major, 2 Minor, 1 Nit). Corrected in `5f9251c10`.
- Head `5f9251c10`: CHANGES_REQUIRED (1 Major: a wizard connect-only draft on the active Claude
  API route did not refresh the adapter. 1 Minor: the edit dialog could not give a shared-source
  instance its own key). Corrected in `4d6fe9427`, verified with `npm run verify -- -p chat,core`
  (4 lint/typecheck tasks and 2 test tasks succeeded).
- Head `4d6fe94274ffac74200a5a1fc4ec647955d6ca13`: APPROVED, with 1 Minor finding (open point).

## Open points

- Minor finding of the last review, not corrected: in `PtahCliRegistry.updateAgent`, a switch
  from `shared-connection` to `instance` saves the configuration before it writes the instance
  secret. If the secret write fails, the instance points to an absent key. The user can save the
  key again or switch back to the shared key. No key leaks. A follow-up can add the rollback.

- The UI was not examined in a running Electron host. Component specs cover the behavior.
- The reviewer lane (codex) is the same vendor as the implementation lanes, because no other
  non-Claude lane had room. This is weaker evidence than a review by a different vendor.
- The model tiers of the `anthropic-api` lane follow the `claude-cli` entry. A separate catalog
  for the direct API is not necessary now.
