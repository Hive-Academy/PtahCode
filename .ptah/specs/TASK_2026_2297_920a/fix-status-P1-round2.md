# P1 round-two fix status

| Finding | Status |
| --- | --- |
| 1. SDK run generations | Implemented with stale start and outcome regression. Agent SDK Jest passed. |
| 4. Request accounting order | Implemented first-seen positions and late A regression. Agent SDK Jest passed. |
| 3. Foreground completion | Implemented SDK background metadata and foreground report regression. Agent SDK Jest passed. |
| 6. SDK outcome attribution | Implemented separate SDK outcomes and gate cleanup with monitor, SendMessage and context regressions. Agent SDK Jest passed. RPC Jest passed. |
| 5. Progress and output pointer | Implemented usage-free progress capture and correlated terminal output fallback with executor-to-monitor regression. Agent SDK Jest passed. |
| 2. Cross-parent gate keying | Deferred in decisions.md |

## Decisions

- Match SDK terminal events to the observed run when both payloads carry a run ID. Task and tool-use IDs provide the fallback for older payloads. A resumed run of an existing spawn keeps the original tool-result delivery route. This is reversible.
- Describe SDK stopped and failed outcomes without assigning an actor. The SDK terminal status alone gives no evidence of who initiated a stop. Legacy budget-stop guidance remains available. This is reversible.
- Keep the validated transcript as the preferred fallback pointer. A correlated SDK output file is display-only, must be an absolute path without traversal or line breaks, and is omitted for SDK frames marked `skip_transcript`. This is reversible.
- Defer cross-parent gate keying because SDK agent IDs are unique per run and collisions between live parent runs are rare. See `decisions.md`.

## Verification

- Agent SDK focused Jest passed 320 tests across five suites. A final monitor rerun passed all 147 cases.
- RPC Handlers focused Jest passed 98 tests across two suites. Shared policy Jest passed 32 tests. VS Code Core registry Jest passed 28 tests.
- ESLint on the 10 changed TypeScript files reported zero errors and six warnings. The warnings are file length, existing unused code and an existing non-null assertion.
- Scoped `ptah_get_diagnostics` timed out after 45 seconds. Native `tsc --noEmit` passed for the Agent SDK and RPC Handlers library and spec configs, and the Shared library config.
- `ptah_search_files` returned no task-folder hits. The supplied task paths were read directly. This lane exposed no skill-loading tool.
