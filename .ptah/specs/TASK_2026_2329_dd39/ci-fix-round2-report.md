# PR 1517 round 2 CI and review fixes

## CI shard 2/4

The drawer spec required the slide animation to be the first declaration in the panel rule. The prior drawer height repair put a layout declaration ahead of it. The portaled panel still owns its entrance animation. In `apps/ptah-extension-webview/src/app/motion-presets.spec.ts`, the assertion now looks for the right slide animation declaration anywhere inside the exact panel rule. The left slide, backdrop independence, and reduced-motion assertions are preserved.

## Inline review

| Thread | Cause and fix | Files |
| --- | --- | --- |
| 4712534490, 4712771052 | The sample-count filter hid funnel activity for runs excluded from scoring. Outcome details now include keys with funnel activity and zero samples. The sampled matrix, totals, and overlap calculation still use scored samples. Active outcome-only models count as models with evidence. A regression case checks that capacity drops remain visible with zero scoring samples. | `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component{,.spec}.ts` |
| 4712771062 | The catalog-only filter ignored catalog membership. It now requires catalog membership and no evidence. Historical models with active outcomes retain their evidence card and historical label. The same regression case verifies the catalog group excludes the historical model. | `libs/frontend/chat/src/lib/settings/ptah-ai/routing-evidence.component{,.spec}.ts` |
| 4712534496 | Disabling the cap also disabled CDK push by default. Viewport correction now defaults on with caller-sized content. An explicit false still disables push for uncapped callers. A mocked viewport case checks the fixed-width pane's right inset. | `libs/frontend/ui/src/lib/native/popover/native-popover.component{,.spec}.ts` |
| 4712771082 | The scroll listener captured the initial anchor for the entire open session. It now follows the effective anchor and cleans up when the anchor changes or the overlay closes. Ownership remains tied to the trigger. The regression test switches between unregistered scroll ancestors while open. | `libs/frontend/ui/src/lib/native/popover/native-popover.component{,.spec}.ts` |
| 4712771067 | Initial focus stopped at the first DOM candidate even when it could not receive focus. The modal skips hidden, inert, and disabled controls, retries after a failed focus attempt, and falls back to its panel. The regression case puts a hidden button before the first usable control. | `libs/frontend/ui/src/lib/native/modal/native-modal.component{,.spec}.ts` |
| 4712771073 | The modal could wrap Tab after a projected control cancelled it. The handler now honors cancellation. The boundary test covers cancelled and unhandled Tab in both directions. | `libs/frontend/ui/src/lib/native/modal/native-modal.component{,.spec}.ts` |
| 4712771087 | Legacy popover cleanup unconditionally restored trigger focus. It now restores focus if focus is in the closing panel or has returned to the document body. Tests cover preservation of external focus and restoration after panel focus. | `libs/frontend/ui/src/lib/overlays/popover/popover.component{,.spec}.ts` |

All eight comments apply to the PR head. GitHub CLI required authentication, so the comments were read through the same public, paginated API endpoint using Node. No GitHub mutations were made.

## Focused checks

| Check | Result |
| --- | --- |
| `npx.cmd tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` | Passed. |
| Focused UI Jest run for native popover, native modal, legacy popover, and native drawer | 4 suites, 68 tests passed. |
| Focused chat Jest run for routing evidence | 1 suite, 8 tests passed. |
| Focused renderer Jest run for motion presets | 1 suite, 6 tests passed. |
| `npx.cmd tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` | Passed. |
| `npx.cmd eslint` on all 9 changed TypeScript files | Passed with no diagnostics. |
| `git diff --check` | Passed. |

The first geometry test expected an exact 8px inset. CDK reported 16px in the mock, so the test now checks the required clearance on both sides. A clipped pane fails that check. PowerShell blocked the npx script shim, so the checks used `npx.cmd`. The Ptah dependency index was partial and omitted these files. Local ripgrep and Git inspection supplied the call-site and diff checks.

## Verification limits

The focused command list excluded the Angular `typecheck-templates` target and launching Electron for an updated visual review. The Jest suites compiled and exercised the changed Angular templates and modeled edge placement. Electron rendering and a screenshot of the changed UI remain unverified. No commit, push, or PR thread action was taken.

