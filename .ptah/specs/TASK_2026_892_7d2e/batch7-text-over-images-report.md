# Batch 7: text over session images

## Deleted

Deleted these six files with ordinary file deletion: `apps/ptah-docs/public/screenshots/{chat-overview,chat-execution-tree,chat-cost-bar,sessions-overview,sessions-tabs,sessions-history}.webp`. No capture run, staging, commit, or push occurred.

## Text added

| Page and line | New text | Renderer evidence |
| --- | --- | --- |
| `README.md:53` | Transcript above composer; assistant work log exposes tools. | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:7-55`; `libs/frontend/chat/src/lib/components/molecules/turn/turn-disclosure-row.component.ts:17-22`. |
| `README.md:80` | Orchestrator and sub-agent lane tabs; `Worked` tool rows. | `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts:144-145`; `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:24-55`. |
| `apps/ptah-docs/src/content/docs/sessions/session-history.md:10` | Previous sessions opens from the rail; dialog controls sit above rows. | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts:319-330`; `libs/frontend/chat/src/lib/components/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts:79-115`; `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:66,127-128`. |
| `apps/ptah-docs/src/content/docs/sessions/managing-sessions.md:10` | Lane tabs switch between Orchestrator and sub-agents. | `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts:144-145`; `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts:186`. |
| `apps/ptah-docs/src/content/docs/sessions/index.mdx:12` | Rail and selected-session details panel, including totals, models and agents. | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts:319-330`; `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.ts:59-62`; `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:98,136-138`. |
| `apps/ptah-docs/src/content/docs/chat/index.md:12` | Conversation above composer with lane tabs above transcript. | `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts:144-145`; `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:7-55`. |
| `apps/ptah-docs/src/content/docs/chat/execution-tree.md:12` | Expand `Worked` for tool rows; sub-agents have lane transcripts. | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:24-55`; `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts:186`. |
| `apps/ptah-docs/src/content/docs/chat/cost-and-tokens.md:12` | Session details show totals, time, models, and agent usage when reported. | `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.ts:59-62`; `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:98,136-138`; `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts:3,40`. |

The existing page text already covers each screen's other controls; no screenshot-specific copy was retained.

## Harness removals

- `apps/ptah-electron-e2e/src/docs-screenshots/chat.shot.ts:1-54` now contains only the ordinary chat shots. The saved-development-session and live-AI tests, prompt, capture helpers, masks, session env vars, and their imports are gone. The model selector price replacement and no-price assertion remain at lines 18-29.
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-profile.ts:56-77` removed the D15 database and D16 transcript copy paths, saved-session option, empty profile copy loop, and unused source-profile selector. Temporary `HOME`/`USERPROFILE` and settings hash functions remain at lines 15-43 and 75-78.
- `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-fixtures.ts:45-66` removed the saved-session fixture option and its profile argument; ordinary sample-repo and extra-workspace options remain.
- `apps/ptah-docs/SCREENSHOTS.md:11-13` now says these screens are intentionally text-only and retains the model-price-mask note. The comparison `git diff origin/main --` for `chat.shot.ts` and `docs-profile.ts` showed only removal of capture-only code; the ordinary shot block and isolation guard remain.

## Other references

Repository-wide search excluding `node_modules` and `.ptah` found no remaining reference to any of the six `.webp` names. Bare `chat-execution-tree` occurs in the unrelated library name, TypeScript aliases, Nx config, and tool benchmark data; those are code references and were left intact. No landing page or screenshot config reference remains.

## Verification

- `npm run verify -- -p ptah-electron-e2e` (foreground, last 20 lines displayed): exit 0. Exactly one requested project, `ptah-electron-e2e`; lint/typecheck `NX 2 tasks: 2 succeeded`; project has no `test` target (`NX 0 tasks: 0 succeeded`).
- `node apps/ptah-docs/scripts/check-screenshot-refs.mjs`: exit 0; 18 docs references resolve. Six other existing screenshots are unreferenced.
- `node D:\projects\ptah-extension\.ptah\specs\TASK_2026_889_d57a\_linkcheck.mjs`: exit 0, 0 bad links, 0 frontmatter or component import issues.
- Scoped `ptah_get_diagnostics` on the three edited TypeScript files: 0 errors, 0 warnings.
- All edited files decode as UTF-8, have no BOM, and contain no mojibake markers. No build, serve, dev, e2e, package or capture target was run.

## Decisions

D19: replace the six fast-staling captures with source-checked text and remove the capture paths that could recreate them. Evidence: user decision and inspected renderer components. Reversible through a later docs change. Keep the separate model selector capture and its price mask because D19 did not remove it.
