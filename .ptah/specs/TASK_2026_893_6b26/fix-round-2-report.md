# PR #1009 round 2 report

## Findings

1. **Valid, fixed.** The rendered `.code-block-header` and `.code-block-toggle` are outside `pre` in `marked-extensions.ts:223-240`. Isolated their shared `.code-block-container` LTR in `thinking-block.component.ts:96`; the controls now inherit LTR. Assertion: `thinking-block.component.spec.ts`.
2. **Valid, fixed.** Removed `dir="auto"` from the Mermaid execution wrapper in `execution-node.component.ts:220`, put it on prose markdown in `mermaid-message-text.component.ts:10`, and conditionally omitted it from the Mermaid fallback wrapper in `message-bubble.component.html:109`. Existing placeholder and error markdown hosts retain `dir="auto"`. Assertions: Mermaid DOM and chat/execution source specs.
3. **Valid, fixed.** Added `.code-block-note` to prose bidi selectors in `execution-node.component.ts:443`, `message-bubble.component.css:366`, and `thinking-block.component.ts:88`. Source assertions cover all three.
4. **Valid, fixed.** Added `dir="auto"` to enhanced H1/H2 output in `marked-extensions.ts:292`. `marked-extensions.spec.ts` asserts both heading levels. The heading itself resolves text direction independently of prior English content, while its accent dot and flex styling remain.
5. **Valid, fixed.** Added LTR isolated `.code-block-container` rules to `message-bubble.component.css:376` and `execution-node.component.ts:453`. Source assertions cover both. Stylelint comments about `::ng-deep` and `markdown` are invalid here: both match the existing scoped selector convention and are unrelated to the bidi defect.

## Decisions

- **Decision:** Isolate the entire code container in all three chat surfaces. **Options:** style only header/toggle, or style the container. **Evidence:** both controls are descendants of the container and outside `pre`; a container rule covers both. **Reversible:** yes.
- **Decision:** Put `dir="auto"` on H1/H2 output. **Options:** wrap heading text in a new span, or set heading direction. **Evidence:** the rendered heading has flex styling and a decorative dot; the heading direction can be determined from its text without changing markup structure. **Reversible:** yes.
- **Decision:** Omit automatic direction on Mermaid wrappers and keep it on markdown prose. **Options:** wrapper direction or prose host direction. **Evidence:** diagram controls share the wrapper; markdown parts render separately. **Reversible:** yes.

## Files changed

- `libs/frontend/chat-ui/src/lib/molecules/thinking-block.component.ts` and matching spec
- `libs/frontend/chat-ui/src/lib/organisms/mermaid/mermaid-message-text.component.ts` and matching spec
- `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts` and matching `execution-node.ptah-ui.spec.ts`
- `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html`, `.css`, and matching spec
- `libs/frontend/markdown/src/lib/marked-extensions.ts` and matching spec

No pre-existing worktree changes were present. No out-of-scope files changed.

## Verification

- `git diff --check`: passed.
- `ptah_get_diagnostics`: TypeScript check unavailable after 45-second timeout; HTML/CSS not covered.
- `npm run verify -- -p @ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/markdown`: passed (exit code 0). Header confirmed the requested projects: `node scripts/verify.mjs -p @ptah-extension/chat,@ptah-extension/chat-ui,@ptah-extension/markdown`. Exact result lines: `NX   6 tasks: 6 succeeded` (lint/typecheck); `NX   3 tasks: 3 succeeded` (test); `VERIFY_EXIT_CODE=0`. Failed tasks: 0.

