## Verdict

REVISE — a stale restored session model leaves no selected row, and repeated picker instances create conflicting ARIA targets.

## Findings

| ID | Severity (high/medium/low) | file:line | Finding | Failure scenario (concrete input and state) | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| B2-1 | medium | `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.ts:281` | Only an unavailable `overrideModel` is validated against the refreshed catalog. An unavailable `sessionModel` remains the effective selection, so no row is marked selected. | Active tab has `sessionModel: 'old-opus'`, no override; a refresh replaces `availableModels` with `[{id:'default'}, {id:'new-opus', group:'other'}]`. `effectiveModel()` stays `'old-opus'`, the trigger names it, and neither rendered group contains a selected row. | Validate the final effective ID against a nonempty available list, then choose the same selected/default/first fallback used for stale overrides. |
| B2-2 | medium | `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.ts:173` | The toggle and controlled container use fixed IDs across all component instances, so `aria-controls` does not uniquely identify this toggle's section. | Two canvas tiles each render a picker with `other` rows and both dropdowns are open. Both buttons have `aria-controls="model-other-versions"`, while the document has two elements with that ID; assistive technology can resolve either button to the first section. | Give each picker instance a stable unique ID and bind both the button's `aria-controls` and its section's `id` to it. |
| B2-3 | low | `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.spec.ts:442` | The refresh test checks only the call count on a resolved stub. It does not prove rows remain visible during a pending refresh or that a rejection is handled. | An implementation that clears the list on open, or omits the rejection handler, still passes this test because `refreshModels` immediately resolves and the assertions inspect only its invocation count. | Use a controllable pending promise and inspect rendered rows before resolving; reject a separate refresh and assert the rejection is handled. |

## Requirements check

1. met — absent `group` is treated as primary, and each filtered list preserves source order (`model-selector.component.ts:318`, `model-selector.component.ts:326`).
2. met for grouped rows — the toggle exists only with `other` rows, and the selected `other` row opens the section by default (`model-selector.component.ts:169`, `model-selector.component.ts:341`); the stale selection case is B2-1.
3. not met — the button has the requested attributes and does not call selection, but its fixed `aria-controls` target collides across instances (`model-selector.component.ts:172`, `model-selector.component.ts:199`).
4. met in implementation — the dropdown emits `opened` after positioning (`native-dropdown.component.ts:278`); the handler starts a nonblocking refresh with a rejection handler (`model-selector.component.ts:397`), and catalog replacement occurs only after the fetch succeeds (`model-state.service.ts:309`, `model-state.service.ts:317`). The test gap is B2-3.
5. met — row markup contains neither badge nor `isRecommended` (`model-selector.component.ts:128`), and `SdkModelInfo` has no such field (`rpc-config.types.ts:106`).
6. met — standalone component metadata, `OnPush`, signals and `inject()` appear at `model-selector.component.ts:35`, `model-selector.component.ts:232`, `model-selector.component.ts:235`; no `@Input`, `@Output`, or `[innerHTML]` appears in the reviewed file.

## Not checked

No tests or Nx targets were run, as requested. The coordinator reported `npm run verify -- -p @ptah-extension/chat` exited 0; that result does not exercise the stale selection or duplicate ID cases. Review was limited to the requested diff, component, adjacent spec, and named contract/service/dropdown excerpts.
