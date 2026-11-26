# PR 1517 CI unit and lint repair

## Root cause and fixes

- Angular CDK now attaches settings dialogs and popovers to the overlay container. Tests querying fixture hosts, native dialog state, or former backdrop hooks failed even when the overlays rendered. The affected specs query the owning overlay and exercise CDK dismissal, focus trapping, focus restoration, and nested content. Tests that depend on browser focusability supply the layout measurements that jsdom lacks.
- Review settings resolves its title and replacement token input from the drawer's attached panel. Its confirmation views project into the drawer overlay to stay outside the application subtree hidden from assistive technology by CDK. The confirmation still uses its manual top-layer popover and cancels Escape locally.
- The lane install guide opts out of the shared popover's automatic focus restoration because the strip already handles user dismissal and host-triggered closure has a separate focus contract. The shared default still restores focus.
- The onboarding install consent uses the controlled modal state during installation. The obsolete native dialog reopen call queried a host that no longer rendered a native dialog.
- The settings audit flagged spacing utilities in provider consumer assignments, the provider setup wizard, and routing evidence. The repairs use design tokens and logical auto alignment. The token-only UI check also flagged a literal rich-select viewport margin, now expressed with the spacing token.
- Drawer motion coverage follows the portaled backdrop and the drawer panel's current entrance and reduced-motion styles. CDK detaches the drawer immediately on close.

## Focused results

Jest was run with each project's config, `--runInBand --coverage=false --runTestsByPath`. All 46 suites passed, with 1,248 passing tests. The table includes all 43 specs listed in the CI failure logs and three related shared overlay specs.

| Project | Spec | Result |
| --- | --- | --- |
| ptah-extension-webview | `motion-presets.spec.ts` | Passed |
| chat-ui | `mcp-directory-browser.component.spec.ts` | Passed |
| chat | `previous-sessions-modal.component.spec.ts` | Passed |
| chat | `output-style-editor.component.spec.ts` | Passed |
| chat | `elevenlabs-panel.component.spec.ts` | Passed |
| chat | `advanced-settings-group.component.spec.ts` | Passed |
| chat | `output-style-list.component.spec.ts` | Passed |
| chat | `provider-connection-card.component.spec.ts` | Passed |
| chat | `session-budget-settings.component.spec.ts` | Passed |
| chat | `go-vet-consent-config.component.spec.ts` | Passed |
| chat | `mcp-port-config.component.spec.ts` | Passed |
| chat | `system-prompt-drawer.component.spec.ts` | Passed |
| chat | `local-tts-panel.component.spec.ts` | Passed |
| chat | `session-organization-editor.component.spec.ts` | Passed |
| chat | `voice-config.component.spec.ts` | Passed |
| chat | `setting-scope-row.component.spec.ts` | Passed |
| chat | `local-stt-panel.component.spec.ts` | Passed |
| chat | `capability-matrix-setting.component.spec.ts` | Passed |
| chat | `add-account-form.component.spec.ts` | Passed |
| chat | `lanes-add-more-strip.component.spec.ts` | Passed |
| chat | `decision-model-row.timeout-field.component.spec.ts` | Passed |
| chat | `main-agent-scope-badges.component.spec.ts` | Passed |
| chat | `decision-model-key-field.component.spec.ts` | Passed |
| chat | `decision-model-row.base-url-field.component.spec.ts` | Passed |
| cron-scheduler-ui | `cron-job-form.component.spec.ts` | Passed |
| cron-scheduler-ui | `cron-scheduler-tab.component.spec.ts` | Passed |
| git-ui | `review-shell.mount.spec.ts` | Passed |
| marketplace | `connectors-page.component.spec.ts` | Passed |
| marketplace | `harness-blocked-paths.spec.ts` | Passed |
| marketplace | `provider-list-view.component.spec.ts` | Passed |
| onboarding | `analyze-skills.page.spec.ts` | Passed |
| onboarding | `ready-connection-step.page.spec.ts` | Passed |
| onboarding | `team-builder-skill-consent.component.spec.ts` | Passed |
| review-runs-ui | `review-settings-drawer.component.spec.ts` | Passed |
| review-runs-ui | `review-runs-page.component.spec.ts` | Passed |
| skill-synthesis-ui | `agent-model-editor.component.spec.ts` | Passed |
| skill-synthesis-ui | `clone-detail-drawer.component.spec.ts` | Passed |
| skill-synthesis-ui | `clone-detail-drawer.phase-files.spec.ts` | Passed |
| skill-synthesis-ui | `skill-clones-view.component.spec.ts` | Passed |
| skill-synthesis-ui | `enhance-preview-drawer.component.spec.ts` | Passed |
| tasks-ui | `task-maintenance-dialog.component.spec.ts` | Passed |
| ui | `ptah-tokens.spec.ts` | Passed |
| ui | `form-controls-look.spec.ts` | Passed |
| ui | `native-drawer.component.spec.ts` | Passed |
| ui | `native-modal.component.spec.ts` | Passed |
| ui | `native-popover.component.spec.ts` | Passed |

- UI class audit passed with zero counts above baseline. The audit baseline is unchanged.
- ESLint passed on the changed TypeScript and HTML files with zero errors and 74 warnings.
- TypeScript application checks passed for `ptah-electron` and `ptah-extension-webview`.
- Git diff whitespace check passed.
- No Nx, workspace verification, or end-to-end commands ran. Electron screenshots were unavailable because no Electron browser session was attached. The Angular template typecheck requires an Nx target outside the authorized commands.

The Ptah dependency graph was partial, so targeted repository searches supplemented its results. The CLI exposed no native skill loader, so the repository Angular, UI, and orchestration skill instructions were read directly. PowerShell and Python parsed the ANSI CI summaries.

## Files changed

- `apps/ptah-extension-webview/src/app/motion-presets.spec.ts`
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.spec.ts`
- `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.spec.ts`
- `libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/accounts/add-account-form.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/main-agent-scope-badges.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts`
- `libs/frontend/chat/src/lib/settings/providers/setting-scope-row.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-add-more-strip.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-add-more-strip.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.spec.ts`
- `libs/frontend/cron-scheduler-ui/src/lib/components/cron-job-form.component.spec.ts`
- `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.spec.ts`
- `libs/frontend/git-ui/src/lib/review-shell/review-shell.mount.spec.ts`
- `libs/frontend/marketplace/src/lib/harness/harness-blocked-paths.spec.ts`
- `libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.spec.ts`
- `libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.spec.ts`
- `libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.testing.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-consent.component.ts`
- `libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts`
- `libs/frontend/onboarding/src/lib/ready/ready-connection-step.page.spec.ts`
- `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.spec.ts`
- `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html`
- `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.spec.ts`
- `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.phase-files.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.spec.ts`
- `libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.spec.ts`
- `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/form-controls-look.spec.ts`
- `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts`
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
- `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts`
