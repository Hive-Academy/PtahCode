# Electron skills screenshot pass

Prepared for TASK_2026_2269_0334 in `D:\projects\ptah-extension\.claude-worktrees\skills-step-redesign`.

Status: capture files written; 5 Playwright tests list successfully; focused TypeScript check passes. No build, launch, screenshot, install, registry call, or live AI run was executed by this lane. The coordinator must execute and inspect the pass below before claiming visual approval.

## Launch and prerequisites

The imported docs fixture launches the real Electron app via `launchPtah`, not a browser renderer fixture. Evidence: `apps/ptah-electron-e2e/src/docs-screenshots/_harness/docs-fixtures.ts:55` creates a scratch sample repository, `:64` creates an isolated profile, `:71` launches Electron, `:77` checks its home, and `:90` obtains the real window. `apps/ptah-electron-e2e/src/support/electron-launcher.ts:77` resolves `dist/apps/ptah-electron/main.mjs` relative to the launcher in THIS worktree; `:132` calls Playwright `_electron.launch` with that entry and an isolated user-data directory. It waits for the real `file:.../renderer/index.html` window.

This worktree needs current `ptah-electron:build-dev` and `ptah-electron:copy-renderer-dev` outputs. Neither the entry nor renderer index was present at inspection. The imported global setup checks main.mjs, preload.js and renderer/index.html (`apps/ptah-electron-e2e/src/support/build-precheck.ts:26`); it does not build or detect stale content. Rebuild after renderer changes even if those files later exist.

`apps/ptah-electron/project.json:441` defines build-dev as sequential main/preload/worker bundles and WASM copying. `:470` defines copy-renderer-dev as the development renderer build followed by copy-renderer.js. `apps/ptah-docs/project.json:27` uses those same two prerequisites for its screenshots target. Do not run that docs target here: it would select the ordinary docs shots. No reliable duration or memory estimate is specified in these files. `scripts/verify.mjs:20` documents a default 5 GB free-memory admission threshold and three slots, not actual build peak usage. Run these stages sequentially under the lock.

## Data feeding and isolation

Use the existing `UiDriver.installFakeRpcListener()` and `mockRpc()` seam. `apps/ptah-electron-e2e/src/support/ui-driver.ts:108` removes real listeners on the renderer RPC channel, `:135` records calls, `:175` emits correlated success replies, and `:211` updates deterministic response maps. There is no forwarding of unmatched RPCs to production handlers. No production change is needed, and the docs fixture explicitly supports this seam.

The shot seeds a completed version-4 analysis, a saved-analysis metadata row, two recommendations with all display fields, three detected stack entries, an unmatched sqlite-vec item, and a per-item search failure. One recommendation is already installed, exercising selectable installed skills. Consent includes SKILL.md-only content and another skill with a script path and a content hash. RPC preview data is synthetic; no file is fetched.

Analysis navigation uses the actual home Analyze link, saved analysis Use button, then Review skills. Evidence: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:254`, `:269`, and `:158`; loading through the store requires a completed manifest (`analysis-step.store.ts:139`). `analyze-skills.page.ts:202` requests recommendations; its `preview()` requests consent previews without installing. The team-builder screenshot fills the actual intent textarea and submits Review skills (`proposal/team-builder-start.page.html:40`, `:86`); its existing loadReview calls are mocked. The webview fixture-server is unnecessary and would not satisfy the Electron-only visual review requirement.

The fixture uses the sample-repo sentinel, never the real worktree as the opened project. Its scratch-repo helper creates and commits a throwaway repository at runtime; it does not write this worktree's git state. `docs-profile.ts:60` creates a fresh run directory; `:77` overrides APPDATA, LOCALAPPDATA and PTAH_DB_PATH; `:78` overrides all supported home environment keys. `electron-launcher.ts:116` supplies the explicit isolated database path. The profile is synthetic, not copied from the user's real profile. Production settings are read only to hash them (`docs-profile.ts:23`), checked after the test and through reused global setup/teardown. Shutdown and cleanup are inherited from the fixture; Windows locked temporary files may be retained with a warning.

The fake RPC listener attaches after the real app boots. Startup may perform ordinary background initialization inside the scratch workspace/profile before interception. This pass does not initiate any live AI work, registry search or installation; after interception, renderer RPC cannot reach those real handlers. It does not claim a process-wide network air gap. Tests stop at consent and never press its install confirm. Main analysis shots assert zero observed install and deep-analyze calls. Do not replace sample-repo with the developer's project or point PTAH_DOCS_CAPTURE_DIR at a real profile.

Theme selection uses the application's persisted `ptah-theme-v2` localStorage hint before renderer reload, and asserts the service-applied `data-theme`. Evidence: `libs/frontend/core/src/lib/services/theme.service.ts:206`, `:349`, `:473`, `:276`. Captures use the eager official Ptah Glass dark/light pair; they do not replace CSS or DOM content.

## Files written

- `.ptah/tmp/skills-shots/playwright.config.ts`: imports the existing docs config by relative path, resets testDir to the throwaway folder, and resolves existing global hooks absolutely. One worker; no retries; no trace/video/automatic screenshots. Playwright results stay under the throwaway directory.
- `.ptah/tmp/skills-shots/skills.shot.ts`: imports the real docs fixtures, supplies deterministic RPC replies, navigates actual UI, sizes Electron content to exact CSS viewport dimensions and writes full-window JPGs at quality 80 directly to this task's gate directory.
- `.ptah/tmp/skills-shots/tsconfig.json`: small strict noEmit check for those two files and their harness imports.
- This plan. No tracked source file was changed by this lane. Other lanes already have tracked modifications in the worktree.

Importing the shooter transitively supplies the fixture's initial sizing, but this spec never calls `shoot()`, so nothing writes into `apps/ptah-docs/public/screenshots/`. The only explicit screenshots use `page.screenshot` with the task gate path.

## Exact coordinator commands

Run from the worktree root in PowerShell. Each command acquires the machine verify lock. Commands 1 and 2 are only needed when the coordinator has not already produced current outputs in this worktree; listing alone does not require them.

```powershell
Set-Location 'D:\projects\ptah-extension\.claude-worktrees\skills-step-redesign'
node scripts/verify.mjs --exec --task skills-shots-build-electron -- npx nx run ptah-electron:build-dev --parallel=1
node scripts/verify.mjs --exec --task skills-shots-copy-renderer -- npx nx run ptah-electron:copy-renderer-dev --parallel=1
node scripts/verify.mjs --exec --task skills-shots-types -- npx tsc --noEmit -p .ptah/tmp/skills-shots/tsconfig.json
node scripts/verify.mjs --exec --task skills-shots-list -- npx playwright test --config=.ptah/tmp/skills-shots/playwright.config.ts --list
node scripts/verify.mjs --exec --task skills-shots-capture -- npx playwright test --config=.ptah/tmp/skills-shots/playwright.config.ts --workers=1
```

Only the final command launches Electron. No Nx e2e/docs-screenshots target is used. Existing global setup only checks outputs and records the settings baseline. No native rebuild or dependency install is included; if launch reports a native ABI mismatch, stop and report the actual error to the coordinator rather than altering the shared node_modules junction.

Expected output under `.ptah/specs/TASK_2026_2269_0334/gate/`:

- `skills-analysis-dark-1280.jpg` — populated analysis, 1280×720, rail title visible, primary completely in viewport.
- `skills-analysis-light-1280.jpg` — same in light theme.
- `skills-analysis-dark-900.jpg` — 900×700, rail title hidden for bottom bar, primary completely in viewport.
- `skills-none-dark-1280.jpg` — both cards unchecked; Continue without skills visible.
- `skills-consent-dark-1280.jpg` — actual primary click, open consent dialog, script-free and script-bearing previews.
- `skills-team-builder-dark-1280.jpg` — real team-builder review after intent submission, 1280×720.
- `skills-empty-dark-1280.jpg` — no recommendations, unmatched detected stack entries, Continue without skills.

The 1280 shots assert rail title visibility and the 900 shot asserts it is hidden. The breakpoint is a 1100px container query (`proposal/stack-skill-review.component.css:30`); viewport width alone does not guarantee that the shell leaves sufficient container width. An assertion failure is useful evidence of a real layout problem: retain the failure, inspect shell dimensions, and do not silently increase the requested size. The spec intentionally does not scroll the primary into view before asserting its bounds.

## Validation and exclusions

Executed: `npx playwright test --config=.ptah/tmp/skills-shots/playwright.config.ts --list` ? 5 tests, one file; no launch. `npx tsc --noEmit -p .ptah/tmp/skills-shots/tsconfig.json` ? exit 0, including after final selector assertions. Scoped `ptah_get_diagnostics` returned unavailable after 45 seconds, with both throwaway TypeScript files unchecked; the focused native TypeScript check provides the usable result. No runtime test is reported as passed and no screenshots exist from this lane.

Not covered: loading capture, interactive search error/retry, a user-entered search with zero results, install execution/results, real registry accuracy, real analysis execution, owner-decision guidance variants, keyboard/focus/accessibility audit, or every theme. The populated fixture does cover an unmatched stack item and a recommendation-search failure. No rendered screenshot was inspected in this lane because launching was explicitly reserved to the coordinator. Inspect the seven images against the approved coverage-board design and pinned action requirement before using them in the PR. Do not treat successful file generation alone as visual approval.

Skill discovery/loading is not exposed in this lane's tool catalogue (only harness skill search/create tools are present); no design or frontend skill was loaded or reconstructed. This work only prepares test artifacts and changes no UI implementation.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Reuse main-process fake RPC | existing UiDriver; new production hook; profile seeding alone | UiDriver already replaces RPC listeners and docs fixtures explicitly allow it | Yes, throwaway spec only |
| Use real saved-analysis and intent navigation | actual controls; Angular debug injector; custom route manipulation | Electron uses MemoryPlatformLocation; existing UI supplies all needed navigation | Yes |
| Write JPGs directly | shooter output change; local page.screenshot | shooter targets docs assets; user requires task gate JPGs | Yes |
| Leave runtime execution to coordinator | launch now; prepare only | explicit instruction and active machine gate | Yes, execute final locked command |

Handoff note: the required single `ptah_agent_report` call was attempted; the server returned `delivered: false`, reason `parent-inbox-full`. It was not retried. The coordinator's required action remains executing the locked commands above. The final Playwright list was repeated after the rail/bar assertions and again listed all 5 tests successfully.
