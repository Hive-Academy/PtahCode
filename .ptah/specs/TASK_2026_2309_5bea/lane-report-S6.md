# S6 · Session inspector

## Files and contracts

| File | Implementation |
| --- | --- |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts` | Dense shared surface and description row, compact Review and Retry buttons, detached badge, muted unknown branch |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.spec.ts` | New Git state, action, tooltip and tracking cases |
| `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-linked-sessions.component.ts` | Dense shared surface and row buttons, visible chain count, current-row indicator |
| `libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-linked-sessions.component.spec.ts` | Shared section and count, compact keyboard-reachable rows and existing chain behavior |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html` | Compact inline and overflow controls, shared danger tone for Stop |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.spec.ts` | Compact inline and overflow controls, Stop dispatch and disabled tooltip cases alongside the existing keyboard cases |

| Selector | Inputs | Outputs |
| --- | --- | --- |
| `ptah-inspector-git-section` | `readonly tabId = input.required<string>();` | None |
| `ptah-inspector-linked-sessions` | `readonly entries = input.required<readonly InspectorLinkedSessionEntry[]>();` · `readonly currentSessionId = input<string \| null>(null);` | `readonly openSession = output<string>();` |
| `ptah-inspector-session-actions` | `readonly tabId = input.required<string>();` · `readonly running = input(false);` | None |

## Acceptance and parity

- **GIT, SIC.html 203–207.** The Git spec covers the working-root branch and title, both signed change counts, the partial count tooltip and measured zero, the unavailable and non-repository messages, Retry with tracking cleanup, and Review changes dispatch to the existing review surface. Review and Retry are native focusable buttons with accessible names.
- **A4.** The Git spec covers detached `HEAD` with a text badge, an attached branch without the badge, and a muted em dash for a missing branch. A separate fixture verifies that the session origin branch and the live detached indication can both be read.
- **Linked sessions, SIC.html 208–215.** The linked spec covers the labelled section and count, root-first order, all three relation labels, current row semantics and visual emphasis, the full title tooltip, missing-title fallback, five-row scroll viewport, activation of other rows and the current row's no-op. Every row remains a native focusable button.
- **Header actions, SIC.html 84–127.** The actions spec covers the three named inline actions, their persistence and running-state gates, Stop's disabled and enabled tooltips, and Stop dispatch in both presentations. Existing coverage exercises overflow selection, arrow keys, Home, End and Escape, focus restoration and dismissal, Organize dispatch, and Rename submission, errors and focus containment.
- **Scope, SIC.html 84–127, 197–201 and the request header.** The existing actions spec keeps the adjacent panel toggle reachable and preserves Escape propagation while the menu is closed. The six-file write set provides the source boundary for the title, status, workflow, branch, close, TASK and Answer bindings. S8 owns the Answer integration case.

## Checks

- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.spec.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-linked-sessions.component.spec.ts` — exit 0, two chat suites and 14 tests passed. The linked-sessions path was outside this Jest config's discovery scope.
- `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — exit 1 with only the known S7 diagnostic, TS2305 at `inspector-agents-section.component.ts:41` for `agentListTotal`.
- `npx eslint libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.spec.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-linked-sessions.component.ts libs/frontend/chat-ui/src/lib/molecules/session/inspector-stats/inspector-linked-sessions.component.spec.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.spec.ts` — exit 0, no errors and three existing non-null assertion warnings in the Rename focus test.
- `ptah_get_diagnostics` scoped to the six implementation and spec files — TypeScript results unavailable after the tool's 45-second timeout. The tool does not recognise the HTML file. Used the requested Angular compiler check above.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Treat the working-root branch value `HEAD` as detached and retain the session origin branch when available | Use the Git status marker or infer detachment from missing branch data | The Git status parser maps `(detached)` to `HEAD`. The store can expose `null` for a missing branch, and `sessionBranch` prefers the session origin. | Yes, template and cases are local to the Git section |
| Keep the linked session ID fallback and five-row viewport | Keep the existing fallback and row capacity or replace the fallback with an em dash and retain the old pixel height | The fallback names the navigation target. The shared compact small button takes 28px, so five rows need 8.75rem. | Yes, linked component and spec only |

## Extra reads and outstanding work

- Workspace skill files `.claude/skills/angular-frontend-patterns/SKILL.md`, its `references/component-patterns.md`, and `.claude/skills/ui-ux-designer/SKILL.md`. The harness catalogue returned no Angular match. Ptah file search located the workspace skills and the lane read those local files.
- Public UI API and styling verification used selected declarations, metadata or literal matches in `libs/frontend/ui/src/index.ts`; `lib/surfaces/{index.ts,surface-section.component.ts}`; `lib/patterns/{index.ts,description-list/description-list.component.ts}`; `lib/badge/{index.ts,badge.directive.ts,badge.types.ts}`; `lib/button/{index.ts,button.directive.ts,icon-button.directive.ts,button.types.ts,button-host.ts,ptah-button.css}`; `lib/card/ptah-card.css`; `lib/form-controls/{ptah-form-controls.css,rich-select/ptah-select.css}`; and `lib/tokens/ptah-tokens.css`. Ptah AST does not parse HTML, so the actions template was read directly.
- A4 and Git spec setup used the state and branch projection in `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts`, the union in `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-metrics.ts` and its public export, and the detached header literal in `libs/backend/vscode-core/src/services/git/git-status-parser.ts`. Targeted searches also surfaced matching literals in `libs/shared/src/lib/utils/git.utils.ts`, `git.utils.spec.ts`, `libs/shared/src/lib/types/rpc/rpc-git.types.ts`, and `libs/backend/vscode-core/src/services/git/git-status-parser.spec.ts`, `git/git-remote-sync.ts`, `git-info.service.remote-stash.real-git.spec.ts`, `git-info.service.switch.real-git.spec.ts` and `git-info.service.ref-guard.real-git.spec.ts`. No full backend files were read.
- Inspector alignment and contract searches used the heading classes in `inspector-limits-lanes.component.ts`, selector and input declarations in `inspector-session-actions.component.ts`, the UI alias in `tsconfig.base.json`, surface rules in `apps/ptah-extension-webview/src/styles.css`, and matching CSS literals in `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.css`. Jest config verification used matching settings in `libs/frontend/chat/jest.config.ts` and `libs/frontend/chat-ui/jest.config.ts`.
- Reviewed the supplied 400px dark prototype for the Git header action placement, compact branch and signed-count row, linked count, and current-row treatment. The coordinator owns the rendered Electron comparison.
- The linked-sessions Jest spec remains to be run under the owning chat-ui Jest config. The authorized chat config command accepted all paths but discovered only the two chat specs.
