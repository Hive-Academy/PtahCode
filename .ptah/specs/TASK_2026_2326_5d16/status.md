# Status — TASK_2026_2326_5d16 (child report to parent f7784134)

The parent report could not be delivered: `ptah_agent_report` returned
"parent-session-not-active", and SendMessage replied "no agent reachable".
This file holds the same report text instead.

## 2026-11-25 — G3–G5 committed, G4b review APPROVED

Branch `fix/route-decide-predictability` (not pushed). Commits on top of dc2168330:

- ae02a9915 fix(lane-routing): G3 review fixes (gather, override, reasons)
- b68b8506c feat: route deadline (gate 8 s, pre-flight 4 s), compaction, G4 review fix round
- 42bafe99c docs: "How the router decides" in agent-orchestration.md
- 9e1461e07 feat: AM6 payload compaction (−68.1%), AM7 cost gate, AM8 no model-cold for
  custom/remote targets. runFixedRequest no longer applies the lane question cap.

Checks before 9e1461e07: `verify --related -p lane-routing` exit 0.
`-t lint,typecheck -p lane-routing,vscode-lm-tools` 4/4 passed.

G4b review (antigravity, `code-logic-review-G4b.md`): APPROVED, 7/10. 0 Blocking, 0 Serious,
4 Moderate, 1 Minor. The D7 files have no changes against main. G4 findings 1–9 are fixed.
Removing the fixed-request cap is safe for every caller.

Moderate:
1. The AM7 cost gate ignores a `target.timeoutMs` that is smaller than `remainingMs`.
2. `unavailableReadTimedOut` drops "route deadline reached" for reviewer-family on a rows() timeout.
3. `buildDecisionPayload` drops outcomeFigures when `taskKind` is omitted.
4. `PrefillRateStore` in-flight lock: an unprotected window after tryStart, and no release
   if decide never settles after abort.

Minor: a gap in the model-refine alternates test, and no end-to-end specs for the AM7 service paths.

Next steps:
1. Full gate once.
2. Kimi final PR review of main...HEAD, which also covers G3 round 2 and the G5 docs.
3. One fix round for the 4 Moderate findings, the kimi findings and D16 (`overrideLabel` `.min(1)`).
4. Commit, push, open the PR, set task.md to in_review.
5. Watch CI and the reviews, then merge and clean up under D18.
