# Batch 9 implementation report

## Changed files

- `libs/frontend/onboarding/src/lib/onboarding.routes.ts` and `onboarding.routes.spec.ts` register and exercise the `analyze/generate` route.
- `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts` and `agent-generation-run.page.spec.ts` implement and test the agent-generation run view.
- `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts` and `setup-run.store.spec.ts` schedule and test the background guidance hand-off.

Template change: yes. The coordinator owns the renderer template typecheck.

## Acceptance

| Requirement | Implementation and verification |
| --- | --- |
| D7 route | `onboarding.routes.ts:81` mounts `AgentGenerationRunPage`. `onboarding.routes.spec.ts:66` covers the retired selection redirect and the new run route with its query identity. |
| Seen on open | `agent-generation-run.page.ts:340` attaches the view and releases it on close. `setup-run.store.ts:363` implements attach through `markSeen`. |
| Running and stopping | `agent-generation-run.page.ts:88` renders a named transcript log. The stream is filtered by workspace, record and attempt at line 297. `agent-generation-run.page.spec.ts:184` checks live updates, isolation and the Stop action. |
| Failed counts and retry | `agent-generation-run.page.ts:122` renders counts and errors. Line 426 submits the existing bound `wizard:retry-item` RPC for each failed item. `agent-generation-run.page.spec.ts:222` covers counts, serial requests and completion after retry. |
| Interrupted and needs input | `agent-generation-run.page.ts:156` exposes Resume and the preview-required state. Resume uses the store's bound checkpoint retry at line 391 and `setup-run-attempt.ts:418`. `agent-generation-run.page.spec.ts:262` and line 270 cover these states. |
| Completed | `agent-generation-run.page.ts:361` opens the store's Done target with the run and analysis identities. `agent-generation-run.page.spec.ts:282` verifies navigation from a live record. |
| Background guidance starts once | `setup-run.store.ts:1179` schedules at the transition to completed. `setup-run.store.spec.ts:1222` checks the timer starts a guidance child after the view closes. Line 1259 checks duplicate terminal pushes, reports and refresh. |
| Accessible, on-pattern UI | `agent-generation-run.page.ts:56` provides a page heading, a polite status announcement, and a named keyboard-focusable log. The page reuses the Project Guidance layout, existing generation controls and Ptah button, color and spacing styles. |

## Checks

- Onboarding Jest passed. 2 suites and 9 tests.
- Setup-wizard Jest passed. 1 suite and 109 tests.
- TypeScript passed for the onboarding and setup-wizard libraries using the requested focused `tsc` commands. Scoped `ptah_get_diagnostics` timed out twice.
- ESLint passed with 0 errors and 15 warnings on existing setup-run code (14 non-null assertions and the file length warning).
- Degradation audit reported `TOTAL 0 unsuppressed site(s)`.
- The router spec exercised URL resolution and an Angular TestBed fixture rendered the page DOM. Electron screenshot review is pending because there was no running Electron renderer for this worktree. The repository reserves visual review for Electron and this batch does not start a build or dev target.

Logs are in `.ptah/tmp/b9-*.log`. The CLI did not expose a skill loader. The lane read and applied the repository’s `.claude/skills/angular-frontend-patterns/SKILL.md`.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Schedule when the root store records agent completion, resolving the hand-off lazily. | Root store transition or page/workflow binding. | Backend pushes and polling reach the root store after the view closes. The guidance hand-off depends on the same run store to create its child. | Yes |
| Scope the workflow view to the route. | Page provider or shared root view. | The Project Guidance page uses its own binding and the shared event adapter remains installed for background updates. The page provider can release its lookup when the run or route changes. | Yes |
| Retry failed items in order and use the final checkpoint to decide completion. | Serial item requests or parallel item requests. | The host has one generation slot and each item RPC returns after settlement. The checkpoint retains outcomes for the full selection. | Yes |

## Clarifications Needed

None.

## Revise round 1

Template change: yes. The revised templates add the hand-off controls to Done and the preview link to the generation page. The coordinator owns the renderer template check.

| Review defect | Fix | Regression test |
| --- | --- | --- |
| Countdown and Skip were unreachable | `analyze-done.page.ts:65` hosts the record-specific countdown, Start now and Skip. It keeps Skip available while a hand-off is queued. `generation-handoff.store.ts:110` cancels the selected pending start. | `analyze-done.page.spec.ts:117` — “shows the agent hand-off countdown on Done and skips the identified run”. `generation-handoff.store.spec.ts:212` — “cancels the pending start when skipped and rejects repeat scheduling”. `setup-run.store.spec.ts:1342` — “schedules and starts guidance on verified completion after the view closes”. |
| Reload discarded the hand-off | `setup-run-persistence.ts:35` stores the original deadline or settled scheduling decision. `setup-run.store.ts:694` restores eligible records when their workspace activates, skips parents with a guidance child, and keeps saved Skip. | `setup-run.store.spec.ts:1249` — “restores the remaining countdown after reload and starts guidance once”. Line 1278 — “does not restart guidance when the restored parent already has a child”. Line 1296 — “persists Skip and never re-arms that agent on reload”. |
| A second completion cancelled the first | `generation-handoff.store.ts:93` keys pending entries by parent id. Line 194 selects the next deadline in the active workspace. Competing chains in the same workspace wait until the live guidance run settles. | `setup-run.store.spec.ts:1309` — “keeps both hand-offs when two agents finish inside the same countdown window”. |
| Preview required had no way back | `agent-generation-run.page.ts:174` links to the entry target from `setup-run.store.ts:283`. The route and query preserve the run and analysis identities. | `agent-generation-run.page.spec.ts:267` — “links the preview-required state to the run entry with its analysis identity”. |

### Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Host the countdown on Done. | Done page or hold the run page open. | `implementation-plan.md:379` specifies Done followed by the hand-off. The page uses the existing `AgentNextStepsComponent` controls, while the root store owns deadlines. | Yes |
| Store the deadline and settled decision on the existing run index. | Optional per-record data or a second storage key. | `setup-run-persistence.ts:35` keeps the state with the parent. Activation can recover the remaining seconds and check for a child before scheduling. Legacy completions with neither state nor a child get a new five-second window. | Yes |
| Use one timer for record-keyed pending hand-offs. | Shared timer or timeout per pending record. | `generation-handoff.store.ts:194` keeps each deadline and starts work in the active workspace. It preserves the existing one-live-guidance-run rule while queued parents wait. | Yes |
| Route preview-required records through the store’s entry target. | Workflow entry or re-entry target. | `setup-run-steps.ts:103` maps the agent-generation entry to Review skills. The re-entry target would reopen the preview-required status page. | Yes |

### Checks

- Onboarding Jest passed with 3 suites and 11 tests. Setup-wizard Jest passed with 3 suites and 171 tests.
- Both library TypeScript checks passed on the final run. The first onboarding check reported an error in the concurrent Home work, which cleared on rerun.
- ESLint reported 0 errors and 15 existing warnings in the setup-run store and spec.
- The degradation audit reported `TOTAL 0 unsuppressed site(s)`.
- Scoped Ptah diagnostics timed out. The focused library TypeScript checks completed.
- Angular TestBed rendered the countdown and Skip and checked the preview link. Electron screenshot review is pending because there was no running Electron renderer.

Logs are in `.ptah/tmp/b9r1-*.log`.

## Revise round 2

| Defect | Fix | Regression tests |
| --- | --- | --- |
| 6. Legacy completions could auto-start guidance after reload | `setup-run.store.ts:694` restores only persisted numeric deadlines. An existing guidance child consumes the pending hand-off. A completion with no deadline and no child remains eligible for manual Continue. | `setup-run.store.spec.ts:1278` — “leaves a legacy completion without a deadline for manual guidance”. Line 1291 — “consumes a restored deadline when the parent already has a guidance child”. Line 1315 — “schedules a restored deadline without a guidance child exactly once”. |
| 7. Done rebound on record patches and left routed runs unseen | `analyze-done.page.ts:162` validates the routed tab against the active workspace. Line 194 marks the routed ID seen. Line 199 keys the bind effect by the agent and backend run IDs and reads the record untracked. | `analyze-done.page.spec.ts:153` — “keeps the agent workflow bound across hand-off patches and rebinds when the backend run changes”. Line 172 — “marks the routed tab seen only in its active workspace”. |
| 8. Queuing guidance removed Next steps | `analyze-done.page.ts:68` keeps the same Next steps component mounted across the queue transition and renders the live queue notice and record-specific Skip beside it. | `analyze-done.page.spec.ts:195` — “keeps next steps mounted when guidance queues and offers Skip”. |

Template change **yes**. The Done template keeps Next steps mounted while guidance queues. Angular TestBed exercises the rendered queue transition and Skip control. The coordinator owns the renderer template check. Electron screenshot review is pending because this workspace had no running Electron renderer.

### Decisions

Done uses the existing Next steps inputs and shows the queue status beside the component. During the queue, the component exposes Continue and the hand-off store enforces the existing queue order. This page-only change is reversible and fits the round 2 write set.

### Checks

- Setup-wizard Jest passed with 1 suite and 115 tests.
- Onboarding Jest passed with 2 suites and 11 tests covering Done and the agent-generation run page.
- Both library checks with `tsc --noEmit` passed.
- ESLint reported 0 errors and 15 existing warnings in the setup-run store and spec.
- The degradation audit reported `TOTAL 0 unsuppressed site(s)`.
- Scoped Ptah diagnostics timed out on the initial call and retry. Both focused library TypeScript checks completed.

Logs are in `.ptah/tmp/b9r2-*.log`.
