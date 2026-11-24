# Frontend implementation — `TASK_2026_2320_lnpar`, batch 2 (F1a composer controls)

**Verdict**: COMPLETE. All scoped checks pass, and so do the 4 new specs (19 tests).

**Skills loaded**: angular-frontend-patterns, angular-developer.

**Tasks completed**:

- Task 2.1: class constants in composer-card, `ComposerAttachMenuComponent`, `ComposerVoiceButtonComponent`.
- Task 2.2: `ComposerGatedControlDirective`, `LaneApprovalChipComponent`.

## Files

Composer-controls root: `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat\src\lib\components\molecules\composer-controls\`

- CREATED `...\composer-controls\composer-attach-menu.component.ts`: the `+` button and its menu. The markup comes from `chat-input.component.ts:354-406`. Outputs are `pickFiles` and `pickImages`, and the menu closes before either one emits.
- CREATED `...\composer-controls\composer-attach-menu.component.spec.ts`
- CREATED `...\composer-controls\composer-voice-button.component.ts`: the mic button (Electron only). The markup comes from `chat-input.component.ts:433-479`, and the logic from `handleVoiceButton` (`:1125-1144`). It injects the `VoiceInputService` its host provides and has no `providers` of its own. Outputs are `transcript` (trimmed, never empty) and `failed` (an error message).
- CREATED `...\composer-controls\composer-voice-button.component.spec.ts`
- CREATED `...\composer-controls\composer-gated-control.directive.ts`: `[ptahComposerGated]="reason"`, `exportAs: 'ptahComposerGated'`.
- CREATED `...\composer-controls\composer-gated-control.directive.spec.ts`
- CREATED `...\composer-controls\lane-approval-chip.component.ts`: a read-only chip that is always gated, per D11. Inputs are `label` (required), `reason` and `pending`. Outputs are `reasonRevealed` and `reasonCleared`.
- CREATED `...\composer-controls\lane-approval-chip.component.spec.ts`
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-ui\src\lib\molecules\composer-card.ts`: adds `COMPOSER_ICON_BUTTON_CLASS`, `COMPOSER_PILL_CLASS`, `COMPOSER_STOP_BUTTON_CLASS`, `COMPOSER_STATUS_LINE_CLASS` and `COMPOSER_DISABLED_CONTROL_CLASS`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\libs\frontend\chat-ui\src\index.ts`: exports the 5 new constants from the barrel. See Plan deviations.

`chat-input`, `libs/shared` and `platform-core` were not touched.

## Stack observed

- Angular `~22.2.7`, Tailwind `^3.4.18`, DaisyUI `^4.12.24` and `lucide-angular` (root `package.json`).
- The components are standalone and OnPush, with signal `input()` / `output()` and `inject()` in field initialisers, as in `composer-compact-bar.component.ts:128-149`.
- The capture-phase click blocker follows the existing pattern in `libs/frontend/chat/src/lib/settings/feedback/busy-disabled.directive.ts`.
- The popover is `NativePopoverComponent` from `@ptah-extension/ui`.

## Design fidelity (design-spec §3 table, §5.1, §9; prototype README constraint 3; D11)

- **Attach**: the 28 px `rounded-md` muted icon button, with the open state `bg-surface-2 text-base-content` and the same menu items, roles, labels and `data-testid="chat-attach-btn"`. It is never disabled.
- **Voice**: same 28 px button. The recording state uses `text-error bg-error/10 animate-pulse` (an opacity animation, compositor-only, as before). A spinner shows while transcribing, with the native `disabled` attribute. The elapsed `m:ss` label and the title / aria-label text (Dictate, Stop recording, Transcribing...) are unchanged.
- **Gated directive** (§5.1 rule 1-4). While a non-blank reason is bound:
  - It sets `aria-disabled="true"` and never the native `disabled`, so the control stays in the tab order.
  - It adds `COMPOSER_DISABLED_CONTROL_CLASS`. That gives a dashed 1 px `surface-border-strong` edge and `cursor-not-allowed`, with no opacity change. The hover fill is suppressed through `aria-disabled:hover:` variants, which outrank the control's own `hover:` classes by specificity.
  - It sets `title` to the reason, and `aria-describedby` to a visually hidden (`sr-only`) node inside the control that holds the reason. That node is `aria-hidden`, so it never joins the accessible name. A description reference still reads hidden content (accname 1.2).
  - A capture-phase click listener runs before the control's own handlers, so no menu opens. Click, focus and mouseenter emit `reasonRevealed(reason)`; blur and mouseleave emit `reasonCleared`.
  - The host template reads `gated()` through the exportAs and shows the info glyph in place of the chevron.
  - Send is not covered, by design (decisions.md 10).
- **Approval chip**: uses the autopilot trigger's classes (`approval-chip inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium`, `text-state-idle`), with the shield icon, or a spinner while `pending`. It also shows the label and an info glyph.
  - Per D11 the chip is always gated. When no backend reason is bound, it says why from its own label: "Approval mode: X. Set when the lane starts." It carries no provider-specific copy.
  - The accessible name is "Approval mode: {label}" and the full reason is in `title` (N3).

Deviation: the attach and voice buttons keep main chat's `focus-visible:outline-[oklch(var(--s))]`. `COMPOSER_PILL_CLASS` also uses that outline (design-spec 4.2), where `model-selector` today uses `focus-visible:ring-1`. Batch 4 decides whether the pickers adopt the pill constant.

## States covered

- Attach: closed and open.
- Voice: idle, recording, transcribing (disabled), start error and transcription error.
- Gated: enabled (untouched; clicks pass), gated, a blank reason (treated as enabled), and gated to enabled again.
- Chip: the gated label, a pending spinner (Checking), and a fallback reason.

Every control is a focusable `<button type="button">`.

## Verification

All output is in `D:\projects\PtahCode\.claude-worktrees\lane-chat-parity\.ptah\tmp\b2-*.log`. I ran the checks only after `batch-1-report.md` appeared.

- `npm run verify -- --related -p @ptah-extension/chat,@ptah-extension/chat-ui` exited 0: `NX 2 tasks: 2 succeeded`. Nx does not print per-suite logs here, so I also ran the next check.
- Four new specs, run directly under the verify lock:
  - Command: `node scripts/verify.mjs --exec --task b2-specs -- npx jest --config libs/frontend/chat/jest.config.ts --maxWorkers=2 --coverage=false --runTestsByPath <4 specs>`.
  - Result: exit 0, `Test Suites: 4 passed, 4 total`, `Tests: 19 passed, 19 total`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/chat,@ptah-extension/chat-ui` exited 0: `NX 4 tasks: 4 succeeded`.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview` exited 0: `ptah-extension-webview:typecheck-templates 39.3s`.
  - Caveat: nothing in the renderer imports the new components until Batches 8 and 11, so this target does not compile their templates.
  - To cover them I ran `ngc --noEmit` under the lock (`--task b2-ngc-new`), with a scratch tsconfig that extends `apps/ptah-extension-webview/tsconfig.app.json` and lists only the 4 new files. It exited 0 with no diagnostics (`b2-ngc-new.log`).
- `npx eslint` on all changed files exited 0 (`b2-eslint-pre.log`).
- I ran no build, serve, e2e, package or workspace-wide check. No visual review was done; the phase plan puts it in Electron at phase review.

## Plan deviations

- I also changed `libs/frontend/chat-ui/src/index.ts`, which is outside the listed write set. The `chat` lib may import `chat-ui` only through its `@ptah-extension/chat-ui` barrel (no deep imports), and the new constants are useless until the barrel exports them. The change adds export names only.
- The voice button gates itself on `VSCodeService.isElectron`. The lifted markup includes `chat-input.component.ts:433`, so hosts do not repeat that check.

## Risk handling

- Main chat behaviour is unchanged: `chat-input`, `model-selector`, `effort-selector` and the autopilot popover are untouched, and the existing constants did not change.
- No component injects anything tab-bound. The voice button relies on the host's `VoiceInputService` (one recorder per composer). Without a host-provided service, the root-provided instance would be used and shared, so Batches 8 and 11 must keep `providers: [VoiceInputService]` on each composer.
- The directive holds a single capture-phase click listener per instance, which `DestroyRef` removes. The reason node is a child of the host element, created through `Renderer2`.
- Batch 1 shared types (`LaneEffectiveApproval`) are not imported. The chip takes a plain `label` string, so Batch 2 does not depend on Batch 1.

## Out-of-scope observations

- `npm run verify -- --related` does not inline Jest suite output, so a run that executed no suites looks identical to a passing one. Focused Jest runs are needed for evidence.
