## Changed files

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.spec.ts`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts`
- `.ptah/specs/TASK_2026_2332_5b4f/batch-b1-b4-report.md`

## Behaviour

| Alias | Implemented behavior |
|---|---|
| `head_limit` | Maps to `maxMatches`, clamps at the existing hard maximum; canonical `maxMatches` wins. |
| `type` | `ts` becomes `*.ts`; comma-separated simple extensions become `*.{ts,md}`. Explicit `glob` wins and the note says so. |
| `output_mode` | `content` preserves current output; `files_with_matches` prints file paths with match counts; `count` prints per-file counts. Invalid values list all three allowed values. |
| `-i` | `true` maps to `caseSensitive: false`; `false` maps to `true`; canonical value wins. |
| `-n` | Accepted and ignored; content output keeps line numbers. |
| `-C`, `-A`, `-B` | Maps the largest value to `context`, capped at the existing maximum; canonical `context` wins. |
| `offset` | Maps to `startLine`; canonical wins. |
| `limit` | Maps to `maxLines`, clamped at 400. |
| `file_path`, `path` | Map to `file`; precedence is `file`, then `file_path`, then `path`. |
| Unknown keys | Rejected with valid canonical keys and accepted aliases listed. |
| Alias notes | A short note is prepended to results; read-symbol clamp note is included when applicable. |
| Continuations | Line and character truncation retain a continuation footer; tests verify the exact next line based on the last printed line. |

`additionalProperties: true` permits aliases through MCP client schema validation. Alias keys are not redundantly declared as schema properties. Description additions: `Native Grep keys are accepted.` and `Native Read keys are accepted.`

Definition sizes (name + description + serialized input schema):

- `ptah_grep`: 2,973 chars before; 2,276 after (−697).
- `ptah_read_symbol`: 1,627 chars before; 1,319 after (−308).
- Combined change: −1,005 chars. After sizes were measured with a throwaway Node/TypeScript snippet; before sizes add the serialized alias properties from the prior schema and remove the 31-character descriptions from each definition. The eager budget spec cannot load its dependency in this worktree. Budget cap remains 22,080 chars; no increase is needed.

## Verification

- `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.spec.ts` — 2 suites failed only on two Windows symlink-creation tests; 74 passed, 21 skipped, 2 failed (97 total). `grep › refuses a path outside the workspace, also through a symlink` and `read-symbol › refuses a symlink that points outside the workspace root` fail at `symlink(...)` with `EPERM` due to Windows privilege restrictions. No alias/continuation tests failed.
- `npx.cmd tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` — PASS, exit 0.
- `npx.cmd tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` — PASS, exit 0.
- `npx.cmd eslint <six changed source/spec files>` — PASS, 0 errors; one existing `max-lines` warning at `tool-description.builder.ts:825`.
- Scoped `ptah_get_diagnostics` for changed TypeScript files — PASS, 0 errors and 0 warnings.
- `npx.cmd jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath ...grep.spec.ts ...read-symbol.spec.ts ...eager-tool-definitions.budget.spec.ts` — budget spec could not load: `@ptah-extension/tool-output-reducers` imports ESM-only `marked`, and resolution maps `marked` to the missing `D:\projects\PtahCode\.claude-worktrees\ptah-mcp-adoption\node_modules\marked\lib\marked.umd.js`. The worktree has no `node_modules`; the parent install has `marked`, but not that mapped UMD file. Jest config only sets `transformIgnorePatterns` for `marked`, not a module mapping.

## Decisions

- Keep the alias schemas permissive with `additionalProperties: true`; handler validation remains explicit and rejects unknown input.
- Treat comma-delimited `type` values as a brace glob when every value is a simple extension.
- Use the largest of `-A`/`-B`/`-C` because the existing handler exposes symmetric context only.
- Leave the two symlink tests unchanged; their failures occur during Windows symlink creation.

## Not done

- The eager-definition budget Jest spec could not execute due to the missing mapped `marked.umd.js`; measured tool-definition sizes show a net decrease, so the cap was not raised.
- Scoped `ptah_get_diagnostics` remained unavailable after 45 seconds; both requested direct TypeScript checks passed.
