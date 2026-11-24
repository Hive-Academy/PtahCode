# Decisions — TASK_2026_2321_rvusg

| # | Decision | Source / evidence |
|---|----------|-------------------|
| D1 | Type FEATURE, depth Partial (requirements and audit already in context.md) | Pre-flight classification; no Routing reminder, no ptah_route_decide tool |
| D2 | CLI lanes disabled, approval mode `user`; same-side document review (opposite side unavailable) | No ptah_agent_* tools in this session |
| D3 | Review spend rolls into account totals (analytics:spendSummary, plan-limit tiles) | User, Gate 1 Q1 |
| D4 | PR comment shows tokens only, no USD | User, Gate 1 Q2 |
| D5 | Partial usage from failed/stopped/timed-out lanes is recorded, marked partial | User, Gate 1 Q3 |
| D6 | No design phase / Gate 1.7: UI change adds fields to existing run detail and drawer, no new surface; before/after screenshots (dark+light) in Electron required at completion | Orchestration skill rule for non-redesign UI changes |
| D7 | Review spend counts in the spendSummary of the workspace that is the reviewed repo's checkout; stored but unattributed when none is open (req. 6.1, 6.5) | User, follow-up to Gate 1 Q1 |
| D8 | Plan-limit tiles unchanged: provider-reported, already include review usage (req. 6.6) | User, follow-up to Gate 1 Q1 |
| D9 | Gate 1 APPROVED by user. User authorized full-auto through PR: later document gates (Gate 2) pass on an APPROVED reviewer verdict without waiting; escalate only removals, user-reserved items, or REVISE after cap | User, 2026-11-23 |
| D10 | A lane failure after selection keeps today's `partial` stage outcome (req 1.4 forbids outcome changes); tests assert lane/model/family/partial usage on that state. Reqs 1.6/7.2 "failed" read as "terminal, lane recorded" | Architect plan + req 1.4; orchestrator decision under D9 (evidence step) |
| D11 | Usage is attributed to the checkout workspace at lane start; runs while no checkout was open, and rows written by older builds, stay uncounted | Matches D7 ("stored but uncounted when none is open"); orchestrator decision under D9 |
| D12 | Gate 2 passed under D9: plan re-review REVISE on one Serious batch-ordering item (N1), fixed by orchestrator in plan Revision 2 (gateway fakes move to B4); no design change, so no further re-review | Re-review in document-review-architecture.md |
| D13 | Executors take short sequential chains of same-layer batches (B2a→B2b; B3a→B3b→B7→B3c; B8) to cut spawns; orchestrator verifies and commits per chain with batch IDs in the commit body | Token economy; batches stay file-disjoint across chains |
| D14 | P1 review (APPROVED WITH FIXES): M2 fixed (namespace `beginSpawn` strips `usageWorkspaceRoot`, spec added). M1 needs no change: review gateway spawns Ptah CLI lanes via `manager.spawn({ ptahCliId })` → `doSpawnSdk` → `trackSdkHandle(..., request.usageWorkspaceRoot)` (agent-process-manager.service.ts:1610); `spawnFromSdkHandle` is only the untrusted namespace path and must not carry the key. M3b exact-folder-string test handed to B4; M3a (older build rejects `usage` under `.strict()`) accepted as rollback-only risk; m1-m3 deferred | code-logic-review-P1.md; orchestrator under D9 |
| D15 | P2 review: m2 fixed (gateway re-checks the signal after the usage folder lookup, so no lane spawns and no lookup warning is logged on abort). m3 fixed (lens marker removal runs only between begin and the lane save; the triage and verification try scopes already enforce this). m1 no change: plan req 3.4 says missing cache counters never set `tokensPartial`, and they are shown only when every run reports them. m4 note only: `saveStageLane` has no owner guard, but final totals stay correct after a lease takeover | code-logic-review-P2.md; orchestrator under D9 |
