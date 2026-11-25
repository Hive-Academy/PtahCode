# Batch 1 report - TASK_2026_2324_efc4

Component 1, "Sub-agent composer, unified look" (implementation-plan.md section 1).

## Changes

- REWRITE `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane-composer.component.ts`
  - The composer no longer uses `ptah-agent-steer-input`. It now has the CLI lane composer's card
    (`data-glass-surface="tile"`), a textarea (`rows=2`, `dir=auto`, `field-sizing: content`, an sr-only
    label "Message {name}") and a toolbar in main chat order:
    gated `+` | gated model · effort pickers, voice, Send to background, Stop, Send.
  - Working controls: text, voice, Stop (when `stoppable`), Send to background (when `canBackground`)
    and Send.
    - Send keeps the native `disabled`.
    - Its aria-label is still "Send steer message" or "Send follow-up".
  - Attach, Model and Effort are gated through `ComposerGatedControlDirective` and the pickers'
    `disabledReason`.
    - The reason text lives in one place, the exported `SUBAGENT_GATED_REASONS`.
    - Steer and follow-up modes have different wording, as the plan states.
    - Clicking a gated control only shows its reason. Nothing is sent.
  - Status line (`aria-live="polite"`) priority: revealed gated reason, then the last action note
    ("Sent to the main chat"), then the mode hint. In unavailable mode the mode hint is the existing
    unavailable text, which keeps `data-testid="subagent-composer-unavailable"`.
  - The "3 limited" badge lists the reasons in its `title`.
  - Error line: `role="alert"`, `text-state-err`, between the card and the status line.
  - Keys: Enter sends and Shift+Enter adds a line. An IME Enter (`isComposing` or `keyCode 229`) does
    nothing.
  - Voice: the transcript is appended to the draft, and a failure shows on the error line.
    The component has `providers: [VoiceInputService]`.
  - Unavailable mode uses the same card, with the textarea and Send disabled.
  - Not rendered: the approval chip, `/`, `@`, send-now, the queue, and any `subagent:interrupt` control.
  - Unchanged: `mode()`, the generation guard and reset effect, `onSubmit` / `steer` / `followUp`, and
    the inputs and outputs. `subagent-lane.component.ts` is not edited.
  - The capability map is recorded in the component doc comment.
- REWRITE `.../subagent-lane/subagent-lane-composer.component.spec.ts` (21 tests).
  - It covers every item on the plan's verification list.
  - It pins each element to its `COMPOSER_*_CLASS` constant, token by token.
- MODIFY `.../subagent-lane/subagent-lane.component.spec.ts`
  - Selectors changed from `ptah-agent-steer-input textarea` to
    `ptah-subagent-lane-composer textarea`.
  - The native-Codex test asserted that no steer input exists. The composer now always renders, so the
    test asserts that its textarea and Send are disabled.

## Decisions

- **Classes are written statically.** The template copies the `COMPOSER_*_CLASS` strings instead of
  binding `[class]`, and the spec pins them to the constants.
  - Options: `[class]` bindings or template-literal substitutions. The audit counts both as
    `<dynamic>`, and this file's baseline allows only 2.
  - Evidence: `tools/ui-class-audit/check-ui-classes.ts` (the inline-template branch) and the brief.
  - Reversible.
- **The gated model pill shows a label.** It shows `context.model`, or else "Agent model" in steer
  mode and "Main chat model" in follow-up mode. With `options=[]` and no id, the pill would have no
  text. Reversible.

## Checks

The user asked not to run verify, nx, tsc or builds locally.

- **Focused jest** passed: 2 suites, 51 tests.
  - Command: `npx jest --config <wrapper> --runInBand --coverage=false --runTestsByPath` on the
    composer spec and the lane spec.
  - The worktree has no `node_modules`. With `libs/frontend/chat/jest.config.ts`, both suites failed
    to start: the preset maps `marked` to `<worktree>/node_modules/marked/lib/marked.umd.js`, which
    does not exist.
  - The wrapper is a copy of the chat config in my scratchpad. It maps `marked` to the main checkout's
    `node_modules`. Nothing in the repo was changed.
  - CI is not affected.
- **`npx eslint`** on the 3 changed files: 0 errors.
  - 9 warnings, all `no-non-null-assertion` in old lines of `subagent-lane.component.spec.ts`.
  - `@nx/enforce-module-boundaries` was skipped because there is no cached project graph. The new
    imports are inside the `chat` lib plus the `@ptah-extension/chat-ui` barrel.
- **ui-class-audit**: exit 0.
  - `subagent-lane-composer.component.ts` dropped from `<dynamic>=2` to 0.
  - The baseline was not updated, because `tools/` is outside this batch.
- **degradation-audit**: exit 0, TOTAL 0 unsuppressed sites.
- **Not run locally**, as instructed: `typecheck-templates`, typecheck and the full test target.
  CI covers them.

## Open

- Someone should record the ui-class-audit decrease with `--update-baseline` so the ratchet tightens.
  The orchestrator can do this.
- The Electron visual review of the sub-agent lane is still to do, in both the glass and Anubis themes.
- The voice button is not exercised in the spec. It renders only under Electron (`isElectron`), and the
  spec stubs that as false.
- The lane header still has its own "Stop {name}" / "Send {name} to background" buttons, and the
  composer now has Stop and background too. That duplication existed before this batch and is
  unchanged.
- No reference to `interruptSession`, `continueAgent`, `resumeAgentWithMessage`,
  `interruptSubagentSession`, `subagent:interrupt` or `agent:continue` was added.
