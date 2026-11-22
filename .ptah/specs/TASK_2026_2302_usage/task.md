---
id: TASK_2026_2302_usage
status: backlog
type: BUGFIX
title: Antigravity usage on the analytics page and repricing (rest of issue 1459)
depends_on: [TASK_2026_2297_agy]
relatesTo: [TASK_2026_2286_b442]
created: '2026-11-22T12:00:00.000Z'
updated: '2026-11-22T12:00:00.000Z'
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
  turn. (5) Confirm live that a provider session has a sessions row whose
  workspace key matches the dashboard normalization.
executor: claude
estimate: M
---
