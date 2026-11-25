# Batch 3 report: gateway pure modules (P1-B3)

## Tasks completed

- 3.1 URL normalization
- 3.2 Naming and collisions
- 3.3 Caller policy matrix

## Files

All six files are new and sit under
`libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/`:

- `mcp-url-normalize.ts` defines `normalizeMcpUrl(raw): string | null`.
- `mcp-url-normalize.spec.ts` (8 tests).
- `gateway-tool-naming.ts` defines these exports:
  - constants `GATEWAY_TOOL_NAME_MAX = 53`, `GATEWAY_ALIAS_MAX = 20`, `RESERVED_GATEWAY_ALIAS = 'ptah'` and `GATEWAY_NAME_SEPARATOR`
  - `sanitizeGatewayAlias`, `connectorAliasBase(key, url?)` and `configAliasBase(name)`
  - `assignGatewayAliases(candidates): ReadonlyMap<key, alias>`
  - `gatewayToolName(alias, tool)`, `isValidGatewayToolName` and `buildGatewayToolName(alias, tool, hostToolNames): string | null`
- `gateway-tool-naming.spec.ts` (25 tests).
- `gateway-caller-policy.ts` defines `isGatewayScopePermitted(scope: McpGatewayScope | undefined): boolean`.
- `gateway-caller-policy.spec.ts` (21 tests, including the `it.each` cases).

No other file was edited. The modules are not exported from the `mcp-directory` or lib barrels, because `index.ts` is not in the batch write set. Batch 4's gateway service imports them by relative path inside the same lib.

## Contract coverage (acceptance)

- **Name stability.** The same input gives the same name. Aliases do not depend on input order, and adding servers leaves existing aliases unchanged.
- **`zernio` vs `zernio_<4hex>`.**
  - Of two keys that share the alias `zernio`, the lexicographically smaller one keeps `zernio`.
  - The other gets `zernio_` plus `sha256(key).slice(0,4)`. The spec checks this against a hash it computes itself.
- **53-character cap.**
  - The spec asserts `mcp__ptah__`.length + 53 === 64.
  - A name that exactly fills the budget is kept as is.
  - A tool part over budget is truncated and gets `_` plus 6 hex of `sha256(tool)`. This holds even for the longest suffixed alias (25 characters).
  - Two long tool names that share a prefix still get different names.
- **Reserved `ptah`.** A server is never given the alias `ptah` bare.
- **Host-name rejection.** `buildGatewayToolName` returns null when the generated name equals a host tool name, or when it is malformed.
- **Alias rules.**
  - `oauth-mcp.zernio.com-mcp` gives `zernio`.
  - The `smithery-` prefix is stripped.
  - A leading `mcp.`, `api.` or `www.` label is dropped, and so is the public suffix, `co.uk` included.
  - A dotless host or an IPv4 host stays readable.
  - The result is sanitized to `[a-z0-9-]`, at most 20 characters.
- **URL normalization.**
  - Scheme and host are lowercased.
  - The default port, userinfo, fragment and trailing `/` are dropped. The path and query are kept.
  - An invalid URL returns null.
- **Every Hub 6 matrix row is covered.**
  - `session` needs `privileged` and `gatewayApproval: true`. `includeConnectors` alone does not grant access.
  - `internal-query` needs `privileged` and `includeConnectors: true`. With `includeConnectors` absent or false the caller gets no gateway tools, and `gatewayApproval` alone does not grant access.
  - A `privileged` `agent` is permitted.
  - These callers are all withheld: `lane-report` (antigravity), `read-only`, `home` and `workspace` slots at every capability, an untokened caller (`undefined`), and an unknown kind.
- **Consistency with the dispatcher.** The truth table matches `isGatewayCallerPermitted` in `vscode-lm-tools/.../mcp-caller-policy.ts`. The switch is exhaustive over `McpCallerBindingKind`, so a kind added later causes a compile error and is denied at run time.

## A2 result

`codex-lane-config.builder.ts` neither enforces nor mentions a tool-name length limit:
- It only emits `mcp_servers.ptah.url` and `tool_timeout_sec`, and disables user servers by name.
- Nothing in the lane config truncates or validates tool names, so the 53-character budget is enforced only by the gateway naming module.

The 64-character figure matches the `TOOL_NAME_MAX_LENGTH = 64` that already exists in `agent-sdk/src/lib/codex-app-server/codex-carry-over-projector.ts:18`. The budget is therefore 64 minus `mcp__ptah__` (11 characters), which is 53, as the plan says.

## Stack observed

- TypeScript, commonjs lib, Jest (`libs/backend/cli-agent-runtime/package.json` and `jest.config.ts`).
- These modules are pure functions, so there is no DI. Hashing uses `node:crypto` `createHash`, following `agent-report-router.service.ts`.
- `URL.canParse` is used instead of try/catch, following `codex-mcp-config.ts`. This keeps the code free of new degradation-audit catch sites.
- Types come from the `@ptah-extension/platform-core` barrel: `McpGatewayScope`, `McpCallerBindingKind` and `McpCallerCapability`.

## Verification

All checks ran from the worktree root and are focused, as the brief requires:

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath <3 specs>`: 3 suites passed, 54 tests passed. After a Prettier reformat, the naming spec was re-run and its 25 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0, no errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json`: exit 0, no errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/mcp-directory/gateway/*.ts`: exit 0, clean.
- `npx prettier --check` on the six files: clean after `--write` on `gateway-tool-naming.ts`.

Not run, and left to the coordinator: the batch's `npm run verify -- --related` and `-t lint,typecheck` commands. The brief limited this executor to focused checks.

## Decisions

- **The reserved `ptah` alias is always suffixed.**
  - Options were: a fixed rename such as `ptah-user`, rejecting the server, or the same `_<4hex>` suffix used for collisions.
  - Chosen: the suffix, `ptah_<4hex>`. It reuses one mechanism, it is stable per key, and the server stays reachable.
  - Reversible.
- **Sanitized tool names are hashed.**
  - The contract only hashes over-budget tool names. A tool name with characters outside `[A-Za-z0-9_-]` would be rewritten to `_` and could collide with another tool, for example `repo.list` and `repo_list`.
  - So any changed or empty tool part also gets `_` plus 6 hex.
  - Reversible.
- **Public-suffix handling is heuristic.** The repository has no public suffix list, so the code drops the TLD, plus a common second-level label (co, com, org, net, gov, edu, ac, or) before a 2-letter TLD. Remaining labels are joined with `-`, so `tools.acme.io` gives `tools-acme`. Reversible.
- **The connector host is read from the key when there is no URL.** The key comes from `deriveMcpOAuthServerKey` (host + path with `/` turned into `-`). The host is taken to end at the first `-` after its last `.`. A URL, when passed, takes precedence. Reversible.
- **`normalizeMcpUrl` accepts only `http:` and `https:`.** Any other scheme returns null, because P1 serves only http and sse. Reversible.
- **An empty alias becomes `mcp`.** This happens when sanitizing leaves nothing. Reversible.

## Plan deviations

None. The decisions above fill in points the contract leaves open.

## Out-of-scope observations

- The barrel exports are deferred because `index.ts` is outside the write set. Add them in a later batch only if a consumer outside the lib needs these functions.
- `git status` shows edits in other directories by the concurrent executors (`agent-sdk`, `vscode-lm-tools`, `batches.md`). They were not touched and not checked.
