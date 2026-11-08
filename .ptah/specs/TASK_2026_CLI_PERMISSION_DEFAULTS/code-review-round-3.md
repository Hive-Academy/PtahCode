# CLI lane permission defaults: round-3 logic review

## Verdict

**CHANGES REQUIRED — 6/10.** The four round-2 behavior gaps are closed on the paths their new tests exercise. OpenCode still passes a raw JSON parser error to Logger; on malformed inline config that error can contain the input, including credentials. This keeps the review below the sound 7–8 band. The working transaction recovery, merge, resolution and row comparison put it above the prior 5 band.

## Round-2 status

| Item | Status | Source evidence | Test pin |
|---|---|---|---|
| Two-key set/reset recovery | **FIXED** | `libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.ts:108-136` snapshots both raw keys, restores both after either rejection, verifies both raw read-backs and raises `AggregateError` if recovery is unverified; successful writes read back both projected settings. | `agent-rpc.handlers.set-config.spec.ts:298-333` covers set/reset, either key mutating before rejection, and failed recovery. |
| OpenCode inherited config | **PARTIAL** | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:624-645,723-735` preserves inherited top-level entries and MCP peers, adds `mcp.ptah`, and sets permission only for yolo. `:648-657` rejects malformed JSON in the MCP/yolo paths, but logs the raw parser error; `:723-724` does not validate malformed inherited JSON in a no-MCP, non-yolo run. | `opencode-cli.adapter.spec.ts:507-537,1385-1419` pins no-MCP yolo and MCP plan merge/rejection; no secret-safe diagnostic or no-MCP plan malformed-input test. |
| Final policy pair | **FIXED** | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:47-52,54-75` selects request fields before pair validation, leaving unused stale saved fields out, and retains parent-plan and resume caps. | `cli-lane-policy-resolver.spec.ts:50-59,75-97` pins override, contributing stale field, and resume caps. |
| Full-row commit check | **FIXED** | `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:923-943` reads the pre-write row, applies null/omitted/value patch semantics, and compares both fields and row presence on read-back. | `providers-settings-state.service.spec.ts:1585-1618` pins retained field, concurrent change, Undo and reset. |

## New and remaining findings

### Serious — malformed OpenCode config can expose secrets in logs

- Trigger: `OPENCODE_CONFIG_CONTENT` contains malformed JSON with a credential, and the spawn uses MCP or yolo.
- Evidence: `opencode-cli.adapter.ts:649-656` passes the original `JSON.parse` error to `logger.error`. V8 syntax error messages can quote a portion of the input. `opencode-cli.adapter.spec.ts:1405-1414` checks only that Logger receives an `Error`.
- Impact: a secret from the environment can enter diagnostic logs. Fix: log a new fixed-message `Error`, with no parser error text or config value; test that the diagnostic excludes a sentinel secret.

### Moderate — malformed inherited JSON bypasses validation without MCP or yolo

- Evidence: `opencode-cli.adapter.ts:723-735` calls `parseInheritedConfigContent` only when MCP credentials exist or permission is yolo. A plan/auto-edit run without MCP leaves malformed inherited content in the child's inherited environment and starts OpenCode. Fix: validate present inline config before every spawn; only construct an override when MCP or yolo requires one. Pin the no-MCP plan rejection.

## Five logic questions

1. Silent failure: recovery failures are surfaced and verified (`cli-lane-defaults-config.ts:115-134`); the no-MCP malformed-config path still delegates failure to the child (`opencode-cli.adapter.ts:723-735`).
2. Unexpected user action: a fully specified explicit policy now bypasses unused stale saved fields (`cli-lane-policy-resolver.ts:58-64`).
3. Wrong input answer: full-row comparison detects a changed retained field (`providers-settings-state.service.ts:923-943`).
4. Dependency failure: either settings write rejection attempts and checks two-key restoration (`cli-lane-defaults-config.ts:115-134`).
5. Missing requirement: diagnostic redaction for malformed inherited config is still absent (`opencode-cli.adapter.ts:654-656`).

## Verification and decisions

- Source and focused specs were inspected. No source was edited; no tests, builds, or git operations were run. `ptah_get_diagnostics` was requested twice but timed out with all requested files unchecked. The implementation reports claim scoped passing checks; this review did not rerun them.
- Decision: treat the raw parser error as unsafe to log. The alternative assumes parser messages never include input; V8 does not guarantee that. The fixed-message diagnostic is reversible.
