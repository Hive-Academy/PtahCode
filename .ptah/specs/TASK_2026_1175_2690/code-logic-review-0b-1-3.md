# Code logic review: Phase 4 step 0b, batches 0b-1 and 0b-3

Verdict: **CHANGES**

## Confirmed defects

1. **Major — phase writes can escape the clone through a symlinked parent.** `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts:54`. `paths()` and `assertUnderUserLayer()` check lexical paths only. A preview can pass while `phases` is a normal directory; if that directory is replaced by a symlink before `applyProposal()`, the apply route does not recheck it, `mkdir(phasesDir, { recursive: true })` accepts it, and `writeTextAtomic(target, ...)` creates its temporary file through that link. The RPC path helper also returns a nonexisting target without checking its real parent (`libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/skill-clone-file-path.ts:33`). The slug lock serializes Ptah operations but does not prevent filesystem changes outside Ptah. **Suggested fix:** under the slug lock, reject symlinked clone/phase parents using `lstat`/`realpath`, including for a missing target, and enforce resolved containment immediately before writing. Test a directory swap between preview and apply.

2. **Major — one-file revert can read a snapshot file outside history.** `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts:69`. Revert checks lexical containment, then `fileExists(source)` follows links and `copyFileAtomic(source, target)` reads the linked file. A symlinked `.history/<ts>` or `phases` component, or a symlinked source file, can copy an arbitrary readable file into the clone for subsequent propagation. The RPC history-body read performs a real-path check; the writer does not. **Suggested fix:** verify the real paths of the history root, snapshot directory, parent, and source file inside the intended clone/history root under the lock; refuse links or use safe directory-handle access. Test symlinks at each component.

3. **Major — applying a phase proposal can overwrite edits made after preview.** `libs/backend/skill-synthesis/src/lib/skill-enhancer.service.ts:514`; `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts:48`. The proposal stores `currentBody`, but `applyProposal()` never compares it with the live phase file. The writer takes the slug lock and snapshots the latest folder, then unconditionally replaces the phase file with text generated from the older body. Another apply or manual edit between preview and apply is silently lost. **Suggested fix:** pass the expected body hash through `SkillFileWriterPort` and compare it with the current file inside the slug lock before snapshot/write; refuse stale proposals and prompt a new preview. The older main-file proposal flow has similar behavior.

4. **Minor — phase history offers revert for snapshots without that phase file.** `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-phase-files.component.ts:90`. Every folder snapshot is shown under every current phase row without checking whether that snapshot contains the phase file. A snapshot predating the file shows an actionable “Revert this file” button; the writer then returns `restored: false`. **Suggested fix:** enumerate availability per file/snapshot, or fetch `getHistoryBody` before enabling revert, and omit unavailable entries.

## Speculation / follow-up

- The `usage:getDimensionTotals` handler has strict Zod parameter parsing and matches the repository result shape. No confirmed 0b-3 logic defect found in the reviewed paths.
- `revert()` converts writer errors into `reverted: false` (`libs/backend/skill-synthesis/src/lib/skill-enhancer.service.ts:881`). This gives a failure toast but loses the distinction between missing history and a write failure; consider preserving a typed error if recovery guidance is needed.

## Review evidence and limits

Read both batch result notes, commit `e98220a7b` stat, scoped source, the host writer and filesystem operations, Angular call sites, usage handler/repository, and schema-hash test. This was a read-only logic review; no tests or UI rendering were run. The Ptah MCP tools and CLI skill discovery were unavailable in this lane, so Git and local searches were used. The workspace copy of `angular-frontend-patterns` was read for the UI review.
