# PR 1488 review triage (head 45a36b3fa)

Source: 17 unresolved CodeRabbit threads. PtahCode review comments on 755736c and 503d004 report 0 verified findings.
Classes: CONFIRMED (corrected in the next commit unless marked DEFER), DISPUTED, DEFER.


0. PRRT_kwDOPngTds666Aza tasks-rpc.handlers.ts:683 (registerGetDigest ~l.676): CONFIRMED (minor).
   `tasks:getDigest` never calls `this.index.ensureStarted(root)`; `tasks:get` does (l.666). The addendum plan
   `implementation-plan-task-digest.md:295` says the handler does Zod, resolveRoot, ensureStarted. Reader
   depends on tasks:changed (session-task-reader.ts:218). Fix: inside the try, before `getDigest`:
   `await this.index.ensureStarted(root);`. Test: tasks-rpc.handlers.spec.ts (describe 'tasks:getDigest' l.384):
   assert ensureStarted called with root.
1. PRRT_kwDOPngTds666Azm task-digest-rules.ts (outdated flag, still present) classifyTaskDocument l.~44:
   CONFIRMED (minor). `/^research-report.*\.md$/` returns 'design' before REVIEW_FILE_PATTERN, so
   `research-report-review.md` is design. `implementation-report-review.md` matches REPORT_SUFFIX/REPORT_TAG
   ('report' followed by `-review`... lookahead `-[a-z0-9-]`) -> 'reports' before the review check at l.46.
   Fix: move `if (REVIEW_FILE_PATTERN.test(name)) return 'reviews';` above the research-report and report lines
   (after handoff). Risk: REVIEW_FILE_PATTERN must not match plain `research-report.md` (verify in spec).
   Test: task-digest-rules.spec.ts (classify cases).
2. PRRT_kwDOPngTds666Azu task-digest-rules.ts:212 extractTaskDecisions: DISPUTED. Fixture
   __fixtures__/decisions.md row 1 "User (pending confirmation)" is a deliberate negative: the spec
   (task-digest-rules.spec.ts:186) expects pendingUser 3 with a 4th row added (rows 2,3,4), and plan
   implementation-plan-task-digest.md:121-122 pins the rule `/^(?:pending|awaiting)\b/i`. In this repo's
   decisions.md, "User" in the last-but-one column means decided by the user, so it is not pending.
3. PRRT_kwDOPngTds666Az2 inspector-cache-tile.component.ts:104 vs inspector-agents-section.component.ts:427:
   CONFIRMED (minor). Tile warns at remainingPercent <= 20 of ttl (5m/1h); agent row warns at ms <= 60_000.
   Fix: one rule. Smallest: in agents-section l.427 use `ms <= (cache.ttl === '1h' ? 3_600_000 : 300_000) * 0.2`
   (and keep expired state separate: ms<=0 -> 'Cache expired'). Test: inspector-agents-section.component.spec.ts (~l.876, cache tests).
4. PRRT_kwDOPngTds666A0A inspector-session-stats.component.ts:~403 metric(): CONFIRMED (minor).
   `unreported` is 'partial' only when reported.length < laneAmounts.length or total.sdk === null; a partial SDK
   snapshot (coverage 'partial', total.coverage 'partial', "≥") with all lanes reported gives 'none', so the meter
   has no hatch while the value shows "≥". Fix: `const unreported = total.value === null ? 'missing' : total.coverage === 'full' ? 'none' : 'partial';`
   (total.coverage is 'full'|'partial'|'missing' at session-usage-totals.ts:31, derived from lowerBound).
   Test: inspector-session-stats spec in chat-ui molecules/session/inspector-stats.
5. PRRT_kwDOPngTds666A0J session-model-breakdown.component.ts:~268 costBasis: DISPUTED. Catalog pricing
   produces costBasis 'estimated' (libs/shared/src/lib/utils/pricing.utils.ts:440-443, 489) which the code labels
   "Estimated"; 'reported' only comes from providerReportedCost (pricing.utils.ts:394) or an absent legacy basis
   (rpc-session.types.ts:516-519 says absent = existing Claude behaviour = SDK-reported total_cost_usd).
6. PRRT_kwDOPngTds666A0W session-usage-totals.ts:~100 sdkContribution tokens: tokenCount optional
   (rpc-session.types.ts:415) while `tokens` has four disjoint classes (l.407-412, "Sum of all four").
   CONFIRMED-lowprio (minor): when tokenCount is undefined the code calls amount(undefined,...) -> unknown. Trust-the-data
   allows deriving from the four reported classes (it is data, not an estimate) but only when all four are finite >=0.
   Fix: `const tokenTotal = validUsage(snapshot.tokenCount) ? snapshot.tokenCount : sumFour(snapshot.tokens)` where
   sumFour returns the sum only if all four are valid, else undefined. Test: session-usage-totals.spec.ts.
   (Not verified whether any producer omits tokenCount; if none does, class as DEFER/low value.)
7. PRRT_kwDOPngTds666A0h session-usage-totals.ts:145 FOUR_CLASS_CLI_PROVIDERS empty (l.~58): CONFIRMED (Major) for the
   backend fact: ptah CLI usage builder (libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:826-880,
   turnUsage) reports inputTokens WITHOUT cache reads/writes plus separate cacheReadTokens/cacheWriteTokens
   (note l.853-854 adds cache into per-model delta inputTokens only for turnModelDeltas, not the segment usage).
   cliTokens (session-usage-totals.ts:~121-145) then sums only input+output and shows an exact total. UNVERIFIED:
   which string run.provider carries for a ptah CLI lane (`lane.providerId` at inspector-agent-rows.ts:55 is the
   ptah CLI agent's providerId e.g. 'openrouter', NOT a constant 'ptah-cli', so a set keyed by one id would not
   work; the lane `cli` field (lane.cli) is likely 'ptah-cli' and would be the right key). Safest correction: in
   projectCliLane pass `provider: lane.cli === 'ptah-cli' ? 'ptah-cli' : lane.providerId` (verify lane.cli value
   in libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:567 area) and add 'ptah-cli' to the set; or if
   unsure make cliTokens mark lower bound when cacheReadTokens/cacheWriteTokens > 0 for providers not in the set.
   Test: session-usage-totals.spec.ts + inspector-agent-rows.spec.ts. Codex must stay out (inputTokens include cache).
8. PRRT_kwDOPngTds666A0o session-usage-totals.ts:~201 sessionTotal SDK_LOAD_PENDING lowerBound: DISPUTED.
   With SDK not loaded and CLI lanes complete, "≥ cli sum" is true (a known contribution is missing, the value is a
   lower bound, not invented). Decision 22 lists detected gaps as lower bound causes; an unloaded SDK is a detected gap.
   Showing unknown instead would hide known CLI data.
9. PRRT_kwDOPngTds666A0x inspector-agent-rows.ts:112-118 `retained` linkedSignal resets on session change: DEFER.
   Real: retained keeps removed lanes only while sessionId unchanged (previous.source.sessionId === sessionId), so a lane
   evicted (agent-monitor.store MAX_COMPLETED_AGENTS) while another session is selected leaves the total with no gap.
   Decision 22 (decisions.md row 22) accepts rare unmarked inaccuracy and defers a backend usage ledger. Safe defer;
   a per-session map in a store is the heavy lift.
10. PRRT_kwDOPngTds666A03 (outdated) orchestrator-usage.ts subtractSubagents (libs/frontend/chat-ui/src/lib/molecules/session/orchestrator-usage.ts:35-63):
   DISPUTED. Behaviour is exactly decision 22: "Orchestrator = SDK snapshot minus SDK subagent rows with ~; muted dash only when negative,
   snapshot absent, or a subagent row has no usage ... user accepts that in rare cases a number can be wrong without a mark.
   This overrides Gate 2 recheck findings R2 and R3 (strict proof)."
11. PRRT_kwDOPngTds666A0- inspector-agent-rows.ts:251 (rows computed, usage object ~l.244-251): CONFIRMED (minor).
   The orchestrator row usage omits `costNotPriced`; producers are session-inspector.store.ts:156 (card) and consumers
   inspector-agent-list.ts:101, inspector-agent-row.component.ts:134,238. Fix: in the usage object add
   `costNotPriced: usage.cost.value === null && usage.cost.causes.includes(NOT_PRICED)` (NOT_PRICED imported as in
   inspector-agent-list.ts:14; sdkCostCause returns NOT_PRICED for rate-missing, session-usage-totals.ts:~72) or
   `card.costNotPriced === true && usage.cost.value === null`. Test: inspector-agent-rows.spec.ts.
12. PRRT_kwDOPngTds666A1F inspector-agents-section.component.ts:539: CONFIRMED (minor). pendingSteerId is one signal
   (l.366); onSteer(A) then onSteer(B): A's finally sets null while B in flight. Fix: `if (this.pendingSteerId() === key) this.pendingSteerId.set(null);`
   Test: inspector-agents-section.component.spec.ts (two overlapping steers with deferred tray.steer).
13. PRRT_kwDOPngTds666A1N session-inspector.component.html:205-207 (`[cache]="s?.cache ?? null"`, contextUsed, compactionCount from raw stats()):
   CONFIRMED (minor, transient during session switch). rosterMatches only gates rows/turns in sessionModel
   (session-inspector.component.ts:293). Fix: add `protected readonly rosterStats = computed(() => { const s = this.stats(); const m = this.model(); return s && (!s.sessionId || !m.sessionId || s.sessionId === m.sessionId) ? s : null; })`
   and bind the three inputs to rosterStats() (reuse in sessionModel). Test: session-inspector.component.spec.ts.
14. PRRT_kwDOPngTds666A1d session-inspector.component.ts:~441-449 answerFromHeader: CONFIRMED but very low value (focus only,
   no action sent; the window is one render tick). Index captured from row.requests before afterNextRender; the button has no
   request id attribute (inspector-request-panel.component.ts:283 `data-request-button`). Fix: add
   `[attr.data-request-id]="request.requestId"` on that button (confirm loop var name at l.~283) and in the callback find by
   `dataset['requestId'] === requestId`. Could be class DEFER if the lead wants zero risk. Test: session-inspector.component.spec.ts:517-525.

15. PRRT_kwDOPngTds666A1q session-task-reader.ts:337: DISPUTED (coordinator). The stale branch sets the
   reason `stale` ("The linked task changed."), a designed message from batch D2. It does not publish
   task A's failure as task B's state; `destroyed` returns with no write.
16. PRRT_kwDOPngTds666A1z session-task-reader.ts:380: DISPUTED (coordinator). `openableTaskId` checks the digest
   `openable` flag before each open and preview, and the TASK section builds its chips only from openable
   documents (`groupTaskDocuments`). The hidden non-openable documents are follow-up M1 in the PR body.

## Coordinator decisions

- Corrected: 0, 1, 3, 4, 7, 11, 12, 13.
- DEFER: 6 (no producer is known to omit `tokenCount`), 9 (needs the backend usage ledger, decisions row 22),
  14 (focus only, one render tick).
- DISPUTED: 2, 5, 8, 10, 15, 16.

## Round 2 (CodeRabbit on head 6357407c3, 11 new threads + 1 follow-up)

- CORRECTED: PRRT_kwDOPngTds66-yIL (table after a fenced block), -yIR (summary bullets counted as findings),
  -yIX (`Unresolved:` dropped), -yIl (question source not read gives no partial mark), -yIs (legend merged
  counts of different lanes), -yJU (capped progress shown as exact), -yJY (menu items in the Tab sequence),
  -yJi (folder totals with the entry cap), -yJs (fallback documents not listed again on Retry).
- DISPUTED: -yI3 (SDK subtotal hidden for fewer than two models: deliberate visual correction, lane-report-V1 V2),
  -yJA (`costPartial` is true for each lane with segment usage; decisions row 22 keeps a restored lane unmarked).
- DEFERRED: PRRT_kwDOPngTds666A1q follow-up (a late stale error of task A can show below the same file name
  of task B; the designed `stale` message is pinned by a spec; needs an owner decision).

## Round 2 follow-up (head 98e0743b0)

No third CodeRabbit round. All 12 round-2 replies are on the threads. CodeRabbit withdrew the
findings on `PRRT_kwDOPngTds66-yI3` and `PRRT_kwDOPngTds66-yJA`. Four of our replies got the
CodeRabbit chat rate limit (not processed by the bot; the replies are posted).

| Thread | Finding | Class | Proof / action |
| --- | --- | --- | --- |
| `PRRT_kwDOPngTds66-yIX` | `\bResolved:` matches inside the question text | CORRECTED | Proven: `- What should the label "Resolved:" display?` was not counted. `RESOLVED_QUESTION` now accepts `Resolved:` only at the item start (optional checkbox, optional emphasis) or after a dash separator. One test added. |
