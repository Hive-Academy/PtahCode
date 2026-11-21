# Stop corrupt config and transport failures from losing or hiding data

Found by the degradation-audit sweep (TASK_2026_2287_d4a9). That sweep only added logging,
by design. This task changes the behaviour. The branch is stacked on
`fix/degradation-audit-sweep`.

| # | Bug | Owner files |
|---|---|---|
| 1 | A corrupt `secrets.enc.json` (not valid JSON, or unknown format) starts an empty store; the next `persist()` overwrites it and the secrets are lost. | `libs/backend/settings-core/src/encryption/secrets-file-store.ts` (+ spec) |
| 2 | A malformed or unreadable `.mcp.json` / Codex `config.toml` is read as empty and written back, dropping the user's other MCP servers. | `libs/backend/harness-sync/src/lib/targets/mcp/json-mcp-facet.ts`, `codex-toml-mcp-facet.ts` (+ specs) |
| 3 | Smithery `checkKeyStatus` maps a transport failure to `not-configured`, so the user sees the API-key form as if no key existed. | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts` (+ spec) |
| 4 | `getDependencies` / `getDependents` return `[]` when no workspace is open or the graph fails, which an agent cannot tell from "no dependencies". | `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/analysis-namespace.builders.ts` (+ spec) |

## Outcome

Four subagents, one per bug, then an independent review (code-logic-review.md).

1. Secrets store: a corrupt file is renamed to `secrets.enc.json.corrupt-<timestamp>`
   and kept; the store starts empty. If the rename fails, writes are refused for the
   session. Review fix: the first load is shared by concurrent callers, and a rename
   that finds the file already moved counts as success.
2. MCP facets: write/remove read strictly and refuse an unreadable or malformed file;
   display reads stay lenient. Review fix: a UTF-8 BOM is stripped before parsing.
   Malformed but readable TOML is not detected (no TOML parser); a write only replaces
   Ptah's fenced block, so the user's servers survive.
3. Smithery: a failed key check is an `error` state with Retry; `not-configured` only
   comes from a successful "no key" answer.
4. Dependency tools: throw "No workspace is open" / "Dependency graph unavailable"; the
   tool runner returns them to the agent as error results. `[]` means no dependencies.

Checks: lint and typecheck of the four libs; Angular template typecheck; related tests
(4 of 4 tasks); protocol-dispatcher spec 427/427; audit TOTAL 0.
