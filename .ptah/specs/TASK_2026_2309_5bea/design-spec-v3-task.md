# Design spec v3 — TASK section update (task digest)

Scope: the TASK section of the session inspector only. Everything else in `design-spec-v3.md` is unchanged.
Prototype: `prototype/v3/index.html` (`function task()`), fixtures `lanes` (rich), `exact` (minimal), `partial`
(truncated digest), `missing` (digest unavailable), `resumed` (digest loading), `live-small` / `empty` (no task).
URL param `&open=docs,dirs` pre-expands the Documents and/or Folders disclosure (used for screenshots).
Data contract: `TaskDigest` in `implementation-plan-task-digest.md` §1; chip partition from §6 (`groupTaskDocuments`).

## Layout (top to bottom)

| # | Element | Content | Source | Classes / tokens reused |
| - | ------- | ------- | ------ | ----------------------- |
| 1 | Heading row | `TASK`, status badge (icon + label), task id badge | `task.status` (effective), `task` id | `.sec-h`, `.chip.st` + `ST` tone/icon, `.chip.mono` |
| 2 | Title | one line, ellipsis, full text in tooltip | `task` title | `.line`, `.ttl.grow` |
| 3 | Progress | stage label, meter, `3/7 tasks` | stage (existing renderer value), `progress.done/total/source` | `.prog`, `.bar` (`ptah-meter`), `.meta`, `.num` |
| 4 | Stat tiles | Decisions, Pending you, Questions, Entries | `decisions.rows`, `decisions.pendingUser`, `openQuestions`, `entryCount` | SESSION tiles: `.tiles` + `.tile` > `.cap` / `.val` / `.num` (`ptah-stat`); modifier `.t4` |
| 5 | Meta line | `changed 14m ago`, `· partial` | `lastModified`, `truncated` + `truncatedReasons` (tooltip) | `.meta`; new `.tmeta` (6px top) |
| 6 | Disclosure tiles | Documents: count + `2 reviews · ! 1 revise`. Folders: count + `20 files` | `documents[]` (openable count), `reviews[].verdict`; `directories[]` length and sum of `files` | Models disclosure pattern: `button.tile` + `.cap` chevron + `.val` + `.sub` (`ptah-stat + ptah-disclosure`); modifier `.t2` |
| 7 | Documents panel (expanded) | document chips, review chips with verdict + `serious·moderate·minor`, `+N more` menu, `+N related` | `documents[]` (`name`, `kind`, `latest`, `openable`, `readable`), `reviews[]` (`file`, `verdict`, `serious`, `moderate`, `minor`) | `.pop`, `.docs`, `button.chip`, `.vd`, `.menu` |
| 8 | Folders panel (expanded) | folder icon, `name/`, `3 md · 9 img`, `14 files` | `directories[]` (`name`, `files`, `markdown`, `images`, `truncated`) | `.pop`, `.tdirs`, `.line`, `.mono.grow`, `.meta` |

Tile structure follows the SESSION tiles as built: caption on top, number below (`--t-val`, weight 600, tabular).

### Colour rules (rev 3 tokens only; every toned value keeps a text label)

| Tile / cue | Condition | Number ink | Extra cue |
| ---------- | --------- | ---------- | --------- |
| Decisions, Entries | any | `--bc` | label |
| Pending you | > 0 | `--st-need` (`.t-need`) | `bang` icon in the caption + label |
| Pending you | 0 | `--bcm` (`.num.unk`) | label |
| Questions (open questions) | > 0 | `--st-run` (`.t-run`, the palette's info tone) | label |
| Questions | 0 | `--bcm` | label |
| Any tile | value absent | muted `—` | `aria-label` "not available" |
| Review verdict | `APPROVED` | `--st-done`, weight 600 | `check` icon + word `Approved` |
| Review verdict | `REVISE` | `--st-need`, weight 600 | `bang` icon + word `Revise` |

### Rules

- Documents tile: count = openable documents (chips + menu). Summary: `N reviews`, then `! N revise` when any
  review says Revise, or `✓ approved` when all do; `no reviews` when none; `reviews —` without a digest.
- Folders tile: omitted when the digest lists no folders. `≥` before the file total when any folder is
  `truncated` or not counted.
- Both disclosures start collapsed, open independently, and keep their state in `S.td` / `S.tf`. The panel
  renders directly under the tile row, Documents before Folders.
- Review chip: `verdict: null` or no digest gives a muted `—`; counts show only when `serious` is present. A
  document with `readable === false` is a disabled chip with the text `unreadable`. Chip order and the 4-review
  cap follow §6. Folder line: `≥` when `truncated`, `not counted` when its count never ran. Nested files are not listed.
- Progress: no `progress` gives an empty meter and `— tasks`. No value is derived or invented in the renderer.

## States

- No task, or inspector loading: section not rendered (unchanged).
- Digest loading: `aria-busy="true"`; the four stat numbers, the meta line and the Documents summary are `.sk`
  skeletons; Documents count comes from the file list and the tile works; Folders tile is disabled with skeletons.
- Digest failed / unavailable: stat tiles show `—`; `changed —`; a `.notice` row (`alert` icon,
  `Task statistics unavailable`, `Retry` `.btn-xs`) sits above the disclosure tiles; Documents tile works
  (count from the file list, `reviews —`, chips without verdicts); Folders tile is disabled with `—`.
- Truncated digest: `· partial` on the meta line; `≥` on affected folder totals.

## Widths (measured in the prototype; no horizontal overflow, no clipped caption, value or summary)

| Width | Stat tiles | Disclosure tiles | Height collapsed (rich) | Height both expanded (rich) |
| ----- | ---------- | ---------------- | ----------------------- | --------------------------- |
| 300 | 2 x 2 | 2 columns | 295 px | 541 px |
| 336 | 2 x 2 | 2 columns | 295 px | — |
| 400 | 4 columns | 2 columns | 240 px | 442 px |
| 448 | 4 columns | 2 columns | 240 px | 420 px |

The 4-column grid switches to 2 x 2 at container width <= 380 px. The id badge may ellipsize at 300, the status
badge never. Chips wrap inside the panel; a file name ellipsizes inside its chip, verdict and counts never shrink.
Folder names ellipsize; counts keep their width. The `+N more` menu is left-aligned, max 240 px.

## Accessibility

- Section: `aria-labelledby` the `Task` heading; `aria-busy` while the digest loads.
- Stat tiles: `role="group"` named `Task statistics`; each tile is a group named `<label>: <value>` (for example
  `Open questions: 3`, `Pending you: not available`); the visual caption and number are `aria-hidden`.
- Disclosure tiles: real `button`s with `aria-expanded`, `aria-controls` (`task-docs` / `task-dirs`) and names
  such as `13 documents, 2 reviews, 1 revise. Show documents` and `2 folders, 20 files. Show folders`. Enter and
  Space toggle; focus stays on the tile. Panels are `role="region"` with a name. A disabled Folders tile is
  named `Folders loading` / `Folders not available`.
- Chips: `Open <file>`; review chip adds `review verdict Approved|Revise|not available, N serious, N moderate,
  N minor findings`. Menu trigger `N more task documents` with `aria-haspopup="menu"`, `aria-expanded`,
  `aria-controls`; items `role="menuitem"`; Escape closes it and returns focus to the trigger.
- Meter: `role="progressbar"` with value attributes and `N of M tasks complete, from <source>`; without progress
  `role="img"` named `Task progress not available`. The failure notice is `role="status"`.
- Focus order: (Retry when failed) → Documents tile → Folders tile → chips → `+N more` → menu items → `+N related`.
- Non-colour cues: every toned number has its caption; pending adds an icon; verdicts are icon + word;
  truncation is `≥` and `partial`.
- Contrast (WCAG 2.x AA, 4.5:1 for text), measured on the rendered prototype, dark / light:
  pending number 6.61 / 5.83; questions number 5.04 / 6.07; neutral number 14.86 / 15.92; caption and meta
  6.05 / 6.04; `Approved` on chip 5.31 / 5.18; `Revise` on chip 6.24 / 5.29; `revise` in tile summary 6.61 / 5.83.

## Changed vs rev 3

- Status badge moved from the progress row to the heading row, next to the task id.
- Progress reads `progress` from the digest and names its unit (`3/7 tasks`).
- New stat tiles (Decisions, Pending you, Questions, Entries) with tone on pending and open questions.
- New meta line (last change, partial).
- Documents and folders start collapsed behind two disclosure tiles; chips and folder lines live in panels.
- Review chips carry a coloured verdict and finding counts; `+N files` became `+N more` with a real menu.
- New digest loading and unavailable states.
- New CSS only: `.hx`, `.tiles.t4`, `.tiles.t2`, `.tmeta`, `.tnote`, `.vd`, `.mw`, `.tdirs`. No new token.

## Decisions

- Tile order is caption then number, as the SESSION tiles are built, not number then caption. Evidence:
  `.tile .cap` / `.tile .val` order in `function session()`. Reversible: yes.
- Tile caption is `Questions` (name and tooltip say `Open questions`): `Open questions` does not fit a
  4-column tile at 400 px. Reversible: yes.
- Open questions use `--st-run`: it is the only non-alarm tone in the rev 3 palette, and `--st-need` is already
  taken by Pending you. Reversible: yes.
- Folder lines are not buttons: plan §6 decision D3 (counts only, nested files not openable). Only the Folders
  tile header is a control. Reversible: yes, if a reveal-folder action is added.
