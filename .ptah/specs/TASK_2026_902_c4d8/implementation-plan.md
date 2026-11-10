# Implementation plan — TASK_2026_902_c4d8 interactive review findings

Worktree: `.claude-worktrees/feat-review-findings-interactive-8d8fa4d6cacf`, branch
`feat/review-findings-interactive`. Electron first. Visual target:
`.ptah/specs/TASK_2026_UX_REVIEWS_MACHINES/{DESIGN.md,reviews-ux.md,prototype/reviews-a.html,prototype/tokens.css}`.

## Facts found on main

- `review:listFindings` returns `ReviewFinding[]` (accepted findings only). The wire shape has no
  finding id, no triage state and no GitHub thread id.
- `IGitHubReviewPort` already has `listOwnReviewsAndThreads` (thread id, path, line, resolved) and
  `replyToFinding(repo, number, threadId, body)`.
- `file:open { path, line?, workspaceRoot? }` exists and opens a file in the app.
- TASK_2026_901 adds `review-status.port.ts`, a status coordinator and migration 0074. It adds no
  finding triage RPC. It edits `sqlite-review.repository.ts` and `github-review.adapter.ts`.
- No renderer RPC spawns a CLI lane with a prompt.

## Design

### Backend contract (one new RPC, no DB change, no file that TASK_2026_901 edits)

`review:respondToFinding` in `review-contracts/src/lib/review-rpc.schema.ts`:

```ts
params: z.object({
  attemptId: z.string().trim().min(1).max(64),
  path: ReviewPathSchema,
  line: z.number().int().min(1).max(10000000).nullable(),
  action: z.enum(['accept', 'dismiss', 'reply']),
  body: z.string().trim().min(1).max(4000).optional(),
}).strict().refine(v => v.action !== 'reply' || v.body !== undefined, 'Reply needs a body')
result: z.object({ ok: z.boolean(), error: z.string().max(500).optional(),
  threadId: z.string().max(128).optional() }).strict()
```

Handler (`review-rpc.handlers.ts`): load the run (repo, prNumber) from the query repository, page
`listOwnReviewsAndThreads` (bounded), match the thread on `path` + `line`, then call
`replyToFinding`. Body: accept = "Accepted by the operator." (+ note), dismiss = "Dismissed by the
operator." (+ reason), reply = body. No thread (dry run, not published) → `{ ok: false, error }`.
Thread *resolved* state stays with TASK_2026_901; this task only writes a reply.

### Frontend (new files in `libs/frontend/review-runs-ui/src/lib`)

- `findings/review-finding-view.ts` — pure view model: key, impact label (category +
  affectedBehavior), severity tone, summary counts, filter + sort functions.
- `findings/review-findings.store.ts` — signals: triage map (`open | accepted | dismissed`,
  pending, error) per finding key; `respond(key, action, body?)` → `review:respondToFinding`
  (Zod parse of result); `openEvidence(path, line)` → `file:open`; fix-prompt hand-off.
  Triage state is session-local until a backend store exists (follow-up, after TASK_2026_901).
- `findings/review-finding-card.component.ts` — presentational card: severity badge, lens,
  confidence, impact, evidence list (buttons that open file:line), collapsible detail,
  accept / dismiss / reply form, "send to lane".
- `findings/review-findings-panel.component.ts` — run summary (counts per severity and triage),
  filters (severity, lens, triage), sort (severity, lens, location, confidence), card list,
  empty and filtered-empty copy with "Clear filters".
- Small edits: `review-run-detail.component.ts` swaps the table for the panel; `index.ts` exports.
  `review-findings-table.component.ts` stays (no removal).
- Shared primitives from `@ptah-extension/ui` (`ptahButton`, field control, status badge).
  No `[innerHTML]`; all finding text renders as text.

### Send to lane

The frontend lane uses an existing host-neutral path in `@ptah-extension/core` to start a chat
with the fix prompt if one exists. If none exists inside module boundaries, the action copies the
fix prompt to the clipboard, the button says "Copy fix prompt", and a follow-up task is recorded.

## Batches (file-disjoint, parallel)

| Batch | Lane | Write set |
| ----- | ---- | --------- |
| B1 backend RPC | codex | `review-contracts` rpc schema + spec, `libs/shared` rpc.types, `rpc-handlers` review handler + spec, every RPC guard file that lists `review:exportRun` |
| B2 frontend | antigravity | new `findings/*` files + specs, `review-run-detail.component.ts` (+spec), `index.ts` |

Verify (orchestrator): `npm run verify -- -p review-runs-ui,review-contracts,rpc-handlers,shared,<guard projects>`.
Then independent code-logic review, commit, push, PR.

## Out of scope / follow-ups

- Persistent triage state and thread resolved state in the UI (needs TASK_2026_901).
- A real "spawn a fix lane" RPC if no renderer path exists.
