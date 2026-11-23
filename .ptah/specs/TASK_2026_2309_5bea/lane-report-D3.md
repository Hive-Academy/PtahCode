# Batch D3 TASK section

Implemented the Electron session inspector TASK section in `inspector-task-section.component.ts` and extended its focused spec.

- The heading carries the effective task status and ID. The title truncates to one line. Progress uses the digest's done, total, and source fields. Missing progress has a named empty track.
- The four stat tiles use the shared stat's `xs` value size and less vertical padding than SESSION. They switch from four columns to two at a 380 px container width. Unknown values are muted and have accessible names. The meta line shows the last change and any digest truncation.
- Documents and Folders start collapsed and toggle independently. Documents supports the reader's error-state fallback, review verdicts and findings, disabled unreadable chips, overflow navigation, related tasks, and the existing preview and editor flow. Folders shows only per-directory summaries. It uses `counted` to distinguish skipped listings from counted zeros, with support for older payloads.
- The focused spec covers no link, missing folder, loading, error and Retry, truncated data above 200 entries, the independent disclosures, accessibility labels, and the 12-line and 1500-character excerpt limits.

## Host contract

- Selector `ptah-inspector-task-section`. Required signal input `tabId: string`. There are no outputs.
- The component provides `SessionTaskReader` locally, binds it to the tab input, and dispatches retry, preview, close, and editor-open actions through it. It uses the renderer's existing `PTAH_CLOCK` provider for the relative change time.
- The existing `[tabId]="tabId()"` binding in `session-inspector.component.html` is sufficient. The coordinator's shared/backend `counted` contract is consumed directly. D3 requires no host template change.

## Decisions

- Used the shared disclosure for both interactive tiles, with a native disabled Folders button during loading and failure. The shared disclosure has no disabled input. This local choice is reversible if the shared primitive gains one.
- Preserved the string overload of `groupTaskDocuments` for fallback names and the existing helper contract. The typed overload uses the digest's eligibility, kind, group, freshness, and readability fields. Both call paths are covered by the spec.
- Legacy records with a numeric file count remain displayable. A missing count or explicit `counted: false` renders `not counted`. A real zero can still be exact or a lower bound according to the digest.

## Verification

- The focused Jest command passed all 23 tests.
- TypeScript passed with `tsconfig.lib.json`. The `tsconfig.spec.json` run exited 2 with 380 diagnostics and none in the D3 files. Examples include branded session IDs in `compact-session-card.component.spec.ts`, RPC mock incompatibilities in `mock-rpc-service.ts`, and BigInt literals under the spec target in `capability-id-codec.ts`.
- Scoped Ptah diagnostics reported no diagnostics in either owned file.
- ESLint exited successfully with one `max-lines` warning on the component. The template and styles are inline in the assigned file.
- Reviewed the approved reference screenshots at 300 px, 400 px, and 448 px, including loading, error, and partial states. The implemented view still needs Electron visual verification and the coordinator's Angular template check. The lane's check scope excluded launching Electron or running template build targets.
