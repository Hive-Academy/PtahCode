# Decision: bring back the agy CLI usage reader (2026-11-22)

Issue 1459 says: do not bring the agy CLI usage reader back unless ACP gives no
usage data at all, and decide that explicitly in the task.

## Evidence

- ACP gives no quota data. `agy acp` (1.5.14) exposes per-turn
  `PromptResponse.usage`, `usage_update {used, size}` (context only), and
  `_meta.antigravity.tier` (plan tier name). `availableCommands` has no `/usage`.
- The OAuth reader needs `~/.gemini/antigravity-acp/acp_token.json`, which
  plain `agy acp` never writes (agy keeps its token in the OS keyring under
  `gemini:antigravity`). The local language-server source needs the IDE.
- Probe, agy 1.5.14, Windows, empty temp cwd, launched from PowerShell (no
  MSYS path conversion):
  `agy -p /usage --output-format json --model gemini-4-hydrogen-low --print-timeout 25s`
  returned in 3 s with `num_turns: 0`, all usage counters 0, empty
  `conversation_id`, and `command: { name: "usage", data: { groups: [ { name,
  buckets: [ { id, name, window: "5h" | "weekly", remaining_fraction,
  reset_time } ] } ] } }`. Groups seen: "Gemini Models", "Claude and GPT
  models". A third-party group with no use reports `reset_time`
  1970-01-01T00:00:00Z.
- The same command from Git Bash was rewritten by MSYS to
  `C:/Program Files/Git/usage` and went to the model (one billed turn). The
  removal in 8a81d78e5 ("print mode sends /usage to the model") most likely hit
  a path rewrite or an older agy build.

## Decision (user, 2026-11-22: "if there is no way unless we call cli tools with
the usage command lets do so")

Restore a CLI source for Antigravity plan usage, guarded so it never bills:

- Spawn with an argument array (no shell), `stdin: 'ignore'`, an empty
  private temp cwd, `--output-format json`, `--print-timeout`, and the
  cheapest model as `--model` in case a future agy routes `/usage` to a model.
- Accept the reading only when `command.name === 'usage'`, `num_turns === 0`
  and every usage counter is 0. Otherwise discard it, log once, and disable
  the CLI source for the process lifetime (circuit breaker), so a changed agy
  can bill at most one turn per app run.
- Parse `command.data.groups[].buckets[]` (fall back to the TSV `response`
  only if `command` is absent). Treat a 1970-01-01 reset as "no reset known".
- Keep it the last source after OAuth and the IDE language server; respect
  the existing 11 s chain budget and the read cache, and never run it per turn.

## Live check (2026-11-22, dev app, Windows)

- Analytics page: usage from the ledger appears (169.2K tokens, $0.08,
  1 session) after migrations 9 and 10.
- Plan limits: Antigravity read by the CLI stage ("CLI command · observed
  just now", Gemini Models 5 h and weekly at 1 %); no new agy conversation
  was created. Codex shows a weekly window (3 %). The chat sidebar shows the
  Antigravity tile.

## Linux case decision (revised after PR review)

Ledger keys fold case only for Windows-style paths (drive letter or
backslash) and on Windows and macOS hosts, whose file systems ignore case.
POSIX paths on Linux keep their case, so two folders that differ only by
case have separate Analytics totals. The usage producers and readers pass
raw workspace paths so the case reaches the repository. Migration S0010
restores a legacy Linux key that the old producers lowercased to the single
session folder it matches; an ambiguous or orphan key stays as it is. The
session list keeps its exact match.

## Known limits

- An agy account switch that the CLI store does not reflect can show the
  previous account's windows for up to 60 s.
- Two Codex team workspaces with the same email and plan look identical
  to account/read; the auth-file watcher remains the guard.
- `libs/shared` dashboard-budgets.spec.ts fails 2 stack-depth tests on this
  Windows machine on main too (unrelated).
