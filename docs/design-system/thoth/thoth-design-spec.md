# Thoth redesign: design spec (TASK_2026_2271_7a3e)

Phase 1 of the Thoth redesign. This spec describes the Memory and Skills panels of the Thoth hub
(`/thoth/memory`, `/thoth/skills`) on the shared components of `@ptah-extension/ui`. The user
decisions that this spec follows are in [README.md](README.md#user-decisions).

## 0. Design of record: the HTML prototype

`prototype/thoth-prototype.html` is the design of record. It is self-contained (no network, no
build). When this spec and the prototype disagree on layout, the prototype wins. When they
disagree on behavior or data, this spec wins.

Prototype controls (top bar): theme (light, dark), width (784, 1168, 1440), panel (Memory,
Skills) and a data state (Loaded, Loading, Empty, Node cap reached, Vectors off, No
workspace). The same values can be set by URL parameters:

| Parameter | Values                                                   | Effect                                            |
| --------- | -------------------------------------------------------- | ------------------------------------------------- |
| `theme`   | `light`, `dark`                                          | Theme                                             |
| `width`   | `784`, `1168`, `1440`                                    | Width of the app frame                            |
| `panel`   | `memory`, `skills`                                       | Panel                                             |
| `view`    | `graph`, `list`, `timeline`, `boards`, `code`, `health`  | Memory view                                       |
| `state`   | `loaded`, `loading`, `empty`, `capped`, `vecoff`, `nows` | Data state                                        |
| `cluster` | any                                                      | Graph starts in Clusters mode                     |
| `select`  | memory id                                                | Selects and focuses one node                      |
| `tab`     | `skill`, `agent`, `command`, `care`                      | Skills library tab                                |
| `open`    | slug                                                     | Opens the skill detail drawer                     |
| `chrome`  | `off`                                                    | Hides the prototype control bar (for screenshots) |

`window.__thoth` exposes `{ S, G, select, focusNode, fit }` for screenshot scripts.

## 1. Design direction

Thoth follows the Settings rev 2 "Flight deck" direction (`../settings/settings-design-spec.md`,
section 1): calm surfaces, one strong accent per screen, state ink only for state, mono
numbers, dense rows. Thoth adds one new surface, the memory graph. The graph is the only
saturated area of the Memory page. All chrome around it stays neutral.

Rules:

- One page header per panel: title, one line of description, the on/off toggle at the right.
- One instrument band below the header (stat tiles with a state bar).
- One view bar (tabs) that selects the main pane.
- Destructive actions live only in a "Danger zone" section or behind an inline confirm.
- Copy follows `docs/design-system/ptah-content-brand.md`.

## 2. Information architecture

### 2.1 Shell (`thoth-shell`)

No structural change. The shell keeps its section nav (Memory, Skills, Messaging, Schedules),
the paused marker on a tab and the route restore (`thothActiveTab`). The redesign changes only
the body of the Memory and Skills tabs. Messaging and Schedules are out of scope.

### 2.2 Memory page

```text
Page header        Memory · "Facts, events, and code Thoth has learned across sessions." · [Memory is on]
Paused alert       (only when paused)
Indexing banner    (only when the code index needs attention; six states, see section 8)
Instrument band    Core · Recall · Archival · Code index · Last curated
View bar           Graph | List | Timeline | Boards | Code index | Health
Main pane          the selected view
Inspector          right side of Graph and List, opens on selection
```

The Graph view is the default view. The long scroll list is gone as the main view. The List view
stays as the accessible and dense alternative of the same filtered set.

### 2.3 Skills page

```text
Page header        Skills · description · [Skills is on] [Skill telemetry]
Paused alert       (only when paused)
Instrument band    Skills · Agents · Commands · Diverged
View bar           Skills | Agents | Commands | Maintenance
Main pane          library table (first three tabs) or Maintenance sections
Detail drawer      right side, opens on a row
```

The card grid of `skill-clones-view` becomes one table per kind. The Maintenance tab collects the
three admin sections that are now below the grid: Orchestration specs, Quarantined agents and
Phase scorecards.

## 3. Memory graph

### 3.1 Canvas

- Renderer: Sigma.js (WebGL) on a graphology graph, loaded lazily with a dynamic `import()` when
  the Graph view first opens. The List view never loads it.
- Nodes are memories. Edges come from `memory:graph` (see `thoth-apply-plan.md`).
- Node color: by kind (default), tier, session or cluster. Node size: by salience (default), hits
  or uniform. A core-tier memory has a ring. A pinned memory has a pin glyph at the node.
- Edge style: "Similar meaning" is a solid line with opacity from the similarity score. "Same
  subject" is a dashed line. "Same session" is a dotted line. A legend shows all three.
- Labels: off by default. With "Show labels" on, labels show for the top nodes by size and for
  the hovered and selected nodes.
- Layout: force layout (ForceAtlas2 in a web worker). "Freeze" stops the layout. "Re-run layout"
  starts it again. "Clusters" mode groups nodes by the cluster key (subject, session or kind).
- Navigation: drag to pan, wheel or the zoom buttons to zoom, "Fit" to fit. A minimap shows the
  viewport at the bottom right at widths of 1168 and more.
- Time range: a brush under the canvas filters by `createdAt` (default: last 91 days).

### 3.2 Graph toolbar and filter rail

The toolbar is above the canvas. The filter rail is at the left of the canvas (width 15rem).

| Area              | Control                                                                                                                             | Content                                                                                                                                        | Component                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Toolbar           | Search                                                                                                                              | Text search on subject and content, applied on Enter. Matches get a highlight, the others dim. A match line gives the count with Prev and Next | `ptah-field` (compact, search)                             |
| Toolbar           | Nodes / Clusters                                                                                                                    | Layout mode                                                                                                                                    | Segmented control (`role="radiogroup"`)                    |
| Toolbar           | Color by                                                                                                                            | Kind (default), Tier, Session, Cluster                                                                                                         | `ptah-select` in `ptah-field`                              |
| Toolbar           | Size by                                                                                                                             | Salience (default), Hits, Uniform                                                                                                              | `ptah-select` in `ptah-field`                              |
| Toolbar           | Re-run layout, Freeze                                                                                                               | Layout control                                                                                                                                 | `button[ptahButton]`, `input[ptahToggle]`                  |
| Toolbar           | Filters (784 only)                                                                                                                  | Opens the filter rail as a slide-over                                                                                                          | `button[ptahButton]`                                       |
| View bar          | Count                                                                                                                               | "133 of 150 memories shown"                                                                                                                    | text                                                       |
| Rail, Show        | Tier chips, Kind chips, Pinned only, Scope, Session                                                                                 | Node filters                                                                                                                                   | chips (`aria-pressed`), `input[ptahToggle]`, `ptah-select` |
| Rail, Connections | Similar meaning, Same subject, Same session, each with a line sample and an edge count. "Similarity at least" slider (default 0.75) | Edge filters                                                                                                                                   | `input[ptahToggle]`, range input                           |
| Rail, Layout      | Cluster by (Subject, Session, Kind), Show labels                                                                                    | Layout options. "Cluster by" applies in Clusters mode                                                                                          | `ptah-select`, `input[ptahToggle]`                         |

"Reset filters" shows in the empty state when the filters hide all memories.

### 3.3 Selection and inspector

- Click selects one node. Shift-click adds a node. A lasso is not in scope.
- The inspector is at the right of the canvas (width 18rem). Without a selection it shows a hint
  for mouse and keyboard use. At 1168 and less it opens only on selection.
- One node selected: tier and kind badges, subject, content, salience (with a meter), hits,
  created, last used, session, workspace, and "Connected (N)": each linked memory with its link
  type and score. A linked memory is a button that moves the selection to it.
- Inspector actions: Pin or Unpin, Open source session, Forget (inline confirm).
- More than one node selected: the inspector shows the count, and a selection bar on the canvas
  gives bulk Pin, Unpin, Forget and "Clear selection".
- At 784 the inspector is an overlay at the right of the canvas with a close button.

### 3.4 Node cap

The renderer shows at most 1,500 nodes. The default request is 150 nodes ranked by salience and
recency. When the result is capped, a line above the canvas shows "Showing N of M memories" and "Show up to
1,500". The filters run on the server, so the cap applies after the filters.

## 4. Other Memory views

| View       | Content                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List       | `ptah-table` of the graph's filtered set: subject, kind, tier, salience, hits, last used, pin state. Multi-select with checkboxes. Same inspector. "Load more" paging. The hint says that the filters are shared with the graph                                                                                                                                                                           |
| Timeline   | The current timeline (events from `memory:search` index) in a `ptah-table`: When, Type, Subject, Concepts. Filter field, type chips, "Show around" anchor, "Load more". The `bm25-only` badge stays when vectors are off                                                                                                                                                                                  |
| Boards     | "Knowledge boards" (current corpora): name, memory count, built date, actions Prime in new chat, Reprime, Rebuild, Delete (inline confirm), "Build board" dialog. "Suggested boards" cards with Create and Dismiss                                                                                                                                                                                        |
| Code index | Index state alert with Re-index, symbol search, symbol table (Symbol, Kind, Path, Tokens), pager, "Clean junk"                                                                                                                                                                                                                                                                                            |
| Health     | Curator (Run curator now, Refresh, trigger toggles, curator model link), Index health (consistency cards, Retry vec, Retry embedder, Open binding folder, Rebuild memory search index, Copy diagnostic), Storage and retention (size, processed, pending, stuck, oldest pending, boot-scan retries, last and next retention run), Live events, Danger zone (purge by subject pattern with mode and scope) |

## 5. Skills page

- Library table per tab (Skills, Agents, Commands). Columns: Name (slug and provenance), Status
  (`ptah-status`: clone, authored, diverged, synth), Runs, Success (`ptah-meter`), Last enhanced,
  Provider copies (Agents only, one badge per provider), row actions (Enhance, Open).
- Toolbar: search, status chips (All, Diverged, Ready to enhance, Never used), Sort by
  (`ptah-select`), "Rebase all diverged (N)", Refresh, and on Agents "Sync provider copies". A
  hint links to Plugin settings for plugin-owned items.
- Enhance is disabled until the item has its minimum recorded runs. The tooltip gives the
  numbers. While Skills is paused, Enhance is disabled.
- Detail drawer (`ptah-native-drawer`, right, 40rem): status and origin, divergence facts and
  reason, metrics and scorecard, model per provider (Agents), phase files, body with Edit (inline
  editor with conflict state), history with Diff and "Revert to this", actions Keep, Rebase,
  Revert, Enhance. Enhance opens the preview with the judge verdict and the diff before a save.
- Maintenance tab: Orchestration specs (counts, Harvest now, Clear stale, "How this works"),
  Quarantined agents (Restore, Finish restore, with the confirm disclosure), Phase scorecards
  (table with rate meter).
- Bulk rebase and reconcile keep their confirm dialogs (`ptah-native-modal`).

## 6. Mapping to `@ptah-extension/ui`

| Need                                   | Component                                                            | Rule                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Page title and toggle                  | `ptah-page-header` + `input[ptahToggle]`                             | Toggle label states the state ("Memory is on")                                                             |
| Stat tiles                             | `ptah-instrument-band`                                               | Tile bar uses state ink only for a warning                                                                 |
| View bar                               | `ptah-native-tab-group`                                              | Tabs, not buttons. Arrow keys move between tabs                                                            |
| Dropdowns                              | `ptah-select` (designed menu)                                        | Never `select[ptahSelect]`. In a toolbar or a row: no floating label, `size="sm"`, `label` or `labelledBy` |
| Text fields                            | `ptah-field` with a floating label                                   | Search fields in a toolbar use the compact form with a leading icon and an `aria-label`                    |
| Setting rows (triggers, curator model) | `ptah-setting-row`                                                   | The row title is the label of the control                                                                  |
| Tables                                 | `ptah-table` with `ptahNumeric`, `ptahStatusCell`, `ptahActionsCell` | Numbers in mono, right aligned                                                                             |
| Status                                 | `ptah-status`, `span[ptahBadge]`                                     | Status ink per `DESIGN.md`                                                                                 |
| Alerts and banners                     | `ptah-alert`                                                         | Tone `warn` for paused and degraded states                                                                 |
| Empty, error, loading                  | `ptah-state-panel`, `ptah-skeleton`                                  | One state panel per pane                                                                                   |
| Confirm                                | `ptah-inline-confirm` (row), `ptah-native-modal` (bulk)              |                                                                                                            |
| Drawer                                 | `ptah-native-drawer`                                                 | Skills detail                                                                                              |
| Popovers                               | `ptah-popover`                                                       | Help text, disabled reasons with detail                                                                    |
| Meter                                  | `ptah-meter`                                                         | Success rate, phase rate                                                                                   |
| Relative time                          | `ptah-relative-time`                                                 | All "ago" values                                                                                           |
| Tooltip                                | `[ptahTooltip]`                                                      | Disabled-button reasons                                                                                    |

## 7. New shared components (API sketches)

These go into `@ptah-extension/memory-curator-ui` unless a second user appears. Then they move
to `@ptah-extension/ui`.

```typescript
// Lazy graph host. Loads sigma + graphology on first render.
@Component({ selector: 'ptah-memory-graph' })
class MemoryGraphComponent {
  readonly nodes = input.required<readonly MemoryGraphNodeWire[]>();
  readonly edges = input.required<readonly MemoryGraphEdgeWire[]>();
  readonly selected = model<readonly string[]>([]);
  readonly colorBy = input<'kind' | 'tier' | 'session' | 'cluster'>('kind');
  readonly sizeBy = input<'salience' | 'hits' | 'uniform'>('salience');
  readonly showLabels = input(false);
  readonly frozen = input(false);
  readonly highlight = input<ReadonlySet<string>>(new Set()); // search matches
  readonly focusRequest = output<string>(); // node focused by keyboard
}

@Component({ selector: 'ptah-memory-inspector' })
class MemoryInspectorComponent {
  readonly memories = input.required<readonly MemoryWire[]>();
  readonly links = input<readonly MemoryGraphEdgeWire[]>([]);
  readonly pin = output<string[]>();
  readonly unpin = output<string[]>();
  readonly forget = output<string[]>();
  readonly openSession = output<string>(); // session id
  readonly focusLink = output<string>();
}

@Component({ selector: 'ptah-graph-toolbar' })
class GraphToolbarComponent {
  readonly filters = model.required<MemoryGraphFilters>();
  readonly counts = input.required<{ shown: number; total: number; capped: boolean }>();
  readonly semanticAvailable = input(true);
  readonly relayout = output<void>();
}

@Component({ selector: 'ptah-time-brush' })
class TimeBrushComponent {
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly range = model.required<readonly [number, number]>();
  readonly histogram = input<readonly number[]>([]);
}

@Component({ selector: 'ptah-library-table' }) // Skills
class LibraryTableComponent {
  readonly kind = input.required<'skill' | 'agent' | 'command'>();
  readonly rows = input.required<readonly CloneRowView[]>();
  readonly paused = input(false);
  readonly open = output<string>();
  readonly enhance = output<string>();
}
```

## 8. States

| Surface         | State                                                    | Design                                                                                                                                                           |
| --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory page     | Paused                                                   | `ptah-alert` warn below the header. Run curator now and Enhance are disabled with a reason                                                                       |
| Memory page     | No workspace                                             | State panel "No workspace is open" with "Show all workspaces"                                                                                                    |
| Memory page     | Non-desktop host                                         | Current "Memory lives in the desktop app" panel stays as is                                                                                                      |
| Graph           | Loading                                                  | Skeleton canvas with "Loading memory graph" (`role="status"`)                                                                                                    |
| Graph           | Empty (no memories)                                      | "No memories yet" with one line on how memories arrive                                                                                                           |
| Graph           | Empty (filters)                                          | "No memories match these filters." with "Reset filters"                                                                                                          |
| Graph           | Node cap reached                                         | Line above the canvas: "Showing N of M memories" + "Show up to 1,500"                                                                                            |
| Graph           | Vectors off                                              | Banner in the canvas: "Semantic links are unavailable." with "Open Health". "Similar meaning" toggle is disabled with the reason. Subject and session edges stay |
| Graph           | No visible links                                         | Hint "No visible links with the current filters."                                                                                                                |
| Graph           | RPC error                                                | `ptah-state-panel` error with Retry. The List view still works from `memory:list`                                                                                |
| Indexing banner | never indexed, indexing, paused, stale, code only, error | Current six banner states, one `ptah-alert` each, same actions (Index now, Cancel, Resume)                                                                       |
| Health          | Read error, mismatch, retention warning                  | Current diagnostics states, shown as cards with a badge                                                                                                          |
| Skills          | Paused, telemetry off                                    | Alert with the effect on Enhance and telemetry                                                                                                                   |
| Skills          | Empty library, no match                                  | State panel per tab, with "Open the setup wizard" on Agents                                                                                                      |
| Skills          | Library failed or updated, sync failed                   | Toast or alert, current copy                                                                                                                                     |

## 9. Motion

- Layout: the force layout runs at most 4 s after a data change, then stops. "Freeze" stops it
  at once.
- Focus: a node focus animates the camera in 300 ms (`ease-out`).
- Drawer and inspector: slide 160 ms. Popovers: fade 120 ms.
- `prefers-reduced-motion: reduce`: no layout animation (the final positions show at once),
  camera moves jump, panels show without a slide.

## 10. Accessibility

- The canvas has `role="application"` and an `aria-label` that states the node and edge counts.
- Keyboard on the canvas: Tab enters the canvas. Arrow keys move the focus to the nearest node in
  that direction. Enter selects. Shift+Enter adds to the selection. Escape clears the selection.
  `+`, `-` and `0` zoom and fit.
- A live region (`role="status"`) announces the focused node (subject, kind, tier, link count)
  and layout state changes.
- The List view is the full accessible alternative: every graph action is available there.
- Node color is never the only signal. Kind also shows in the inspector, the legend has text and
  core nodes have a ring.
- Contrast: edges and labels meet 3:1 against the canvas in both themes. Text meets 4.5:1.
- Every disabled action has a tooltip and an `aria-describedby` reason.

## 11. Responsive

| Width         | Memory                                                                                                                                                                    | Skills                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1440 and more | Rail + canvas + inspector side by side, minimap on                                                                                                                        | Table, drawer (40rem) over the table                                                               |
| 1168          | Rail + canvas. The inspector opens over the canvas on selection. Minimap on                                                                                               | Same                                                                                               |
| 784           | The shell nav becomes a top bar. The filter rail is a slide-over behind "Filters". The inspector is an overlay at the right of the canvas. The toolbar wraps to two lines | The shell nav becomes a top bar. The table scrolls sideways inside its frame. Drawer is full width |

## 12. Feature parity

Every current feature has a place in the new design. The `data-testid` values stay. A test id
of a removed wrapper moves to the new element that has the same role.

### 12.1 Memory (`memory-curator-ui`)

| Current feature (component, test id)                                                                                    | New place                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Memory on/off (`memory-pause-switch`, `memory-enabled-toggle`)                                                          | Page header toggle                                                        |
| Paused notice (`memory-paused-notice`, `memory-pause-error`)                                                            | Paused alert                                                              |
| Stats strip (`memory-stat-core`, `-recall`, `-archival`, `-code-index`, `-last-curated`)                                | Instrument band                                                           |
| Search bar, tier and scope (`memory-search-input`)                                                                      | Graph toolbar Search and the filter rail; List view uses the same filters |
| Entry list (`memory-entry-row`, pin, unpin, forget)                                                                     | List view + inspector actions + bulk bar                                  |
| Cue list (`memory-cue-list`)                                                                                            | Inspector "Connected"                                                     |
| Timeline view and filters (`thoth-section-memory-timeline`, `timeline-bm25-only-badge`)                                 | Timeline view                                                             |
| Knowledge corpora list, build dialog                                                                                    | Boards view, "Knowledge boards"                                           |
| Corpus suggestions                                                                                                      | Boards view, "Suggested boards"                                           |
| Indexed code (`memory-indexed-code`, `symbol-total`, `memory-code-error`)                                               | Code index view                                                           |
| Indexing banner (`memory-banner-*`)                                                                                     | Indexing banner below the header                                          |
| Purge junk                                                                                                              | Code index view, "Clean junk"                                             |
| Rebuild index (`memory-rebuild-index`, `memory-rebuild-result`)                                                         | Health, Index health                                                      |
| Diagnostics accordion (`memory-diagnostics-details`, `refresh-diagnostics`)                                             | Health view                                                               |
| "How this works" help (`curator-how-it-works`, `skills-harvest-how-it-works`)                                           | Disclosure in the Curator section and in Orchestration specs              |
| Run curator now (`run-curator-now`, `run-curator-paused-hint`, `manual-run-status`, `last-curator-run`)                 | Health, Curator                                                           |
| Trigger toggles                                                                                                         | Health, Curator rows                                                      |
| Curator error, open settings (`curator-error*`)                                                                         | Health, Curator alert                                                     |
| DB health (`vec-status-panel`, `vec-retry-btn`, `vec-open-folder-btn`, `embedder-*`, `copy-diagnostic-btn`, `health-*`) | Health, Index health                                                      |
| Storage health (`storage-*`)                                                                                            | Health, Storage and retention                                             |
| Event feed (`event-feed-empty`)                                                                                         | Health, Live events                                                       |
| Danger zone (purge by subject pattern, scope switch)                                                                    | Health, Danger zone                                                       |
| Recovery toast (`recovery-toast`)                                                                                       | Same toast                                                                |
| No active session hint                                                                                                  | Graph state "No workspace"                                                |
| Desktop-only notice                                                                                                     | Unchanged                                                                 |

### 12.2 Skills (`skill-synthesis-ui`)

| Current feature                                                                                                       | New place                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Skills on/off, telemetry (`skills-pause-switch`, `skills-telemetry-switch`)                                           | Page header toggles                                           |
| Specs control (`skills-specs-*`, harvest, clear stale, `skills-harvest-result`, `skills-harvest-error`)               | Maintenance, Orchestration specs                              |
| Clones grid and cards (`clones-grid`, `clone-card-*`)                                                                 | Library table rows                                            |
| Provenance badge and plugin state (`provenance-badge`, `provenance-plugin-state`, `clone-card-plugin-state`)          | Name cell sub-line and drawer header                          |
| Legend, status badge                                                                                                  | Status column + band                                          |
| Diverged filter (`clones-diverged-filter`)                                                                            | Status chips                                                  |
| Bulk rebase bar and modal (`clones-bulk-*`)                                                                           | "Rebase all diverged" + modal                                 |
| Keep and Rebase on one diverged item (`clones-keep-btn`, `clones-rebase-btn`, `drawer-keep-btn`, `drawer-rebase-btn`) | Drawer actions; Rebase also as a row action on a diverged row |
| Refresh library (`clones-refresh`, `clones-library-updated`, `clones-library-failed`)                                 | Toolbar Refresh + alert                                       |
| Agent sync (`clones-agent-sync*`), sync chips                                                                         | "Sync provider copies" + Provider copies column               |
| Enhance button and hint, preview drawer (`preview-*`)                                                                 | Row action + drawer preview                                   |
| Detail drawer (`drawer-*`)                                                                                            | Detail drawer                                                 |
| Body editor (`clone-body-editor-*`)                                                                                   | Drawer Body section                                           |
| History, diff, revert (`drawer-history*`, `lazy-diff-*`)                                                              | Drawer History section                                        |
| Revert from the grid (`clones-revert-btn`, `clones-history-revert-btn`)                                               | Drawer History, "Revert to this"                              |
| Phase files and history (`drawer-phase-*`)                                                                            | Drawer Phase files section                                    |
| Scorecard badge and detail (`scorecard-*`)                                                                            | Success column + drawer Scorecard                             |
| Agent model editor (`agent-model-*`)                                                                                  | Drawer "Model per provider"                                   |
| Reconcile guard (`reconcile-guard-*`)                                                                                 | Same confirm dialog                                           |
| Quarantined agents (`quarantine-*`)                                                                                   | Maintenance, Quarantined agents                               |
| Phase scorecards (`phase-scorecard*`)                                                                                 | Maintenance, Phase scorecards                                 |
| Plugin settings pointer (`clones-plugin-settings-*`)                                                                  | Toolbar hint link                                             |
| Open setup wizard (`clones-open-wizard`)                                                                              | Agents empty state                                            |
| Retired, unused, not owned badges (`clone-card-retired-badge`, `-unused`, `-not-owned`)                               | Name cell sub-line and Status column                          |
| Desktop notice, paused notice, toast (`clones-desktop-notice`, `clones-paused-notice`, `clones-toast`)                | Unchanged copy, new placement as alert or toast               |

## 13. Open questions

1. Node cap default: 150 nodes at first open, 1,500 maximum. Confirm in phase 2 with a
   measurement on a database of 10,000 memories.
2. Similarity threshold default 0.75 and k = 8 neighbors per node. Tune in phase 2 from real
   distances.
3. Suggested boards: keep the current suggestion source, or cluster from graph communities.
   Phase 2 keeps the current source. Graph clusters are a later option.
