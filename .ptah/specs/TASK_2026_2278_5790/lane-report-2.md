# Lane 2 ? Settings field review fixes

Implemented the five findings within the assigned chat settings and Electron shot files. Rendered verification remains for the coordinator: this lane did not run build, serve, e2e or the shot spec. No claim of measured visual success is made.

## Per finding

1. **Compact-window label:** `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:128` now says **Compact window (tokens)**. The previous 36-character label exceeded the floating label's body width, which excludes trailing controls. `LABELS` derives from `NUMBER_FIELDS`, so save/failure feedback automatically uses the new label. Updated the matching spec label at `session-budget-settings.component.spec.ts:316`; repository-wide literal search found no other assertions of the former label. Setting key, input id and test id remain unchanged.
2. **Handoff label and selected token measure:** `session-budget-settings.component.ts:395` overrides only the local grid with `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))`. The generic md minimum was 14rem, leaving too little body width for the full label and selected value. Wider tracks wrap to fewer columns according to available space; the full Handoff after compactions label and Weighted session tokens option text/value remain unchanged.
3. **Vertical rhythm:** `libs/frontend/ui/src/lib/form-controls/ptah-field.css:43` reserves a blank message line in grids for fields without a footer. That blank line made the visible gap after the two selects larger than after fields with real Range hints. Floating labels additionally extend half a label line above their boxes (`ptah-field.css:179`). Both selects now have a real one-line footer (`session-budget-settings.component.ts:268`, `:288`), matching every number field. The local grid uses one row gap of `calc(var(--ptah-gap-field) + var(--ptah-field-label-float-leading) / 2)` at `:397`, leaving clearance above the next notch. Shared primitives are unchanged. The shot measures actual box/message bottoms to next-row label tops, requiring spread <= 2px and positive clearance, and verifies every budget hint occupies one line.
4. **Short help:** `session-budget-settings.component.ts:84`, `:268`, `:288`, `:325` explicitly distinguish short hints from the one long numeric explanation. Repeated token/cost descriptions are dropped. `local-stt-panel.component.ts:135`, `:155` and `local-tts-panel.component.ts:164` use short model hints without info actions. Lane guard source was inspected: its detailed multi-sentence explanation is appropriately long, so its popover, range, `lane-guards-intro` id and test id remain unchanged. Existing explicit ids, data-testids and aria-labels on controls remain. Existing sr-only session select help/resolved paragraphs remain with their ids.
5. **Custom model width:** `local-tts-panel.component.ts:158` spans the custom editor across all grid tracks; `:160` stacks input and Save. STT does the same conditionally in custom mode (`local-stt-panel.component.ts:130`, `:151`). Previously the editor shared a narrow grid track with Source/Voice and lost more width to the adjacent Save button. Both inputs now get their full row. Curated STT retains its existing arrangement.

Regression checks: `apps/ptah-electron-e2e/src/design-preview/settings-field-info.shot.ts:126` measures visible label/value scrollWidth vs clientWidth and uses canvas font/letter-spacing measurement for placeholders against input content width (placeholders do not reliably affect scrollWidth). `:154` measures budget row gaps. After-phase calls run at all existing widths/themes, both on curated drawers and HF/folder custom sources. The budget popover capture now targets the long compaction help instead of the removed Token budget icon. Assertions were added without running the shot.

## Help decision table

Range means the existing numeric range remains in the same single hint line. Shortened wording preserves the useful distinction while allowing the range to fit. One-line fit is asserted by the coordinator-owned shot; it has not been observed here.

| Field | Help text (before ? displayed wording where shortened) | Decision |
| --- | --- | --- |
| Budget unit | Tokens use chat usage; Cost uses priced models. ? Tokens or priced cost. | Hint; original sr-only paragraph/id retained |
| Token measure | Weighted discounts cache reads; raw counts all tokens. ? Weighted discounts cache reads. | Hint; original sr-only paragraphs/ids retained |
| Token budget | Chat token limit. | Dropped as repetition; range hint remains |
| Cost budget (USD) | Session cost limit. | Dropped as repetition; range hint remains |
| Fallback weighted tokens | Used when model pricing is unavailable. ? No pricing. | Hint plus range |
| Tighten at (%) | Starts tightening; stays below Handoff. ? Below Handoff. | Hint plus range |
| Handoff at (%) | Offers to wrap up and hand off to a new session. ? Offers handoff. | Hint plus range |
| Handoff after compactions | Handoff after repeated compactions leave context at least half full. | Popover; range hint |
| Compact window (tokens) | Advisory only until set; then lowers the compact window. ? Unset: advisory. | Hint plus range; the new label supplies the compact-window meaning |
| Repeat-call stop at | This guard stops a lane when it repeats the same call this many times. Lanes also have a weighted token budget and a duration limit. A lane gets an early warning when it reaches the budget warning ratio, or when one more turn of its largest size would cross the limit. The first turn that crosses the token limit is a grace turn: the lane is warned again, and its next turn stops it. A lane stopped by its budget does not resume; start a fresh lane for the remaining work. | Popover unchanged; Range: 2 or greater. hint unchanged |
| STT Whisper model | Curated models download to ~/.ptah/models/ on first use. ? Downloads on first use. | Hint; directory detail dropped |
| STT custom model | Enter an owner/name repository or an absolute folder path. ? Use owner/name or an absolute folder path. | Hint |
| TTS custom model | Enter an owner/name repository or an absolute folder path. ? Use owner/name or an absolute folder path. | Hint |
| Track a budget for each chat session | Enable this limit for the current chat. | Existing setting-row hint unchanged |
| Hand off automatically at 100% | Hands off once per session, after the current turn. | Existing setting-row hint unchanged |

## Decisions

- Keep long select option text and Handoff label; widen the local grid instead of renaming these established concepts. Evidence: generic 14rem tracks plus field padding/actions constrain their usable width; the user expressly permits a local grid minimum. Reversible local CSS change.
- Supply real select hints rather than changing shared empty-footer behavior. Evidence: the shared grid intentionally reserves message space; changing it would affect unrelated forms. Reversible template/CSS change.
- Stack custom Save below a full-row input instead of preserving the compressed inline editor. Evidence: both existing editors use the same grid-plus-flex arrangement and the user explicitly asks for a full row. Reversible template change; same state and save APIs.

## Changed files (this lane)

- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts`
- `apps/ptah-electron-e2e/src/design-preview/settings-field-info.shot.ts`
- `.ptah/specs/TASK_2026_2278_5790/lane-report-2.md`

The existing task.md/status.md working-tree changes are outside this lane's edits. No Providers or shared UI primitive changes; no git writes.

## Checks and results

Initial inspection: `git diff main...HEAD -- libs apps`.

Final focused Jest command:

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts --silent
```

PASS: 3 suites, 93 tests, 0 failed, 0 snapshots; 36.544s. Earlier runs of the same command without `--silent`: first 92 passed/1 failed (old select-description assertion), then 93 passed/0 failed; after moving compact-window help to a hint, 92 passed/1 failed (old info-id assertion). Both obsolete assertions are updated; final run above passes.

```powershell
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.spec.json
```

PASS: both exit 0, no diagnostics. The standard e2e tsconfig excludes design-preview shots, so the changed shot was additionally checked with this temporary config (removed afterward):

```powershell
$laneTypecheckConfig = Join-Path $env:TEMP 'ptah-settings-field-info-lane-2.tsconfig.json'
@{ extends = (Join-Path (Get-Location) 'apps/ptah-electron-e2e/tsconfig.spec.json'); files = @((Join-Path (Get-Location) 'apps/ptah-electron-e2e/src/design-preview/settings-field-info.shot.ts')); include = @(); exclude = @() } | ConvertTo-Json | Set-Content -LiteralPath $laneTypecheckConfig
npx tsc --noEmit --project $laneTypecheckConfig
$laneTypecheckExit = $LASTEXITCODE
Remove-Item -LiteralPath $laneTypecheckConfig
exit $laneTypecheckExit
```

PASS: exit 0, no diagnostics, including a rerun after replacing non-null assertions with explicit required-node checks.

```powershell
npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts apps/ptah-electron-e2e/src/design-preview/settings-field-info.shot.ts
```

PASS: exit 0, 0 errors, 0 warnings. Initial lint found 3 non-null-assertion warnings in the shot helper, subsequently removed.

`git diff --check`: PASS, exit 0 (line-ending normalization notices only).

Ptah diagnostics was attempted with scoped changed components; it returned unavailable after its 45s compiler timeout, twice. Native direct TypeScript checks above are the fallback evidence. Ptah workspace analysis and AST inspection were available. `ptah_search_files` returned zero AGENTS.md hits; native read confirmed no root AGENTS.md. No skill-loading tool/catalogue was exposed in this lane, so requested frontend/design skills could not be loaded or applied from their bodies.

UI-class audit: no cheap plain JavaScript script exists in tools/ui-class-audit (the entry is TypeScript with a ts-node target). Skipped per task instruction. No new raw spacing utility classes were added; the new gap uses the existing --ptah-gap-field token. Audit totals were not measured.

## Unmet / coordinator follow-up

- Run the after-phase Electron shot at 1824 / 1168 / 784 and inspect the dark screenshots against all five findings. This lane did not launch or render the application, so actual clipping/one-line fit and row-gap equality remain unverified visually. The new assertions are ready for that run.
- No shot/e2e, build, serve, nx, npm run verify, commit, push, stash or other git write command was run.
- A progress report requesting coordinator visual verification was refused by ptah_agent_report with `parent-inbox-full`; this deliverable carries that follow-up.
