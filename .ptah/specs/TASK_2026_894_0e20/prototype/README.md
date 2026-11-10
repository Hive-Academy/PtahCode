# Ptah Settings prototype

Open [index.html](index.html) directly in a browser with `file://`. This static HTML, CSS and JavaScript page needs no server, build, network or RPC. Use the toolbar to switch dark and light themes. The 240px Settings sidebar is modeled in every capture. Section tabs and the sidebar are review controls; they do not propose product navigation changes.

| Prototype section | Product surface |
|---|---|
| CLI agents | Shared Ptah CLI defaults, instance cards and equal-height provider cards replacing the CLI agents matrix table |
| Orchestration | Routing switch, friendly last picks and grouped capability evidence |
| Providers / Codex | Existing provider connections page with the Codex connection detail drawer open on Credentials |

The production Context management tab is intentionally omitted. Per user decision on 2026-11-08, its design stays exactly as it is; implementation only removes the Codex agents group and moves web search and sandbox to the Codex provider drawer.

The provider cards use the Settings content container width: one column below 560px, two from 560px and three from 860px. These thresholds are provisional until Electron measurement. Every card is 548px tall and the body does not scroll in the drawn normal, running, failed and unsupported states. Credentials appears only for Cursor. Status badges have fixed slots; Test has a fixed width and an aria-live result line. Reset and full explanations are in popovers. The full-access preview uses a modal dialog; the select retains its committed value until Confirm. Prototype popovers model the production ptah-native-popover behavior. Selects, toggles and menus are local examples and do not call RPC. The Codex card link opens the provider drawer mock.

## Screenshots

- [900-dark.png](screenshots/900-dark.png), [900-light.png](screenshots/900-light.png): narrow Settings, one card per row.
- [1200-dark.png](screenshots/1200-dark.png), [1200-light.png](screenshots/1200-light.png): two cards per row.
- [1600-dark.png](screenshots/1600-dark.png), [1600-light.png](screenshots/1600-light.png): three cards per row.
- [card-states-dark.png](screenshots/card-states-dark.png): running, failed, unsupported and reset popover states.
- [routing-dark.png](screenshots/routing-dark.png): rotation tiles and grouped evidence grid.
- [provider-dark.png](screenshots/provider-dark.png), [provider-light.png](screenshots/provider-light.png): Codex Credentials drawer.
- [provider-detail-dark.png](screenshots/provider-detail-dark.png), [provider-detail-light.png](screenshots/provider-detail-light.png): drawer scrolled to sandbox choices.

## Implementation boundary

The prototype uses mock values and a local approximation of Ptah theme tokens. Production behavior uses the existing Angular components, DaisyUI tokens, host RPCs and confirmation flow in [design-spec.md](../design-spec.md). No product code was changed.
