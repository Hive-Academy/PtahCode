# Status — TASK_2026_1180_d4cd

`ptah_agent_report` returned `delivered: false` (`unattributed-caller`), so the report is here.

## 2026-11-15 — research done

Full table and fix list: [usage-sources.md](./usage-sources.md).

Causes:

1. codex false AT LIMIT: the bucket-level `rateLimitReachedType` is copied onto both windows
   (`codex-plan-usage.reader.ts:187-196`); `namesGate` (`plan-limit-ledger.rules.ts:180`) then
   keeps held exhaustion on a 7% weekly window. `ordinaryUsageAllowed` is ignored.
2. codex/grok lookup timeout: 12 s / 3 s deadlines vs a cold codex chain / a 5 s grok HTTP read.
   The spawn MCP call waits on the same lookup and times out while the lane starts.
3. antigravity: OAuth needs a token file agy 1.5.9 does not write; the CLI fallback runs in a
   cwd that boots MCP servers (17-25 s) against an 8 s timeout.
4. A 100% window reads "near limit" without exhaustion evidence.
5. grok 402 "usage balance exhausted" is not classified as a limit.

Verdict on the `/usage` proposal: no PTY fallback. Every installed CLI has a structured source;
`agy -p /usage --output-format json` covers antigravity headlessly.

Next: batch (a).
