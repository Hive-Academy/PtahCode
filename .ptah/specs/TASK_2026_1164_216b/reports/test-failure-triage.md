# Test failure triage — feat/usage-ledger-coverage

Verdicts use the first error for each spec in the ANSI-stripped scoped logs. “Scoped” means the original Nx log; focused results use `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec>`, one spec at a time. The main checkout was on `main` and clean in the compared paths.

| Spec | Project | Failure cause (first error) | Worktree result | Main result | Verdict |
| --- | --- | --- | --- | --- | --- |
| `steps/dispose-evaluate.step.spec.ts` | task-end-hook | Symlink creation `EPERM` on Windows | Focused: 1 failed, 20 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `trigger/task-end-transition-detector.spec.ts` | task-end-hook | Post-write assertion: expected notification, received 0 | Focused: 9 failed, 13 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `steps/index-request.step.spec.ts` | task-end-hook | Symlink creation `EPERM` on Windows | Focused: 1 failed, 22 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `trigger/main-root-resolver.spec.ts` | task-end-hook | Expected checkout root, received `null` | Focused: 22 failed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `read/task-end-run.reader.spec.ts` | task-end-hook | Expected run object, received `null` | Focused: 6 failed, 2 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `dispose/candidate-path.resolver.spec.ts` | task-end-hook | Symlink creation `EPERM` on Windows | Focused: 1 failed, 4 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `dispose/task-spec.reader.spec.ts` | task-end-hook | Symlink creation `EPERM` on Windows | Focused: 1 failed, 10 passed | Focused: same | PRE-EXISTING / ENVIRONMENT |
| `lib/deliverable-check.spec.ts` | lane-outcomes | POSIX path expectation on Windows; symlink `EPERM` | Scoped: 6 failed | Not rerun; Windows-only errors | PRE-EXISTING / ENVIRONMENT |
| `lib/di/register.spec.ts` | lane-outcomes | Expected `/workspace`; Windows `realpath` used `D:\workspace` | Scoped: 1 failed | Not rerun; platform path mismatch | PRE-EXISTING / ENVIRONMENT |
| `helpers/compaction/subagent-budget-monitor.spec.ts` | agent-sdk | Expected zero Jest timers, found 6 | Scoped: 1 failed | Not rerun; monitor path unchanged | PRE-EXISTING / ENVIRONMENT |
| `quota/plan-usage.service.spec.ts` | auth-providers | OpenCode credential test exceeded 5 s | Scoped: 1 failed | Not rerun; quota path unchanged | PRE-EXISTING / ENVIRONMENT |
| `cli-agents/lane-terminal-outcomes.integration.spec.ts` | cli-agent-runtime | Scoped run missed expected `Review capture refused` warning | Focused: 16 passed | Focused: 16 passed | PRE-EXISTING / ENVIRONMENT |
| `implementations/electron-state-storage-oversized-profile.spec.ts` | platform-electron | Oversized profile test exceeded 120 s | Scoped: 1 failed | Not rerun; storage path unchanged | PRE-EXISTING / ENVIRONMENT |
| `file-settings-manager.bench.spec.ts` | platform-core | 1000-write performance smoke exceeded 30 s | Scoped: 1 failed | Not rerun; benchmark path unchanged | PRE-EXISTING / ENVIRONMENT |
| `config/esm-bundle-gate.spec.ts:457` | ptah-electron | Bare worker bundle returned `timedOut=true` twice | Scoped: 1 failed | Not rerun; worker gate path unchanged | PRE-EXISTING / ENVIRONMENT |
| `session-driver-lock/control-endpoint.spec.ts` | platform-core | Lock acquire returned `ok=false` | Scoped: 1 failed | Not rerun; lock path unchanged | PRE-EXISTING / ENVIRONMENT |
| `session-driver-lock/kernel-session-driver-lock.spec.ts` (“release race”) | platform-core | Windows socket reset: `This handle type cannot be sent` | Scoped: failed | Not rerun; lock path unchanged | PRE-EXISTING / ENVIRONMENT |

`git diff main...HEAD --stat` and `git diff --stat` show usage-ledger changes in analytics, persistence, CLI usage capture, host DI, and public exports. Commit `d7ed4a363` changes only `task-end-hook/src/index.ts` (one added export); the uncommitted `ReadOnlyGit` export is also only in that entry point. The seven task-end specs import internal modules directly, and their focused failure counts and first errors match main. The changed `LaneOutcomeRecorder` code adds Codex usage-reason bookkeeping; it does not change the review-refusal warning path exercised by the CLI integration spec. The remaining failing paths are untouched by the branch or fail on Windows privilege, path semantics, or timing under load.

REGRESSION root causes and fixes: none identified.

Overall verdict: no branch-caused test regression found among the reported failures.
