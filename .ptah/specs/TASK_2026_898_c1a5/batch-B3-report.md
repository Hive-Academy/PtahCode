# Batch B3 report

## Files changed

- `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts` (new): validated task and PR inputs, confirmed open/merged/closed-unmerged outcomes, one disposable timer for watched review tasks, bounded lookup timeout and capped exponential backoff, detached close-out on merge.
- `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.spec.ts` (new): open, unknown, closed-unmerged and merged behavior.
- `libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.ts`: `setCarrierStatus` replaces only the frontmatter status line, with task-ID and resolved-path checks.
- `libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.spec.ts`: byte-preservation and repeat-write test.

## Design

The reconciler checks PR state through `CloseOutPrStatusPort`. An open PR sets `in_review`; a merged PR sets `done` and starts `TaskCloseOutService.run` in the background, passing through the existing opt-in cleanup setting. Unknown results do not change status. A closed-unmerged PR gives an explicit result and leaves the carrier unchanged. Only in-review tasks enter periodic polling; all watched tasks share one unref'd timer, cleared on dispose. Each lookup times out after 15 seconds; failed lookups back off up to one hour.

The detector patches the exact status line in `task.md`, preserving its remaining bytes, including CRLF and body content. It refuses absent or duplicate status lines and paths resolving outside `.ptah/specs`.

## Decisions

- Used a narrow detector status-write method instead of `TaskWriterService.updateStatus`. Options: writer or narrow patch. Evidence: the writer also changes `updated:` (`task-writer.service.ts:838`), contrary to AC5. Reversible when the writer supports status-only updates.
- Injected `CloseOutPrStatusPort` through the existing `PR_STATUS_PORT` token. Options: existing token or new token. Evidence: B3 cannot edit `di/tokens.ts`; B1 added the new port without a token. Reversible when the integration batch adds distinct registration.
- Left closed-unmerged status unchanged. Options: revert, cancel, unchanged. Evidence: implementation plan decision and AC6. Reversible.

## Verification

- Scoped `ptah_get_diagnostics` after edits: 0 errors and 0 warnings. Two foreground runs of `npm run verify -- -p @ptah-extension/task-end-hook` (second after validation/path fixes): lint and typecheck both passed; Jest 8 failed/13 passed suites, 42 failed/566 passed tests (608 total). This matches the reported main baseline of 8 failing suites/42 failing tests. The new reconciler suite and four new tests passed; no new failures.
- `task-end-transition-detector.spec.ts` still has 9 pre-existing failing tests: held writer; settle re-check; bulk path; writer watcher echo; watcher then write; worktree then main; worktree-only startup; dubious-ownership retry; and run notifications. They fail on the same Windows path/casing and mock-file-system behavior as before. Its new carrier-status test passes.

## Not done

- B3's four-file scope excludes host registration, index/startup subscriptions, PR adapter changes, and public exports. The existing registered `PrStatusPort` implements only `openPrStatus`, so the reconciler cannot be activated until a later batch binds a `CloseOutPrStatusPort` and `TaskCloseOutService`, then calls `reconcile` on startup/index changes and disposes it. The detector status method currently relies on the normal file watcher to refresh the index.
- B2's migration registration remains outstanding as reported in B2; close-out persistence must be registered before production use.
