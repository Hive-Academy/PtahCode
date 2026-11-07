# Ptah Dev Electron live test, round 3 — aborted at isolation gate

Date: 2026-11-07. Worktree: `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path`.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| PR #978 ancestor | PASS | `git merge-base --is-ancestor 28f5c97ac HEAD` exited 0. |
| Dev settings path in Electron entry point | PASS | `apps/ptah-electron/src/main.ts:72` sets `PTAH_SETTINGS_DIR` to `path.join(homedir(), '.ptah-dev')`. |
| Production settings baseline | PASS | SHA-256 before launch: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`, matching the expected prefix. |
| No pre-existing Ptah Dev instance | **FAIL** | PID 24380 was already running at 2026-11-07T19:23:09.5425311Z. Its command runs Electron with `D:\projects\ptah-extension\.claude-worktrees\docs-media-refresh\dist\apps\ptah-electron\main.mjs` through Playwright and a separate profile. It is from another worktree and was not started by this test. Child Electron PIDs were also present. |
| Dev settings backup | NOT RUN | Aborted at the prelaunch gate before changing settings. Current dev SHA-256: `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. No restore was needed. |

The hard rule requires stopping and reporting when an unowned Dev instance is running. I did not terminate PID 24380 or any other process, and I did not launch, build, or change settings.

## Setup

Production Ptah PID 26500 and its children were running and untouched. The unowned Electron root was PID 24380. No test PID or CDP port was allocated. No model or budget was changed. Round 2's scratch workspace remains available; no scratch file was changed in this attempt. No screenshots were taken.

## Scenario 1 — handoff stop

| Criterion | Result | Evidence |
| --- | --- | --- |
| Near-budget notice before stop | NOT PROVEN | Scenario not run after isolation gate failure. |
| Handoff stop reason, record, redaction, parent text, resume guidance, follow-up | NOT PROVEN | Scenario not run. No new Dev log evidence exists. |
| Model ID | NOT PROVEN | No agent launched. |

## Scenario 2 — steer allowed

| Criterion | Result | Evidence |
| --- | --- | --- |
| SendMessage steer to running agent allowed | NOT PROVEN | Scenario not run. |
| Model ID | NOT PROVEN | No agent launched. |

## Scenario 3 — safety stop

| Criterion | Result | Evidence |
| --- | --- | --- |
| Safety stop and usable chat | NOT PROVEN | Scenario not run. |
| Model ID | NOT PROVEN | No agent launched. |

## Scenario 4 — non-Claude

| Criterion | Result | Evidence |
| --- | --- | --- |
| Luna selection, actual model, handoff stop | NOT PROVEN | Scenario not run; no provider switch or model use. |

## Defect 6

NOT PROVEN. There was no current-run budget stop or declined Read/Bash. No permission-decision or parent-turn fields can be attributed to this aborted run.

## Production settings unchanged

SHA-256 before gate: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`. SHA-256 at 2026-11-07T19:25:03.0599211Z: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`. The file was not edited.

## Cleanup

No processes were started, so none were stopped. No settings were edited or restored. No source files, commits, pushes, or PRs were created. Existing unrelated `.gitignore` modification was present in `git status --short` and was left untouched.

## Findings

The live test is blocked by an unowned Electron instance from `docs-media-refresh`. A fresh run requires that instance to exit before the isolation gate is retried. All requested runtime behaviors remain unproven in round 3.
