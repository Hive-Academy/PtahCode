---
id: TASK_2026_2301_agyfu
status: backlog
type: BUGFIX
title: Antigravity chat follow-ups after PR 1462 (resume instructions, review moderates)
depends_on: [TASK_2026_2297_agy]
relatesTo: [TASK_2026_2288_acp1]
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T12:00:00.000Z'
description: >-
  Open items from TASK_2026_2297_agy reviews and live tests.
  (1) S2: instructions on restored sessions - verify that agy keeps the
  session/new _meta systemPrompt append across session/resume and
  session/load; if not, re-deliver Ptah identity, memory, system prompt
  and output style on restore (profile has instructionsOnRestore none).
  (2) Re-check code-logic-review.md moderates 1-8 and minors 9-10 and fix
  what is still present: history adopt double spawn, false ptah MCP hint,
  file path TOCTOU, Windows sign-in false negative and cmdkey spawn per
  status call, one non-http user MCP server failing the start, resume of
  a session agy never persisted, ptah_lane MCP name collision, pid ledger
  flush not awaited at shutdown, stale auth-status comment, baseEnv doc.
  (3) Fallback lane origin-only ptah MCP entry (from the live tests).
  (4) User decisions to take: should a chat on Ptah Plan permission also
  reset agy to plan each turn (today only Manual does); keep or relax the
  fail-closed block when agy offers no plan mode.
  (5) Live re-check on gemini-4-hydrogen-low: one extra set_mode per
  Manual prompt, /clear leaves no bubble, single Ptah tool set.
executor: claude
estimate: M
---
