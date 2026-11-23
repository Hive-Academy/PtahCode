# Context
Work items from the parent session: (1) ptah_ast_analyze names or counts the dropped members of a cut class; (2) confirm the ptah_grep unspaced `a|b` regex note; (3) account-binding spec failure; benchmark rerun is out of scope.

Approval mode: lane-review (codex review lane, two rounds). Lanes: codex only (review). Implementation by the coordinator after the earlier child's diff (worktree 5ff77e333654, read-only) was examined and corrected.

## Decisions
- Item 2: no behavior change. The note `(pattern read as regex; pass regex:false for a literal search)` is in the result header (grep.ts:93-95, 393) and in the zero-match hint (grep.ts:554-558). Live test shows it with correct matches.
- Item 3: spec defect, not a product defect. Fixture ROOT 'D:/lane-account-fixture' is relative on POSIX; resolved against the jest cwd inside a linked worktree, worktreeMainRoot (git-main-checkout-root.ts:21) finds the main checkout, and agent-process-manager.service.ts:1046-1050 reads the stored selection a second time (correct fallback). Reproduced: original spec 1 failed (expected 1 call, got 2), fixed spec 79/79.
- Item 1: owners first, then Class.member names, so many methods never hide a later cut class. Earlier diff's interleaved order replaced. Names are dropped when the note alone does not fit the budget (review finding 1).
- Nested-class names (`Inner.run`) do not resolve in ptah_read_symbol (it needs `Outer.Inner.run` or `run`). Left as is; the hint tells the reader to use the plain name. Follow-up: qualify members with the full class chain in the AST record.
- ptah_task_create timed out twice and left two empty carrier folders (TASK_2026_2316_*); removed. Valid ID TASK_2026_2317_973a came from the third call.
- Verify gate: lint, typecheck and tests for the 3 projects pass. The first workspace-intelligence test run failed on two timing tests (context-size-optimizer 1000 files <100ms, ast-transport-bounds <50ms) while 3 checks shared the machine; both pass alone and the test rerun passed (exit 0).
