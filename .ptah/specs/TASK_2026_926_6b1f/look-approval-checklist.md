# Look approval gate: checklist

Use this checklist one time for each component family, at step 3 of the method in
`.ptah/specs/TASK_2026_924_8ac1/design-system-plan.md` (section 4). The user gives the approval.
The coordinating agent relays it. Mass adoption (step 4) does not start before the approval.

## A. Before the request (family owner)

- [ ] The owner component is in `libs/frontend/ui` and is exported from `@ptah-extension/ui`.
- [ ] The component uses tokens only (`foundation-tokens.md`). The token guard spec lists its
      folder in `TOKEN_ONLY_DIRS` and passes.
- [ ] The gallery page (`/ui-gallery`, Electron only) has a section for the family. The section
      shows each variant, each size and each state: default, hover, focus-visible, active,
      disabled, busy, error (where it applies), long text, icon only.
- [ ] Behavior comes from Angular CDK or `@angular/aria`. Keyboard operation and the accessible
      name are correct in the gallery.
- [ ] The zero-pixel adoption (step 2) is merged or is in an open pull request.
- [ ] The scoped checks pass: `npm run verify -- -p <changed projects>`.

## B. The look sheet (`family-<n>-look.md` in the family task folder)

- [ ] Variant list: name, purpose, when to use it, when not to use it. One primary action for
      each surface.
- [ ] Token table: each token the family uses, with its value in the dark theme and the light
      theme.
- [ ] White space: control height, inner padding, gap to adjacent controls, with the rule
      number from `foundation-tokens.md` section 3.
- [ ] Visual hierarchy: the type role of each text part, and the order of emphasis between the
      variants.
- [ ] Reference pages: 3 to 5 pages that show the family in real use. For each page: the
      element recipes of today, the proposed variant, and the expected visible difference.
- [ ] Exceptions that keep their current look (decision U2: chat composer, canvas rail).
- [ ] Removals: the recipes and local components that the family replaces
      (`## Proposed Removals`).

## C. Screenshots (Electron only)

The family owner does not start a build or the application. The owner asks the coordinating
agent, who supplies the screenshots or authorizes the build.

- [ ] Gallery section, `ptah-glass` (dark), full section.
- [ ] Gallery section, `ptah-glass-light`, full section.
- [ ] Each reference page before the change, dark and light.
- [ ] Each reference page with the proposed look, dark and light, same window size (1440 x 900)
      and same data.
- [ ] One capture with keyboard focus on a control of the family.
- [ ] The look sheet records the file name and the SHA-256 hash of each screenshot. The
      screenshots are not committed if they show private data.

## D. Review before the request

- [ ] Contrast: text 4.5:1, control edge and focus ring 3:1, in the two themes.
- [ ] Spacing agrees with the 4 px scale. No value is outside the scale.
- [ ] The family looks the same on each reference page (one design language).
- [ ] An independent reviewer lane read the look sheet and the diff.

## E. The request and the record

- [ ] The owner sends one report to the coordinating agent: the look sheet path, the screenshot
      list, the variant list and the open questions with a recommendation for each.
- [ ] The user answers: approved, approved with changes, or rejected.
- [ ] The look sheet records the answer, the date and the list of approved changes.
- [ ] After approval, step 4 uses the declared DOM delta gate: committed snapshot, screenshot
      pairs for each batch, reviewer lane. A change outside the approved look needs a new
      request.
