# Text-over-images review

Review family: claude (implementer: codex)

Scope: `git diff HEAD` in `D:\projects\ptah-extension\.claude-worktrees\docs-session-shots`
(branch `docs/docs-session-shots`), against D19 and `batch7-text-over-images-report.md`.
Read-only review. No verify, capture, e2e, build or serve run (the coordinator owns checks).

## Verdict

**APPROVED** — score **8/10**.

All eight new sentences are true for the current Electron renderer. The harness removal is
clean and does not weaken the isolation guards. The defects below are all Low: wording that is
imprecise or incomplete, not wrong. A 9 would need the rail and lane-tab sentences to be exact.
A 7 or lower would need a false UI claim or a weakened guard, and I found neither.

## Defects

1. **Low — `apps/ptah-docs/src/content/docs/sessions/index.mdx:12`: the rail does not list all workspace sessions.**
   "the session rail lists your workspace sessions" is too wide. The rail (`aria-label="Sessions"`,
   `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts:119`) shows the open
   session cards, with the running cap `MAX_RUNNING_SESSIONS` (`:516`). Earlier sessions are in
   **Previous sessions**. The details panel also has a compact 56 px rail form and a hidden state
   (`session-inspector.component.html:1-58`, `Hide session details` in
   `inspector-shell.controller.ts:34`), so "opens beside a details panel" is the default case only.
   Suggested text: "the session rail shows your open sessions" and "beside the session details panel".

2. **Low — `apps/ptah-docs/src/content/docs/sessions/session-history.md:10`: filters, sort and group are conditional.**
   `previous-sessions-toolbar.component.ts:62` renders `ptah-session-filter-bar` (Filters, Sort
   sessions, Group sessions, `session-filter-bar.component.ts:169,284,298`) only when
   `organizationAvailable()` is true. Otherwise the dialog shows only the search field and
   **Date range** (`:79,115`). The page's existing sections have the same gap, so the new sentence
   does not add a new error. An optional fix: "…and, when session organization is available,
   filters, sorting and grouping".

3. **Low — `README.md:80` and `apps/ptah-docs/src/content/docs/sessions/managing-sessions.md:10`: lane tabs show more than sub-agents.**
   The lane tabs dock has four kinds: `orchestrator`, `subagent`, `cli`, `background`
   (`libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts:43-48`). "the
   Orchestrator and sub-agents" omits CLI lanes and background agents. The text is incomplete,
   not false. Suggested text: "the Orchestrator, its sub-agents and CLI lanes".

4. **Low — `apps/ptah-docs/src/content/docs/sessions/managing-sessions.md:10`: two meanings of "tabs" near each other.**
   The new sentence is about lane tabs. Line 17 ("Open sessions show as tabs") is about session
   tabs. A reader can confuse the two. An optional fix: move the lane-tab sentence below
   "Open a session", or name both items explicitly.

5. **Low — `README.md:53` and `README.md:80`: the same point appears two times.**
   Both sentences say that an assistant turn expands to show tool activity. They use two terms:
   "work log" and "**Worked** row". Keep the tool-row detail in one sentence only. Use one term.

6. **Low — `apps/ptah-docs/SCREENSHOTS.md:11`: "Ordinary" now has no contrast.**
   The saved-session mode is gone. `DOCS_WORKSPACE` and `SAMPLE_REPO` are both `'sample-repo'`
   (`docs-fixtures.ts:20,34`), and no shot file sets a real workspace (`editor-git.shot.ts:12`
   sets `SAMPLE_REPO`). Suggested text: "All docs screenshots use the throwaway sample repository."

## Checked and OK

- **Accuracy, item by item:**
  - "Worked" disclosure: `turn-disclosure-row.component.ts:17-22` and `turn-facts.utils.ts:253`
    produce `Worked for …` / `Worked`. Its button opens the work log of tool rows
    (`tool-call-item.component.ts`). `chat/execution-tree.md:12` and `README.md:80` are correct.
  - Lane tabs above the transcript: `canvas-focus-area.component.ts:51-66` puts
    `ptah-canvas-lane-tabs` (`role="tablist" aria-label="Lanes"`) above
    `ptah-canvas-lane-view`. The Orchestrator name comes from `session-agent-roster.ts:62`. A
    sub-agent lane has its own transcript (`subagent-lane.component.ts`). `chat/index.md:12` is correct.
  - Session details panel: `session-inspector.component.html` (`aria-label="Session details"`)
    holds `ptah-inspector-session-stats` with Context, Tokens, Cost, Time, Model/Models and
    per-model usage (`inspector-session-stats.component.ts:64-356`). It also holds the AGENTS
    section, with tokens and cost for each agent row (`inspector-agents-section.component.ts:94-98`,
    `inspector-agent-row.component.ts:65-75`). The agent row shows "—" when a value is not reported.
    This agrees with "when reported" in `chat/cost-and-tokens.md:12`.
  - Previous sessions: the rail opens it (`canvas-rail.component.ts:325-330`). It has
    `Search sessions...`, **Date range**, Filters, Sort, Group and Clear all filters
    (`previous-sessions-toolbar.component.ts`, `session-filter-bar.component.ts`). The rows
    are below the toolbar (`previous-sessions-modal.component.html:59-160`).
  - I found no invented UI names.
- **Pages:** each page reads well. The new sentence replaces the image line and does not repeat
  the sentence above it (README lines 53 and 80 are the only small overlap, defect 5).
- **Dangling references:** a repository-wide search (without `node_modules`, `.ptah`, `.git` and
  `dist`) found no reference to the six `.webp` names. The search also found no reference to
  `PTAH_DOCS_SESSION_WORKSPACE`, `PTAH_DOCS_SOURCE_PROFILE`, `useDevSessionStorage`,
  `devSessionWorkspace` or `realProfileDir`. `chat-execution-tree` matches are the unrelated Nx
  library name only.
- **Harness:**
  - `chat.shot.ts:1-53` keeps the model-selector, approval-mode and `@`-suggestion shots. The
    price mask (`:18-28`) and the no-price assertion (`:29`) are intact. The descriptions-count
    guard (`:17`) is intact.
  - The imports are minimal (`test`, `expect`, `shoot`), and all of them are used. The removed
    imports (`perf-session-fixture`, `freezeMotion`, `SHOT_DIR`, `fs/os/path`) are still used
    elsewhere and are not dead exports.
  - `docs-profile.ts`: `os`, `normalize`, `canonical` and `productionPtah` are still used
    (`:17-25,64`). The code still sets `HOME_ENV_KEYS`, which maps HOME and USERPROFILE to the
    temporary home (`:78`). It still sets the temporary `APPDATA`, `LOCALAPPDATA` and
    `PTAH_DB_PATH` (`:77`). The capture-dir guard (`:61-66`) is unchanged. `productionSettingsHash`,
    `assertSettingsOrRetain` and `assertChildHome` are unchanged. The fixture still calls them
    (`docs-fixtures.ts:54,77,84`), and so does `docs-videos/_harness/video-fixtures.ts`.
  - The removal also removes every read of the real `~/.ptah/state` and of the dev profile, so
    the isolation is now stronger.
  - `docs-fixtures.ts:64-66`: the profile argument is still correct for both cases.
- **SCREENSHOTS.md** agrees with the code. The isolation paragraph (`:9`) is still true. The
  saved-session, DB-copy and `CLAUDE_CONFIG_DIR` notes are gone, and the code for them is gone
  too. The price-mask note (`:13`) agrees with `chat.shot.ts:18-29`.
- **Strict TypeScript and encoding:** the three changed `.ts` files have no `any`, `ts-ignore` or
  `as unknown as`. None of the modified files has a UTF-8 BOM. A byte scan found no mojibake markers.
- **D19 scope:** six images deleted, six docs-page references and two README references replaced,
  saved-session test, live-AI test, D15 DB copy and D16 transcript copy removed, and
  `chat-model-selector` kept. This agrees with `decisions.md` D19.

## Decisions

- **Severity of the rail and lane-tab wording (defects 1 and 3): Low, not Medium.** Options: Low
  or Medium. Evidence: each sentence is true for the default Electron layout and omits only
  secondary cases. No reader action fails because of the text. Reversible: yes (a docs edit).
- **Defect 2 counts against the new sentence only as Low.** The same unconditional statement was
  already on the page before this change, so the new sentence keeps the existing behavior.
  Reversible: yes.
- **Verdict APPROVED with optional fixes.** No Critical, High or Medium defect was found, and the
  harness guards are intact. The coordinator can apply defects 1, 3 and 6 as small wording edits
  before commit. Reversible: yes.
