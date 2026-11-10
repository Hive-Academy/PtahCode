# Batch 01 field-shell coverage follow-up

## Tests added

| File:line | Coverage |
| --- | --- |
| `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.spec.ts:88` | Invalid threshold row inline `outerHTML` snapshot: error paragraph, `input-error`, `aria-invalid`, and two `aria-describedby` ids |
| `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts:154` | Invalid numeric row inline snapshot with the same error-state wiring |
| `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts:164` | Invalid stored value and projected `<id>-stored` notice inline snapshot |
| `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts:174` | USD row without a readable note inline snapshot |
| `libs/frontend/ui/src/lib/extracted/settings-field/settings-field.component.spec.ts:48` | Null `errorRole` omits `role` |
| `libs/frontend/ui/src/lib/extracted/settings-field/settings-field.component.spec.ts:57` | Optional slots appear before hint and after error, with no `ptahSettingsField` marker attribute |

## Original-code capture proof

Before snapshot capture, the adopted component files were copied byte-for-byte to `C:\Users\abdal\AppData\Local\Temp\ptah-field-shell-coverage-batch01`. Their worktree copies were replaced with `git show HEAD:<path>` output. At capture time, `git hash-object` matched `HEAD` for both: session budget `fac6447d77b2db3e52a294dca668f228006fbbb2`; lane guards `e3a1963f4fcb0e51b938e2923c5fbe334e7472f0`. The focused `--updateSnapshot` capture then succeeded: 2/2 Nx targets. The files were restored from the temporary byte copies and SHA-256 compared equal to those copies. Restored Git blob hashes are `ceb8344a106b012217aed5c04de00c67e13ebdec` and `e2476cc5e1c47d1537875a1a7e87e36e8fe564a4`, respectively. `git diff` still shows the adopted extraction.

The first capture attempt had one test assertion mistake: it matched the control's unit suffix as a readable note. The selector was narrowed to direct row children and the capture was rerun on the same `HEAD` components. No snapshot was updated after restoring the adopted files.

## DOM differences and fixes

The first post-restoration run exposed two genuine differences in the shared error paragraph: the original had spaces around the error text node, and the original lane-guard `role` attribute preceded `id` in serialized `outerHTML`. In `libs/frontend/ui/src/lib/extracted/settings-field/settings-field.component.ts:17`, the template now preserves the spaces and creates `role="alert"` before the bound `id`, while `[attr.role]="errorRole()"` removes `role` when null. The UI unit test checks the null case. The coordinator's selector lint-disable comment remains directly above `selector`.

## Final result

Command, from worktree root, without snapshot update:

`npm run verify -- -t test -p @ptah-extension/ui,@ptah-extension/chat -- --testPathPatterns="(settings-field|session-budget-settings|lane-guards-settings).component.spec" | Select-Object -Last 40`

Exit 0; Nx **2/2 targets succeeded**, uncached. Chat: **2 suites, 49 tests, 6 snapshots passed**. UI: **1 suite, 3 tests passed**. Combined: **3 suites, 52 tests, 6 snapshots passed**. The final command tail reported `NX 2 tasks: 2 succeeded` and lock release with exit code 0. No full verify was run, per coordinator instruction. Ptah diagnostics completed on retry: no diagnostics in the four requested changed TypeScript files; sibling files retain unrelated diagnostics.

