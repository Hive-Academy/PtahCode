# e2e fix report: new-project.spec.ts

File: `apps/ptah-electron-e2e/src/specs/harness/new-project.spec.ts`

## Tests
| Test | Action | Why |
|---|---|---|
| `submits the new intake and opens a chat tab` (was line 14) | Rewritten | Submit now opens a chat tab. Mocks `harness:initialize`, `harness:start-new-project`, `chat:start`. Wire payload assertion kept. |
| `submits the .NET platform and stack in the wire payload` (was line 49) | Rewritten | Same change. Payload assertion (`platform: dotnet`, `stack: aspnetcore-api`) kept. |
| `reload offers to resume the proposal from Home` | Deleted | Proposal resume does not exist any more. |
| `continues the same draft after a direct view switch` | Deleted | Proposal draft does not exist any more. |
| `foreign-session question does not take the proposal panel` | Deleted | Proposal panel is removed. `new-project-question-routing.spec.ts` covers question routing in chat. |

Tests at old lines 4 and 89 are unchanged.

## Selectors
- `ptah-chat-view`: `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts:191`
- `ptah-onboarding-shell`: `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts:26`
- RPC `harness:initialize`: `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:58`
- RPC `harness:start-new-project`: same file, line 78
- Both selectors and the `harness:initialize` mock shape also appear in `new-project-question-routing.spec.ts:9-38`.

## Other files
- `new-project-dotnet.spec.ts`: no stale assumption. No change.
- Search of `apps/ptah-electron-e2e/src` for `proposal-workspace`, `proposal-panel`, `new-project/proposal`, `team-builder/proposal`: only `new-project.spec.ts` matched. No other hit.

## Check
`npm run verify -- -t lint,typecheck -p ptah-electron-e2e`: 2 tasks succeeded, exit code 0. E2e specs not run (rule).

## Decisions
- Reused the sibling spec mock for `harness:initialize` because the launcher calls it before `harness:start-new-project`.
- Deleted three tests instead of rewriting, because the guarantee (proposal resume, draft, panel) no longer exists.
