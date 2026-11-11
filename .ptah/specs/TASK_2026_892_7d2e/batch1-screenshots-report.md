# Batch 1 screenshots report

## Files changed

- Capture code: `apps/ptah-electron-e2e/docs-screenshots.config.ts`; `src/docs-screenshots/{agents,chat,marketplace,providers,sessions,setup,workspace-settings}.shot.ts`; `src/docs-screenshots/_harness/{docs-fixtures,docs-profile,shooter}.ts` (all under `apps/ptah-electron-e2e`).
- PNGs: the 20 changed files listed under **Privacy check**, all in `apps/ptah-docs/public/screenshots/`.
- This report. No docs page references changed, and all existing PNG names remain.
- I did not change README, docs-videos, electron-launcher, project configuration, or video assets. The separate docs-videos lane changed its own files during this work; its earlier lint errors were gone by the final scoped verify.
- The lane exposed no skill-loading tool, so no skill package was loaded; repository task guidance and the existing screenshot harness were used.

The harness defaults to a throwaway sample repo and the launcher's isolated database. The only source profile is the OS app-data `Ptah Dev` directory; no screenshot code reads production `~/.ptah`. Every fixture creates a temporary home and passes it as both `HOME` and `USERPROFILE` to Electron. Default shots seed synthetic state. The saved-session test copies one development workspace's saved storage into that home's `.ptah` and the temporary Electron profile. No test starts an AI provider run.

**Home-isolation correction:** `C:\Users\dev\.ptah\settings.json` SHA256 was `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4` immediately before and after the final full capture. A prior capture overlapped the separate `ptah-docs:videos` lane; its before/after hashes differed (`3B77A44A544E315FAB6EA64E66ACF6A418A2FB94D1AE5D6EC028FEC36215132B` -> `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4`), so that earlier change cannot be attributed to this lane. The final capture ran after the video lane released the lock and did not change the production file. Every generated PNG was recaptured under the isolated home.

## Shots added

These nine entries from the plan's 17-row table were captured. Each selector was exercised in the rendered Electron app during the passing locked run.

| PNG | Rendered crop selector | Result |
|---|---|---|
| `agents-cli-panel.png` | `[data-testid="cli-matrix"]` | Current Settings matrix with detected CLI rows after the detection request settles. |
| `agents-setup-wizard.png` | `[data-testid="analyze-workspace"]` | Pre-run analysis step. |
| `chat-at-suggestions.png` | `.suggestions-panel` | Sample-repo files; clean crop with no approval popover. |
| `chat-autopilot-toggle.png` | `dialog[aria-label="Approval mode settings"]` | Current approval popover. |
| `chat-model-selector.png` | `ptah-model-selector .dropdown-panel` | Current selector with rendered model options. |
| `marketplace-smithery.png` | `[data-testid="marketplace-content"]` | Smithery connection screen; branding still exists. |
| `providers-settings.png` | `[data-testid="connections-grid"] [data-testid="provider-connection-card"]:first` | Generic provider card; no account identity. |
| `setup-ai-team-builder.png` | `[data-testid="onboarding-path-team-builder"]` | Pre-run team-builder entry card. |
| `setup-hub.png` | `ptah-onboarding-home` | Current setup home. |

Existing shot definitions refreshed the other PNGs in the privacy table.

## Shots left stale

| PNG | Reason |
|---|---|
| `agents-catalog.png`, `agents-overview.png` | The old Agents page has no current route. Marketplace is a different surface; original bytes were left untouched. |
| `agents-custom-editor.png` | The old custom editor is absent; no replacement was fabricated. |
| `agents-wizard-step1.png`, `agents-wizard-step3.png` | Analysis phases and recommendations require a provider run, excluded by D9. |
| `chat-cost-bar.png` | No replayable saved conversation with current cost stats was available. |
| `chat-execution-tree.png` | README-critical; **not recaptured**. It still shows old UI and “Opus 4.7.” Session used: **none**. Saved rows rendered one bubble, zero tool rails and zero agent nodes in the prior inspection; the final isolated run could not open the previous-sessions dialog. The required expanded delegation and token/cost badges could not be verified. |
| `chat-overview.png` | README-critical; **not recaptured**. Session used: **none**. No saved row rendered assistant text plus a tool call in the prior inspection; the final isolated run could not open the previous-sessions dialog. I restored the previous transcript PNG after an interim empty-composer capture. |

Saved-session titles inspected in the prior run: “Run F. Use the Agent tool,” “Run E. Use the Agent tool,” “can you spawn the claude cli tool,” “Convene a Tribunal Council,” “what model are u and what skills,” and “hey.” The dev storage has session metadata and agent-output records, but those rows did not replay into the full chat view with the isolated database. In the final isolated-home run, the previous-sessions dialog was unavailable, so the optional shot skipped. I did not synthesize a completed run from those records. The two unchanged README PNGs were opened and passed the same privacy check below.

## Privacy check

I opened every changed PNG after the final isolated-home capture. **Pass** means no real path with a user name, email, account identity, token, or private project name is visible. `ptah-e2e-git-*` labels are generated sample repos; provider names are product names.

| Changed PNG | Visible content | Privacy |
|---|---|---|
| `agents-cli-panel.png` | Loaded CLI matrix | Pass |
| `agents-orchestration.png` | CLI capability matrix | Pass |
| `agents-setup-wizard.png` | Pre-run analysis | Pass |
| `chat-at-suggestions.png` | Sample-repo file names | Pass |
| `chat-autopilot-toggle.png` | Approval popover | Pass |
| `chat-model-selector.png` | Populated model dropdown | Pass |
| `commit-composer.png` | Sample commit message | Pass |
| `diff-side-by-side.png` | Generated sample repo diff | Pass |
| `git-dock-header.png` | Git controls | Pass |
| `marketplace-smithery.png` | Empty API-key field | Pass; no key value |
| `providers-settings.png` | Provider brand and status | Pass; no account name |
| `recent-workspaces.png` | Generated sample repo label | Pass |
| `sessions-analytics.png` | Settled Usage panel; account cards cropped out | Pass |
| `settings-overview.png` | Loaded CLI rows, provider brands and generated repo label | Pass |
| `setup-ai-team-builder.png` | Entry card | Pass |
| `setup-hub.png` | Generated sample repo label | Pass |
| `setup-new-project.png` | Entry card | Pass |
| `theme-toggle.png` | Theme menu | Pass |
| `v2-thoth-memory.png` | Synthetic facts and metrics | Pass |
| `workspace-switcher.png` | Generated sample repo label | Pass |

`chat-overview.png` and `chat-execution-tree.png` are unchanged/stale, but I opened them too; both pass the same privacy check. No new PNG contains development-session text.

## Command results

| Command | Exit | Filtered result |
|---|---:|---|
| `node scripts/verify.mjs --exec --task docs-screenshots -- npx nx run ptah-docs:screenshots`, final foreground run | 0 | Nx 3 tasks succeeded; Playwright 13 passed, 7 skipped. Saved-session shot skipped because its dialog was unavailable in the isolated copy. Production settings hash unchanged before/after. |
| Same locked capture, preceding isolated-home run | 1 | 13 passed, 6 skipped, 1 saved-session dialog failure. The optional session test now skips when no dialog is available. Production hash unchanged before/after. |
| Same locked capture, initial isolated-home run | 1 | 12 passed, 6 skipped, 2 Windows `EPERM` cleanup failures. Cleanup now retries and reports retained temporary profiles. Production hash changed during concurrent video capture, with attribution unresolved. |
| Same locked capture, earlier pre-isolation run | 0 | 13 passed, 7 skipped; later invalidated by the production-home correction and fully recaptured. |
| `node apps/ptah-docs/scripts/check-screenshot-refs.mjs` | 0 | All 29 docs references resolve; 6 unreferenced PNGs reported. |
| `npm run verify -- -p ptah-electron-e2e` | 0 | Header selected exactly **1 project**, `ptah-electron-e2e`. Lint and typecheck both passed (2 Nx tasks); no `test` target is configured. |
| Scoped `ptah_get_diagnostics` after last edits | clean | 0 TypeScript errors or warnings in `chat.shot.ts` and `docs-profile.ts`. |
| Round 2 final locked capture | 0 | Nx 3 tasks succeeded; Playwright 13 passed, 7 skipped (9.6m). Production settings SHA256 unchanged before/after. |
| Round 2 screenshot reference check | 0 | 29 docs references resolve; 6 unreferenced PNGs. |
| Round 2 `npm run verify -- -p ptah-electron-e2e` | 0 | Header selected exactly **1 project**; lint and typecheck both succeeded (2 tasks); no test target. |

## Decisions

- **Home isolation:** Give every screenshot fixture a temporary home and pass it as both `HOME` and `USERPROFILE` to Electron, matching the existing e2e `HOME_ENV_KEYS` pattern. Copy selected dev workspace storage into that home's `.ptah` only; never read production `~/.ptah`. Evidence: app settings use `os.homedir()` despite isolated Electron userData and DB; final before/after production settings hashes match. Reversible: yes.
- **Dev data:** Copy one existing dev workspace's storage only for saved-session attempts; keep default shots synthetic. Evidence: relaxed D8 and sample-repo fixture. Reversible: yes.
- **Live runs:** Stop at pre-run setup UI; leave run-dependent shots stale. Evidence: D9. Reversible: yes.
- **Removed surfaces:** Keep old Agents/editor PNGs and page references. Evidence: D10 and current routes. Reversible: yes.
- **README images:** Preserve the previous transcript and execution-tree PNGs because tested saved rows had one bubble, zero tool rails and zero agent nodes, and the final isolated-home run could not open the previous-sessions dialog. Reversible when replayable neutral data exists.
- **Smithery:** Capture its current connection screen because the route and brand remain in Electron. Evidence: rendered marketplace content. Reversible: yes.
- **Round 2 settled states:** Wait for installed CLI rows and the completed detection control, model option elements, and Usage content or error with the account loading indicator gone. Evidence: all four rendered PNGs after the passing locked capture. Reversible: yes.
- **Round 2 analytics privacy:** Crop the settled Usage panel because the full dashboard displays development-profile account identifiers. Evidence: first round 2 image review; the final cropped PNG contains no account card. Reversible: yes.

## Clarifications Needed

- A replayable, neutral saved session with assistant text, a tool call and a delegation is needed to replace `chat-overview.png` and `chat-execution-tree.png` under D9. The six inspected rows did not meet those conditions, and the final isolated-home run could not open the previous-sessions dialog. No provider call is needed once suitable saved data is available.

## Recapture round 2

Orchestrator review identified four screenshots showing transient loading or empty UI. The shot definitions now use explicit final-state waits. `chat.shot.ts` also tolerates the optional saved-session dialog closing after it first loads; a previous round 2 run failed there, outside the four requested shots. No saved-session README image was replaced by this change.

| PNG | Final rendered state | Privacy check after opening PNG |
|---|---|---|
| `agents-cli-panel.png` | Installed CLI rows (Codex, Copilot, Antigravity, OpenCode, Grok, Claude) after detection. | Pass: product and CLI names only; no private path, email, account name, token or private project name. |
| `chat-model-selector.png` | Populated model options, with no empty selector state. | Pass: model labels only; no private data. |
| `settings-overview.png` | Detection complete, populated CLI order and installed rows; no “Detecting…” or “Loading…” state. | Pass: only a generated `ptah-e2e-git-*` sample-repo label and provider product names. |
| `sessions-analytics.png` | Settled “No recorded usage” panel, with no spinner. The full dashboard had development account identifiers, so this shot is cropped to `ptah-usage-dashboard`. | Pass: no account cards, paths, emails, tokens or private project names. |

The final locked command `node scripts/verify.mjs --exec --task docs-screenshots -- npx nx run ptah-docs:screenshots` exited **0**: Nx **3/3** tasks succeeded; Playwright **13 passed, 7 skipped**. Its preceding run exited **1** after **13 passed, 6 skipped, 1 failed** because the optional saved-session dialog closed between checks; the guard above resolved that failure. The earlier round 2 run passed but its full analytics image exposed development account identifiers, which prompted the crop. The production `C:\Users\dev\.ptah\settings.json` SHA256 was `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4` immediately before and after the final run. The isolated home remained active.

`node apps/ptah-docs/scripts/check-screenshot-refs.mjs` exited **0** (29 references resolve, 6 unreferenced PNGs). `npm run verify -- -p ptah-electron-e2e` exited **0**; its header selected exactly **1 project**, lint and typecheck passed (2 tasks), and the project has no test target. Scoped `ptah_get_diagnostics` after the final source edit found **0 errors and 0 warnings**.
