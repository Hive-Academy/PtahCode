# Batches — TASK_2026_2325_899d

Source: `implementation-plan.md` § "Proposed batch groups" (34 groups, revision 3) + "Revision 3
amendments" + "Coordinator amendment C1" (binding). One batch = one group. Write files and scoped
specs per group are in the plan table; this file adds the wave, executor and state.

Rules (D16/D17/D21/D22, CLAUDE.md):
- Executor order: complex = codex or antigravity; medium = kimi code
  (`pc-7594dcab-a859-41a0-8e8b-e8df5dba7d25`); simple = Ollama Code
  (`pc-f3384f72-a556-4ab4-b2b1-7e1e028f22cb`). Claude subagent only if no lane fits.
- At most 3 lanes in flight. Parallel lanes in one wave are file-disjoint (plan table).
- Lanes run only focused jest/tsc/eslint, never `npm run verify`/`nx`, never commit or push.
- Coordinator runs after each wave: `npm run verify -- --related -p <projects>` and
  `npm run verify -- -t lint,typecheck -p <projects>` (log to `.ptah/tmp/<name>.log`), never while a
  lane edits that project. Coordinator commits per wave.
- Code review per phase by a different family than the implementer (code-logic-review.md).

Phases: P1 backend = W1-W8 (+ `G-Skills-Ranking-Delete`); P2 frontend = W9-W13.

| Wave | Group | Executor | Projects | State |
| --- | --- | --- | --- | --- |
| W1 | G-Shared-RPC | codex (eb314d41) | shared | done 893b035e1 |
| W2 | G-Shared-SkillDoc | kimi (9f38345e) | shared | done |
| W2 | G-AgentSdk-Port | Ollama Code (dd33e723) | agent-sdk, cron-scheduler | done |
| W2 | G-Storage-Core | antigravity (71f33f98) | platform-core, settings-core | done |
| W2 | G-Lane-Routing-Dispatch | codex (37988eda) | lane-routing | done |
| W2 | G-Wizard-Client | Ollama Code (17314d6a) | setup-wizard | done |
| W2 | G-Fixtures | Ollama Code (de3d0e2f) | webview-e2e-harness | done |
| W3 | G-AgentSdk-Stream | codex (a5bcd013) | agent-sdk | done bf1f6b70a |
| W3 | G-Storage-Adapters | kimi (ac488cde) | platform-electron, platform-cli | done fcc4a1df2 |
| W3 | G-Setup-Scope-Resolver | antigravity (90074954) | settings-core, auth-providers | done de921863c |
| W3 | G-Lane-Routing-SkillCaller | codex (2ede7c29) | lane-routing | done 08963872c |
| W4 | G-AgentSdk-Dispatch | codex (e0a272f7) | agent-sdk | done 783341841 |
| W4 | G-Analysis-Service | antigravity (c2a20fe1) | agent-generation | done ac0d955d6 |
| W4 | G-Generation-Service | antigravity (1a43c85b) | agent-generation | done 8e1ccc746 |
| W4 | G-Guidance-Backend | kimi (a22924d5) | agent-generation, rpc-handlers | done 87df960d2 |
| W5 | G-Runner-And-Extract | codex (af33b7f3) | rpc-handlers | done d4dd3de83 |
| W5 | G-Generation-Handlers | kimi (ba823fd9) | rpc-handlers | done 4281d6a04 |
| W6 | G-Skills-Judge | codex (6ea3dd3f) | rpc-handlers | done 7aa55f4d3 |
| W6 | G-Skills-Draft-And-Fs | kimi (7cec3540, limit) -> codex (5aa607c5) | rpc-handlers | done e391b7775 |
| W7 | G-Skills-Rec-And-DI | antigravity (e4b397b8) -> codex revise 1 (de8516ba) | rpc-handlers | done 1b1d2faf0 (revise 1 fixed fake-time vs real scratch-dir I/O race) |
| W7 | fix preview-fidelity spec (D27) | Ollama Code (ecaba1e0) | rpc-handlers | done 634730f84 |
| W8 | G-Setup-RPC-Integration | codex (595cf3a8) | rpc-handlers, ptah-electron | done 472c8daee (+ smoke stub, D30) |
| W9 | G-Skills-Ranking-Delete | Ollama Code (3ec095ea) | rpc-handlers | done e02b089d6 |
| W9 | G-Settings-Core-Types-Nav | Ollama Code (14825229) | core | done 8e430843f |
| W9 | G-Onb-Store-Coverage | antigravity (944c83c7, resumed fbee6c55) | onboarding | done b498dc8e4 |
| W9 | G-Onb-Judge-Parts | Ollama Code (7f629f62) | onboarding | done 8bfdc0e4a |
| W9 | G-Onb-Build-Draft | codex (500ff571, resumed 0c9e532a) | onboarding | done 8bfdc0e4a |
| W9 | G-Onb-Shell-Pill | Ollama Code (a40e928b, resumed ce0d11a0) | onboarding | done b498dc8e4 |
| W10 | G-Settings-Core-Commit-State | codex (0dde2b9b) | core | done 8e430843f |
| W10 | G-Onb-Cards-Unmatched | claude ambient (c5ee3530) | onboarding | done b498dc8e4 |
| W10 | G-Onb-Rail | antigravity (a963aec3) | onboarding | done b498dc8e4 |
| W11 | G-Settings-UI | codex (d57e290c) | chat | done 033317aa1 |
| W11 | G-Onb-Review | codex (a03e5706) | onboarding | done bbeb099fc |
| W12 | G-Onb-Pages | antigravity (837b3775) | onboarding | done 360d6237d |
| W13 | G-Onb-Consent-Parity | antigravity (8db8e08d) | onboarding | done c8a0b31f2 |

Notes:
- W4 runs `G-Analysis-Service` and `G-Generation-Service` (both agent-generation, disjoint files) in
  parallel only if the plan table confirms no shared file; otherwise in sequence.
- W2 has 6 groups: run at most 3 lanes at a time (complex first).
- After W8: P1 code review (different family: kimi reviews codex/antigravity work), gate
  `npm run verify -- -p <P1 projects>`.
- After W13: P2 review, `typecheck-templates`, visual review in Electron (dark + light), gate.
- Lane tokens per batch: record from each completion; write "unavailable" when unknown.
- Downstream typecheck of rpc-handlers and webview-e2e-harness is expected to fail after W1 until
  W8 (`G-Setup-RPC-Integration`) and `G-Fixtures` land (required `judge`/`analysisPair`, new
  methods in the host manifest invariant). Per-wave checks are scoped to the projects of that wave.
- Commit only when no lane is running in this worktree (lint-staged hides unstaged files during
  the pre-commit hook; a lane edit in that window can be lost).
- Merge risk: branch fix/route-decide-predictability (TASK_2026_2326_5d16) also edits
  lane-routing `pipeline/model-refine.ts` and `model-call.ts`. Rebase after whichever PR merges first.
- Env: the G-AgentSdk-Port lane created the git-ignored `node_modules` symlink in this worktree
  (-> main checkout node_modules), like sibling worktrees.
- Expected interim break: auth-providers `workspace-llm-resolver.ts:50` implements the port without
  `resolveSetup` until G-Setup-Scope-Resolver (W3).
- Carry into G-AgentSdk-Dispatch and G-Runner-And-Extract briefs: `terminal` is optional; a stream
  that ends without an SDK result returns `{ structuredOutput: null }` with no `terminal`. Success
  attribution requires `terminal?.kind === 'success'`.
- Carry into G-Runner-And-Extract / G-Skills-Judge briefs (from G-AgentSdk-Dispatch): use the typed
  `InternalQueryQueueTimeoutError` for `queue-timed-out`. When an outer timer wins, a missing
  `pairAttempted` alone cannot separate slot wait from SDK preparation: classify it as `timed-out`
  with no `pairAttempted`, not as `queue-timed-out`. Strict Setup model identity check stays in
  `buildSetupProfile` (plan line 96); the SDK keeps alias resolution for general callers.
- Name: the plan's `onProviderDispatch` is implemented as `onProviderSubmit(submitted: ModelPair)`
  (InternalQueryConfig and OneShotRunInput), same name as lane-routing. Use this name in later briefs.
- 2026-11-25 11:38Z: PR #1511 merged (ac25cf011). Next idle point: commit all reviewed groups,
  `git fetch origin && git merge origin/main` (D23), resolve lane-routing conflicts, run lane-routing
  lint/typecheck/related, then start G-Lane-Routing-SkillCaller on the merged base.
- Routing task close-out (TASK_2026_2326_5d16): its session's ptah_task_close_out was refused
  ("Task must be valid and done"). Run it when the host shows that task as done.
- kimi AT LIMIT (reset unknown, context.md). Reassign the remaining kimi groups: backend
  (G-Lane-Routing-SkillCaller) -> codex; frontend medium groups (Settings-Core-Types-Nav,
  Onb-Judge-Parts, Onb-Build-Draft, Onb-Cards-Unmatched, Onb-Rail, Settings-UI, Onb-Review)
  -> antigravity or codex, Ollama Code for the small ones. Re-check kimi at the P2 start.
- 2026-11-25 11:57Z: 10 groups committed (bf1f6b70a..e391b7775). Merge of origin/main in progress;
  codex lane f67f38e3 resolves 4 lane-routing conflicts (D25).
- 2026-11-25 12:04Z: merge committed beac0b1b8 (4 lane-routing files by codex f67f38e3, 2 agent-sdk
  files `onProviderSubmit` + `includeConnectors` kept both). lane-routing and agent-sdk lint,
  typecheck and related passed. G-Lane-Routing-SkillCaller started (codex 2ede7c29).
- 2026-11-25 13:16Z: P1 review lanes (claude, ambient account): A 6846fb05, B 07500e0e, C 8c178573.
  rpc-handlers related tests now all pass (no interim TS errors left).
- 2026-11-25 13:22Z: P1 review REVISE (A/B/C 7/10). Fix round 1: F1 36c4d630, F2 af4f2c1d, F4 682bbe11;
  F3 pending slot. P2 note: C5 equal Build slugs need a renderer check before Create.
- 2026-11-25 13:36Z: fix round 1 committed (13fcde258, a441db2ad, ac0edd9d7, a953fc030). Re-review
  A 543857c7, B 1bbd61d1, C ec24a40a. P1 gate running in background (log .ptah/tmp/p1-gate.log).
- 2026-11-25 13:43Z: P2 W9 started (D35): codex 500ff571 Build-Draft, antigravity 944c83c7 Store-Coverage, Ollama Code 14825229 Settings-Core-Types-Nav. Queued: Onb-Judge-Parts, Onb-Shell-Pill. P1 gate re-run in background.
- 2026-11-25 13:46Z: Settings-Core-Types-Nav delivered (lane: 156/156 core spec pass, tsc clean). Lane note: plan line 572 `appState.requestOpenSettings` does not exist; use `requestSettingsTab` + `setCurrentView` (carry into G-Onb-Pages brief). Judge-Parts started on Ollama Code 7f629f62 (kimi at limit).
- 2026-11-25 13:50Z: Judge-Parts delivered (lane: 14 tests, tsc/eslint clean). Carry: `SkillVerdictFilterValue` lives in skill-verdict-filter.component.ts (store imports it); wiring contracts in its report for G-Onb-Review. Note for all frontend briefs: `angular-frontend-patterns` is disabled for model invocation (skillOverrides); lanes follow neighbor components.
- 2026-11-25 14:02Z: host restart stopped codex 500ff571, antigravity 944c83c7, Ollama a40e928b and the P1 gate. Resumed by CLI session: 0c9e532a, fbee6c55, ce0d11a0. P1 gate re-run started again (log .ptah/tmp/p1-gate.log).
- 2026-11-25 14:04Z: Build-Draft delivered (lane: 12 tests, tsc, eslint pass). Contract for G-Onb-Review in its report. Settings-Core-Commit-State started early on codex 0dde2b9b (dep Types-Nav done; antigravity busy).
- 2026-11-25 14:05Z: Shell-Pill delivered (lane: 16 tests, tsc, eslint pass). Carry into G-Onb-Pages/Review: nothing calls `OnboardingRunPillService.recordRun({ analysisPair, stages })` yet; call it at run acceptance and `clear()` at run end. Cards-Unmatched started on claude ambient c5ee3530 (kimi at limit, Ollama session 88%); P2 review of its files must be by codex (different family).
- 2026-11-25 14:07Z: Commit-State API (codex 0dde2b9b report) for G-Settings-UI brief: ProvidersSettingsStateService.setupModel: Signal<ProvidersSettingsSection<ProvidersSetupRowState>>; setupUndoEntry: Signal<ProvidersSetupUndoEntry | null>; setupCommit: Signal<ProvidersSetupCommitState> (status idle/saving/saved/invalid/failed, message: string | null); refreshSetupModel(): Promise<void>; commitSetupPair(pair: ModelPair | null): Promise<boolean> (null clears); undoSetupPair(): Promise<boolean>. Setup reads via open()/refresh(); separate from generic `commit` signal.
- 2026-11-25 14:09Z: Cards-Unmatched delivered (lane: 13 tests, tsc, eslint pass). Carry into G-Onb-Review: cards take compact/reason/scriptNote (SkillShEntry has no script data; Review supplies scriptNote); unmatched list takes judgedItems/draftBlockedReason, output manualDraftRequested.
- 2026-11-25 14:10Z: D36: no new claude lanes (user relay, usage 90%). P2 review: antigravity reviews codex files, codex reviews the rest.
- 2026-11-25 14:12Z: Commit-State delivered (lane: jest, tsc, eslint pass). G-Settings-UI started on codex d57e290c. Core related + lint/typecheck running (logs .ptah/tmp/p2-core-*.log).
- 2026-11-25 14:14Z: core checks PASS: related tests (exit 0) and lint+typecheck (2/2 tasks). Core groups Types-Nav + Commit-State ready to commit at the next no-lane point.
- 2026-11-25 14:19Z: Store-Coverage delivered (lane: 23 tests, tsc, eslint pass; 1 max-lines warning). Full store API + Review/Pages wiring list in its report (lines 45-180) — G-Onb-Review and G-Onb-Pages briefs must point there. Rail started on antigravity a963aec3.
- 2026-11-25 14:21Z: P1 gate COMPLETE (14 projects): lint/typecheck 27/27 succeeded; test 23 tasks, 22 succeeded, 1 failed = rpc-handlers only the known non-task `plugin-rpc.handlers.session-notice.spec.ts` (1 test, /tmp/.claude + /tmp/.ptah on this machine, D27; 7115 passed, 3 skipped). ptah-electron test passed. P1 gate accepted.
- 2026-11-25 14:26Z: Settings-UI delivered (lane: 128 tests in 4 suites, tsc, eslint pass; 8 files incl. D37 agents-routing-settings). Chat related + lint/typecheck running (logs .ptah/tmp/p2-chat-*.log).
- 2026-11-25 14:31Z: W9-W11 checks: core related+lint/typecheck PASS; chat related+lint/typecheck PASS; onboarding lint/typecheck PASS, related 158/159 -> D38 spec fix, re-run of that spec 19/19. Committed 8e430843f (core), 033317aa1 (chat), 8bfdc0e4a + b498dc8e4 (onboarding, scope webview: no onboarding scope). G-Onb-Review started on codex a03e5706.
- 2026-11-25 14:35Z: G-Onb-Pages contract (codex a03e5706 report): `<ptah-stack-skill-review [store]="state" [runId]="analysis.loaded()?.manifest?.runId ?? ''">`; (draftPreviewRequested) -> { params: WizardGenerateSkillDraftParams, revision, previewRequestSeq }: page calls wizard:generate-skill-draft and settles through the store (applyDraftPreviewResult/applyDraftPreviewError); (draftCreateRequested) -> { revision, submitted }: review already called beginCreateDraft, page calls harness:create-skill and settles completeCreateDraft/failCreateDraft; (itemSearchRequested) -> { itemId, query }: page fills store.setItemSearchResults. Keep selectionToggled and searchRequested bindings. Keep the review mounted while consent shows (F29 blocker visible).
- 2026-11-25 14:51Z: Review delivered (+D39 blank manual opener). onboarding related + lint/typecheck PASS; committed bbeb099fc. G-Onb-Pages started on antigravity 837b3775.
- 2026-11-25 14:52Z: P2 review slice A (non-codex committed files) started on codex b671d873 (brief review-brief-p2.md, out code-logic-review-p2-A.md). Slice B (codex files: Build-Draft, Commit-State, Settings-UI, Review, store D39) -> antigravity after Pages. Slice C (Pages, antigravity) -> codex.
- 2026-11-25 15:00Z: D40 slice A REVISE 5/10 -> fix round 1: Pages lane (queued msg), codex 19268c53 F-A1, codex ebb2e01e F-A2. Re-review by antigravity.
- 2026-11-25 15:07Z: F-A2 delivered (codex ebb2e01e): rail bar keeps a selected list with remove; strip measures the real overflow control; jest, tsc, eslint pass; 7 files, uncommitted.
- 2026-11-25 15:09Z: F-A1 delivered (codex 19268c53: 57 tests, tsc, eslint pass; D40 contract RecommendationApplyResult in stack-coverage.ts). Review slice B1 (core/chat codex files) antigravity 85843f7b; slice B2 (onboarding codex files + slice A fix re-review) antigravity 1937ffae. Uncommitted until Pages lane ends.
- 2026-11-25 15:22Z: Pages delivered (60 tests, tsc, eslint pass). Both queued D40 messages to 837b3775 FAILED (continuation_rejected), so the page part of finding 1 was not done. onboarding related + lint/typecheck PASS; committed 360d6237d (Pages) and c78286a46 (F-A1 + F-A2). Page part of finding 1 resumed on antigravity session f10b8fe1 (report batch-fix-p2-A1-page-report.md).
- 2026-11-25 15:24Z: D41 slice B1 REVISE 5/10 -> fix round 1 codex (see spawn); re-review antigravity.
- 2026-11-25 15:27Z: D42 slice B2 REVISE 6/10 (slice A fixes verified) -> fix round 1 codex; re-review antigravity.
- 2026-11-25 15:30Z: A1 page fix delivered (antigravity 33b58370: 38/38 page tests, 4 new). Uncommitted until fix lanes end. W13 Consent-Parity started on antigravity (tests role).
- 2026-11-25 15:31Z: all P2 groups done. Checks PASS (core+chat related, lint/typecheck 4/4; onboarding related, lint/typecheck 2/2). Committed 1d1a8f534 (B1 fix), 92e207ecf (A1 page fix), a67c16c66 (B2 fix), c8a0b31f2 (W13). Running: antigravity 70fb3ea0 re-review B1+B2 fixes; codex 1c70d3e9 review slice C (pages + A1 page fix + W13); typecheck-templates (log .ptah/tmp/p2-templates.log).
- 2026-11-25 15:34Z: typecheck-templates ptah-extension-webview PASS (exit 0).
- 2026-11-25 15:40Z: D43 user answers: launch Electron for visual review; no admin merge. B1/B2 re-review APPROVED 8/10 (antigravity 70fb3ea0). Visual review lane codex 98606082 (build-dev under verify lock, Playwright launchPtah, fixtures, dark+light, 1100/1440; out visual-review.md, shots .ptah/tmp/visual/shots). Slice C review codex 1c70d3e9 still running.
- 2026-11-25 15:45Z: D44 slice C REVISE 5/10 -> fix round 1 codex; re-review antigravity.
- 2026-11-25 15:58Z (successor coordinator): Fix C done -> commit 99c47c0c3 (onboarding related + lint/typecheck PASS). Slice C re-review RUNNING: antigravity b679ddc9 -> code-logic-review-p2-C-rereview.md. Visual review REVISE, 5 defects (D45). Visual fix round 1 RUNNING: codex 32ecc3be (defects 1,2,3,5; brief-fix-visual-1.md) -> batch-fix-visual-1-report.md. Defect 4 waits for the re-review end (analyze-workspace.page.ts).
- 2026-11-25 16:05Z: Slice C re-review APPROVED 7/10 (code-logic-review-p2-C-rereview.md), 2 Minor new findings in analyze-workspace.page.ts. Fix round 2 + visual defect 4 RUNNING: codex e0cef532 -> batch-fix-p2-C2-report.md (revise round 2 of 2).
- 2026-11-25 16:16Z: Visual fix round 1 (codex 32ecc3be) -> commit 90eb94ebc; slice C round 2 + defect 4 (codex e0cef532) -> commit 801de5a14. Checks: onboarding+chat related, lint/typecheck, typecheck-templates PASS. RUNNING: antigravity 93fc905a review -> code-logic-review-p2-D45.md; codex 5dc1f0d6 Electron re-check -> visual-review-round2.md; full gate (background) -> .ptah/tmp/full-gate.log.
- 2026-11-25 16:53Z: Host restart stopped 93fc905a and 5dc1f0d6 (no deliverables). Full gate exit 1: rpc-handlers session-notice (D27, known); core app-state.service.spec and chat providers-settings.component.spec failed with 5 s timeouts under memory pressure (165 MB free, swap full) -> both re-run alone PASS. Review resumed as antigravity c4c761de. Visual re-check waits for the review end (memory).
- 2026-11-25 17:00Z: D45 review (code-logic-review-p2-D45.md) APPROVED 7/10, 7/7 fixes confirmed, 2 Minor new findings. Revise cap reached -> ONE bounded correction by coordinator (claude): commit aa7fe624f (Continue not primary while blocked; clear write error when source is workspace). Onboarding related + lint/typecheck + typecheck-templates PASS. RUNNING: antigravity b0329f12 -> code-logic-review-p2-bounded.md; codex e8870ffb Electron re-check -> visual-review-round2.md. If the bounded review finds defects: report, do not fix (cap).
- 2026-11-25 17:12Z: Bounded review APPROVED 8/10 (no new findings). Electron re-check visual-review-round2.md APPROVED (9 PNGs, Start/Continue muted+disabled when blocked, gold when valid; Skills 4 cols, collapsed 0 px). Ready for docs commit + push.
- 2026-11-25 17:30Z: PR #1514 opened (head 662cf858d). CI: checks + webview-e2e FAIL (D46), all other jobs pass. RUNNING: codex 37481fe1 -> batch-fix-ci-audit-report.md; antigravity 4e1f182a -> batch-fix-ci-e2e-report.md.
- 2026-11-25 17:40Z: CI fixes delivered: e2e fixtures (antigravity 4e1f182a) + 11 audit markers (codex 37481fe1, audit TOTAL 0). lint/typecheck 5 projects PASS (9/9). RUNNING cross-family reviews: antigravity a788216a -> code-logic-review-ci-audit.md; codex 7aa32f37 -> code-logic-review-ci-e2e.md.
- 2026-11-25 17:55Z: Audit review (antigravity a788216a) APPROVED 8/10; Moderate note fixed by coordinator: logger.warn + reported marker in 3 resolver catches (audit TOTAL 0; auth-providers related + lint/typecheck PASS). E2e review (codex 7aa32f37) REVISE 6/10, 2 Moderate fixture findings -> fix lane antigravity b1597fa2 running.
- 2026-11-25 17:52Z: e2e round 2 fixes (antigravity b1597fa2): ui-driver Setup defaults (-w diff +152/-4, all branches set data) + set-setup-model validation. lint/typecheck harness + ptah-electron-e2e PASS. Codex re-review 2f50e5b2 running -> code-logic-review-ci-e2e-rereview.md.
- 2026-11-25 18:00Z: e2e re-review REVISE (Blocking: __uiRpcError read on every reply) -> coordinator scoped it to the Setup setter; re-review 2 APPROVED 9/10. Audit fixes committed d0343853c. Committing e2e fixes + docs, then push.
