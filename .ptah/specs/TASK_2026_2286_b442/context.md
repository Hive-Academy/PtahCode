# Context

User request (2026-11-20): Antigravity usage still does not show. In analytics, move the
`Provider reported` stats under the two charts as a full row. Give the two tables (Breakdown,
Top sessions) more space and a better design: icons, bars, charts, background, number formats.

## Gate 0.1
- Preference source: none in memory (preference unknown). Mode: enabled. Approval: lane-review.
- `ptah_route_decide` timed out; rule tables used.
- Lanes: codex (room, weekly 83%), antigravity (reader failed), grok, claude installed.
  Ollama Code and kimi code AT LIMIT.
- Executors: backend-developer + frontend-developer subagents (parallel, file-disjoint);
  code review by a codex lane (different family).

## Part A: Antigravity reader (libs/backend/auth-providers)
Evidence on this machine (agy 1.5.13):
- Probe: `Antigravity state=service-unavailable reason=process/discovery`.
- No `language_server` process runs (CLI-only install), so the local-rpc source fails.
- `~/.gemini/antigravity-acp/acp_token.json` does not exist, so the OAuth source fails.
- The `antigravity-cli` source is a stub that returns `source-unavailable` (commit 8a81d78e5
  removed `antigravity-cli-usage.adapter.ts` because `agy -p /usage` timed out then).
- Today `agy -p /usage --output-format json` exits 0 in about 3 s (2 runs), `num_turns: 0`,
  `usage.total_tokens: 0`. Shape:
  `{conversation_id,status:"SUCCESS",response,duration_seconds,num_turns,usage,
    command:{name:"usage",data:{description,groups:[{name,description,
    buckets:[{id,name,description?,window:"weekly"|"5h",remaining_fraction,reset_time}]}]}}}`
- `antigravity-usage-json.parser.ts` exists but no production code calls it. It requires
  `type === 'command'` and `group.windows`; the live output has no `type` and uses `buckets`.

## Part B: usage dashboard (libs/frontend/dashboard, usage-dashboard components)
- `ptah-usage-cost-quality` (Provider reported / Model priced / Unpriced / Cache savings) is in
  the right column of the chart row. Move it to a full-width row under the chart row.
- Table row: Breakdown and Top sessions need more room and a richer design.

## Scope added by the user (2026-11-20, second message)
- UI/UX designer on the whole analytics page (plan limits tiles, repository usage, charts, tables).
- CLI usage-command fallback for Grok and other installed CLIs with failed usage reads.
- Seen in the screenshot: the Grok chip shows "sign in to the antigravity cli (run agy once)" (wrong CLI).
