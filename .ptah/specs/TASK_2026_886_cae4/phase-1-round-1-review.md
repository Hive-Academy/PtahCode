# Phase 1 fix round 1 — re-review
Review family: codex (implementer family: claude)

## Logic (L1-L3)
Verdict: APPROVED
Score: 8/10
- L1: RESOLVED — `libs/backend/task-end-hook/src/lib/steps/index-request.step.ts:251-264` starts the census before coalescing and leaves joiners deferred if start refuses; the shutdown spec checks both waiting rows at `steps/index-request.step.spec.ts:736-786`.
- L2: RESOLVED — `libs/backend/task-end-hook/src/lib/steps/index-request.step.ts:58-77` permits lexical fallback only for ENOENT/ENOTDIR; `:282-292` rejects an unverifiable main or registered root. The extracted disposal resolver also fails closed on other realpath errors at `dispose/candidate-path.resolver.ts:33-56`.
- L3: RESOLVED — `libs/backend/task-end-hook/src/lib/dispose/ignored-files.walker.ts:66-88` maps vanished listed files, directories, and nested entries to `error`; `dispose/disposal-input.collector.ts:365-370` records the failed probe, and `steps/dispose-evaluate.step.spec.ts:763-778` checks the blocked outcome.
### New defects
None

## Style (S1)
Verdict: APPROVED
Score: 8/10
- S1: RESOLVED — `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts:56-65` imports the extracted path, filesystem, ignored-file, and task-spec helpers; the collector now ends at `:809`. The helpers have focused implementations and specs in `dispose/candidate-path.resolver.ts:21`, `dispose/ignored-files.walker.ts:41`, and `dispose/task-spec.reader.ts:30`.
### New defects
None

## Decisions
- Accepted start-before-coalesce over rollback: `CensusCoordinator.start` synchronously refuses disposed or in-flight requests (`steps/census-coordinator.ts:134-145`), while completion first awaits the census port (`:222-236`). Reversible: yes.
- Accepted the existing `main-root-not-open` outcome for non-missing realpath failures: gate 0 cannot prove an open root (`steps/index-request.step.ts:282-292`). Reversible: yes.
- Treated a vanished ignored entry as an incomplete P7 probe, including a nested entry: `walkIgnored` catches every read failure and the end-to-end spec records `blocked/precondition-unverifiable`. Reversible: yes.
- Scope and verification: assessed only the four prior findings and their changed lines. Reviewed the fix diff, source, focused specs, and fix report. Scoped Ptah TypeScript diagnostics returned zero errors or warnings; the implementer's fix report records 467 passing tests. No Nx, npm, git, build, or test command was run here. Logic score 8 reflects these covered boundaries but no independent runtime test; style score 8 reflects the requested extraction despite the remaining 810-line orchestrator.
