> **How to read this file.** The text below the line is the output of the real renderer
> (`renderWalkthrough`), not typed by hand. The input data is split like this:
>
> - **Hand-written:** the whole triage content (summary, areas, risks, API changes, tests), the
>   lens list, the finding counts and the diff size. They match PR #1071 in shape. They are not
>   real model output, because a live triage lane was not cheap to run here.
> - **From the real renderer:** every heading, table, link, count wording, cap, escape and the
>   collapsed sections. The renderer owns the layout. The model only returns data.
> - **Not shown:** the `ptah-review` markers. The GitHub adapter adds them.

---

## PtahCode review · [`1aeafd4`](https://github.com/Hive-Academy/PtahCode/commit/1aeafd4e1f0f4d9a8f4c9c0f4b6c1f7a2d3e4f50)

Adds a proposed "Next" button look to the UI gallery, removes the icon-only directive input and fixes tooltip blur and hover behavior.

| | |
| --- | --- |
| **State** | ⚠️ **Partial** · 1 of 3 lenses unavailable: contracts-callers (deadline) |
| **Scope** | Initial review of the full PR |
| **Size** | 17 files · +1336 −20 · feature |
| **Risk** | 🟡 Medium · Shared button directive and tokens change for every consumer. |
| **Findings** | **2 verified** (🟡 2 minor) · 0 held locally · 0 dismissed |

### Changes

| Area | Files | What changed |
| --- | ---: | --- |
| Button directive | 2 | Removes the iconOnly input. Icon-only state now comes from the content. |
| Tooltip | 1 | Hides the tooltip on blur and no longer keeps it open after hover ends. |
| Design tokens | 2 | Adds tokens and a Next-look button stylesheet. |
| UI gallery (Electron) | 1 | Adds /ui-gallery components that show every button state. |

<details><summary>Walkthrough by area</summary>

- **Button directive** — Removes the iconOnly input. Icon-only state now comes from the content.
  - Callers that set iconOnly must stop passing it.
  - The spec covers the new content-based detection.
  - Files: `libs/frontend/ui/src/lib/button/button.directive.ts`, `libs/frontend/ui/src/lib/button/button.directive.spec.ts`
- **Tooltip** — Hides the tooltip on blur and no longer keeps it open after hover ends.
  - Hover and focus now share one close path.
  - Files: `libs/frontend/ui/src/lib/tooltip/tooltip.directive.ts`
- **Design tokens** — Adds tokens and a Next-look button stylesheet.
  - Files: `libs/frontend/ui/src/styles/tokens.css`, `libs/frontend/ui/src/styles/next-button.css`
- **UI gallery (Electron)** — Adds /ui-gallery components that show every button state.
  - The route is only reachable in the Electron host.
  - Files: `apps/ptah-extension-webview/src/app/ui-gallery/`

</details>

<details><summary>Risks and what to verify (2)</summary>

1. **Removed iconOnly input** — Any template that still binds iconOnly fails to compile.
   Verify: Run typecheck-templates for the webview and the libs it imports.
2. **Tooltip close path** — One shared close path can hide a tooltip that a keyboard user still needs.
   Verify: Tab to a tooltip trigger and confirm the tooltip stays while focus stays.

</details>

<details><summary>API and contract changes (1)</summary>

- `ButtonDirective.iconOnly` · removed — Templates must drop the binding. Callers: `libs/frontend/chat`, `libs/frontend/setup-wizard`.

</details>

<details><summary>Test coverage of this change</summary>

The directive spec and the tooltip spec cover the new behavior.
- Gap: No spec for the Next-look stylesheet classes.

</details>
