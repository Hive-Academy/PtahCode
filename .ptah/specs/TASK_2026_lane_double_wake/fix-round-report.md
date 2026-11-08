# Fix round: single-owner final report coalescing

## Changes

- Restored `parent-delivery-drainer.service.ts`, `parent-envelope-store.service.ts`, `parent-envelope.schema.ts`, and `lane-completion-replay.ts` byte-for-byte from HEAD. Their `git diff --stat` is empty; no durable hold or report link remains.
- Added a singleton in-memory coalescer with one held final report per agent, a 120-second unref'ed timer, synchronous `take`, and `dispose` flushing. The router holds `final: true` after validation and sends an older held report standalone before replacing it. Progress reports and session-child routing retain immediate behavior.
- The notifier takes a held report once immediately before rendering the completion body. It increments `reportsDelivered`, renders once, and checks that exact body against the cap. Oversize reports use the router's existing standalone enqueue and drain path. The durable completion outbox owns an embedded report during retry and outcome-unknown cases.
- Report count and tile note are recorded when the completion's checkpoint is durable or its envelope enqueue succeeds. A pending held result says the report will arrive with completion.

## Review findings

- **Blocking 1, size-boundary false link:** The exact final body, including the incremented count, is measured. No link field exists. Oversize goes standalone.
- **Blocking 2, blocked-retryable double wake:** An embedded report has one durable completion record. A blocked or retryable send retains that record and never releases a separate report.
- **Serious 1, deadline race:** Timer and notifier both call synchronous `take`; only the first receives the report.
- **Serious 2, outcome-unknown:** The report is in the completion body governed by existing outcome-unknown handling; there is no independent report record to release.
- **Moderate, inactive parent at deadline:** The unref'ed timer expires in a live host and enqueues via the existing standalone path; an inactive parent may still wait for that queue's ordinary drain. A host crash inside the window loses the in-memory report; the lane process dies with the host, while its deliverable file and completion replay remain.

## Decisions

- Use the already registered singleton dependency container for the coalescer, shared by router and notifier. This avoids a process-global store and is reversible.
- Count a coalesced report and write its tile note at durable completion enqueue or outbox checkpoint, rather than after a send attempt. The parent can receive the queued body; this avoids falsely claiming an in-memory-only report.

## Verification

The single required `npm run verify -- -p cli-agent-runtime,agent-sdk,vscode-lm-tools` invocation confirmed a three-project header and completed with exit code 1. No second verify was run, per the one-run instruction. The run observed the following project target results:

| Project | Lint | Typecheck | Test |
| --- | --- | --- | --- |
| cli-agent-runtime | 1 passed | 1 failed | 1 failed |
| agent-sdk | 1 passed | 1 passed | 1 passed |
| vscode-lm-tools | 1 passed | 1 failed | 1 passed |

The two typecheck failures had the same sole diagnostic: `agent-report-router.service.ts:354` referenced the removed `heldCount`. I removed that reference after the run's typecheck phase. The runtime test phase reported 172 suites passed, 1 failed; 3,509 tests passed, 1 failed, 1 skipped. The failure was an old `cli-adapter.utils.spec.ts` assertion requiring `(no agent id)` and `delivered: false` in conditional-report guidance; I updated it to assert the current conditional guidance and `final: true`. The two fixes are **not verified by a rerun**. Ptah scoped diagnostics timed out and returned unavailable after the edits. `git diff --check` reported no whitespace errors.

`git diff --stat` (tracked files only):

```text
 .claude/skills/agent-lanes/SKILL.md                |  8 +--
 .../src/lib/prompt-harness/ptah-core-prompt.ts     |  2 +-
 .../cli-agents/agent-report-router.service.spec.ts | 45 ++++++++++++
 .../lib/cli-agents/agent-report-router.service.ts  | 84 ++++++++++++++++++++--
 .../cli-adapters/cli-adapter.utils.spec.ts         |  6 +-
 .../cli-agents/cli-adapters/cli-adapter.utils.ts   |  2 +-
 .../lane-completion-notifier.service.spec.ts       | 65 +++++++++++++++++
 .../cli-agents/lane-completion-notifier.service.ts | 63 ++++++++++++++--
 .../src/lib/cli-agents/lane-reporting-contract.ts  | 17 ++---
 .../cli-agent-runtime/src/lib/di/register.ts       |  3 +
 .../mcp-core/mcp-response-formatter.ts             | 10 ++-
 .../code-execution/mcp-core/protocol-dispatcher.ts |  6 +-
 .../mcp-core/tool-description.builder.spec.ts      |  2 +
 .../mcp-core/tool-description.builder.ts           | 26 ++++---
 .../mcp-stdio/agent-tool.dispatcher.spec.ts        | 11 +++
 .../mcp-stdio/agent-tool.dispatcher.ts             |  3 +
 16 files changed, 306 insertions(+), 47 deletions(-)
```

The new `agent-report-coalescer.ts` and `.spec.ts` are untracked, so Git excludes them from that stat. The four restored files have no diff.

Skill discovery/invocation was unavailable in this lane; the existing agent-lanes skill file was read as source guidance.

