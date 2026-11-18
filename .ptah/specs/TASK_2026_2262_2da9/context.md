# Named Claude lane refused from each task worktree

## Symptom

A `ptah_agent_spawn` call with `cli: "claude"` from a task worktree was refused with
`Named lane refused` (`unsupported-source`, step `policy-scan`). The same call from the main
checkout passed. Evidence in the application log of 2026-11-17: refusal at 21:53:05Z from cwd
`.claude-worktrees/bots-definition`, success at 21:53:52Z from the main checkout.

## Root cause

`claude-auth-settings-scan.ts`, source `S4` (`ancestorsClear`), refused when an ancestor
directory with `.git` also had `.claude/settings.local.json`. The check was an existence check.

A task worktree is in `<main checkout>/.claude-worktrees/<name>`. The main checkout has `.git`
and usually a `.claude/settings.local.json` with harmless keys. Thus each worktree cwd was
refused. For the main checkout cwd the same file is source `S3`, which scans the content and
passes.

The lane account selection in the database was correct. The earlier fix (PR #1272) did not
change this scan.

## Change

- `S4` scans the content of the ancestor `settings.local.json` with the rule of `S3`
  (`scanFile`). An override, an unreadable file, an oversize file or bad JSON still refuses.
- `scanClaudeAuthPolicy` reports the id of the refused source through `onRefusedSource`.
  `ClaudeRouteCertifier` writes that id to the log. The id is a fixed string (`S1`…`S12`),
  never a path or a value.

## Proof plan

1. Unit tests in `claude-auth-settings-scan.spec.ts` (override refuses, read error refuses,
   benign worktree passes).
2. Run the real `scanClaudeAuthPolicy` with the real file system against a real worktree cwd,
   before and after the change.
3. A real spawn from a worktree needs a new build of the application. Only the user can
   install it.

## Follow-up

The independent review (`code-logic-review.md`, finding 3) found a gap that existed before this
task and stays out of its scope. `ancestorsClear` (S4) visits only the lexical parents of `cwd`
that contain `.git`. A Git worktree outside the subtree of its main checkout does not have the
main checkout as a parent. Thus the scan can miss an auth override in the
`.claude/settings.local.json` of that main checkout. A follow-up task must resolve the Git common
directory with bounded, validated operations and scan the effective local-settings locations.
