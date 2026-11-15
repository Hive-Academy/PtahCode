## Fixes

1. `mcp-core/agent-spawn-dedupe.ts:73` validates settled results before replay; `mcp-core/protocol-dispatcher.ts:1289` supplies a status callback that accepts only a running lane. Terminal, unknown, and unavailable status cause a fresh spawn. In-flight calls still replay.
2. `mcp-core/protocol-dispatcher.ts:1217,1406` tracks whether the named limit lookup is still pending and restores the pending limit note without a second lookup. Auto-detected lanes have no named pre-spawn lookup, as the code comment states.
3. `mcp-core/agent-spawn-dedupe.ts:89` evicts only the oldest settled entry at capacity. If all 200 entries are in flight, it runs the new call without storing it.
4. `mcp-core/agent-spawn-dedupe.ts:10,65` expires in-flight reservations after five minutes. A late result cannot overwrite a replacement entry.
5. `mcp-core/protocol-dispatcher.ts:758,1327` wraps the shared failure with the gate context, so concurrent callers format the same refusal or spawn error text.

## Tests added

- `mcp-core/agent-spawn-dedupe.spec.ts:106-177`: running versus terminal replay, settled-first capacity eviction, all-in-flight bypass, and five-minute ceiling.
- `mcp-core/protocol-dispatcher.spec.ts:4398-4540`: running versus failed lane, concurrent identical error, force bypass, 120-second TTL, AT LIMIT refusal with retry, and pending named-target limit note without a second lookup.
- Existing assertions were retained. The shared spawn test helper now provides a running status result for its replay checks.

## Check results

- `b21fix-jest.log`: `Test Suites: 3 passed, 3 total`; `Tests:       440 passed, 440 total`. The final log line is `"libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-limit-gate.spec.ts".`
- `b21fix-tsc-lib.log`: empty output, exit 0.
- `b21fix-tsc-spec.log`: empty output, exit 0.
- `b21fix-eslint.log`: exit 0, 77 warnings and 0 errors. Last warning line: `4356:7   warning  The value assigned to 'returnedSource' is not used in subsequent statements                          no-useless-assignment`.
- `b21fix-prettier.log`: exit 0. Final line: `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts 2636ms`.
- `ptah_get_diagnostics` timed out after 45 seconds; both requested native TypeScript checks passed.

## Decisions

- Status lookup failure is treated as unknown and permits a fresh spawn. The dispatcher logs a safe warning with agent ID and error name. Reversible.
- A shared validation promise prevents simultaneous settled-entry checks from launching duplicate fresh spawns. Reversible.
- The coordinator's task preview in the invocation log and longer replay guidance remain in place.

## Open issues

None.

FIXES-ROUND-1: DONE
