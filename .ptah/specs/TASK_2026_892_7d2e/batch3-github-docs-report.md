# Batch 3 GitHub docs report

## Files changed

- `README.md`: linked existing desktop highlights and named corpora; added session details, memory timeline, review runs, and external MCP callers.
- `apps/ptah-docs/SCREENSHOTS.md`: described isolated dev-profile capture, synthetic state, `PTAH_DOCS_SOURCE_PROFILE`, and excluded secrets.
- This report.

Existing README raw screenshot URLs and landing demo links remain unchanged. No new image names were referenced.

## Claims and evidence

All paths below are relative to the worktree root. Each docs URL maps to a file under `apps/ptah-docs/src/content/docs/`.

| README claim added or linked | Docs link | Implementation evidence |
| --- | --- | --- |
| Apps is a desktop tab with agent surfaces (existing claim, linked) | https://docs.ptah.live/mcp-and-skills/apps/ | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:269-274,691-692` |
| Attention bell separates requests and notices (existing claim, linked) | https://docs.ptah.live/workspace/notifications-and-tray/ | `libs/frontend/notification-center/src/lib/notification-center.component.ts:45,76` |
| Display panel hosts a sandboxed artifact (existing claim, linked) | https://docs.ptah.live/chat/display-panel/ | `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:149,300,323` |
| Session details shows stats, requests, agents, and linked sessions | https://docs.ptah.live/canvas/session-inspector/ | `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.ts:55,73-75,221-223`; `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html:156-165,210-213` |
| Named corpora can be built and used to prime a chat (existing claim, linked) | https://docs.ptah.live/memory/timeline-and-corpus/ | `libs/frontend/memory-curator-ui/src/lib/components/corpus-list.component.ts:44-45,90-92,161-167,181-182` |
| Memory timeline can be filtered and drilled into from an event | https://docs.ptah.live/memory/timeline-and-corpus/ | `libs/frontend/memory-curator-ui/src/lib/components/timeline-view.component.ts:17-20,33,101-102,160` |
| Reviews tab lists PR review attempts, opens details, and supports reruns | https://docs.ptah.live/reviews/ | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:291-295,687-688`; `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:55-57,190-192,221`; `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:50-53` |
| External MCP callers can use read-only or full access | https://docs.ptah.live/mcp-and-skills/built-in-mcp-server/#external-callers | `libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:138-153,298` |

## Stale items fixed

- `SCREENSHOTS.md` previously said the harness copied state from `~/.ptah`. The current harness defaults to `%APPDATA%\Ptah Dev` and creates an isolated temporary profile with synthetic state; see `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts:11-14,21-39` and `apps/ptah-electron/src/main.ts:65-67`.
- The same guide described real-project captures as the normal path. The default is the throwaway `SAMPLE_REPO`; see `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-fixtures.ts:32-33,59,80-81`.
- `CONTRIBUTING.md` and `.github/copilot-instructions.md` were checked. No stale product name, Electron-conflicting host copy, or dead user-facing link was found, so neither was changed.
- Other lanes' screenshot harness and asset changes shown by `git status` were not made or reverted here.

## Link check

- Ran `node D:/projects/ptah-extension/.ptah/specs/TASK_2026_889_d57a/_linkcheck.mjs`: 88 sidebar slugs OK; redirect targets OK; bad internal links 0; frontmatter issues 0; component import issues 0.
- Confirmed each new README route with `rg --files apps/ptah-docs/src/content/docs | rg 'session-inspector|notifications-and-tray|display-panel|timeline-and-corpus|reviews.index|built-in-mcp-server|mcp-and-skills.apps'`; all seven target files appeared. Confirmed the external-callers anchor at `built-in-mcp-server.md:39`.
- `git diff --check -- README.md apps/ptah-docs/SCREENSHOTS.md` passed.
- `ptah_get_diagnostics` on edited Markdown reported unavailable because no requested file type could be checked. No Nx target was run.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Link existing bullets and add only missing desktop surfaces. | The README already described Apps, the bell, display panel, and corpora; corresponding docs routes exist. | Yes |
| Use `/memory/timeline-and-corpus/` for both memory entries. | The current sidebar has one combined Timeline & Corpus route. | Yes |
| Use `/reviews/` for review runs. | `reviews/index.md` is the page and the Electron shell opens `review-runs`. | Yes |
| Leave CONTRIBUTING and GitHub review instructions unchanged. | Both were read and contain no stale user-facing copy in scope. | Yes |
| Do not claim remote machines. | The gap inventory says the renderer UI is absent. | Yes |
