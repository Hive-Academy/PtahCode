# Batch 4 WebP and cleanup report

## Files changed

- apps/ptah-electron-e2e/src/docs-screenshots/_harness/{docs-profile,docs-fixtures,shooter}.ts and src/docs-videos/_harness/video-fixtures.ts: one capture run directory for home, profile and raw video; cleanup after app close and on launch failure; keep flag; new WebP capture output.
- .gitignore: explicit .ptah/tmp/ ignore entry. The existing .ptah/** rule also ignored it.
- apps/ptah-docs/public/screenshots/: converted all 35 PNGs to WebP and deleted the PNGs.
- apps/ptah-docs/public/assets/videos/setup-wizard-analysis.mp4: recompressed in place.
- Docs page image references, README image URLs, and apps/ptah-docs/SCREENSHOTS.md.
- apps/ptah-docs/scripts/check-screenshot-refs.mjs was inspected but unchanged: its existing regex accepts WebP and it already exits 1 for missing files. setup-wizard-agent-generation.mp4 was inspected but unchanged (3,042,575 bytes, under 3 MiB).

## Sizes

All sizes in bytes. WebP uses sharp quality 90, effort 6; inspected chat text remained readable.

| Screenshot | PNG before | WebP after |
| - | -: | -: |
| agents-catalog.png | 140815 | 78508 |
| agents-cli-panel.png | 655966 | 65890 |
| agents-custom-editor.png | 200905 | 124986 |
| agents-orchestration.png | 1065917 | 83536 |
| agents-overview.png | 140815 | 78508 |
| agents-setup-wizard.png | 278818 | 23474 |
| agents-wizard-step1.png | 85363 | 43208 |
| agents-wizard-step2.png | 138488 | 89048 |
| agents-wizard-step3.png | 125827 | 77078 |
| agents-wizard-step4.png | 87328 | 52632 |
| chat-at-suggestions.png | 65768 | 7152 |
| chat-autopilot-toggle.png | 62652 | 9066 |
| chat-cost-bar.png | 26599 | 12176 |
| chat-execution-tree.png | 83277 | 45600 |
| chat-model-selector.png | 24278 | 10040 |
| chat-overview.png | 181766 | 94012 |
| commit-composer.png | 144802 | 8604 |
| diff-side-by-side.png | 540433 | 83574 |
| file-tree-panel.png | 17598 | 10470 |
| git-dock-header.png | 28539 | 2530 |
| marketplace-smithery.png | 1060172 | 45568 |
| providers-settings.png | 26437 | 4258 |
| recent-workspaces.png | 230215 | 7554 |
| sessions-analytics.png | 159039 | 9492 |
| sessions-history.png | 14486 | 6068 |
| sessions-overview.png | 10841 | 3808 |
| sessions-tabs.png | 290841 | 51956 |
| settings-overview.png | 1530241 | 98626 |
| setup-ai-team-builder.png | 125766 | 8912 |
| setup-analysis.png | 100089 | 40770 |
| setup-hub.png | 1101478 | 81940 |
| setup-new-project.png | 125834 | 8918 |
| theme-toggle.png | 44900 | 13312 |
| v2-thoth-memory.png | 1401388 | 75714 |
| workspace-switcher.png | 230215 | 7554 |
| **Total** | **10547896** | **1464542** |

Analysis video: 7,406,211 -> 2,836,458 bytes (H.264, yuv420p, faststart, CRF 37); duration remains 135.25 s. Six sampled frames were extracted and inspected; UI headings and body text were readable. Agent-generation video: 3,042,575 bytes, unchanged.

## Reference updates

- `README.md`
- `apps/ptah-docs/src/content/docs/git/commits.md`
- `apps/ptah-docs/src/content/docs/git/git-status.md`
- `apps/ptah-docs/src/content/docs/git/diffs.md`
- `apps/ptah-docs/src/content/docs/getting-started/signing-in.md`
- `apps/ptah-docs/src/content/docs/marketplace/smithery.md`
- `apps/ptah-docs/src/content/docs/agents/index.mdx`
- `apps/ptah-docs/src/content/docs/agents/custom-agents.md`
- `apps/ptah-docs/src/content/docs/agents/cli-agents.md`
- `apps/ptah-docs/src/content/docs/agents/built-in-agents.md`
- `apps/ptah-docs/src/content/docs/chat/switching-models.md`
- `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md`
- `apps/ptah-docs/src/content/docs/chat/index.md`
- `apps/ptah-docs/src/content/docs/chat/cost-and-tokens.md`
- `apps/ptah-docs/src/content/docs/chat/autopilot.md`
- `apps/ptah-docs/src/content/docs/chat/file-attachments.md`
- `apps/ptah-docs/src/content/docs/chat/execution-tree.md`
- `apps/ptah-docs/src/content/docs/workspace/opening-a-workspace.md`
- `apps/ptah-docs/src/content/docs/settings/theme.md`
- `apps/ptah-docs/src/content/docs/setup/setup-wizard.md`
- `apps/ptah-docs/src/content/docs/settings/index.mdx`
- `apps/ptah-docs/src/content/docs/setup/new-project.md`
- `apps/ptah-docs/src/content/docs/setup/ai-team-builder.md`
- `apps/ptah-docs/src/content/docs/setup/index.md`
- `apps/ptah-docs/src/content/docs/sessions/index.mdx`
- `apps/ptah-docs/src/content/docs/sessions/managing-sessions.md`
- `apps/ptah-docs/src/content/docs/workspace/switching-workspaces.md`
- `apps/ptah-docs/src/content/docs/sessions/session-history.md`

The docs checker resolved 29 references; 6 assets are unreferenced but retained. No remaining docs or README screenshot PNG references were found. Other screenshots/*.png examples in the UI design skill are unrelated to docs assets and were not changed.

## Verification

- node apps/ptah-docs/scripts/check-screenshot-refs.mjs: exit 0; 29 references resolve.
- node .ptah/specs/TASK_2026_889_d57a/_linkcheck.mjs: exit 0; 0 bad internal links, 0 frontmatter or component import issues.
- npm run verify -- -p ptah-electron-e2e: exit 0; header lists one project (ptah-electron-e2e); lint and typecheck succeeded. Nx found no test target, so no tests ran.
- ptah_get_diagnostics scoped to the four changed TypeScript harness files: 0 errors.
- ffprobe confirmed H.264, yuv420p and unchanged duration. No capture targets were run.

## Decisions

- Use one run directory per fixture under .ptah/tmp/docs-capture, or the PTAH_DOCS_CAPTURE_DIR override. This keeps every capture home, profile and raw video in one removable location; PTAH_DOCS_KEEP_CAPTURE=1 retains it. Reversible: yes.
- Keep the existing checker implementation because it already accepts WebP and fails on missing references. Reversible: yes.
- Leave the agent-generation video unchanged because 3,042,575 bytes is below 3 MiB; the requested 3.0 MB description uses rounded units. Reversible: yes.
- Use CRF 37 for analysis video because it met the size target while sampled text remained readable. Reversible: yes.

Existing %TEMP% capture folders were not deleted. Other batches' uncommitted changes were not reverted. No commit, push or capture was run.