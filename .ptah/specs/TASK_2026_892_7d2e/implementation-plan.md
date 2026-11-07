# Docs media refresh: feasibility and implementation plan

## Feasibility

### Profile

The dev build sets userData to `%APPDATA%\Ptah Dev` (`apps/ptah-electron/src/main.ts:63-67`). `docs-profile.ts:33-48` copies files `global-state.json`, `settings.json`, `.machine-uuid`, `.content-cache.json`, and directories `workspace-storage`, `user`, `skills`, `plugins`, `templates`, `migrations`; its default is `~/.ptah` (`:64-68`). Set `PTAH_DOCS_SOURCE_PROFILE` explicitly to the dev profile and change copying to an allowlist. A read-only listing via `[Environment]::GetFolderPath('ApplicationData')` showed `Ptah Dev` currently has `global-state.json`, `workspace-storage`, `config.json`, `secrets.json`, caches and logs, but no `settings.json`. This supersedes D2's old inventory. Never read/copy `secrets.json`, `secrets.enc*`, `master-key-ref.json`, existing `workspace-storage`, or production `~/.ptah`. Create neutral sessions via the app in `docs-repo.ts`'s sample workspace, or seed a sample-only `workspace-state.json` and synthetic `global-state.json` in the temporary copy. `docs-fixtures.ts:39-48,87-103` currently defaults to a real project and has a real-DB opt-in; docs capture should use `SAMPLE_REPO` and the launcher isolated DB (`electron-launcher.ts:61-84`).

### Live AI

Setup analysis, agent generation, and a real CLI orchestration turn require a provider run. `ptah-cli-registry.ts:1528-1530` explicitly inherits ambient Claude CLI login from `~/.claude`; docs say `codex login` is supported (`providers/codex.md:16`). Therefore these are **feasible with condition**: a dedicated signed-in capture account, spend approval, and a successful isolated-profile sign-in check. No Ptah secret envelope is copied. If login fails, capture only pre-run UI and reuse a current landing orchestration demo if its actual flow matches; do not simulate a completed AI run. Other shots and provider/plugin/MCP settings flows do not require live AI.

### Video format

`@playwright/test` is `^1.50.0` (`package.json:165`); installed types expose `recordVideo` on Electron launch options (`node_modules/playwright-core/types/types.d.ts:25985`) and `page.video().saveAs()` (`:5286-5289,23431`). Pass optional `recordVideo` through `launchPtah` (`electron-launcher.ts:10-25,130-140`); close the app before saving WebM. FFmpeg 9 is on PATH. Current docs tags specify `video/mp4` (`getting-started/installation.md:8-9`); transcode with H.264/yuv420p/faststart for existing tags, or serve `video/webm` with MP4 fallback. Existing files range 0.46–7.41 MB; target <=5 MB per new video and <=20 MB total for seven referenced slots. Landing MP4s are 0.18–1.31 MB.

## Screenshot plan

`rg` comparison found **29 referenced PNGs, 12 covered, 17 missing** (the prompt's “15” is a count error). No top-level agents route exists (`app.routes.ts:86-153`); legacy agent imagery must map to current Settings/Marketplace or its page reference must go. Selectors below are candidates to verify in a rendered capture.

| PNG | Page | Electron surface/route | Still exists? | Shot file | Crop selector |
|---|---|---|---|---|---|
| agents-catalog.png | agents/built-in-agents | Marketplace catalog | Changed; inspect | agents.shot.ts | `ptah-marketplace-shell` |
| agents-cli-panel.png | agents/cli-agents | Settings CLI matrix | Yes | agents.shot.ts | `[data-testid="cli-matrix"]` |
| agents-custom-editor.png | agents/custom-agents | Agent editor | Unconfirmed; remove reference if absent | agents.shot.ts | `ptah-agent-model-editor` candidate |
| agents-overview.png | agents/index | Settings/Marketplace overview | Changed; inspect | agents.shot.ts | `ptah-marketplace-shell` |
| agents-setup-wizard.png | setup/setup-wizard | Onboarding analysis | Yes, redesigned | setup.shot.ts | `ptah-onboarding-shell` |
| agents-wizard-step1.png | setup/setup-wizard | Analysis phases | Yes | setup.shot.ts | `[aria-label="Analysis phases"]` |
| agents-wizard-step3.png | setup/setup-wizard | Agent recommendations | Yes | setup.shot.ts | `[data-testid="agent-recommendation-list"]` |
| chat-at-suggestions.png | chat/file-attachments | Chat @ menu | Yes | chat.shot.ts | `.suggestions-panel` |
| chat-autopilot-toggle.png | chat/autopilot | Approval chip/popover | Changed wording; inspect | chat.shot.ts | `[data-testid="composer-approval-chip"]` |
| chat-cost-bar.png | chat/cost-and-tokens | Session cost stats | Changed; inspect | chat.shot.ts | `[data-testid="lane-stats-cost"]` |
| chat-execution-tree.png | chat/execution-tree | Delegated turn transcript | Conditional on neutral/live turn | chat.shot.ts | `ptah-chat-transcript` |
| chat-model-selector.png | chat/switching-models | Model picker | Yes | chat.shot.ts | `[data-testid="composer-compact-model"]` |
| chat-overview.png | chat/index | Chat route | Yes | chat.shot.ts | `ptah-chat-view` |
| marketplace-smithery.png | marketplace/smithery | External marketplace source | Smithery branding unconfirmed; remove if absent | marketplace.shot.ts | `[data-testid="marketplace-shell"]` |
| providers-settings.png | getting-started/signing-in | Settings providers | Yes | providers.shot.ts | `[data-testid="connections-grid"]` |
| setup-ai-team-builder.png | setup/ai-team-builder | Recommendation selection | Changed; inspect | setup.shot.ts | `[data-testid="agent-recommendation-list"]` |
| setup-hub.png | setup/index | Onboarding home | Yes | setup.shot.ts | `ptah-onboarding-home` |

Selector evidence: `ui-driver.ts:34,37,438`; `onboarding-home.component.ts:60,120,257-264`; `phase-list.component.ts:13`; `agent-recommendation-list.component.ts:60-101`; `providers-settings.component.ts:349-350`; `composer-compact-bar.component.ts:56`; `autopilot-popover.component.ts:42`. Existing unreferenced v2 shots `v2-display-panel`, `v2-apps`, `v2-attention-bell`, `v2-session-rail`, `v2-voice-stage` (`v2-surfaces.shot.ts:18-102`) fit the new pages named in the request; inspect then reference.

## Video plan

Landing `live-demo` has `always-on`, `command-center`, `decision-loop`, `multi-agent`, `orchestration`, `providers`, `tribunal-council`, each MP4/WebM/JPG (read-only directory listing). Preview before reuse.

| Video | Page | Flow steps if new | Live AI? | Landing video that fits | Feasible? |
|---|---|---|---|---|---|
| cli-agent-orchestration.mp4 | agents/agent-orchestration | Session → launch CLI lane → result | Yes | orchestration or multi-agent; reuse if it shows same delegation | Conditional on login/spend; reuse preferred |
| install.mp4 | getting-started/installation | Installer is outside Electron | No | None | Not scriptable; D1 replaces with screenshots |
| ptah-mcp-server.mp4 | mcp-and-skills/built-in-mcp-server | Settings → MCP server → caller setup | No | None | Feasible new flow |
| plugins.mp4 | plugins/index | Marketplace → browse/install in sample repo | No | None | Feasible with network/catalog |
| providers.mp4 | providers/index | Settings → connections/model routing | No | providers.mp4; reuse | Feasible |
| setup-wizard-agent-generation.mp4 | setup/setup-wizard | Analyze sample → select → generate agents | Yes | None | Conditional on login/spend |
| setup-wizard-analysis.mp4 | workspace/project-analysis | Setup → analyze sample → results | Yes | None | Conditional on login/spend |

`auth.mp4` is unreferenced (D5). Copy reused MP4 into docs assets unless a shared landing URL is guaranteed stable. The actual landing flow must match page text; a conceptual montage is insufficient. `README.md:19-31` already links landing demos.

## Harness design

Add `apps/ptah-electron-e2e/docs-videos.config.ts`, `src/docs-videos/*.flow.ts` one per uncovered flow, and shared `_harness/{video-fixtures,pace,finalize-video}.ts`. Reuse `docs-profile.ts`, `docs-repo.ts`, `UiDriver`, and `launchPtah`; avoid mocked RPC. Add `ptah-docs:videos` in `apps/ptah-docs/project.json`, mirroring screenshots' `build-dev` and `copy-renderer-dev` dependencies (`project.json:27-36`), calling `npx playwright test --config=docs-videos.config.ts`. This is a manually invoked capture target, never ordinary e2e. Record at 1600×900, dark theme; wait for visible states then hold each 1–2 seconds, use slow input/cursor steps, and hold the ending 2–3 seconds. Save only after app close, transcode, check size/duration, and inspect frame sequence and poster for private data. Correct stale mocked-fixture comment in `docs-screenshots.config.ts:6-13` when implementing.

## Batches

Three file-disjoint implementer lanes:

1. **Screenshots/data:** `src/docs-screenshots/_harness/{docs-profile,docs-fixtures,docs-repo}.ts`, `src/docs-screenshots/{agents,setup,chat,marketplace,providers}.shot.ts`, all referenced `apps/ptah-docs/public/screenshots/*.png`, and five new docs pages' screenshot references. Scoped verification: `nx run ptah-docs:screenshots` then `nx run ptah-docs:check-screenshots`; visually inspect contact sheet. Capture owns its output PNGs.
2. **Videos:** `src/support/electron-launcher.ts`, `docs-videos.config.ts`, `src/docs-videos/**`, `apps/ptah-docs/project.json`, seven video-bearing docs pages, and `apps/ptah-docs/public/assets/videos/*`. Scoped verification: `nx run ptah-docs:videos` only after live-run conditions, `ffprobe`, visual review. Video lane may reuse screenshot harness files read-only.
3. **GitHub docs/editorial:** `README.md`, `apps/ptah-docs/SCREENSHOTS.md`, and `.github/*.md`/`CONTRIBUTING.md` only if stale user-facing copy is found. Verify asset URLs with `rg`; `nx run ptah-docs:check-screenshots` if names/references change.

Conservative file count: 17 missing shot definitions in 5 files; 29 refreshed referenced PNGs; 5 v2 assets already exist; 3 uncovered flow files + 4 video harness/config files; up to 5 new-page references; 7 current video pages; 3 new MP4s + 2 landing copies + 1 deletion; README/guide/project/launcher/profile fixtures = **about 68 changed/new/deleted files**, under 100. Recount with `git status --short` before PR.

README audit against `gap-inventory.md`: `README.md:35-45` already names rail, Apps, attention bell, display panel, but does not explain or link them. Add links under **Desktop command center/Highlights** to `https://docs.ptah.live/canvas/session-inspector/`, `/chat/display-panel/`, `/mcp-and-skills/apps/`, `/workspace/notifications-and-tray/`. Under **Memory and skills** (`README.md:124-136`), link `/memory/timeline/` and `/memory/corpus/` (inventory B-2/B-3, `:146-147`). Under **Your repo, and the trust around it** (`README.md:154-177`), add Review runs and link its actual new docs slug (inventory B-19, `:163`). Under **Providers** or trust, link `/mcp-and-skills/built-in-mcp-server/#external-callers` (inventory B-79, `:223`). Keep existing raw PNG names so `README.md:53,80,120,126,179` refresh automatically; list exact README lines if any name must change. Do not claim remote machines: inventory says no renderer UI. `rg` found no screenshot/live-demo links in `.github/*.md` or `CONTRIBUTING.md`; `.github/copilot-instructions.md:46` has architecture wording only. README copy: Electron only, evidence for each claim, no version numbers, prices, dates, or roadmaps.

## Risks

The dev profile now contains private workspace storage and a secret file; D2 inventory is stale. Ambient auth can expose account details and incur cost. Some legacy Agents/Smithery imagery may no longer match current UI. Landing demos may be conceptual loops, not procedural footage. Video can catch paths, notifications, or identity. Review every output asset before commit.

## Decisions

D1 Playwright recordings; installer becomes screenshots. D2 dev profile plus neutral sample repo, never production secrets. D3 branch stacked on docs-gap PR. D4 feasibility first, then capture, then inspect. D5 unreferenced `auth.mp4` proposed for deletion. Added reuse-first rule: use current landing footage when it genuinely depicts the docs flow. Synthetic state is safer than copying current dev workspace storage.

## Clarifications Needed

- **Privacy:** allow only synthetic neutral session/profile state, or also inspected nonsecret dev preferences?
- **Money:** authorize a dedicated live provider account and maximum spend for analysis, generation, and orchestration; otherwise omit completed live-run footage.
- **Removals:** approve deleting `auth.mp4`, replacing the installer video with screenshots, and removing page references only where a surface is demonstrably gone.

