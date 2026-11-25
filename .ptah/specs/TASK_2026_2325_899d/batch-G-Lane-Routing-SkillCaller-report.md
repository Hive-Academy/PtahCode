# G-Lane-Routing-SkillCaller (W3)

## Files changed

All three files are under `libs/backend/lane-routing/src/lib/decision-model/`.

- `skill-ranking-caller.types.ts` defines the discriminated result with the shared pair, stage category, registry, and Install outcome types. It extends the existing input with evidence, registry, and deprecation metadata, and keeps the candidate label as the stable ID.
- `skill-ranking-caller.service.ts` attributes the configured and submitted pairs, enforces the Decision deadline, prepares the request, and validates each returned item independently.
- `skill-ranking-caller.service.spec.ts` covers status mapping, the real fixed-request fit and cancellation paths, the deadline, request sanitization, and validation and rejection behavior.

## Plan items

- Lines 43 and 115–118. Return `used`, `failed`, or `skipped`. Set `pairConfigured` from the opened selection and `pairAttempted` from the dispatch seam. Return `pairUsed` on a successful Decision result. Carry only a category and known pairs on transport failures.
- Lines 118 and 399–403. Bound Decision by the earlier of Decision start plus 3 seconds and RPC entry plus 31 seconds. Pass the deadline-linked signal to `dispatchFor` and `runFixedRequest`. An oversized request, cancelled request before submission, or other failure before submission returns `pre-dispatch-error`. A timeout after submission keeps the attempted pair. A late completion skips validation and live bookkeeping.
- Lines 118 and 438–440. Send the stack item's kind, name, sanitized evidence and registry state, along with non-deprecated candidates. Validate Install candidate IDs against the item's own candidates, including case-insensitive ambiguity. Reject conflicting answers, deprecated candidates, missing evidence or reason, and Build or proposal fields for the affected item. Leave explicit none, low confidence, and omissions unresolved. Preserve valid sibling installs and per-candidate rejection reasons.
- Lines 265, 343, and 411. Kept source edits in the three assigned files and added the exact named regression.

## Checks

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts` passed all 22 tests. The initial run surfaced the broad `OpenedCaller.selection` discriminant. Narrowing it resolved the compile error.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` passed.
- `npx eslint libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.types.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts` passed.
- The native checks ran sequentially under the repository's shared verify lock. Ptah diagnostics reported zero errors and zero warnings for the three files. Provider behavior was exercised with fake completions and the real fixed-request pipeline.

## Decisions

- Use a local structured completion adapter to substitute an envelope-only schema and capture the response. Extending the shared fixed-request mode would cross this batch's write boundary. The shared pipeline projects output to scalar choices, while its structured port already accepts a schema and returns unvalidated output. The request fit reserves the replacement schema's bytes. Reversible if the pipeline gains a generic structured-response mode.
- Route a native System One Install pick without a reason to Normal. The current System One protocol accepts scalar choices and confidence, with a strict answer schema. Generating a substitute reason would conflict with the plan's evidence-grounding requirement. Reversible if System One gains reason-bearing output.
- Keep the legacy input fields and selected-first `items[key].order` alongside the Install outcome. The existing RPC ranking consumer parses results as unknown and reads `items[key].order`, so its call remains type-compatible. The evidence-grounded verdict requires evidence, which the old consumer does not supply. Reversible when the judge replaces that consumer.

## Open items and needed changes in other groups

- G-Skills-Judge should pass `rankSkillCandidates(items, rpcEntry)` with the original RPC entry timestamp, project evidence, registry state, stable candidate IDs in `label`, and the candidates' deprecation flags. Map `itemRejections` keys to stage `invalidItemIds` and leave every item absent from `items` eligible for Normal. Apply accepted Install outcomes and candidate rejection reasons, including the plan's default for unselected eligible candidates without an explicit rejection.
- Native System One can submit and report a choice, but its current transport cannot provide an evidence-grounded Install reason. That path uses Normal for reason-bearing judgement. Supporting reason-bearing System One installs would require a separate protocol change.
- Independent review and cross-project verification remain with the coordinating session.

## Extra reads

- Read the Decision acceptance criteria in `task-description.md`, the C1 amendment and targeted plan matches, the repository's CLI-lane check rules in `CLAUDE.md`, and the repository orchestration and agent-lanes guidance.
- Read the relevant parts of `pipeline/model-call.ts`, `pipeline/answer-validation.ts`, `reasons/compile-reasons.ts`, `decision-model/system-one.schema.ts`, `decision-model/structured-decision.port.ts`, and the agent SDK structured Decision adapter to check the two provider contracts.
- Read the relevant scorer input, result parser, and call site in the RPC handlers' `skill-ranking.service.ts` and `skill-ranking.schema.ts`, and checked the lane-routing public exports in `src/index.ts`.
- Ptah's absolute-path brief read failed, so the briefs were opened with the native reader. `ptah_search_files` returned zero handoff stubs, confirmed by a scoped `rg --files` fallback.
