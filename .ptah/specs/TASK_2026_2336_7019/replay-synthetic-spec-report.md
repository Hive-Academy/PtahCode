# Synthetic assistant replay coverage

- `libs/backend/agent-sdk/src/lib/helpers/history/session-replay.service.spec.ts` verifies that persisted synthetic assistant records for `/usage` and `/context` produce a `ptah-ui` fence. It also verifies exact raw-text preservation for ordinary synthetic text and report-shaped text from a regular model.
- `libs/backend/agent-sdk/src/lib/message-transform/artifact-parity.spec.ts` compares the complete live SDK assistant path with persisted assistant replay. It checks byte-for-byte text delta equality for both dashboard fixtures, the `/cost` alias, and the raw-text cases.

The existing replay change applies the formatter at the assistant text delta using the persisted nested model field. The tests use the shared `usage.txt` and `context.txt` fixtures. This follow-up changes only specs and this report.

## Verification

- Focused Agent SDK Jest passed all 103 tests across the two changed specs.
- ESLint passed for both changed specs.
- Source inspection used Ptah search and range reads, with PowerShell for surrounding test setup and working-tree inspection. Native CLI skill discovery was unavailable.
