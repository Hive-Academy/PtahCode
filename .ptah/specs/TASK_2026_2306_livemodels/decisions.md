# Decisions — TASK_2026_2306_livemodels

| # | Decision | Evidence / source |
|---|---|---|
| 1 | Type REFACTORING, depth Full (architecture -> document-review -> batch -> implement -> review -> tests) | Crosses shared, auth-providers, agent-sdk, rpc-handlers; removal needs blast-radius map |
| 2 | Lanes disabled, approval mode `user` | No lane tools listed in session |
| 3 | Removal of static lists approved by user | User message 2026-11-22 "yep lets do that" |
| 4 | Branch type `fix` (closes bug #1455) | CLAUDE.md branch naming = commit type |
| 5 | Gate 2 round 1: plan-review.md verdict REVISE (1 Blocking, 9 Serious). Revision round 1 runs on a fresh architect | plan-review.md |
| 6 | USER: tiers stay as curated preferences, checked against the live catalog; a missing tier id resolves to the closest live model of the same family with a warning; tiers never list or admit models | AskUserQuestion 2026-11-22 |
| 7 | USER: Z.AI to be rebuilt as a GLM coding-plan integration like Kimi Code. Orchestrator decision: separate follow-up task TASK_2026_2307_glmcode (Kimi Code is ~15 files: OAuth, credential store, proxy). This PR adds NO ZAI_RATE_CARD; Z.AI cost shows unknown until that task lands (coding plan = flat subscription, so no rate card needed after it) | User answer + kimi-code folder size |
| 8 | USER: include Cursor FALLBACK_MODELS and agy model-id tables in this PR | AskUserQuestion 2026-11-22 |
| 9 | Blocking B1 (persisted catalogs already contain static rows): version the persisted record, ignore pre-version records. Technical, no user decision | plan-review.md |
| 10 | Gate 2 round 2: REVISE with 3 Serious plan edits; applied by orchestrator as Revision 2 (S-A spec files to B5/B6, S-B sequential gates, S-C native pass-through) | plan-review-2.md |
| 11 | S-C: native child spawn passes the model through when the Claude catalog is empty (runtime validates); refusing all native spawns on a fetch failure would be a regression and pass-through is not a repo literal | plan-review-2.md, user rule |
| 12 | USER APPROVED Gate 2 (plan incl. Revision 1+2 and removals in parity-inventory.md) | user message 2026-11-22 'approved' |
| 13 | B1.1+B1.2 committed together: both edit providers/index.ts. dashboard-budgets.spec.ts fails 2 tests identically on clean main (pre-existing, unrelated; RangeError stack-depth test) | b1-gate.log, budgets-main.log |
| 14 | B2.1-B2.3 committed as one commit (one plan batch; sub-batch files interleave in provider-models.service.ts). 4 out-of-set spec fixtures added to B2 by coordinator | b2-gate.log |
| 15 | rpc-handlers spec-only typecheck (tsconfig.spec) has 9 errors from the B1/B2 isStatic/ProviderModelList contract; the nx typecheck target (lib) is green. B4a owns those specs and must clear them | batch-B4b-report.md |
| 16 | B4a: kept additive auth-providers barrel exports (ModelListError, classifyModelListFailure, ProviderModelList). Coordinator replaced an orphaned degradation-audit marker in chat-session.service.ts:1535 with a plain comment (the catch is not a flagged site) | b4a-da.log |
| 17 | USER 2026-11-22: let CI carry broader verification; finish with a live Electron dev-server test (no console errors, app works). Local checks reduced to focused tests on changed projects | user message |
| 18 | Live Electron test 2026-11-22 (scratch PTAH_SESSIONS_DB_PATH; the user's dev sessions DB is at schema 10 from another branch): 15 providers live or correct unavailable, no main/renderer errors. Final fixes re-review APPROVED | live-check-2.log, code-logic-review-final-2.md |
| 19 | CodeRabbit round 2 (7 findings) fixed; no separate subagent re-review: scope is 7 local fixes with pinning specs, lint/typecheck 10/10 + audit green, and CodeRabbit re-reviews the push. Cross-restart invalidation deferred | coderabbit-round-2.md |
