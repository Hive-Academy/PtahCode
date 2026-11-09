# Existing system audit — Electron renderer

Scope: read-only audit, 9 November 2026. Source locations below are repository-relative. The product design is already a mature glass variant; the proposed work is a small delta.

## Foundations and themes

| Evidence | Current behavior |
|---|---|
| `package.json:185` | DaisyUI `^4.12.24`; use its v4 `--b1`, `--b2`, `--b3`, `--bc`, `--p` variables, not DaisyUI v5 `--color-*`. |
| `apps/ptah-extension-webview/tailwind.config.js:83-85,232,277,321-356` | Tailwind uses DaisyUI; custom `ptah-glass` and `ptah-glass-light` are eager. The 32 stock themes are deferred in `theme-extra.css`; `themeRoot` is `[data-theme=ptah-glass]`. Do not rename themes. |
| `apps/ptah-extension-webview/src/styles.css:7-18` | Inter, Cinzel, JetBrains Mono imports; CDK overlay and Gridstack CSS; Tailwind base/components/utilities. |
| `apps/ptah-extension-webview/src/app/app.css:1-24` | App host and VS Code loading shell use `--vscode-*`; this is compatibility shell styling, not the glass recipe. |
| `docs/design-system/ptah-content-brand.md:1-18` | Content brand points visual decisions to root `DESIGN.md`; dark ink, gold accent, Inter/JetBrains Mono. |

## Current tokens, roles and fallbacks

| Evidence | Current behavior |
|---|---|
| `styles.css:94-96,456-460,488-492` | Older `.glass-panel` uses `--glass-panel`, `--glass-border`, and `--glass-blur`; light overrides exist. Do not treat it as the new component API. |
| `styles.css:159-171,389-411` | `--surface-0..3`, border, highlight and `.surface-1..3` provide solid structural tiers. |
| `styles.css:2805-2820` | Glass layer v2 documents roles `chrome`, `overlay`, `content`, `tile`; markup and later CSS also use `bar` and `plate` (`styles.css:3184-3216`). It is gated by `data-glass='on'` and `data-glass-mode`. |
| `styles.css:2827-2885` | Existing recipe includes `--glass-filter`, blur 16px/22px, saturation, brightness, radius 22/14/10px, tint/scrims, edge top/bottom, glint, depth shadows, grain and focus. |
| `styles.css:2888-2922` | Dark values: pane base tint alpha .7, reading scrim .62, overlay .88, edge top white .38; light values are defined just above at `styles.css:2869-2885` and in the light-mode block preceding dark. |
| `styles.css:2928-2939,2984-3004,3162-3180,3660` | Unsupported blur, forced colors, reduced transparency and reduced motion have partial existing fallbacks. Any new effect must extend these paths. |
| `styles.css:3134-3158,3193-3237` | Chrome/bar and overlay sample backdrop via `::after`; content/tile/plate remain stable fills. Rim uses `::before`, grain uses `::after`. |
| `styles.css:3276-3460` | Glass styling already covers DaisyUI `btn`, `input`, `select`, `textarea`, `menu`, `tabs-boxed`, `badge`, `stats`, `chat-bubble` and more. |
| `styles.css:3692-3700,3760-3786,3817-3823` | Structural surfaces and chat/tool nested tiles have special scrim rules; broad `.card` restyling would collide. |

## Components in current use

| Area | Evidence and anatomy/classes |
|---|---|
| UI surfaces | `libs/frontend/ui/src/lib/surfaces/surface-section.component.ts:14,23,30-37`: API accepts only `content` or `chrome`, defaults `content`, combines `surface-1`/`surface-2`. `surface-card.component.ts:9-24`: `surface-2`, optional hover border. |
| UI overlay | `libs/frontend/ui/src/lib/overlays/dropdown/dropdown.component.ts:63-64`: `.dropdown-panel surface-3 rounded-xl p-1.5` with `data-glass-surface='overlay'` and focus outline. Native drawer close uses `btn btn-ghost btn-sm btn-square` (`libs/frontend/ui/src/lib/native/drawer/native-drawer.component.ts:100`). |
| Chat composer | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:166,209,286-298,351-362,380-394,512-535`: `bg-surface-0` shell, tile composer, borderless text area, `surface-2` toolbar hover, overlay menu, solid circular send action, plate status line; loading uses `loading-spinner` at line 222/467. Preserve this structure. |
| Chat message/tool | `styles.css:3453-3457,3817-3823,3869`: chat bubbles use readable scrim and rim, tool calls use `tile`, inner transcript content has a reading scrim. `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.css` and `message-bubble-prose.component.css` add message/prose detail. |
| Chat badges/actions | `libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts:53-72`: `badge badge-sm badge-success` or `badge-ghost`; `copy-text-button.component.ts:36-38`: `btn btn-ghost btn-square btn-xs`. `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-summary.component.css` styles stats. |
| Tabs, stats, menus | Global glass treatment is at `styles.css:3377-3432`: existing DaisyUI `menu`, `tabs-boxed`, `tabs-bordered`, `badge`, `stats`. |

`libs/frontend/onboarding/**` and setup wizard use the role vocabulary, but the authoritative styling is renderer `styles.css`, not component-local CSS. The exact PR #1028 foundation diff could not be audited: `gh pr diff 1028 --name-only` returned an authentication prompt. Its flat pill buttons, outlined fields, metric cards and list/detail are known only from the task context/screenshot description.

## Small gaps to close

1. The semantic roles are complete enough; missing is a restrained **component scale** for tiny inner rim/highlight and state response. Current glint is shared across large panes and small controls (`styles.css:2869-2875,3349-3425`).
2. `surface-section` exposes only `content|chrome` while CSS has six role values (`surface-section.component.ts:14`; `styles.css:2813-2817,3184-3216`). Any API expansion needs explicit compatibility review; styling can proceed without it.
3. Existing blur/reduced-transparency/forced-color paths are real, but new component refinements need parity in those branches (`styles.css:3162-3180,3660`).
4. Light and dark use different edge and shadow strengths; small-control rim and state values need theme-specific tuning (`styles.css:2869-2922`).
5. Chat's bespoke borderless textarea and circular send button do not use `.textarea`/`.btn`, so global DaisyUI changes alone will miss them (`chat-input.component.ts:298,512`).
