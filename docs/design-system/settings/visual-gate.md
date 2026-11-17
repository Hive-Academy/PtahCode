# Settings visual gate

Every pull request that changes a Settings page must meet these rules before review. The rules
come from section 6 of the gap analysis in `TASK_2026_2255_53ce`. The design target is in
[README.md](README.md).

## Rules

1. The pull request body has a table with these columns: page, width, theme,
   **prototype screen**, **Electron before**, **Electron after**.
2. Capture these widths: 1024, 1440, 1920 and 2560 px in the dark theme, and 1440 px in the
   light theme. Use the design-preview capture with an isolated profile that has **fixture
   data** (lanes, instances, connections), so that rows and expanded rows render.
3. When the pull request touches Providers, include one expanded lane row at 1440 px and at
   1920 px.
4. The prototype screen is a file in `docs/design-system/settings/prototype/screens/`, not a
   path in a local worktree. Write the revision (rev 2 or rev 1) beside each screen.
5. The reviewer opens the screenshots and states one result: matches, differs (with a list),
   or not comparable (with a reason). A review of the source only does not pass the gate.
6. The `ui-class-audit` baseline and the `max-lines` baseline can only go down. The pull
   request states the counts.
7. Every `id`, `data-testid` and `aria-label` that existed before stays. The pull request
   states the result of the parity check in one line. Parity alone does not pass the gate.
8. A fixture-profile error in a screenshot (for example "could not be read") blocks the gate
   until the fixture is fixed. It is not accepted as "data only".

## Where to put gate screenshots

Commit the Electron screenshots of a pull request to
`docs/design-system/settings/gate/<pr-number>/`. Do not use `.ptah/specs/`, because
`.gitignore` ignores `*.png` and `*.jpg` files there.

- Name each file `<page>-<theme>-<width>-<before|after>.jpg`, for example
  `providers-dark-1920-after.jpg`.
- Use JPEG. Keep each file below about 300 KB. Keep the set of one pull request below about
  5 MB.
- Do not capture a profile that contains a real e-mail address, a user name, a local path or a
  key.

## Proposed automation

A separate task can add a `design-preview` spec that captures the four widths. The spec fails
when the content panel at 1920 px is less than 70 % of the main width, or when the lanes table
at 1440 px has `data-collapsed="true"`.
