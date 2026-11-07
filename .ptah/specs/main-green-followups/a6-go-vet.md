# Go vet hostile integration: Windows follow-up

## Findings

`fe3648eff` introduced the hostile integration spec and the checker. Git blame attributes all eight fixture cases and the environment builder to that commit. The Go toolchain is installed (`go1.27.1` in the checker's audit). The initial narrow verify reproduced six failures: 6 failed, 96 passed across the Go vet suites. The other two hostile cases, minimum Go version and missing modules, already passed.

The common root cause is in **product code**: `go-vet-checker.ts:393-405` built the sanitized child environment without `GOCACHE`; it copied `LOCALAPPDATA` only if the parent supplied it. This Windows process has `USERPROFILE=C:\Users\abdal` but no `LOCALAPPDATA`. A temporary diagnostic read of the child output showed: `build cache is required, but could not be located: GOCACHE is not defined and %LocalAppData% is not defined`. The checker then returned `failed/unparseable`. The temporary diagnostic lines were removed.

| Failing case (spec line) | Root cause and verdict | Fix |
| --- | --- | --- |
| `generate` (:259-275) | Go could not locate its build cache, so vet never reached the directive. Product defect, introduced with the environment builder in `fe3648eff`. | Supply Windows `LOCALAPPDATA` fallback; the existing directive and marker assertions pass. |
| `suggested toolchain` (:278-297) | Same child environment failure prevented the local vet run. Product defect (`fe3648eff`). | Same fallback; status, local version audit, and no-download assertions pass. |
| `cgo` (:340-367) | Same failure prevented vetting `plain.go`. Product defect (`fe3648eff`). | Same fallback; plain file is checked and cgo file remains reported as skipped. |
| `line directive` (:376-400) | Same failure yielded `failed/unparseable` before the outside-root finding could be parsed. Product defect (`fe3648eff`). | Same fallback; finding count and unclaimed file assertions pass. |
| `vcs` (:402-421) | Same failure prevented the repository fixture run. Product defect (`fe3648eff`). | Same fallback; status and fsmonitor marker assertions pass. |
| `toolexec` (:423-441) | Same failure prevented the hostile parent environment run. Product defect (`fe3648eff`). | Same fallback; status and toolexec marker assertions pass. |

## Files changed

- `libs/backend/workspace-intelligence/src/diagnostics/external-checkers/go-vet-checker.ts:393-416`: derive conventional `LOCALAPPDATA` from `USERPROFILE` on Windows when it is omitted. The fixed Go variables and environment allowlist remain intact.
- `libs/backend/workspace-intelligence/src/diagnostics/external-checkers/go-vet-checker.spec.ts:408-416`: assert the missing-`LOCALAPPDATA` Windows environment shape.
- `.ptah/specs/main-green-followups/a6-go-vet.md`: this report.

## Verification

- Initial narrow command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -t test -p workspace-intelligence -- --testPathPatterns=go-vet` — `1 failed`, `2 passed` suites; `6 failed`, `96 passed` tests.
- Narrow command after fix: `NX 1 task: 1 succeeded`; exit code 0; cache `0/1 hit`.
- Final full command: `PTAH_VERIFY_SLOTS=1 PTAH_VERIFY_MIN_FREE_GB=8 npm run verify -- -p workspace-intelligence` — lint/typecheck `NX 2 tasks: 2 succeeded`; tests `NX 1 task: 1 succeeded`; exit code 0.
- `ptah_get_diagnostics` scoped to the two changed TypeScript files: 0 errors, 0 warnings; coverage clean.
- `git diff --check` for diagnostics: clean.

## Decisions

- Fixed the checker because its sanitized environment made normal Go execution impossible in a valid Windows process environment. No fixture assertion was weakened or skipped.
- Used the standard Windows `USERPROFILE\AppData\Local` location only when `LOCALAPPDATA` is absent. An explicitly supplied `LOCALAPPDATA` retains priority.
- Kept all source edits inside `libs/backend/workspace-intelligence/src/diagnostics/`; the required report is outside that source scope by the deliverable contract.
- No matching skill was available: the local skill inventory was empty and no native Skill tool was exposed.

## Not done

- No commit, push, stash, reset, restore, checkout, clean, package install, or workspace-wide verification was performed.
