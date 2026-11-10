# TASK_2026_904 Wave 1 — batches

| Batch | Executor | Status | Write set | Verify |
| ----- | -------- | ------ | --------- | ------ |
| F (follow-ups A+B) | main session | done | `tools/ui-class-audit/check-ui-classes.ts`; `libs/frontend/ui/src/lib/foundation/status-badge.component.ts`; `apps/ptah-extension-webview/src/app/ui-gallery.component{,.spec}.ts` | `npm run verify -- -p ui-class-audit,@ptah-extension/ui,ptah-extension-webview` |
| V0 baseline | codex (visual-reviewer) | running | `apps/ptah-electron-e2e/visual-parity.config.ts`, `apps/ptah-electron-e2e/src/visual-parity/**`, `wave1/visual/**` | ptah-electron-e2e typecheck/lint; determinism re-run = 0 px |
| E1 setup action | codex | pending V0 | `libs/frontend/ui/src/lib/extracted/setup-action/**`; `onboarding/.../analyze/analyze-workspace.page.ts`; `onboarding/.../home/resume-banner.component.ts` | `-p @ptah-extension/ui,@ptah-extension/onboarding` |
| E2 rail icon action | codex | pending V0 | `libs/frontend/ui/src/lib/extracted/rail-icon-action/**`; `canvas/.../canvas-rail/canvas-rail.component.ts` | `-p @ptah-extension/ui,@ptah-extension/canvas` |
| E3 setup field shell | codex | pending V0 | `libs/frontend/ui/src/lib/extracted/setup-field/**`; `setup-wizard/.../generation-model-picker.component.ts`; `onboarding/.../shell/workspace-header.component.ts` | `-p @ptah-extension/ui,@ptah-extension/onboarding,@ptah-extension/setup-wizard` |
| V1 source diff | codex (visual-reviewer) | pending E1-E3 | `wave1/visual/**`, `wave1/visual-source-diff.md` | 0 changed px on every source state |
| A1 adopt machines + reviews | codex | pending V1 | `machines-ui` add pane + row actions; `review-runs-ui` settings drawer + close | `-p @ptah-extension/machines-ui,@ptah-extension/review-runs-ui` |
| V2 consumer after + source re-diff | codex (visual-reviewer) | pending A1 | `wave1/visual/**`, `wave1/visual-consumer.md` | source still 0 px |
| R phase review | Glm (ollama-cloud) | pending A1 | `wave1/code-logic-review.md` | — |

Shared file owned by the orchestrator: `libs/frontend/ui/src/lib/extracted/index.ts` and the
`export * from './lib/extracted';` line in `libs/frontend/ui/src/index.ts`.
