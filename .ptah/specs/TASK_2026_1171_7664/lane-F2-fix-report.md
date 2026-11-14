# Fix round 2 report — TASK_2026_1171_7664

## Changes

| Item | Change | Tests |
| --- | --- | --- |
| A1 | `agent-process-manager.service.spec.ts:2552,2641`: expect the existing `reportAttempts` and `reportsFailed` signal fields. | Updated two expectations. |
| A2 | `parent-envelope-store.service.ts:375-391`: log a consumed-key shard write failure and leave the outbox entry for retry; remove it only after the shard key is durable. `lane-completion-notifier.service.ts:856`: use the existing best-effort consume helper in satisfied replay. | Existing restore and durability integration specs cover shard outage and removal order. |
| S-NEW-1 | `lane-completion-notifier.service.ts:555-604`: both pending callbacks check the current entry state before cancelling; delivered settlement clears the callback. `completion-read-ack.ts:54`: add the clear function. `parent-envelope-store.service.ts:300`: cancel leaves delivered and cancelled entries unchanged. | Added delivered-then-read regression in `lane-completion-notifier.service.spec.ts:1091`. |
| m1 | `protocol-dispatcher.ts:1730`: handle acknowledgment errors per exited entry. | Existing dispatcher specs. |
| m2 | `lane-completion-notifier.service.ts:1233`: say failed report attempts, without claiming the reports were lost. | Updated envelope expectation. |
| m3 | `ptah-api-builder.service.ts:1198`: keep the session resolver JSDoc directly over its method; fix indentation at line 1084. | Type checks. |
| m4 | `mcp-attachment-observer.ts:39`: expire each attempt map separately. | Added expired-authenticated/fresh-rejected regression in `mcp-attachment-observer.spec.ts`. |
| m5 | `lane-completion-notifier.service.ts:555`: early-read callback no longer consumes; the post-checkpoint skip path consumes once. | Existing checkpoint race spec. |

## Focused checks

| Check | Result |
| --- | --- |
| Runtime Jest: manager service, manager restore, notifier | 3 suites passed; 373 tests passed, 0 failed. |
| Runtime Jest: completion durability integration | 1 suite passed; 7 tests passed, 0 failed. |
| VS Code Jest: dispatcher, attachment observer | 2 suites passed; 394 tests passed, 0 failed. |
| TypeScript: `cli-agent-runtime` lib and spec configs | Both passed; 0 errors. |
| TypeScript: `vscode-lm-tools` lib and spec configs | Both passed; 0 errors. |
| ESLint: 9 changed TypeScript files | Passed; 0 errors, 6 warnings. |
| `ptah_get_diagnostics` on changed source | Unavailable after 45 seconds; the scoped TypeScript checks above passed. |

The first runtime Jest invocation included an incorrect path for the durability integration spec. It reported one suite load failure (`ENOENT`) alongside 373 passing tests in the three valid suites. The corrected invocation passed all 7 durability tests.

## Decisions

- A2: A failed consumed-key write retains the outbox for a later retry. Removing it before the key is durable could lose the dedupe marker. This uses the existing key shard and is reversible.

## Not done

No requested change remains undone. The initial `ptah_get_diagnostics` call timed out; all four permitted TypeScript project checks passed instead.
