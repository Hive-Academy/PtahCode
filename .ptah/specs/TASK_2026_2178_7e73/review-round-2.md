# PR #1288 — Permission enforcement review, round 2

## Verdict

**REQUEST CHANGES. Overall logic score: 5/10.** Finding 1 remains a high-severity bypass of the parent approval sink. Finding 2 is fixed in production code, but its regression spec does not exercise that fix. Static review only: specs were read, not executed; a scoped Ptah diagnostics request timed out.

## Finding 1 — Child approvals can bypass the parent sink (HIGH, open)

**Answer: (b), permission-based auto-approval remains.** A foreign thread passes only when `isChildTurn` accepts it (`libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts:310-320`). The admitted child then runs through `codexPermissionPolicy` (`:323-330`). `interact` calls the parent sink only for `present`; otherwise it returns the policy result (`:468-476`). The level is the parent's `turnPermissionLevel` (`libs/backend/codex-runtime/src/lib/codex-context.ts:384-398`).

| Level | Child approval without a fresh parent-sink decision |
| --- | --- |
| `plan` | No grant: ordinary approvals return `decline`; questions take a separate path (`codex-permission-policy.ts:17-20`). |
| `ask` | A matching remembered rule returns `acceptForSession`; otherwise the request is presented (`codex-permission-policy.ts:40-44`). |
| `auto-edit` | A plain file change returns `accept`; a matching rule can return `acceptForSession`. File changes with `grantRoot` or unrecognized details are presented (`codex-permission-policy.ts:22-44`). |
| `yolo` | Most approval requests return `accept`; a matching rule returns `acceptForSession`. File changes with `grantRoot` or unrecognized details are presented (`codex-permission-policy.ts:22-44`). |

Child command targets are built from the request (`codex-approval-bridge.ts:403-413`) and matched against parent-identity rules (`:324-328`), so remembered grants are reachable. Auto-grants become wire decisions at `:343-364`. Child specs at `codex-approval-bridge.spec.ts:296-361` use the `ask` default (`:107`) with no pre-existing rule, and cover none of these grants.

**Required resolution:** If D17 requires every child approval to reach the parent sink, force recognized children through that sink while preserving plan-mode denial. Test child requests in `ask` with a remembered rule, `auto-edit` file change, and `yolo`. If inherited parent policy is intended, have the task owner explicitly authorize that permission contract and add tests for its grants. The current code cannot support the claim that every child approval reaches the sink.

## Finding 2 — Terminal native children remain approvable (HIGH, production fix present)

**Answer (a): yes, terminal children are removed from both approval maps.** A recognized native terminal event adds the turn to `terminalTurns` and deletes `childTools` and `childTurns` (`codex-context.ts:881-890`). The non-native terminal path does the same (`:892-897`). `isChildTurn` requires both map entries (`:396-398`); `isCurrent` scans surviving child turns (`:390-394`). A late approval after cleanup therefore fails closed (`codex-approval-bridge.ts:343-356`).

**Answer (b): a regression spec exists, but is incomplete.** `codex-approval-bridge.spec.ts:321-332` asserts `cancel` and no sink call for a terminal child. It supplies a synthetic `isChildTurn` callback that rejects a different turn ID; it does not emit a terminal event or test `CodexContext` map deletion. It would pass if `codex-context.ts:888-889` regressed. Add a context-level terminal-event test that admits a native child, processes its terminal event, then submits a late approval for the same thread and turn.

## Overall design

**D24: reordering does not guarantee `plan` for every no-row adapter.** `libs/shared/src/lib/types/cli-lane-defaults.types.ts:40` orders modes from `plan` to `yolo`, but the resolver selects the first *supported permission/network pair* (`:49-59`). Ptah CLI supports `plan`/`allow` (`:66-73`), and its no-row case is tested (`cli-lane-defaults.types.spec.ts:4-8`). If another manifest lacks a supported `plan` pair, the resolver can choose `ask`, `auto-edit`, or even `yolo` with no saved row. Test and explicitly decide the unsupported-plan case, especially a manifest supporting only `yolo`.

**D17: parent-sink routing does not prevent child auto-approval.** The sink is reached only for `present` (`codex-approval-bridge.ts:473-475`). The child tests cover that path under `ask`, not the auto-grant cases.

## Five logic questions

1. **Silent failure:** A child receives `accept` or `acceptForSession` while the parent sink sees no request (`codex-approval-bridge.ts:323-330`, `:473-475`).
2. **Unexpected user action:** A child under `auto-edit` requests a plain file change, or one under `yolo` requests most approval kinds, and gets an automatic grant (`codex-permission-policy.ts:40-44`).
3. **Wrong-answer input:** A no-row manifest supporting only `yolo`/`allow` resolves to `yolo`, despite D24's plan-default intent (`cli-lane-defaults.types.ts:49-59`).
4. **Dependency failure:** A rejected sink promise becomes `decline`, and a timed-out interaction is declined (`codex-approval-bridge.ts:437-478`); auto-grant paths never invoke the sink. A request after terminal cleanup fails the child callback (`codex-context.ts:396-398`, `:887-889`).
5. **Missing requirement:** D17 needs an explicit rule for inherited parent auto-grants versus a fresh parent-sink decision. The code chooses inheritance; the task summary says child approvals must reach the parent session or fail closed (`.ptah/specs/TASK_2026_2178_7e73/task.md:5-10`).

## Score and scope

**5/10:** the terminal-child production defect is fixed and the Ptah CLI no-row default is `plan`, placing this above the 3–4 band. The remaining high-severity auto-grant path and unsupported-plan fallback keep it below 7–8. The terminal test's limited coverage adds residual risk. Finding 3 of the initial review (commit metadata) was outside this round's focus and was not reassessed. No source files were edited.

## Decisions

- Interpreted “reach parent session or fail closed” in `task.md:9` and Finding 1's review question as requiring a parent-sink decision for each child approval. Inherited parent policy is a plausible alternative, but it needs an explicit task-owner decision and tests. This decision is reversible.
