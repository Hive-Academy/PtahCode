# Review round 2: task-description.md (TASK_2026_2261_63e3)

## Verdict

APPROVED. Revision 2 resolves all 12 findings of round 1 and the 3 missing decisions. No blocker or major defect remains. The minor notes below do not block approval.

## Finding status

| # | Status | Location in revision 2 | Note |
|---|---|---|---|
| 1 | Resolved | "Manual creation before the designer"; Phase 1 scope and acceptance; decision 5 | Phase 1 adds CRUD RPC, an Electron list/editor and the frontend projects. The reviewer path is stated. |
| 2 | Resolved | Phases 2a and 2b | Memory ownership is a separate PR. Five PRs are stated in "Phases" and in the constraint list. |
| 3 | Resolved | "Sender authorization and approval enforcement"; Phase 3 acceptance | `allowedSenderIds`, trusted adapter identity, queued recheck, untrusted input and an ask/plan ceiling are present. Each has a fixture line. |
| 4 | Resolved | "What exists today" rows for catch-up and gateway session route; "Triggers, routing ownership and catch-up" | The job owns the schedule. The bot link owns the session in a bot route. The legacy route stays. |
| 5 | Resolved | Phase 3 acceptance | Adapter fakes, an injected clock, a fake power monitor and a lease test replace live checks. Live checks are labeled manual. |
| 6 | Resolved | "Schema and revisions"; "Delete and retention"; decision 6 | Rules cover newer and older schema, `bot_revisions`, resolved run configuration and four retention combinations. |
| 7 | Resolved | Record table; tool id mapping paragraph; scope paragraph | `executionPreference` and `unattended` are gone. `accountRef` is deferred. Tool mapping and root matching are defined. |
| 8 | Resolved | Phase 1 first deliverable `consumer-and-storage-audit.md` | The audit is an explicit first deliverable. Synthetic fixtures must be labeled. |
| 9 | Resolved | "Top-level enforcement seam"; Phase 2b and 3 acceptance | The seam is tied to code locations. The minimal gate is in 2b. Message ceilings are in phase 3. |
| 10 | Resolved | Phase 2b prerequisites; design paragraph before phase 1 | Decision 4 is a 2b prerequisite. Design approval precedes UI phases 1, 2b, 3 and 4. |
| 11 | Resolved | Citations throughout | The sampled citations are correct. See the next table. |
| 12 | Resolved | Phases 1 and 3 project lists and CLI acceptance | `platform-cli` is added. Each phase has a CLI compatibility line. |

Missing decisions from round 1: creation surface is decision 5, delete and retention is decision 6, scheduler owner is decision 7. All three are present.

## New claims checked

| Claim | Source | Result |
|---|---|---|
| `replayMissed` takes a per-job policy function and an explicit `now` | `catchup-coordinator.ts:81-85` | confirmed |
| Window is clamped to the 24-hour maximum. A zero window returns with no replay | `catchup-coordinator.ts:87-91` | confirmed |
| `none` skips the job. `last` fires only the final slot | `catchup-coordinator.ts:98`, `:102` | confirmed |
| Lower bound is `max(cutoff, lastRunAt ?? cutoff)`. The interval is `(since, now]` | `catchup-coordinator.ts:99`, `:117-121` | confirmed |
| Startup and resume pass a fixed policy | `cron-scheduler.ts:112`, `:123` | confirmed |
| Default policy is `last` | `cron-scheduler.ts:56` | confirmed |
| `started` guard and slot uniqueness note | `cron-scheduler.ts:103`, `:97-98` | confirmed |
| `ScheduledJob` has no catch-up field | `types.ts:38-50` (no field seen) | confirmed |
| `GatewayBinding` has `allowListId`, `approvalStatus`, `ptahSessionId`, `workspaceRoot` | `messaging-gateway/src/lib/types.ts:72-76` | confirmed |
| `GatewayConversation` has `ptahSessionId` and `workspaceRoot` | `types.ts:93-95` | confirmed |
| Inbound message has `allowListId` described as user, guild or team id. No separate sender field | `adapter.interface.ts:30-31` | confirmed |
| `createCallback` composition site in the query builder | `sdk-query-options-builder.ts:1363` | confirmed |
| PreToolUse bypass note | `sdk-query-options-builder.ts:~1395-1397` | confirmed (a few lines earlier than the cited 1396 is acceptable) |
| Live level resolver parameter | `sdk-permission-handler.ts:511` | confirmed |
| Child-policy lookup and yolo exception | `sdk-permission-handler.ts:627-636` | confirmed |
| `setSessionPermissionLevel` | `session-control.service.ts:599` | confirmed |
| Seam `BotRunPolicyProvider` | not in code | proposed, labeled as proposed |

## New defects

No major defect. Minor notes:

1. **Encoding damage (minor).** Quotes were replaced by `?` in several places, for example `?file-read?`, `?Talk to bot?`, `?not found?` and `?a stopped host does no work?`. Restore the quotation marks.
2. **Phase 4 prerequisite (minor).** Phase 4 depends on phase 1 only. Draft review feeds the phase 1 editor, so this is correct. State that phase 2b is not needed, to stop a wrong reading.
3. **Phase 1 reload evidence (minor).** The acceptance step "reload the app" is a manual reviewer step. Add one automated persistence fixture reference to make it repeatable.
4. **Cost of a new column (minor).** Phase 3 adds a catch-up migration in `cron-scheduler` and a tagged route in `messaging-gateway`. Both need a migration plan. The text says "forward migration" for the first only. Name the second in the phase 3 plan.
5. **Phase 3 size (note).** Phase 3 lists 13 projects and five areas (schedule, lease, gateway route, sender identity, policy ceilings). It is large. The text already says confirm ownership in each plan. Consider a split in the phase 3 plan if the audit shows more work.

No removed preserve-list item was found. Each row has a disposition and a reviewer check.

## Open decisions assessment

1. Scope and memory: a real decision with options, cost and evidence (`memory-search.service.ts:180`). The recommendation is supported.
2. Trigger scope and senders: a real decision. The recommendation is supported by named handlers, catch-up policy input and the guild or team nature of `allowListId`.
3. Approval defaults: a real decision. Evidence shows that the child policy lookup is separate, so a top-level seam is needed. Supported.
4. Continuity and rollover: a real decision. The recommendation (manual rollover first) is conservative. The evidence does not prove that automatic rollover is unfeasible, but the text says so with care.
5. Creation before designer: a real decision. It affects the phase 1 surface. Supported by the evidence that no frontend designer caller was found.
6. Delete and retention: a real product decision with four combinations. The recommendation is supported by the tombstone rule.
7. Scheduler owner: a real decision with a security and duplication impact. The lease recommendation is supported by the `started` guard being per instance only.

## Not checked

- Whole-repository absence of bot records (the bounded search is stated in the document).
- Program `evidence/` files and the research report cited in the Decisions table.
- The exact line of the PreToolUse comment (within a few lines of 1396).
- Behavior of existing non-bot scheduler tests and the 22 coverage floors.
- Live provider behavior for the policy gate (proposed work).
