# Backend review fixes

## Item 1 — resume parent plan cap

`cli-lane-policy-resolver.ts` now applies the current trusted parent plan cap to a saved resume snapshot before manifest validation. Codex resumes also force network deny. Other snapshot fields remain intact. `cli-lane-policy-resolver.spec.ts` covers system Codex and Ptah CLI resumes.

## Items 2 and 5 — serialized settings and Codex reset

`agent-rpc.handlers.ts` delegates the CLI defaults transaction to `agent-config/cli-lane-defaults-config.ts` within the existing `setConfigQueue`. The helper reads the latest persisted map, merges row and field patches, validates the result, writes canonical `cliLaneDefaults` and the Codex legacy projection, and restores the canonical map if the second write fails. It reads both values back after success; `agent:setConfig` returns those persisted values in optional `cliLaneDefaults` and `codexSandboxMode` result fields. `rpc.types.ts` describes the additive response fields. A Codex row or full-field reset clears the legacy key, so `agent:getConfig` shows no saved Codex row and the built-in sandbox mode. `agent-rpc.handlers.set-config.spec.ts` covers rollback, concurrent edits to distinct rows, reset read-back, legacy-only migration, and field reset.

## Item 4 — Ptah CLI save validation

`cli-lane-defaults.types.ts` exports `PTAH_CLI_PERMISSION_CAPABILITIES`; `ptah-cli-registry.ts` advertises that same contract. The RPC helper rejects unsupported saved pairs, including partial `ptah-cli: {network:'deny'}`, before any setting write. `agent-rpc.handlers.set-config.spec.ts` covers this boundary.

## Item 6 — OpenCode inherited config

`opencode-cli.adapter.ts` parses and merges inherited `OPENCODE_CONFIG_CONTENT` when yolo has no Ptah MCP token. It preserves unrelated keys, overrides only `permission` with `allow`, logs a fixed safe error through the injected logger, and refuses malformed JSON before spawn. `cli-detection.service.ts` supplies the logger. `opencode-cli.adapter.spec.ts` covers merge and rejection with typed fakes and no model request.

## Item 7 — one pair-filling rule

Exact exported signature in `@ptah-extension/shared`:

```ts
resolveCliLaneDefaultPair(
  capabilities: Pick<CliAdapterManifest, 'permissionModes' | 'networkModes'>,
  saved: { permission?: LanePermissionMode; network?: LaneNetworkMode } = {},
): {
  permission?: LanePermissionMode;
  network?: LaneNetworkMode;
  permissionSource?: 'saved' | 'built-in';
  networkSource?: 'saved' | 'built-in';
} | { unsupported: string }
```

`cli-lane-policy-resolver.ts` and the RPC save validator use it. `cli-lane-defaults.types.spec.ts` covers built-in, saved partial, and unsupported partial pairs.

## Item 8 — focused config helper

`agent-config/cli-lane-defaults-config.ts` owns canonical and legacy projection, migration, patch merge, validation, rollback, and persisted read-back. The existing handler remains the RPC entry point. No DI registration was added.

## Verification

| Command | Result |
| --- | --- |
| `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=cli-lane-policy-resolver.spec.ts` | 1/1 target passed, 0 failed |
| `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.set-config.spec.ts` | 1/1 target passed, 0 failed; repeated after response and validator changes |
| `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=opencode-cli.adapter.spec.ts` | 1/1 target passed, 0 failed |
| `npm run verify -- -t test -p @ptah-extension/shared -- --testPathPatterns=cli-lane-defaults.types.spec.ts` | 1/1 target passed, 0 failed |
| `npm run verify -- -t lint,typecheck -p @ptah-extension/shared,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers` | 6/6 targets passed, 0 failed |

`ptah_get_diagnostics` was called with changed files twice; each call reported its TypeScript compiler check still running after 45 seconds and returned no diagnostics.

## Decisions

- **Codex reset removes the legacy key.** The settings provider supports removal via `setConfiguration(..., undefined)`; the previous implementation and reset tests already used that path. This is reversible.
- **The shared Ptah CLI capability contract is the source for both runtime and save validation.** The registry previously defined this same permission/network matrix inline. This is reversible.
- **The RPC response adds optional persisted values.** The existing success/error result remains valid for callers; clients that need immediate read-back can use the new fields. This is reversible.

## Open issues

None identified in these backend review items.
