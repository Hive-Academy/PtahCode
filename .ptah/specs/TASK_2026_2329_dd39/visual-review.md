# Electron visual review for PR 1517

Worktree `settings-overlays`, branch `fix/settings-overlays`, head `157a9790f`.

The visual reference is the [task context](context.md) and [implementation plan](implementation-plan.md). The review covers the Providers lanes layout, action and copy density in both add forms, the active provider and model in Background models, clipping and alignment in the instance modal dropdown, and whether Routing evidence summarizes sparse samples.

## Result

**Blocked at the Electron renderer build.** The locked Electron main build produced `dist/apps/ptah-electron/main.mjs`, preload, worker bundles, and WASM assets. The locked renderer target exited with code 1 in five attempts across Node 26.13.1 and Node 24.15.0. The retries included one Angular worker, serial TypeScript compilation, and a development build with source maps disabled. The last attempt reached Angular TypeScript emit and diagnostics, then exited before writing `dist/apps/ptah-electron/renderer/index.html`. The logs contain timings and warnings but give no underlying build error. [Renderer task](../../../.nx/cache/terminalOutputs/4805239754470476233) · [Angular build](../../../.nx/cache/terminalOutputs/7240068703197585534)

Playwright capture requires the Electron renderer bundle. The output folder contains zero captures from this lane. Every visual verdict and product defect severity below remains unverified.

| Screen | Intended capture | Visual status |
| --- | --- | --- |
| Providers lanes matrix | `lanes-1440-dark.jpg`, `lanes-1920-dark.jpg` and the corresponding `-expanded.jpg` states | Unobserved. Adjacent Network and Model controls and Ptah CLI Defaults alignment still need review. |
| Add provider | `add-provider.png`, `add-provider-custom.png` | Unobserved. Copy and duplicate actions still need review. |
| Add Ptah CLI instance | `add-ptah-cli-instance.png`, `add-ptah-cli-instance-openrouter.png` | Unobserved. Copy and duplicate actions still need review. |
| Background models | `memory-curator-{claude-cli,openrouter,openai-codex,github-copilot}-provider-open.png` and the corresponding model states | Unobserved. Active selections, unsupported state, and unused-provider errors still need review. |
| Dropdown in modal | `add-ptah-cli-instance-provider-open.png` | Unobserved. Clipping, stacking, and alignment still need review. |
| Routing evidence | `routing-evidence-summary.png` | Unobserved. The fixture supplies one measured cell and one zero-sample cell for the summary check. |

The existing lanes preview covers the matrix. I added one Electron Playwright preview using its fixtures for the remaining captures. Its Claude case clears the OpenRouter credential status to exercise the reported unused-provider error. The preview has not run. [settings-overlays.shot.ts](../../../apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts)

Repository skill files were available and read through Ptah because this session exposed no native skill invocation tool. The capture plan uses the Electron Playwright fixture so the client being reviewed is Electron. The worktree acquired unrelated tracked edits during the build attempts, so a future capture should establish a clean checkout at the requested head before building.
