# Batch 13 report: remove chat:start connector overrides (C8, D-U1 Option 1)

Task 13.1 (Delete per-connector overrides) is done. Nothing was committed.

## Gateway independence (checked before deleting)

`libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/` and
`libs/backend/cli-agent-runtime/src/lib/di/register.ts` do not import or reference
`ChatSessionService`, `buildMcpServersOverride` or its resolver getters. The only hit is a
doc comment in `gateway/server-sources.ts:7` saying that `ChatSessionService` used to do the
merge. The gateway builds its own Smithery and OAuth resolvers from `cli-agent-runtime`
exports, which stay in place.

## Files changed

- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`
  - Deleted `smitheryOverrideResolver` / `getSmitheryOverrideResolver()` and
    `oauthOverrideResolver` / `getOAuthOverrideResolver()` (old lines 877-950).
  - `buildMcpServersOverride(callerOverride)` now only passes the caller override through:
    `return Promise.resolve(callerOverride)`. Its doc comment points to the gateway (D-U1).
  - Deleted the now-unused imports `SmitheryRegistrySource`, `SmitheryConnectionResolver`,
    `SmitheryInstalledManifestStore`, `SmitheryOverrideResolver`,
    `createSmitheryConfigSecretStore`, `McpOAuthService`, `McpOAuthInstalledManifestStore`,
    `McpOAuthOverrideResolver` and `createMcpOAuthTokenStore` (from
    `@ptah-extension/cli-agent-runtime`), plus `SMITHERY_API_KEY_SECRET_ID`.
  - Updated two doc comments that still listed "OAuth overrides" in the pre-admission work.
  - `mergeMcpOverride` is unchanged. The call site at about line 1872 is unchanged.
- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.native.spec.ts`
  - Removed the `buildMcpServersOverride: async () => undefined` stub, so the real
    passthrough runs.
  - The ambient case no longer injects the prototype method and the fake
    `getSmitheryOverrideResolver` / `getOAuthOverrideResolver`. It now passes the same
    two HTTP servers as `mcpServersOverride` on `startSession`. Two assertions about the
    resolvers being called were removed. The Codex native-attach, secret-reference and
    redaction assertions stay and now cover caller-supplied servers.
- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.host-routing.spec.ts`
  - Removed the `jest.spyOn(service, 'buildMcpServersOverride').mockResolvedValue(undefined)`
    stub. It is no longer needed because the method no longer reads manifests.
- MODIFIED `libs/backend/rpc-handlers/src/lib/chat/session/chat-session-agent-child.spec.ts`
  - Removed the `buildMcpServersOverride` passthrough spy and its stale comment about the
    Smithery and OAuth resolvers reading manifests from disk.

## Callers of `buildMcpServersOverride`

- Production: the only caller is `launchSdkSession` in `chat-session.service.ts`. It is
  unchanged.
- Specs inside the write set: updated as listed above.
- Specs outside the write set still stub the method and still pass unchanged:
  - `chat-session.carry-over-launch.spec.ts:242` (spyOn)
  - `chat-session.connection-switch.spec.ts:103` (property stub)
  - `chat-session.provider-session.spec.ts:108` (property stub)
  - `chat-session.ptah-ui-flag.spec.ts:168` (spyOn)

  The stubs are now redundant but harmless. Keeping the method name is what keeps them
  valid.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath`
  run on the 3 write-set specs plus the 4 out-of-set specs that stub the method:
  7 suites passed, 156 tests passed.
- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/rpc-surface.spec.ts`:
  1 suite passed, 17 tests passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.spec.json`:
  - The first run hit the default heap limit (OOM).
  - The re-run under `node scripts/verify.mjs --exec` with `--max-old-space-size=6144`
    exited 0 with 0 errors.
- `npx eslint` on the 4 changed files: 0 errors and 1 warning. The warning is the existing
  `max-lines` warning on `chat-session.service.ts`, which now has 3012 lines counted
  against a limit of 700. This batch makes the file shorter.
- Not run, because the brief forbids it for this role: the `npm run verify` commands named
  in the batch (`--related` and `-t lint,typecheck -p @ptah-extension/rpc-handlers`). The
  coordinator owns them.

## Decisions

- **`buildMcpServersOverride` is kept as a one-line passthrough, not inlined.**
  - Options: inline `input.mcpServersOverride` at the call site, or keep the method.
  - Evidence: the contract says the method "reduces to the callerOverride passthrough".
    Four specs outside the write set stub it by name.
  - Reversible: yes. A later batch can inline it and drop those stubs.

## Deviations

- **The `authSecretsService` constructor dependency is kept, although it is now unused.**
  - The contract says to delete now-unused constructor dependencies.
  - `ChatSessionService` is built with positional constructor arguments in 16 specs.
    13 of them are outside this batch's write set: `chat-continue-slash-before-resume`,
    `chat-session-abort-resume-state`, `-auth`, `-budget`, `-history-page`, `-mcp-status`,
    `-policy-roots`, `-provider-profile`, `-resume-activate`, `-session-folder`,
    `.account-binding`, `.carry-over-launch` and `.follow-up-queue`.
  - Removing the parameter (`@inject(TOKENS.AUTH_SECRETS_SERVICE)`, about line 458) would
    shift every later argument and break all of those specs.
  - The field compiles and lints clean as it is, because the config has no
    `noUnusedLocals` rule for parameter properties.
  - Recommendation: a follow-up whose write set holds those 16 specs. It removes the
    parameter, the `IAuthSecretsService` import and the matching positional argument in
    each spec.
- `batches.md` shows a 1-line change in `git diff` that this batch did not make. This
  batch did not touch it.

## Out-of-scope observations

- The four redundant `buildMcpServersOverride` stubs listed above can be removed together
  with the method in the follow-up.

## PR-notes text (D-U1 rename and its effect on resumed history)

> **Installed connectors now reach every session through the Ptah MCP gateway.**
> Smithery and OAuth connectors used to be attached to `chat:start` sessions only, each as
> its own MCP server entry. Agent, cron and other sessions did not get them. Now every
> session reaches them through the single `ptah` MCP server. Because of this, connector tool
> names change from `mcp__<connector-server-key>__<tool>` (for example
> `mcp__oauth-mcp_zernio_com-mcp__<tool>`) to `mcp__ptah__<connector>__<tool>` (for example
> `mcp__ptah__zernio__<tool>`).
> **Effect on resumed history:** sessions started before this change still show the old
> tool names in their transcript. When such a session is resumed, the model sees only the
> new names. Earlier tool calls stay readable as history, but the model must call the
> `mcp__ptah__…` names from then on, and any permission rule or allowlist written against
> the old `mcp__<connector>__*` names no longer matches. Re-approve or update such rules
> for the new names.
