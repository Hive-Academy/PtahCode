# Batch 2.1 fixes round 2

## Fixes

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts:834`: Advertised `idempotencyKey` as a 1-128 character string on both HTTP and stdio surfaces. The description states retry replay and the `force: true` exception.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:1415`: Restored the bounded post-spawn limit lookup for auto-detected lanes. A pending lookup adds the Alternatives note at line 1431. Named targets still use the non-awaiting pre-spawn result, and replay returns before any lookup.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts:4562`: Corrected the new auto-detect test to assert lookup after spawn rather than no lookup.

## Tests

- Existing `agent-spawn-surface-parity.spec.ts`, `bounded-limit-lookup.spec.ts`, and `agent-spawn-limits.transport.spec.ts` assertions now pass without changes to those files.
- `protocol-dispatcher.spec.ts:4423`: Added a fake-timer test that a status lookup taking over 2 seconds replays the earlier lane and does not spawn a second one.
- Focused Jest run: 8 suites, 667 tests passed.

## Check results

- `.ptah/tmp/b21fix2-jest.log`: `Test Suites: 8 passed, 8 total`; `Tests:       667 passed, 667 total`; `Snapshots:   0 total`; `Time:        43.125 s, estimated 57 s`.
- `.ptah/tmp/b21fix2-tsc-lib.log`: empty output, exit 0.
- `.ptah/tmp/b21fix2-tsc-spec.log`: empty output, exit 0.
- `.ptah/tmp/b21fix2-eslint.log`: `78 problems (0 errors, 78 warnings)`; exit 0.
- `.ptah/tmp/b21fix2-prettier.log`: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts 136ms`; exit 0.
- `git diff --check` passed with no output.

## Open issues

- None for this fix. Local skill discovery returned no applicable installed skill; remote results were marked non-invocable. Prettier reformatted existing lines in `tool-description.builder.ts` as part of the required format command.

FIXES-ROUND-2: DONE
