# F1 fix report — TASK_2026_1171_7664

## Findings

| Finding | Change | Tests added |
| --- | --- | --- |
| S1 | `protocol-dispatcher.ts:1451,1728` catches status, caller resolution and acknowledgment failures locally, logs the `Error` with the injected logger, and returns the original read/wait result. `completion-read-ack.ts:26` retains failed cancellation callbacks for reconciliation. | `protocol-dispatcher.spec.ts:283,295`: read status/resolver/cancellation failures and wait resolver/cancellation failures. All cases remain in the existing B4 block. |
| S2 | `parent-envelope-store.service.ts:342,374` writes a durable consumed completion key before removing its outbox entry; a concurrent checkpoint sees the key and skips writing the outbox. `parent-delivery-drainer.service.ts:123` exposes settlement. `lane-completion-notifier.service.ts:414,550,668,704,856,1340` settles acknowledged transitions at the read hook, checkpoint skip, replay skip and satisfied replay. | `lane-completion-notifier.service.spec.ts:1143,1176`: read during checkpoint, restart replay, and eviction after 256 newer acknowledgments. |
| S3 | `agent-report-router.service.ts:284` records per-lane attempts and failed results; `agent-process-manager.service.ts:2208,3682` keeps bounded counters on the tracked agent and carries them into the signal. `tracked-agent.ts:80` and `agent-process.types.ts:768` hold the counters. `lane-completion-notifier.service.ts:1227` adds `reportsFailed`, a delivery status line, and a Next line when reports failed. Deliverable verdict values and missing-file behavior are unchanged. | `agent-report-router.service.spec.ts:104` checks failed delivery counting; `lane-completion-notifier.service.spec.ts:1248` checks exit 0, fresh deliverable, and explicit failed-report state. The existing status expectation at line 1243 was updated. |
| M1 | `lane-completion-notifier.service.ts:590,880` handles refused or thrown cancellation, logs an `Error`, retains pending reconciliation, and keeps signal operations resolved. `completion-read-ack.ts:26,42` retains callback state until cancellation succeeds. | `lane-completion-notifier.service.spec.ts:1193,1209`: refused cancellation remains retryable; refusal during enqueue does not reject signaling. |
| M2 | `http-server.handler.ts:386` records rejected pre-auth requests separately. `mcp-attachment-observer.ts:19,38,57` keeps authenticated observations authoritative and bounds rejected attempts to 512. | `mcp-attachment-observer.spec.ts:4,12`: same-ID pre-auth rejection cannot replace an authenticated observation; rejected map remains bounded. |

## Focused checks

| Check | Result |
| --- | --- |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` | Pass; 0 errors. |
| `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` | Pass twice, including after final test edits; 0 errors. |
| `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` | Pass; 0 errors. |
| `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` | Pass; 0 errors. |
| `npx eslint` on all 16 changed source/spec files | Pass; 0 errors, 10 warnings (existing large-file/unused-value warnings and unavailable Nx graph rule). A final focused lint on the last edited spec passed with 0 errors and one Nx graph warning. |
| Focused Jest: runtime notifier spec, runtime report-router spec, VS Code dispatcher and observer specs | Incomplete: each command emitted the Jest ES-module configuration warning, then produced no test output for roughly 3 minutes. Each was interrupted. Across these attempts: 0 tests reported passed, 0 tests reported failed. |
| `ptah_get_diagnostics` on changed source | Unavailable after 45 seconds; scoped TypeScript checks above completed successfully. |

## Decisions

- Persist a consumed completion in the existing completion-key shard and remove its outbox entry. The existing store already treats shard keys as satisfied during replay; this is reversible within the existing schema.
- Keep artifact verdicts tied to deliverables and expose report failures as separate completion attributes and lines. This preserves the established `no-deliverable` contract.

## Limitations

The Jest runner did not produce test verdicts in this worktree. The new regression cases type-check and lint, but their runtime assertions remain unverified. No requested finding was intentionally left unimplemented.
