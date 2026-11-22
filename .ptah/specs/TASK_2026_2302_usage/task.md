---
id: TASK_2026_2302_usage
status: in_progress
type: BUGFIX
title: Antigravity usage on the analytics page and repricing (rest of issue 1459)
depends_on: [TASK_2026_2297_agy]
relatesTo: [TASK_2026_2286_b442]
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T13:30:00.000Z'
description: >-
  GitHub issue 1459 remainder after PR 1462 (which prices agy turns from
  the live OpenRouter catalog and writes them to session_usage_turns with
  producer 'provider-session'). (1) usage-analytics CliSessionSource
  ('antigravity') still reports 'unavailable'; report it from the ledger
  rows instead. (2) provider id 'antigravity-cli' vs source id
  'antigravity': map the label so the dashboard names Antigravity, not the
  claude-ledger source. (3) Turns priced before the catalog hydrated stay
  unpriced forever; add a reprice path (the repository allows
  runCostSnapshot only for sdk-owner today). (4) Plan/quota windows for
  agy: say "unavailable" in the provider card, never probe with a model
  turn. (5) Root cause found live (all providers, pre-existing): the
  dashboard queries the ledger with normalizeWorkspaceRoot(path)
  ('c:/users/.../ws') but sessions.workspace_key is stored raw
  ('c:\Users\...\ws'), and every read prefers the sessions key via
  COALESCE(s.workspace_key, t.workspace_key). So no ledger usage (Claude
  sdk-owner included) appears on the Analytics page. Normalize the key on
  write in sqlite-session-record-repository plus a migration for existing
  rows, or normalize both sides in the queries; add a spec with a mixed-case
  backslash Windows path. Coordinate with TASK_2026_2286_b442.
executor: claude
estimate: M
---
