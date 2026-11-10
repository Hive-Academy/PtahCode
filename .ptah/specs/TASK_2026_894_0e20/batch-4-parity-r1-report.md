# Summary

R1 compared the specified old blocks with the approved provider-card design. This continuation lifted provider-popover ownership to the matrix and added card-move focus, Escape, model/effort, instance, and off-Electron account coverage. The second continuation verification passed all 38 focused tests. The earlier Copilot-label correction is verified.

# Coverage table

| Old test title (main line) | Outcome | New test or design rule / remaining gap |
| --- | --- | --- |
| gives the CLI matrix its own glass content section (342) | migrated | Existing matrix section assertion and card mount test; section retains `data-glass-surface=content`. |
| is a table-sm with the prototype columns (346) | obsolete | `design-spec-revision-2.md` item 1 replaces table with equal fixed cards, max three columns. Heading remains. |
| lists installed system rows by preferred order, then the Uninstalled group; instances below (371) | migrated | `mounts installed cards in preferred order...`, `keeps the Uninstalled disclosure...`. |
| uninstalled CLI toggle native disabled; installed aria-disabled while busy (392) | restored | `keeps installed toggles focusable but aria-disabled while a save runs`; card toggle handler guards writes. |
| omits the Uninstalled group when every CLI is installed (404) | migrated | `keeps the Uninstalled disclosure...`. |
| empty and loading states (412) | restored | `shows loading and empty states`. |
| transparent rows and table-sm density (432) | obsolete | `design-spec-revision-2.md` items 1–2 require bordered fixed-height cards. Dimmed state is still represented by status and control state, but has no dedicated assertion. |
| one Add, Tiers/More on instances, Credentials on Cursor (447) | migrated in part | `keeps Credentials on Cursor only...`; `design-spec-revision-2.md` items 8–9 assign instance actions to the separate instance section. Add/Tiers/More cardinality remains unasserted. |
| opens add/edit/tier modals (469) | migrated | `opens add empty, edit populated, and tier modals through the instance section`. |
| Add row when no instance (507) | migrated | `offers Add from the instance empty state`. |
| detection states and instance last latency (518) | migrated | `renders card status and a live test slot`, `tests a system CLI and displays its latest result`; instance last latency unasserted. |
| instance key status and three tiers (537) | migrated | `shows instance key status, tier models, and unset tiers...`. |
| versions, providers and CLI defaults (556) | restored in part | `renders normalized versions...`; provider/default content not specifically asserted. |
| readable Codex executable status line (569) | migrated | `renders normalized versions...` checks Codex line presence. |
| model/effort buttons only on enabled installed rows (581) | migrated | `shows model and effort actions only for enabled installed cards`. |
| badge and status base-content, color on dots/fills (600) | behavior missing from R1 coverage | Card status markup uses base-content; no computed-style assertion. |
| opens model popover one click and closes (625) | migrated | `opens and closes a model popover in one click`. |
| effort saved in two clicks (644) | migrated | `saves an effort in two clicks`. |
| Esc closes while save runs and restores trigger focus (659) | restored | `Escape closes the effort popover and returns focus during a save`. |
| each CLI permission note in info popover (708) | migrated in part | `shows each permission note and Copilot auto approve only for Copilot`; Copilot label correction verified. Per-CLI note assertions beyond Copilot remain absent. |
| Cursor Credentials from Uninstalled (720) | migrated | `keeps Credentials on Cursor only...`, `keeps Credentials on an uninstalled Cursor...`. |
| installed Cursor Credentials only (738) | migrated in part | Card-local Credentials condition and existing `keeps Credentials...` test; installed Cursor variant unasserted. |
| Copilot auto-approve only in permission popover (759) | migrated | `shows each permission note and Copilot auto approve only for Copilot`; correction verified. |
| one popover at a time (780) | restored | `owns one provider popover across installed and uninstalled grids`. |
| collapsed keyboard Uninstalled disclosure/count (1085) | migrated | `keeps the Uninstalled disclosure collapsed...`. |
| moving row keeps collapsed group open (1114) | restored | `opens a collapsed Uninstalled group for a moved popover...`. |
| moved Cursor trigger receives focus (1147) | restored | `keeps a moved Cursor popover open and returns focus to its new trigger`. |
| removed key focuses disclosure (1175) | restored | `opens a collapsed Uninstalled group for a moved popover...`. |
| 20px checkbox-sm centered tick (1207) | migrated in part | Card uses `checkbox-sm checkbox-primary`; pixel geometry unasserted. |
| narrow actions fold into More (1223) | obsolete | Revision item 1 replaces narrow table with responsive cards; revision item 8 places instance actions in instance section. |
| tier summary and Not set (1281) | migrated in part | `shows instance key status, tier models, and unset tiers...` checks all three mapped titles, summary, and unset labels. The partial mapping title omits unset tiers; its formatter is in `ptah-cli-instances.component.ts`, outside the R1 edit allowlist. |
| narrow status/provider one line (1306) | obsolete | Revision item 1 replaces narrow table; card status slot/provider title remain, but no layout assertion. |
| 12px helper text (1318) | migrated in part | Card version/provider and header hint use `text-xs`; computed pixel size unasserted. |
| normalized version token on name line/full title (1506) | restored | `renders normalized versions...` checks token and full title. |
| model id once, display name in title (1520) | restored | `renders normalized versions...` checks id and title selector. |
| account cell absent without Claude and reads nothing (1553) | migrated | `mounts the Claude lane account cell only...` checks absence and no account open. |
| installed Claude account cell under name (1558) | restored in part | `mounts the Claude lane account cell only...` checks mount and account/ambient reads. Exact placement and text remain unasserted. |
| account cell absent on uninstalled Claude (1577) | restored | `mounts the Claude lane account cell only...`. |
| no account rendering or reads off Electron (1583) | migrated | `renders and reads no Claude account off Electron`. |

# Production changes

- `cli-orchestration-matrix.component.ts`: added visible loading line while both reads are unloaded.
- `cli-provider-card.component.ts`: preserved native disabled for uninstalled toggles while using `aria-disabled` and a guarded handler for busy/unwritable installed toggles; placed normalized version beside name with full line title; uses model display title; mounts Claude account cell for installed Claude.
- `cli-provider-grid.component.ts`: accepts a shared open cell from the matrix and emits open/close requests, retaining local ownership for standalone use.
- `cli-orchestration-matrix.component.ts`: owns one provider open cell across both grids, keeps a moved card visible while its popover is open, and returns focus to the moved trigger or collapsed-group disclosure after close.
- `cli-provider-card.component.ts`: adds stable popover-trigger markers used for focus return.

# Verification

Command, from worktree root, each run: `npm run verify -- -t test -p chat -- --testPathPatterns=cli-orchestration-matrix.component.spec --testPathPatterns=cli-provider-card | Select-Object -Last 60`.

- Previous R1 runs: 24/25, 27/28, 27/28. Those failures were corrected before this continuation.
- Continuation run 1: `Tests: 1 failed, 37 passed, 38 total`; the in-flight save stub did not set commit status to `saving`.
- Continuation run 2: `NX 1 task: 1 succeeded`; Jest log: `Test Suites: 2 passed, 2 total`; `Tests: 38 passed, 38 total`; `Snapshots: 0 total`; `Time: 18.694 s`.
- `ptah_get_diagnostics` was retried on changed files but timed out after 45 seconds and returned unchecked; no typecheck result was claimed.

## Decisions

- Replaced table-only assertions with card-DOM checks. Evidence: approved revision item 1; reversible: yes.
- Kept installed toggles natively focusable while writes are busy, with `aria-disabled`. Evidence: old Batch 54.1 assertion and keyboard access; reversible: yes.
- Mounted account cell only for installed Claude. Evidence: old P6 assertions and Electron gating inside `ClaudeLaneAccountCellComponent`; reversible: yes.
- Lifted provider popover state to the matrix, sharing it with both grids and the instance section. Evidence: old M3/N-2 and one-open assertions; reversible: yes.
- Angular frontend skill could not be loaded: no skill catalogue or loader was listed for this lane. Work followed repository conventions and existing nearby tests.

## Not done

- The partial tier mapping title omits unset tiers. Its formatter is in `ptah-cli-instances.component.ts`, outside the user-approved R1 edit allowlist; the existing `Not set` labels and full mapped-title case are verified.
- `ptah_get_diagnostics` did not finish within 45 seconds; scoped focused Jest passed. No changes were made to R2's writes spec.
