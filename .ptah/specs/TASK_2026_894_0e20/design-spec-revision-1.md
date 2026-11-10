# Settings design, revision 1

Review source: [design-spec-review.md](design-spec-review.md) (antigravity, REVISE). All revisions are confined to task-folder design artifacts.

| Finding | Change | Location / evidence |
|---|---|---|
| F1 Blocking: unreal Codex destination | Agent behavior mounts after Codex sign-in in the existing connection detail drawer Credentials tab. A typed drawer request opens it from the card link. Sandbox keeps `agent:getConfig`/`agent:setConfig`; web search keeps generic `settings:get`/`settings:set`. | [design-spec.md](design-spec.md), Codex provider; [prototype](prototype/index.html), provider panel. `connection-detail-drawer.component.ts:66,100-107`; `credentials-tab.component.ts:181-193,454`; `connection-kind.ts:9-30`; `providers-settings.component.ts:79-85,1032-1050,1212-1219`; `settings.component.html:171-174`. |
| F2 Serious: invented Context controls | Removed the entire Context prototype panel. Per the later user decision, the production Context layout remains unchanged except removing Codex agents. | [design-spec.md](design-spec.md), Context section; [prototype](prototype/index.html) omits Context. `orchestration-settings.component.ts:62-90`; `advanced-settings.types.ts:136-212,223-261`; `decisions.md` #3. |
| F3 Serious: missing friendly-name sources | Specified a shared frontend display-name store, `cliAgents` instance lookup, built-in labels, slug formatting, `cliModelDisplay` parser, and loading/unknown fallbacks. | [design-spec.md](design-spec.md), Routing; `cli-matrix-rows.ts:222-253,307-322,417-430`; `agent-orchestration-config.component.ts:350,366`. |
| F4 Serious: tall defaults cell | Both labeled selects sit in one row in shared defaults and cards. Defined `layout` input and Codex navigation output; confirmation appears outside the fixed card grid. | [design-spec.md](design-spec.md), CLI cards; [prototype](prototype/index.html), defaults regions. `cli-lane-default-cell.component.ts:15-49`. |
| F5 Serious: viewport breakpoint | Modeled 240px sidebar and content container queries for one/two/three/four equal cards; no viewport breakpoint drives the card count. Captured 900, 1200 and 1600px widths. | [prototype](prototype/index.html), card CSS; [screenshots](prototype/screenshots). Measured 1600px card widths 304.75px. |
| F6 Serious: missing matrix affordances | Every installed card has toggle, identity, status, capability summary/full popover, provider, Credentials, model, effort, safety Info/Edit, inline defaults, Codex note where applicable, Test and More. Toolbar, custom instances, uninstalled group and confirmation stay. | [prototype](prototype/index.html), card grid; [parity inventory](parity-inventory.md); 1600 and 1200 screenshots. |
| F7 Serious: weak boundaries | Controls use a separate token for borders, measured 5.27:1 dark and 5.20:1 light against adjacent surface; production spec calls for semantic `border-base-content/50`. | [design-spec.md](design-spec.md), Design system; [prototype](prototype/index.html), CSS. |
| F8/F9 Moderate: shell and citations | Reused Settings shell and glass surfaces; prototype hex values are identified as approximations and the light token citation is corrected. | [design-spec.md](design-spec.md), Design system. |
| F10/F11 Moderate: evidence semantics/states | Routing evidence is a semantic table with family rowgroups, model row headers, working expansion, source/sample/stale metadata, evidence details and loading/empty/error examples. | [prototype](prototype/index.html), routing panel; [routing screenshot](prototype/screenshots/routing-dark.png). |
| F12/F13 Moderate: claims and toggles | Removed local-only scoring claim and unsupported availability badge; kept routing toggle shape and specified the web-search toggle separately. | [prototype](prototype/index.html), routing/provider; [design-spec.md](design-spec.md). |
| F14-F16 Minor: scaffolding/labels | Marked navigation as review scaffolding, separated CLI safety mode from lane defaults, and used friendly visible labels with unchanged option values. | [prototype README](prototype/README.md); [design-spec.md](design-spec.md). |

## User direction 2026-11-08

| Direction | Applied change |
|---|---|
| Keep production Context management design | Removed the prototype Context tab and its screenshot. The spec explicitly preserves current layout, order, copy and behavior. Only the Codex agents group disappears; its two numeric keys are removed and sandbox/web search move to the Codex provider drawer. The [parity inventory](parity-inventory.md) retains the unchanged global controls. |
| Replace CLI table with provider cards | Replaced the rendered table with a responsive `@container` grid of fixed **548px** cards. Content widths `<620`, `620-829`, `830-1179`, and `>=1180px` show one, two, three, and four columns. At 900/1200/1600px browser widths the result is one/three/four columns. Card body scrolls; every expanding control uses a top-layer popover, keeping width and height stable. |
| Keep all matrix behavior and other fixes | The card grid retains the complete control/readout inventory, order and concurrency toolbar, uninstalled group, custom instances, shared defaults, and full-access confirmation. Routing and Codex drawer improvements remain. |

## Checks

Opened the in-workspace `file://` URL with `ptah_browser_navigate` and saved dark/light PNGs with `ptah_browser_screenshot` at 900, 1200 and 1600px. Browser DOM checks found four installed cards at an identical 548px height, four columns at 1600px, three at 1200px, two at 1100px and one at 900px. Opening either an agent or instance capability popover left its card height unchanged. The CLI table markup and Context panel are absent. Inspected routing and Codex provider captures. Ptah diagnostics reported Markdown and HTML unsupported. No product build, test or server target ran.

## Limits

The 240px sidebar and prototype hex colors are visual approximations. Implementation should measure the actual Electron Settings content width and use the cited semantic theme tokens. Prototype controls show interaction placement and do not call RPC.
