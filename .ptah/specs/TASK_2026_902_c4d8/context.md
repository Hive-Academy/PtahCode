# Context — interactive review findings in the app

User request (2026-11-09): findings should be interactive and well presented, not plain text.
Depends on Phase A (Machines/Reviews redesign from PR #1018 brief; being implemented by session
chat-71c0e8). Start after Phase A merges.

Scope (libs/frontend review-runs-ui, Electron renderer): finding cards with severity, impact,
evidence list that opens file:line in the app, accept / dismiss / reply (synced to GitHub thread),
"send to lane" to fix a finding, filters and a run summary.
