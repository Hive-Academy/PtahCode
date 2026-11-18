# Revision 2 report

## Fixes

| Defect | Status | file:line | Spec file:line |
| --- | --- | --- | --- |
| 1 | fixed - Epoch-aware in-flight guard queues one replacement open after a close; concurrent explicit requests share it. Promise identity protects replacement cleanup. | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:305` | `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:120` |
| 2 | fixed - Repeated automatic open failures are deduped by message, including not-ready. Explicit intent clears dedupe; successful open resets it. Close failures retain their existing reporting. | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:342` | `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:140` |
| 3 | fixed - Reactive effect clears the requested binding when its dock reads closed/default after forgetTab. The request guard also checks it before comparing tabs, covering same-tick deletion and update. | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:296` | `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:164` |
| 4 | fixed - Bind-time request sequence is read untracked. Rebinding skips the old focus request while later requests still open. | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:171` | `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:177` |
| 5 | fixed - Epoch checked before handling any resolved result; rejected requests check it before reporting too. A native close suppresses stale failure, unavailable and rejection notices. | `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts:324` | `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts:195` |

## Files changed

- `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts`
- `libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts`
- `.ptah/specs/TASK_2026_2270_18ad/revision-2-report.md`

## Checks run

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts libs/frontend/chat/src/lib/services/display-dock/display-dock.state.spec.ts`
  - Before the service fix: 8 new regression cases failed, 64 tests passed (1 failed suite, 2 passed). Every requested defect has a test that failed against the previous code.
  - After the service fix: PASS, 3 suites / 72 tests (including all 8 previously failing cases).
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` - PASS, exit 0, no diagnostics.
- `npx eslint libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts libs/frontend/chat/src/lib/services/display-window/display-window-revision.spec.ts` - PASS, exit 0, no diagnostics.

## Not done

- No git state changes, installs, verify/Nx, builds, serve or e2e. No template or visual changes; no rendered UI check performed.
- No source/spec files outside the two authorized paths changed. Service: 530 lines; revision spec: 213 lines. No any types, non-null assertions or console calls added.
- CLI-native skill invocation remains unavailable; the Angular patterns skill read in the previous round continues to guide this signal/effect change.
- Ptah AST inspection succeeded. Dependency graph remained building; targeted native source/reference reads were the fallback. Checks use only the requested focused Jest, tsc and ESLint commands.
