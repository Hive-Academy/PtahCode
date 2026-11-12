# Family 3 look: badge and status (composite 1)

Date: 2026-11-11. Task: TASK_2026_957_fda3. Step 3 of the six steps. Research:
`badge-status-research.md`. Owner: `libs/frontend/ui/src/lib/badge`. Gallery: `/ui-gallery`,
section "Badge and status family" (`#family-badge`).

## The concept: the word carries the meaning

A badge is a static label. It is not a button. It has no hover, focus or disabled state. The
text tells the meaning. The tone only supports the text. A status adds a glyph. Each state has
its own glyph shape, so a user who cannot see the color still reads the state.

Today the product has 30 class mixes for one idea. The proposal has 6 tones, 2 appearances and
2 sizes for the badge, and 5 inks and 3 appearances for the status.

## A. Owner checks

- [x] `PtahBadgeDirective` (`span[ptahBadge]`) and `PtahStatusComponent` (`ptah-status`) are
      exported from `@ptah-extension/ui`.
- [x] Tokens only. `badge` is in `TOKEN_ONLY_DIRS`. The new tokens are in `ptah-tokens.css`.
- [x] The gallery shows each tone, appearance, size, the count, long text and each status.
      Hover, focus-visible, active, disabled and busy do not apply (static text).
- [x] No behavior. No CDK is necessary. The accessible name is the text, or the `label` of a dot.
- [ ] Zero-pixel adoption: exception requested (open question 4). The owner has no `.badge`
      class and a new look, so a zero-pixel move is not possible without a two-look phase,
      which epic section 5 forbids. The old recipes keep their look until step 5.
- [x] `npm run verify -- -p ui,ptah-extension-webview` and `typecheck-templates` pass.

## 1. Variants

### Badge (`span[ptahBadge]`)

| Tone | Purpose | Use it for | Do not use it for |
|---|---|---|---|
| `neutral` (default) | Metadata | Model, kind, scope, version, file type | A state that needs action |
| `accent` | Brand emphasis | New, Pro, recommended | More than one in a row |
| `info` | Running or informative state | Running, syncing, preview | Plain metadata |
| `ok` | Success state | Active, connected, passed | Decoration |
| `warn` | Attention | Beta, needs review, expires soon | An error |
| `err` | Failure | Failed, expired, offline | A destructive action (that is a button) |

| Appearance | Rule |
|---|---|
| `soft` (default) | Tinted fill of the tone ink. Use it in rows, cards and headers. |
| `outline` | An edge, no fill. Use it only where a fill competes with the surface, for example on a selected row or inside a settings card that already has a tint. |

| Size | Height | Use |
|---|---|---|
| `sm` (default) | 20 px (`--ptah-badge-h-sm`) | Card headers, settings rows, detail panes |
| `xs` | 16 px (`--ptah-badge-h-xs`) | Dense list rows, tabs, tree items |

Long text: put text that can overflow in a `.ptah-badge-text` child. It gets the ellipsis.
Direct text in the badge is cut without an ellipsis.

`count`: tabular figures and a minimum width equal to the height, so 3 and 128 align.
Rule: one `accent` badge for each surface at most, and at most two state tones in one row.

### Status (`ptah-status`)

| Ink | Statuses | Glyph | Color token |
|---|---|---|---|
| `run` | running | ring with a center point and a slow pulse (the point stays with reduced motion) | `--ptah-state-info` |
| `idle` | queued, pending | hollow circle | `--ptah-badge-neutral-ink` |
| `need` | needs-review, warning | diamond | `--ptah-state-warn` |
| `err` | failed, offline | square | `--ptah-state-err` |
| `done` | completed, online | filled circle | `--ptah-state-ok` |

| Appearance | Rule |
|---|---|
| `pill` (default) | Glyph and word in a neutral soft badge. Use it in cards and headers. |
| `inline` | Glyph and word, no fill. Use it in table cells and dense rows. |
| `dot` | Glyph only, with `role="img"`, `aria-label` and `title` from `label`. Use it only where the row text already names the item, for example a rail item. |

The word stays neutral ink. Only the glyph takes the state color. This keeps a list of
statuses quiet and puts the emphasis on the state that differs.

## 2. Tokens

The ink values come from the theme: `--state-ink-*` where a theme sets them (the measured
4.5:1 inks of the picker themes), else the DaisyUI state color. `ptah-glass` and
`ptah-glass-light` use the DaisyUI fallback today.

| Token | Value | Dark (`ptah-glass`) | Light (`ptah-glass-light`) |
|---|---|---|---|
| `--ptah-badge-h-xs` | 1rem | same | same |
| `--ptah-badge-h-sm` | 1.25rem | same | same |
| `--ptah-badge-px-xs` | `--ptah-space-1` (4 px) | same | same |
| `--ptah-badge-px` | `--ptah-space-2` (8 px) | same | same |
| `--ptah-badge-fill-mix` | 12 % of the ink on transparent | same | same |
| `--ptah-badge-edge-mix` | 45 % of the ink (outline edge) | same | same |
| `--ptah-badge-neutral-ink` | `oklch(var(--bc))` | theme base content | theme base content |
| `--ptah-badge-accent-ink` | `--ptah-accent-ink`, else `--ptah-link`, else primary | gold link ink | gold-strong link ink |
| `--ptah-state-info/ok/warn/err` | existing state ink tokens | `--in/--su/--wa/--er` | `--in/--su/--wa/--er` |
| `--ptah-status-glyph` | 0.5rem | same | same |
| `--ptah-status-ring` | 0.125rem | same | same |
| `--ptah-status-square-radius` | 0.125rem | same | same |
| `--ptah-status-pulse-duration` | 1600ms (reduced motion: no animation) | same | same |
| `--ptah-gap-label` | `--ptah-space-1` (4 px) | same | same |
| `--ptah-gap-inline` | `--ptah-space-2` (8 px) | same | same |
| `--ptah-border-width` | existing border width token | same | same |
| `--ptah-ease-standard` | existing motion token | same | same |
| `--ptah-radius-chip` | `--rounded-badge` | theme | theme |
| `--ptah-text-caption-*` | 11 px / 16 px / 500 | same | same |

## 3. White space

| Measure | Value | Rule (`foundation-tokens.md` section 3) |
|---|---|---|
| Height sm / xs | 20 px / 16 px | Below the control heights: a badge is not a control |
| Inner padding sm / xs | 8 px / 4 px | 4 px scale (space-2, space-1) |
| Gap glyph to word | 4 px | `gap-label` |
| Gap badge to badge or to text | 8 px | `gap-inline` (consumer layout) |
| Glyph | 8 px | 4 px scale |

## 4. Visual hierarchy

- Type role: `caption` (11 px, weight 500) for every badge and status word. A badge never uses
  `label` or `body`, so it is always quieter than the text it describes.
- Order of emphasis: `err` > `warn` > `accent` > `info`/`ok` > `neutral`. Outline is one step
  quieter than soft of the same tone.
- Status: only the glyph has color. The word is neutral.

## 5. Reference pages

| Page | Recipes today | Proposed | Expected visible difference |
|---|---|---|---|
| Settings, providers and Ptah AI (`chat/settings/ptah-ai/*-config`, `license-status-card`) | `badge badge-outline badge-sm gap-1 text-base-content`, `badge-success`, raw dots in `credentials-tab` | `neutral outline sm`, `ok soft sm`, `ptah-status inline` | Same size. Success badges get a tint in place of a solid fill. Dots get a shape and a word. |
| Tasks board and detail (`tasks-ui/board/task-list`, `detail/task-relations`) | `badge badge-xs`, `badge badge-ghost badge-xs`, `badge-sm` | `neutral soft xs` | Ghost and plain look the same. Text is caption size. |
| Marketplace nav and cards (`marketplace-nav`, `connector-card-status`) | `badge badge-ghost badge-sm tabular-nums`, `badge-warning` | `neutral soft sm count`, `warn soft sm` | Counts align. Warning is a tint, not a solid yellow. |
| Chat messages and agent cards (`chat-ui` atoms, `agent-card-permission`) | `badge badge-outline badge-sm`, `ptah-ui-status-badge`, `badge-warning` | `neutral soft sm`, `ptah-status pill`, `warn soft sm` | Agent run state uses the shape glyph. Cost and token badges are quieter. |
| Review runs list (`review-runs-ui`) | `bg-current` dots, `badge-outline` | `ptah-status dot` with label, `neutral outline xs` | The dot gets a name and a shape. |

## Exceptions (keep their look)

- Chat composer and canvas rail (decision U2). The canvas rail dot keeps its look.
- `ptah-file-status-badge`: git letter codes with their own contrast spec.

## Proposed Removals

At step 6, after the adoption:

- All `badge badge-*` class recipes outside `libs/frontend/ui` (241 static, 3 dynamic).
- Raw status dots (13) that use `rounded-full` and a `bg-*` state color.
- `ptah-status-badge` in `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts` (0 uses).
- `ptah-ui-status-badge` (`foundation/status-badge.component.ts`): its 3 uses move to
  `ptah-status`. The `PtahStatus` type moves to `badge/badge.types.ts`.
- The inner badge recipes of the private wrappers (`ptah-cost-badge`, `ptah-duration-badge`,
  `ptah-delivery-status` and the others in the research owner table).

## D. Review

- [ ] Contrast: not yet measured. The text is the full ink on a 12 % tint of the same ink. A
      tint lowers the ratio a little, so the measured 4.5:1 of the inks is not proof. Step 4
      measures each tone on the soft fill over surfaces 0 to 2 in the two glass themes from the
      Electron screenshots and records the lowest ratio here. If a tone is below 4.5:1, lower
      `--ptah-badge-fill-mix` or mix the text ink toward base content. The outline edge is
      decoration, not a control edge (no 3:1 need).
- [x] Spacing: 4 px, 8 px, 16 px and 20 px. All on the 4 px scale.
- [x] One design language: the same 6 tones on each reference page.
- [ ] Independent reviewer lane: see the pull request.

## C. Screenshots

The coordinator supplies the Electron screenshots (gallery dark and light, reference pages
before and after). Record the file names and the SHA-256 hashes here.

## Open questions

1. Soft as default, outline only on tinted surfaces. Recommendation: yes.
2. Solid `badge-success`/`badge-warning` become tints. Recommendation: yes. A solid fill is
   louder than a primary button.
3. `ptah-file-status-badge` stays out. Recommendation: yes.
4. Skip the zero-pixel adoption for this family (see section A). Recommendation: yes.

The resolved hex values of the glass themes are recorded with the step 4 screenshots.

## Approval record

Open.
