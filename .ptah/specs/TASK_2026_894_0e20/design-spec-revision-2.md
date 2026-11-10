# Revision 2 ? approved Settings design fixes

| Item | Applied change | Spec section |
|---|---|---|
| 1 | Maximum three columns; 560/860px container thresholds, provisional pending Electron measurement; equal fixed cards. | CLI agents and custom instances provider cards |
| 2 | Budgeted 548px cards for unsupported and unavailable states, moved Reset to a popover, added 4px body padding and a no-overflow verification requirement; compacted empty note and rows. | CLI agents and custom instances provider cards |
| 3 | Fixed-height aria-live test line, fixed-width Test button and status slot; five badge states and running/failed prototype cards. | CLI agents and custom instances provider cards |
| 4 | Light-theme controls use border-base-content/60 or stronger; computed 3:1 boundary verification is required. | Design system applied; States and accessibility |
| 5 | Grid uses component CSS container-type and @container; no query plugin or class. | CLI agents and custom instances provider cards |
| 6 | Production mandates ptah-native-popover, retaining model/effort and Cursor credential components; focus, Escape, one-open and ARIA behavior specified. | CLI agents and custom instances provider cards |
| 7 | Full-access confirmation uses shared native modal dialog from either select; commit only after Confirm. | Full-access confirmation and instance ownership |
| 8 | Instance section owns tiers, Last test and Key set; grid More reaches Tiers/Edit/Delete; instance cards are content-sized. | Full-access confirmation and instance ownership |
| 9 | Credentials row belongs to Cursor only; reserved status line uses space on other cards. | CLI agents and custom instances provider cards |
| 10 | Ghost action triggers, loading and long-name examples, evidence popover and distinct Current CLI mode/Lane default labels. | CLI agents and custom instances provider cards; Routing and capability evidence |

## Render verification

Chromium through ptah_browser_navigate on the in-workspace file URL and ptah_browser_screenshot: at 1600, 1200 and 900px, both themes showed 3, 2 and 1 columns respectively. All six rendered cards measured 548px tall and equal width at each viewport; every card body had scrollHeight equal to clientHeight (zero overflow), including running, failed and unsupported mock states. The 560/860px content thresholds remain provisional until measured in Electron.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Retain 548px card height after compacting rows | Shorten height / fit longest state | 480px browser render overflowed by up to 66px; 548px render had zero overflow | Yes |
| Use 560/860px content thresholds | Prior 620/830/1180px | User max-three requirement; two-column cards remain about 270px at threshold | Yes |
