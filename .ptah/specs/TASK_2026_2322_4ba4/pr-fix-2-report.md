# PR #1496 review fix round 2 — TASK_2026_2322_4ba4

Base: HEAD a75d747e6 (refactor/agy-acp-only). No commits made.

## Findings

1. Valid (Major, quoted key cap). Fix: `QUOTED_SECRET` (128-char bounded key) replaced by `QUOTED_PAIR`, which matches any quoted key and a quoted value. No key length limit. Every body is one `*` over two alternatives that cannot both match a character. An opening quote cannot follow a backslash (`(?<!\\)`), so key scans cannot overlap on a run of escaped quotes (`"\"\"\"…`). `redactQuotedSecrets` uses an exec loop and decides in code whether the key holds a secret word (`SECRET_KEY_WORD`). When a key holds none, the loop moves on by one character, the same way a failed match would, so a secret pair inside a non-secret value (`"msg": "{'token': 'abc'}"`) is still redacted. Specs added: a 1,000-character key on each side of `token`, the nested pair, an unchanged non-secret pair, and three ~100 KB timing cases under 250 ms (escaped quotes, 9,000 non-secret pairs, a 100 KB secret key). The existing timing cases still pass.
2. Valid (Major, `_token` / `_secret` suffixes). Fix: in `INLINE_SECRET`, `\b` is replaced by `(?<![A-Za-z0-9])` before the secret word. A bare `key` now counts only as the last part of a field name, after a letter or digit and `_` or `-` (`private_key`). Specs check that `access_token`, `refresh_token`, `id_token`, `client_secret`, `x-api-key` and `private_key` are redacted. They also check that `tokenizer=`, `monkey=`, `key=`, `mytoken=` and `tokens:` are left unchanged; the old rules did not redact these either.
3. Valid (Minor, second `--version` read). Fix: `probeAcp(binary, fresh?: { version })`. Detection passes `{ version }` even when the version is undefined, and `runAcpProbe` uses it without reading `--version` again. A lane call passes no `fresh`, so it still reads the version again. Spec: when detection's read is unreadable, `probeCliVersion` runs once. The next `runSdk` reads again and rejects with the 1.4.2 message.
4. Valid (Minor, cached pass after a downgrade). Fix: when `fresh` is given, the cached pass is skipped. A `false` result clears `acpFloorPassed` for that binary, and an `undefined` result keeps the cache. Spec: detect reads 1.5.13, then 1.4.2. `runSdk` then rejects with "Antigravity lanes need agy 1.5.1 or later (installed: 1.4.2). Update agy and try again." and the transport is never created.
5. Valid (Minor, `?`/`#` in slot URLs). Fix: the agent and workspace segments in `PTAH_PERSISTENT_URL` and `PTAH_LANE_URL` are now `[^/?#]+`. Specs: `http://localhost:8080/agent/local?tenant=dev`, `…/agent/local#dev`, a lane workspace URL with `?`, and persistent workspace URLs with `?` or `#` are all kept. Agent and workspace segments that contain `%3F` or `%23` are still recognised as Ptah entries and removed.

## Checks (logs in `.ptah/tmp/prfix2-*.log`)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath` lane-stderr-redaction.spec.ts, antigravity-cli.adapter.acp.spec.ts, antigravity-cli.adapter.spec.ts: 3 suites, 113 tests passed.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts … retired-ptah-mcp-slots.spec.ts`: 1 suite, 41 tests passed.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: exit 0.
- `npx eslint` on the 6 changed files: exit 0, no output.
- `npm run verify` and nx were not run, as the brief instructed.

## Files

- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.ts
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.spec.ts
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.ts
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.acp.spec.ts
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http\retired-ptah-mcp-slots.ts
- MODIFIED D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http\retired-ptah-mcp-slots.spec.ts

## Decisions

- Finding 2: I did not add a bare `key` field. `key=` stays unredacted, as it is today; only a `_key` or `-key` suffix after a letter or digit is redacted. Other options were adding a bare `key`, which redacts `key=enter`, or not handling `_key` at all. The review's own negative cases (`monkey=`) support this choice. It is reversible.
- Finding 1: a non-secret key that holds a secret pair in its value is still scanned. I used an exec loop instead of `replace` with a callback, because a callback would consume the value. That would miss secrets that the old rule caught, such as one nested in a `msg` value.
- Finding 1: an opening quote that follows a backslash cannot start a key. Escaped JSON keys (`\"token\":`) were not redacted before this change either, so nothing that was redacted before is lost.
