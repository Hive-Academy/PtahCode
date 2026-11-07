# Decisions — TASK_2026_891_b41c

| # | Decision | Evidence | Reversible |
| - | -------- | -------- | ---------- |
| D1 | Removal approved by the user (AskUserQuestion answer "Remove dead VS Code code", 2026-11-07). Type REFACTORING, depth Minimal: one implementer lane, scoped checks, one different-family review. No architect: the dead branch is local to the transcript and the card component. | User answer | yes (git) |
| D2 | Dead-code proof: `display.enabled` is `this.vscodeService.isElectron` (`chat-transcript.component.ts:861-862`), and Electron is the only host (TASK_2026_889 facts.md). The `@else if (changeSetAnchors()...)` branch with `host="vscode"` (`chat-transcript.component.html:142-151`) can never render. | code | — |
| D3 | Implementer: codex lane (confirmed room). Reviewer: claude lane (different family). | `ptah_agent_list` | yes |
| D4 | Preserve list: the turn summary chip and its inputs/outputs, `ChangeSetStore`, the `git:turnChangeSet` / `git:turnChangeSets` flow, the Electron e2e spec `apps/ptah-electron-e2e/src/specs/git/change-set-card.spec.ts` (it tests the chip), and any change-set code the chip or the review flow uses. | code | — |
