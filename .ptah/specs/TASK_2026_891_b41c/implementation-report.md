## Removed

- `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.html`: unreachable VS Code `@else if` change-set card branch. `display.enabled` is Electron-only and the branch was the sole template user of `changeSetMarks`, `changeSetError`, `onChangeSetOpenScm`, and `ChangeSetErrorIcon` (scoped `rg` search).
- `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.ts`: removed those branch-only members, the `ChangeSetCardComponent` import and component registration, and related `ChangeSetMarks`/`AlertTriangle` imports. `rg` found no other users of those symbols.
- `libs/frontend/chat-ui/src/lib/molecules/change-set/change-set-card.component.ts`, its spec, `libs/frontend/chat-ui/src/change-set-card.ts`, and its `tsconfig.base.json` alias: repository `rg` found the transcript and the deleted specs as the card's only consumers. The two helpers still used by the summary chip were moved to `turn-summary-files.utils.ts`.
- `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.change-set.spec.ts`: tested only the removed VS Code card path.
- Updated obsolete comments in chat and chat-ui. Removed two obsolete VS Code/card-only assertions from `chat-transcript.display.spec.ts`; all Electron chip tests remain.

## Kept

- Electron turn summary chip, `TranscriptDisplayFeed`, `changeSetAnchors`, `ChangeSetStore`, and summary review/open-file actions: the snapshot builder and chip still use them. `changeSetKey`, `changeSetErrors`, and `runChangeSetAction` remain because the chip actions call that shared wrapper; changing its error handling was outside the branch removal.
- `git:turnChangeSet` / `git:turnChangeSets` flow and message handlers: untouched. `apps/ptah-electron-e2e/src/specs/git/change-set-card.spec.ts` and the chat display specs still test the chip.
- `formatFileCounts` and `ROW_PAGE_SIZE`: moved intact to `libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.utils.ts` for the summary model and files component.

## Verification

- Initial command: `npm run verify -- -p chat,chat-ui,ptah-extension-webview`. Header: `starting verify lint,typecheck (chat,chat-ui,ptah-extension-webview)`. `chat` and `chat-ui` lint/typecheck passed; webview lint failed on untouched static imports of `@ptah-extension/core` in spec files. Test phase: `chat-ui` and webview passed; `chat` failed on two obsolete card expectations in `chat-transcript.display.spec.ts`, which were then removed. Full log: `verify.log`.
- Final command: `npm run verify -- -p chat,chat-ui`. Headers: `starting verify lint,typecheck (chat,chat-ui)` and `starting verify test (chat,chat-ui)`. `chat`: lint PASS, typecheck PASS, test PASS. `chat-ui`: lint PASS, typecheck PASS, test PASS. Nx summaries: `4 tasks: 4 succeeded, 2 cached`; `2 tasks: 2 succeeded, 1 cached`. Exit code 0. Full log: `verify-final.log`.

## Decisions

- Followed D4 preserve list. The webview project is included because its eager-bundle guard comment was updated.
- Used repository `rg` reference searches as the permitted Grep proof; no other production card reference remained.

## Clarifications Needed

None.
