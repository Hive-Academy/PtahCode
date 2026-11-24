# Code Logic Review — TASK_2026_2326_5d16 / G2

Verdict: REVISE  
Review family: codex (implementer antigravity)  
Commit: `e528f9632`

| Overall score | Blocking | Serious | Moderate | Minor |
| --- | ---: | ---: | ---: | ---: |
| 6/10 | 0 | 0 | 3 | 0 |

The normal settings, tier policy, and exclusion paths follow the G2 contract. The reader still has gaps in failure isolation, role matching, and diagnostic formatting. The core policy and precedence checks hold, so the fixes can stay local to the reader and its tests.

## Findings

1. **Moderate — A throwing entry aborts the entire read.** `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:154`. The loop reads `raw[index]`, calls Zod, and may read the raw ID again for a label. Any of those reads can throw for a value accepted by the `unknown` API. For example, put an object with a getter for `match` that throws between two valid rules. Zod reads the getter during `safeParse`, so the public helper throws. The workspace wrapper catches it at line 240 and discards both valid siblings, returning a generic setting read failure with no entry index. Guard top-level inspection and isolate each indexed read and parse. Use a fixed diagnostic with the index if entry inspection throws, then continue to later entries. Add a regression with valid rules on both sides of the throwing entry.
2. **Moderate — The reader and matcher normalize roles differently.** `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:222`. The reader trims the configured role at line 37, while the phase argument parser preserves whitespace (`libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:24`). A valid call carrying `role: "backend-developer "` misses a rule for `backend-developer` and can pick a later catch-all without a validation diagnostic. Trim the phase role for the selector comparison and retain the phase value for other callers. Cover a padded phase role and a role array in the matching spec.
3. **Moderate — Unknown field names can inject control characters into diagnostics.** `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:115`. Zod 4.6.7 interpolates unknown JSON property names verbatim into the `unrecognized_keys` message. A valid rule that also contains a key encoded with `\u001b` is rejected, but the escape character survives the replacements at line 102 and reaches the diagnostic. The entry label and 160-character cap still apply. Render this issue from fixed text and the schema path, or escape control characters before truncating. Cover an unknown key containing an escaped control character in the reader spec.

## Five logic questions

1. **Where does failure look like success?** A padded phase role is accepted and can produce an ordinary catch-all result even though the earlier role-specific rule was intended to apply (finding 2).
2. **What user action is surprising?** Passing a role with trailing whitespace through the route call silently changes the winning rule (`routing-rules-setting.ts:222`).
3. **What input yields a wrong result?** A strict-object rejection for a JSON property containing a control character yields an unsafe diagnostic string (`routing-rules-setting.ts:115`). Ordinary invalid entries retain their valid siblings and carry an ID or index (`routing-rules-setting.ts:154–187`).
4. **What happens when a dependency fails?** The synchronous workspace configuration read has no timeout path. A thrown read returns one diagnostic (`routing-rules-setting.ts:233–248`). Zod validation failures are handled per entry, but exceptions during entry traversal reach that setting-wide fallback (finding 1).
5. **What case did the requirements leave implicit?** A setting may be absent, which yields empty rules and diagnostics (`routing-rules-setting.ts:132–140`). The raw port can also return JavaScript objects with accessors. Finding 1 applies the explicit no-throw contract to that input.

## Data flow and verification

- The reader validates strict objects, keeps the first valid occurrence of each ID, drops reversed bounds, and retains input order. The matcher uses OR inside selector arrays and AND across fields, with the first matching entry winning. The three findings concern this read and match boundary.
- The policy preserves R1–R5 precedence and the 3999/4000, 7999/8000, and 11999/12000 transitions. Omitted weight has an explicit condition in every branch. Both tier bounds form a valid interval after validation. The effort schema uses the same five values as shared `EffortLevel`. Evidence: `tier-effort-policy.ts:34–140`, `tier-effort-policy.ts:155–189`, `route-decide-result.schema.ts:187–193`, and `ai-provider.types.ts:184–185`.
- Hard constraints run before user exclusions. An accepted pin bypasses its own user exclusion, while an at-limit or otherwise hard-blocked pin stays unavailable. The reviewer-family fallback branch and disclosure flag are preserved. The reason compiler now accepts the same exclusion type as the classifier, and the reader and result schema share the ID pattern. Evidence: `hard-constraints.ts:232`, `hard-constraints.ts:249–269`, `hard-constraints.ts:284–363`, `compile-reasons.ts:67–70`, and `route-decide-result.schema.ts:73–79`.
- The shared RPC changes add a standalone type and setting key. Ptah symbol search returned no hits, and absolute-path `ptah_lsp_references` returned a limited text scan with no hits. Exact-word `rg` in the worktree found the new exports consumed only by the G2 reader, policy, and specs. Scoped Ptah TypeScript diagnostics returned zero errors. Skill catalogue discovery was unavailable for this lane. The plan's Nx skill assignment covers B05a implementation.
- Existing focused specs were inspected. The findings are static traces. No Jest, Nx, or verify commands were run. Combined pin-model and rule-clamp resolution remains an integration check for B07: in this commit the planner still calls the base policy and separately resolves pin models (`phase-plan.ts:130–142`, `phase-plan.ts:387–395`).

## Decisions

- Apply the committed shared ID vocabulary, including dots. The plan summary omits dots, while G1's result contract and tests explicitly accept them and the G2 coordinator edit reuses that validator. Tightening only the reader would recreate a contract mismatch. A shared vocabulary change is reversible only with a decision about existing dotted IDs.
- Treat duplicates after invalid entries are removed, which keeps the first valid rule. Reserving the ID of an invalid entry would discard an otherwise valid sibling. The plan says to retain valid siblings and match the first valid rule. This interpretation is reversible with a reader change and a test that fixes the desired ordering.

Confidence is high in the static traces.
