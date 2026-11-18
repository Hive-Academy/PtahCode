Verdict: REVISE — 7.5/10

All 11 round 1 findings are closed. The revision adds no wrong citation. Two existing spec groups will still break (RPC registry and surface ids), and one UI file will exceed the size limit. Fix these in the batch write sets and checks. No file except this one was changed. No test or build command ran.

Counts: 0 blocker, 3 major, 4 minor.

## Status of round 1 findings

| # | Round 1 finding | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Migration 0076 breaks existing specs | Closed | `implementation-plan.md:261-338`. The four follow-on lists hold exactly the 24 files that `rg -l "toBe\(75\)"` returns for `libs/backend/persistence-sqlite/src/lib/migrations/`. I compared the names one by one. Each batch has six files. B04 depends on all four (`:368`). Remove the "27 versus 24" note at `:263` now that the coordinator fixed 24. |
| 2 | Wrong jest config for cli-engine | Closed | `:194-205`. All named config files exist: `libs/backend/cli-engine/jest.config.cjs`, `jest.config.ts` in shared, persistence-sqlite, rpc-handlers, vscode-core, platform-cli, ui, chat, webview and electron. The `tsconfig.lib.json` files exist, and the webview app uses `tsconfig.app.json`. B11 uses `.cjs` (`:494`). |
| 3 | Wrong Electron tsconfig | Closed | `:190`, `:475`. `apps/ptah-electron/project.json:559` runs `tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`. |
| 4 | Token file in no write set | Closed | `:49-56`, `:364`. `libs/backend/persistence-sqlite/src/lib/di/tokens.ts:11` holds `PERSISTENCE_TOKENS`. B04 owns it. B03 owns `bot-ports.ts`. B05 and B06 own the bindings. `apps/ptah-electron/src/di/expected-resolvable.ts:36-53` has `EXPECTED_RESOLVABLE` and a tokens list, so B10 can add all five tokens. |
| 5 | B03 exports files that do not exist | Closed | `:339-350`, `:395-406`. B03 has no `index.ts`. B06 owns the barrel. B00 checks only the alias (`:224`). Each batch compiles its own files. |
| 6 | B05 order and unknown contracts | Closed | `:185-189`, `:387`. I opened `provider-models.service.ts:288` (`fetchModels`), `harness-skill-selection-rpc.service.ts:61-88` (`sourceResolver.resolve` then `readSkillCandidates`), `skill-catalog.ts:67-97`, `workspace-authorization.ts:6,26,44` and `harness/di.ts:47-66`. All match. B05 starts after B06 (`:387`, `:638`). |
| 7 | Retention data-loss gap | Closed | `:94-106`, `:368`, `:655`. Both keep-history cells keep every revision. The name is kept only for history=keep. The test inventory covers four combinations with three revisions each. |
| 8 | Missing B06 | Closed | B00-B11 are consecutive (`:218-495`). The dependency line at `:638` matches the headers. |
| 9 | Boundary citation | Closed | `:37`, `:59`, `:157`. Cited lines agree with my round 1 reading. |
| 10 | Unused import ledger | Closed | `:84`, `:107`. The table is deferred. Preview is deterministic and has no ledger reads. |
| 11 | Two updates on one revision | Closed | `:120`, `:368`, `:655`. |

## New findings

1. **Major — B01 breaks existing RPC registry specs, and no later batch runs them.** `:226-243`, `:429-460`. B01 adds nine methods to the registry. These existing specs check the whole registry: `libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts:76-77` (every registry method is claimed once) and `libs/backend/rpc-handlers/src/lib/rpc-allowlist.spec.ts:85-130` (every manifest and registry method has an allowed prefix). `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts` also uses the method list. They fail from B01 until B08 and B09 land. The B08 and B09 checks run only the new specs. Correction: add `manifest.spec.ts` and `rpc-allowlist.spec.ts` to the B08 jest command. Add `rpc-surface.spec.ts` to B11. State that these runs are read-only (no edit). Say in B01 that the registry is intentionally incomplete until B08 and B09.

2. **Major — U07 and U08 break existing surface specs that no write set covers.** `:600-632`. `libs/shared/src/lib/types/webview-surface.types.spec.ts:27-40` asserts the exact list of surface ids, and `:71` asserts the accepted initial views. `apps/ptah-extension-webview/src/app/webview-routing.spec.ts:273-296` loops over every id, expects the last surface to be `machines` and expects the last id to be Electron-only. Adding `bots` fails these specs. U07 alone also adds an id with no route. Correction: (a) put `webview-surface.types.spec.ts` in U07 (fold the new `bots-surface.spec.ts` into it, so the file count stays at two); (b) add `webview-routing.spec.ts` to U08 (five files, two projects) and run it and `app.routes.spec.ts` in the U08 check; (c) place `bots` in the id list so the "last id" assertions stay true, or update them in the same batch; (d) land U07 and U08 with no gate between them.

3. **Major — `bot-editor.component.ts` will exceed 700 lines.** `:581-598`, design states at `design-spec.md:128-146`. U06 gives one editor file the header, the Enabled toggle with its hint, the More actions menu, the save bar with eight states, the validation focus, the archived read-only mode, the conflict alert and the compare drawer. The plan states the 700-line rule only for U05 (`:573`). Correction: split U06 into U06a (page, barrel, css, page spec) and U06b (editor, `bot-save-bar`, `bot-conflict-drawer`, editor spec). Each stays under six files and one project.

4. **Minor — a decided option has no test.** `:545-560`. The user selected the "User" badge for user-scoped bots. U04 owns `bot-list-row.component.ts` but has no spec for it. The design gives the row an exact accessible name (`design-spec.md:196`). Correction: add `bot-list-row.spec.ts` to U04 (five files). Test the badge, the name text and the disabled/archived status.

5. **Minor — U06 acceptance does not name the decided items.** `:592`. Name the Enabled toggle with its "Applies at once" hint, the "Preview later" placeholder, "Show archived (N)", and the Restore action in the archived note. Add one assertion for each to the page or editor spec. The design lists `segmented-choice` as a new component (`design-spec.md:113`). The plan keeps it inside the delete dialog (`:65`, U05). This is allowed, but record it as a design-approved variant.

6. **Minor — parallel UI batches share one compile target.** `:530-560`. U03 and U04 both run `tsc` on `libs/frontend/bots-ui/tsconfig.lib.json`, which includes the other batch's files. One failing batch blocks the other. Correction: add a sentence to the U-batch rules that U03 and U04 run in sequence, or that a failure in a file not owned by the batch is reported, not fixed.

7. **Minor — CLI persistence failure is not mapped.** `:47`, `:487`. `libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts` wraps the persistence registration and catches failures as non-fatal (`logger.warn "... (non-fatal)"` near `:118-150`). Then `BOT_REPOSITORY` is unbound. The application service resolves lazily and fails with a DI error, not with `PERSISTENCE_UNAVAILABLE`. Correction: B08 maps a failed resolution of the repository or application token to `RpcUserError(..., 'PERSISTENCE_UNAVAILABLE')`. Add a B08 test and a B11 test with the repository unbound.

Both-root token wiring is otherwise consistent: the five tokens have one declaration owner, one binding owner, and an entry in each root (`:49-56`, `:471`, `:487`). The Electron order (harness, adapters, application, then handler) matches `apps/ptah-electron/src/di/phase-4-handlers.ts:107`. The CLI move of `registerHarnessServices` from `libs/backend/cli-engine/src/lib/container.ts:1121` to after `registerThothLibraries` (`:940`) is valid because harness-sync (`:828`) comes first.

The retention matrix (`:96-103`) removes no data that the user keeps. Row 2 and row 4 set the name to NULL by design. The tombstone keeps scope and workspace root in all rows (accepted in question 1).

The U batches cover every designed component except `segmented-choice` (see finding 5). All designed list and form states are in U03/U06 acceptance, with the gaps in findings 3-5.

## Residual risks for implementation

1. `libs/backend/cli-engine/src/lib/container.ts` has 1161 lines. B11 edits a baseline file. Keep the change to a helper call and move the code into a small new file if the diff grows.
2. Moving `registerHarnessServices` out of the optional RPC branch changes CLI startup order. Run the existing cli-engine startup specs after B11 and confirm no listener starts twice.
3. B02 leaves 24 old specs failing until B02a-d land. Do not run the project gate between them.
4. The `list-detail` change touches six container-query class strings (`libs/frontend/ui/src/lib/foundation/list-detail.component.ts`). Run the specs of the other consumers of this component before the gate.
5. Template type errors are outside `tsc`. The plan records the template gate (`:661`). The coordinator must schedule it before the push.
