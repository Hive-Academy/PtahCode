# Batch 16 implementation report

## Acceptance

Paths in the table are relative to the indicated library.

| Item | Implementation |
| --- | --- |
| 1. Completed disk analysis and Review skills | `setup-wizard/src/lib/services/setup-run/setup-run-saved-analysis.ts:74` discovers and adopts the latest completed manifest by workspace and manifest identity. When the newest manifest is incomplete, discovery also checks the saved list for the latest completed result. `setup-run-saved-analysis.ts:112` attaches freshness to the exact matching record or inserts a completed analysis with both identities set. Home already maps that record to Review skills through `onboarding/src/lib/home/setup-runs-list.component.ts:313` and the shared step target. |
| 2. Durable dismissal and explicit resume | `setup-wizard/src/lib/services/setup-run.store.ts:473` records the dismissal before removal. `setup-run/setup-run-dismissals.ts:35` keys the marker by normalized workspace, workflow and backend identity. `setup-run-persistence.ts:412` reads markers from the same version-1 snapshot as the records, and the passive analysis and generation coordinators consult them. `generation-run-event-adapter.ts:124` applies the same marker before adopting a delayed generation push. `setup-run/setup-run-bound.coordinator.ts:277` explicitly reopens a dismissed generation as interrupted from Home, where the existing Resume page still sends the bound resume request. Analyze's existing Continue action can still create a record and resume a dismissed analysis. |
| 3. Discovery failure and Retry | `setup-wizard/src/lib/services/setup-run.store.ts:645` starts discovery during workspace reconciliation. `setup-run/setup-run-saved-analysis.ts:36` coalesces reads per workspace, retains last known records and freshness, and clears only that workspace's error on success. `onboarding/src/lib/home/setup-runs-list.component.ts:138` renders an alert even without rows and Retry calls only discovery. Home does not call the run store's refresh on mount. |
| 4. Home context | `setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:215` counts checkpoint agents with the written outcome and updates matching records. `setup-run/setup-run-saved-analysis.ts:112` stores the backend's freshness state and reason. `setup-run-persistence.ts:267` validates and restores the context. `onboarding/src/lib/home/setup-runs-list.component.ts:69` renders the count and stale/incomplete explanations. |
| 5. Team Builder recovery | `setup-wizard/src/lib/services/setup-run/setup-run-host.ts:14` types the report against the stored Team Builder shape. `setup-run/setup-run-record.ts:37` persists supplied recovery fields, copies arrays and retains fields omitted by later reports, including explicit null and false values. |

The workspace-pinned reads use the existing workspace authorization rule in `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:824`. The optional workspace parameter preserves current implicit-root callers. The freshness and list RPCs provide manifest identity and update time without loading phase contents. See `libs/backend/agent-generation/src/lib/services/analysis-freshness.service.ts:123` and `analysis-storage.service.ts:804`. No package export is required.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Adopt the latest completed result as a seen row | Importing the whole history or adopting the latest result were both possible. The former Home card used the latest saved result, the store caps record history, and historical adoption does not represent a new completion. If the current status qualifies an incomplete result, the older completed row carries freshness only when it has its own qualified status. | Yes |
| Persist dismissal in the existing snapshot | A separate storage key would require two writes for one Dismiss. An optional property on the existing version-1 payload keeps removal and marker atomic and reads older snapshots. Markers survive index eviction and have no expiration. | Yes |
| Reopen a dismissed generation explicitly from Home | The D7 route already handles Resume and requires a run record. A link-style action restores the same backend checkpoint and opens that route without starting model work. The D3 configure chat flow continues to use its existing handoff. | Yes |
| Pin the read-only discovery RPCs to the store's workspace | Implicit host-root calls could race an Electron workspace switch. Saved list/load already authorize explicit workspace paths. Freshness carries run identity so Home discovery can avoid `loadAnalysis`, whose completed-analysis path may update the CLAUDE.md link. | Yes |
| Keep optional Team Builder fields on later reports | Replacing the subrecord would drop recovery fields from install and interruption reports that send only intent and installed skills. Reports can still explicitly clear owner decisions with null and set boolean flags to false. | Yes |

## Open minors

- Batch 11 Minor 10 fixed. Final-row Dismiss focuses the Home heading at `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts:115`. Minors 11 and 12 were previously closed.
- Batch 15 Minors 1–4 addressed. Discovery and dismissal logic live in collaborators, bound coordination delegates are grouped and marked internal, and `applyReportFields` keeps the record subtype.
- Batch 18A recovery minor addressed at `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-saved-analysis.ts:176`. Current list metadata avoids per-manifest load calls for no-ID recovery. Older hosts use ordered batches of four reads and skip individual failures.
- The two earlier bound-attempt timing minors listed under Batch 6 remain open. They concern orphan grace and pending initial-start lookups, outside the Batch 16 discovery and dismissal changes.

## Regression specs

- `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:566` covers metadata-only recovery and a failed legacy candidate. At lines 792, 816, 855, 902 and 958, it covers adoption and route identity, workspace isolation, failure and Retry with retained data, incomplete freshness, persisted dismissal with explicit resume, and Team Builder recovery after reload. `generation-run-event-adapter.spec.ts:397` covers late stream and terminal pushes for a dismissed checkpoint, and a subsequent push for a different run.
- `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts:118` covers the alert and Retry with and without rows, progress and incomplete copy, and opening the existing Resume route. `onboarding-home.component.spec.ts:231` covers keyboard focus after the last Dismiss. The existing Review skills row spec checks real navigation commands.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:472` verifies workspace authorization and pinning. The freshness and storage specs verify metadata identity and update time.

## Verification

- Setup Wizard Jest passed 261 tests across 4 suites. Log at `.ptah/tmp/batch16-setup-jest.log`.
- Onboarding Home Jest passed 53 tests across 2 suites. Log at `.ptah/tmp/batch16-onboarding-jest.log`.
- RPC handlers and schema Jest passed 115 tests across 2 suites. Log at `.ptah/tmp/batch16-rpc-jest.log`.
- Analysis freshness and storage Jest passed 84 tests across 2 suites. Log at `.ptah/tmp/batch16-analysis-jest.log`.
- Workspace-configured TypeScript passed for Setup Wizard, Onboarding, RPC Handlers, Agent Generation and Shared. Logs at `.ptah/tmp/batch16-*-tsc.log`.
- Ptah diagnostics found no issues in the three files checked after the late-push change. Its fallback compiler reported eight BigInt-target diagnostics in unchanged sibling files. The initial broader call timed out. The project-configured TypeScript checks are the verification fallback.
- ESLint exited 0 with zero errors and 35 warnings. Log at `.ptah/tmp/batch16-eslint.log`.
- Applied the repository Angular frontend patterns skill. This host exposed the repository skill file through Ptah reads.
- The live Electron review is pending. DOM specs exercised the existing Home row, Dismiss, and Interrupted state and the new alert and reopen action. I inspected the prior Electron screenshots for the completed Review skills row and the Interrupted row after restart. No updated Electron renderer was available in this lane, and the batch check scope excludes build and serve. [Completed reference](./visual-review/10-home-after-analysis-reconcile.png) · [Interrupted reference](./visual-review/23-post-restart-setup-home.png)
