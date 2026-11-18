# Revision 3 notes - TASK_2026_2261_63e3

1. Encoding repair: in "Goal", "What exists today", "Record and storage", "Sessions and user control", "Phase 1 - Audit, record and manual editor (one PR)", "Phase 3 - Schedule and gateway dispatch (two PRs: 3a and 3b)", "Preserve list", "Decisions" and "Related follow-up (not in scope)", replaced damaged question-mark quotation pairs and typographic quotes with plain ASCII quotation marks. Preserved TypeScript optional markers and the nullish-coalescing operator. The definition is revision 3 and is UTF-8 without BOM, with ASCII-only text.

2. Phase 4 prerequisite: in "Phases" and "Phase 4 - Designer output and controlled transition (one PR)", stated explicitly that phase 2b is not needed. Designer draft review feeds the phase 1 editor and may ship with execution disabled; the proposed delivery order adds no dependency.

3. Automated reload evidence: in "Phase 1 - Audit, record and manual editor (one PR)", added an acceptance fixture that writes and edits a bot in temporary on-disk storage, closes and reopens storage through a fresh repository, then reads back its id, edited fields, current revision and immutable revision contents. This supplements the manual Electron reload check; it is a proposed implementation test, not a test added or run in this documentation task.

4. Tagged-route migration: in "Phase 3 - Schedule and gateway dispatch (two PRs: 3a and 3b)", named the existing `GatewayBinding`/`GatewayConversation` types in `messaging-gateway/src/lib/types.ts`, `BindingStore` in `binding.store.ts`, `ConversationStore` in `conversation.store.ts`, and the `persistence-sqlite/src/lib/migrations/` registry and existing gateway migration files. The proposed forward migration preserves legacy routes and conversation data; confirmed bot conversion clears both session authorities transactionally. Upgrade/reload and mixed-target fixtures cover the transition. The referenced source was read; no source was edited.

5. Phase 3 size: in "Phase 3 - Schedule and gateway dispatch (two PRs: 3a and 3b)", proposed 3a for schedules/catch-up, reserved-handler dispatch, deduplication and lease/fencing, followed by 3b for gateway migration, authenticated senders, message deduplication and approval/policy ceilings. Assigned acceptance checks at that boundary and retained Electron-first and CLI compatibility evidence for each PR. Updated the PR counts in "Phases" and "Lane-introduced constraints"; other phase numbers and all seven open decisions/recommendations remain unchanged.

Verbatim open-decisions section heading and numbered decision headings from the definition:

## Open decisions for the user

1. **Definition scope and memory.**
2. **Trigger scope and senders.**
3. **Approval defaults.**
4. **Continuity and rollover trigger.**
5. **Creation before the designer.**
6. **Bot delete, memory and run history.**
7. **Scheduler owner across Electron and CLI.**
