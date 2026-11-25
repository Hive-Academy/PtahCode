# G2 code logic re-review — TASK_2026_2326_5d16

Verdict: REVISE  
Review family: codex (implementer antigravity)

1. **FIXED — Throwing entries discard valid siblings.** The top-level array inspection is guarded and each indexed read, parse, and diagnostic label is inside its own exception boundary. The catch emits a fixed diagnostic with the entry index and continues. Regressions cover throwing entry getters, array slots, and a top-level length trap. Evidence: `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:164`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:206`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:249`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts:202`, and `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts:258`.
2. **FIXED — Padded phase roles miss their rule.** The reader and matcher trim both operands while preserving case, scalar and array semantics, and the original phase value. The added spec exercises padded inputs and checks that the phase stays intact. Evidence: `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:41`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:284`, and `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts:415`.
3. **NOT FIXED — Moderate — Unknown field names still pass some control characters into diagnostics.** The original ESC example is covered, and the cap applies to the full diagnostic. The predicate strips C0 and DEL but leaves C1 controls (U+0080–U+009F). An unknown JSON property containing U+009B, the C1 Control Sequence Introducer, is rejected, but the returned Zod message still contains that character. Whitespace collapsing leaves it intact. Extend the predicate to cover C1 and add a regression with an escaped C1 character in an unknown key. Evidence: `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:112`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:126`, `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.ts:213`, and `libs/backend/lane-routing/src/lib/scope/routing-rules-setting.spec.ts:300`.

**New defects:** None identified in the two-file diff. Finding 3 is a remaining case of the original defect.

## Logic check

A diagnostic can appear cleaned while still containing a C1 control. Padded role inputs now match the intended selector. An unknown key containing U+009B still produces an incorrect diagnostic. Exceptions during per-entry parsing preserve valid siblings and an unreadable top-level array produces one diagnostic. The diagnostic requirement implicitly covers both C0 and C1 controls.

## Verification

The focused routing rules Jest suite passed all 20 tests. The C1 case was identified by static trace. This review covered the two requested working-tree files.
