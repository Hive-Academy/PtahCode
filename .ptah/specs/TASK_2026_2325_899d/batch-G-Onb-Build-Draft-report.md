# G-Onb-Build-Draft implementation report

## Files changed

- `libs/frontend/onboarding/src/lib/proposal/skill-build-row.component.ts` and its colocated spec
- `libs/frontend/onboarding/src/lib/proposal/skill-draft-preview.component.ts` and its colocated spec
- `libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts` and its colocated spec

## Plan items

- R15/F24/F32 (plan lines 189, 196, 550–555, 574, 654). Build rows check for Install on linked judge items, disclose full descriptions and all linked Build reasons with More, and emit the same reasons and evidence in the draft-generation request. Each disclosure has a per-instance control ID. Registry search failures receive the TD 4.4 disclosure (line 571).
- R23/F25 and Preview/Create byte equality (lines 190, 452–473, 568–569). The preview renders the shared serializer's exact SKILL.md text and destination slug. Edit retains the document across mode changes. Create sends a snapshot with the raw body so the filesystem writer can use the same serializer. The Build opener remains focusable when its created path is displayed and rejects a second request.
- R18/F30 (lines 198–201, 569). Create disables editing, mode changes, retry and Cancel while busy. The standalone project editor retains edits and clears the busy state on a failed response or rejection, with an inline message. Its manual draft starts with project evidence and authoring space.
- C5/D35 (decisions line 39). Matching the computed slug against `usedSlugs` shows a warning and gates Create on a named checkbox. Renaming to an unused slug removes the warning. Changing back or submitting requires fresh confirmation.

## Contract for G-Onb-Review

Import these standalone components from their files in `libs/frontend/onboarding/src/lib/proposal/` when wiring the review. Add public barrel exports only if another library needs these types or components.

| Component | Inputs |
| --- | --- |
| `SkillBuildRowComponent` (`ptah-skill-build-row`) | Required `proposal: SkillBuildProposal`, `items: readonly SkillJudgeItem[]`, `runId: string`. Optional `disabledReason: string \| null` and `createdPath: string \| null`, both defaulting to null. The row supports content projection for the inline preview. |
| `SkillDraftPreviewComponent` (`ptah-skill-draft-preview`) | Required `draft: SkillDraftValue` ({ name: string, description: string, body: string }). Optional `mode: SkillDraftMode` ('preview' or 'edit', default 'preview'), `busy: boolean`, `generating: boolean`, `canRetryGeneration: boolean` (all default false), `generationError: string \| null`, `createError: string \| null` (both default null), `showCancel: boolean` (default true), `usedSlugs: readonly string[]` (default []). |

| Output | Payload and handling |
| --- | --- |
| Row `previewRequested` | `SkillBuildPreviewRequest` ({ params: WizardGenerateSkillDraftParams, opener: HTMLButtonElement }). Pass params to the store generation action after replacement checks and retain the opener for focus restore. |
| Preview `draftChange` | `Partial<SkillDraftValue>` with one changed field. Merge into the current store draft and mark it dirty. |
| Preview `modeChange` | `SkillDraftMode`. Update the store mode. |
| Preview `createRequested` | `SkillDraftSubmission` ({ name: string, description: string, body: string, slug: string }). Snapshot it and submit `harness:create-skill` with { name, description, content: body }. |
| Preview `cancelRequested`, `retryRequested` | `void`. Apply the store's dirty and busy guards before closing or retrying. |

Bind `usedSlugs` to `createdSkillSlugs()`. Scope the rendered preview instance to the currently open draft so confirmation state cannot carry across replacements. Supply the evidence-only draft and `mode: 'edit'` on generation failure. On successful Create, record the response path or compute the fallback from the submitted slug. Close the preview, update the row's `createdPath`, and focus the opener after the state change. Restore opener focus after an accepted Cancel as well. The opener uses `aria-disabled` after Create so it remains a valid focus target.

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <the three specs above>` passed all 12 tests.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- `npx eslint <the six changed TypeScript files>` passed with zero errors and zero warnings.
- Scoped `ptah_get_diagnostics` timed out after 45 seconds without reporting a result. The directly invoked scoped TypeScript check passed.

The approved dark prototype screenshot was inspected for the compact Build heading and actions, inline preview, scrollable document, destination hint and Create placement. Electron rendering was not run under this lane's launch restrictions. The focus test exercises signed-off parent wiring in a local test host, and the row test verifies that the real opener remains focusable after creation.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Control the judged preview from its parent | A store-controlled draft or a second component-owned RPC lifecycle. R18/F30 already assign lifecycle and replacement guards to the store. The coordinator approved controlled inputs and outputs. | Yes |
| Share the preview between judged and standalone project editing | Reuse the new view or keep separate create forms. Both use the same serializer, field controls and busy behavior. The standalone component retains its RPC ownership. | Yes |
| Preserve input bytes at submission | Normalize in the renderer or preserve the draft received from generation and user edits. Section 3.5 and the generation service assign normalization to the server's model-output boundary. | Yes |

## Open items and integration

- G-Onb-Review and G-Onb-Pages own production bindings for the components. G-Onb-Store-Coverage owns the lifecycle, the four dirty-draft replacement guards, stale generation rejection, duplicate submission guard and created-slug signal. Electron visual verification remains open for the integrated page.

## Extra reads

- Workspace guidance in `CLAUDE.md`, the Angular and UI design skill entry files, and the approved `prototype/screenshots/skills-build-preview-dark.png` reference.
- `brief-G-Onb-Store-Coverage.md` and targeted draft-symbol search in `stack-skill.store.ts` for the cross-lane contract. `decisions.md` D12/D13 confirm design approval and D35 specifies the confirmation split.
- Shared barrel and RPC declaration snippets in `libs/shared/src/index.ts`, `rpc-harness.types.ts` and `rpc-setup.types.ts` for import and payload verification.
- Targeted symbol search in backend `skill-draft-generation.service.ts` and `harness-fs.service.ts` confirmed the one normalization boundary and writer serializer. `ptah_get_dependents` returned zero results with an incomplete index for the standalone project editor. A targeted `rg` located its template consumer.
