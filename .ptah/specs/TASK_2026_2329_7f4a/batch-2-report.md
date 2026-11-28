# Batch 2 Report — `TASK_2026_2329_7f4a`

## Changed Files
All edits were made exclusively in worktree `/home/amun/ptah-extension/.claude-worktrees/fix-full-auto-yolo-providers-13f62db78c01`:

1. `libs/backend/codex-runtime/src/lib/codex-permission-policy.ts`
2. `libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts`
3. `libs/backend/codex-runtime/src/lib/codex-permission-policy.spec.ts`
4. `libs/backend/codex-runtime/src/lib/codex-approval-bridge.spec.ts`

Unchanged by design: `codex-execution-profile.ts` and `codex-context.ts` (`on-request` and `nextTurn` contracts untouched).

## Behavior per Requirement

1. **`codex-permission-policy.ts` — `yolo` auto-approval before `fileChange` details guard**
   - Preserved `if (kind === 'userInput') return 'present';` and `if (level === 'plan') return 'decline';` as the top two guards.
   - Added `if (level === 'yolo') return ruleStoreHit ? 'acceptForSession' : 'accept';` immediately before the `fileChange` `grantRoot`/unknown-fields guard.
   - Removed the now-redundant `level === 'yolo' ||` branch below the guard so `auto-edit` and `ask` retain the exact existing `fileChange` details guard while `yolo` auto-approves all non-question requests (including `fileChange` carrying `grantRoot` or extra metadata keys).

2. **`codex-approval-bridge.ts` — live native child approvals honor parent policy + `plan` safety guard**
   - Replaced `const policy = isChild() ? 'present' : codexPermissionPolicy(...)` with:
     `const policy = codexPermissionPolicy(this.options.permissionLevel(), request.kind, !isChild() && target !== undefined && this.options.rules.matches(identity, target), request.details);`
   - Live native child requests now auto-accept under parent `yolo`, decline under parent `plan`, stay interactive under parent `ask`, and never inherit parent rule-store hits (`!isChild()`).
   - Updated the final `plan` safety guard on `decision` by removing `!isChildRequest &&` (and removing the unused `isChildRequest` local), so `request.kind !== 'userInput' && this.options.permissionLevel() === 'plan'` declines both parent and child approvals even if the parent transitions to `plan` while a child prompt is in flight.

3. **Unchanged contracts**
   - Did not modify `codex-execution-profile.ts` or `codex-context.ts`.

4. **`codex-permission-policy.spec.ts` — updated `grantRoot`/unknown details coverage**
   - Updated the parameterized `grantRoot`/`writableRoots`/`scope` `fileChange` test so `ask` and `auto-edit` continue asserting `'present'` for both `remembered: false` and `remembered: true`.
   - Added assertions that `yolo` returns `'accept'` when `remembered === false` and `'acceptForSession'` when `remembered === true`, while `userInput` remains `'present'` under `yolo`.

5. **`codex-approval-bridge.spec.ts` — regression tests**
   - Narrowed the existing `Finding 1` sink-routing test from all 4 levels to `['ask', 'auto-edit']` to reflect the updated child policy contract.
   - Added regression tests verifying:
     - Under `ask`, a live native child does not inherit parent rule-store hits.
     - Under `yolo`, live native child approvals for `command`, `fileChange`, `permissions`, and `mcpElicitation` auto-accept with the expected wire response without invoking the sink.
     - Under `yolo`, a `fileChange` carrying `grantRoot` auto-accepts without invoking the sink.
     - Under `yolo`, `userInput` still invokes `requestUserInput` and never auto-accepts or calls the approval sink.
     - Under `plan`, a live native child approval declines without invoking the sink (D17), and an in-flight child approval declines if the parent switches to `plan`.

## Verification

- **Command**: `npm run verify -- -p @ptah-extension/codex-runtime` (run in `/home/amun/ptah-extension/.claude-worktrees/fix-full-auto-yolo-providers-13f62db78c01`)
- **Exit Code**: `0`
- **Summarized Output**:
  - `nx run @ptah-extension/codex-runtime:lint` — passed (`13.3s`, 0 cache hits)
  - `nx run @ptah-extension/codex-runtime:typecheck` — passed (`17.8s`, 0 cache hits)
  - `nx run @ptah-extension/codex-runtime:test` — passed (`35.7s` fresh execution in prior run with identical inputs; `171ms` local cache hit on final full pass)
  - Total verify lock duration: `33.8s`, exit code `0`.

## Decisions & Risks

- **Existing test update**: `Finding 1` in `codex-approval-bridge.spec.ts` previously asserted that child `command` approvals reached the sink across `['plan', 'ask', 'auto-edit', 'yolo']`, which directly contradicted the new `yolo` auto-accept and D17 `plan` decline requirements. It was narrowed to `['ask', 'auto-edit']` and paired with explicit tests for `yolo` and `plan`.
- **Child `auto-edit` fileChange behavior**: Passing child requests through `codexPermissionPolicy` means a live native child `fileChange` without `grantRoot`/extra keys will auto-accept under parent `auto-edit` (matching parent `auto-edit` policy and never looser than parent), while `command` remains interactive.
- **Sandbox note**: Running Nx inside the sandbox failed due to Linux user-namespace `/tmp` ownership causing Nx to fall back to a socket path exceeding the Unix socket length limit; re-running `npm run verify -- -p @ptah-extension/codex-runtime` outside the sandbox completed cleanly with exit code `0`.

## Continuation verification

The full scoped Codex runtime verification passed again. Commit `9cfbd50fb`.
