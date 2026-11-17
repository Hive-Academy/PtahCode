# Context — TASK_2026_2257_26ea

PR F of the settings fix program (epic `TASK_2026_1177_9109`). Docs only. No change in `libs/`
or `apps/`.

## Goal

Put the agreed settings prototype (rev 2), the design spec, the apply plan and the rev 2 /
rev 1 reference screens in a tracked folder (`docs/design-system/settings/`), and write the
visual gate (section 6 of the gap analysis in `TASK_2026_2255_53ce`, root cause R7).

## Decisions

- Location `docs/design-system/settings/`: `.gitignore:135-136` ignores `*.png` and `*.jpg`
  under `.ptah/specs/`. `git check-ignore` confirmed the new folder is not ignored.
- Screens kept: `rev2b-*` (4), `review-a3-*` (3), `lane2b-*` (4, rev 2 captures that the gap
  analysis names as reference screens), `rev2-context-dark-784.jpg` and
  `rev2-matrix-light-1168.jpg` (the only rev 2 screens of Context and the matrix), rev 1
  `advanced-*` and `search-*` (8, pages with no rev 2 screen). Superseded screens left out.
- Only `settings-prototype.html` is copied. `rev-2.html` has the same SHA-256 hash.
- Each copy was compared byte by byte (`fc.exe /b`, exit 0) before edits.
- Privacy scan: one local absolute path in `settings-apply-plan.md:31` replaced with
  `<main-checkout>\node_modules`. No e-mail address, user name or secret found. JPEG files
  contain no EXIF block and no user name.
- Gate screenshots of future PRs: `docs/design-system/settings/gate/<pr-number>/`.
- Pointer: new `docs/design-system/README.md` index plus two lines in `CONVENTIONS.md`.
