# Context — TASK_2026_2289_p1

Phase P1 of program TASK_2026_2288_acp1 (see ../TASK_2026_2288_acp1/implementation-plan.md: Components 1, 2, 3 for P1, Parity inventory "Grok ACP lane", and "Revision 2 responses" which wins on conflict). Stacked on branch docs/acp-unified-adapters (PR #1443).

## Review outcome (code-logic-review.md, APPROVED, same-family)

- Fixed in P1: M-2 (`AcpSessionOptions.mcp` required), m-2 (twin comment on `stripAnsiCodes`).
- Carried to P2 (unreachable in P1, required before P2 wires the stream): M-1 per-turn replay ids,
  M-3 stream rows for errors and failed turns, m-1 lane-level SDK-unavailable case, m-3 runtime
  sets `replayed` (acp-replay-collector), m-4 wire `onStreamEvent` with a visual check.
- M-4 gate: all 7 projects lint+typecheck pass; tests pass for acp-runtime, provider-session-contracts,
  cli-agent-runtime (full), cli-engine, platform-cli, ptah-electron (115 suites; `container.smoke.spec.ts`
  OOM in the batch run, passes alone 67/67 with a 4 GB heap). `shared`: 2 failures in
  `dashboard-budgets.spec.ts` are pre-existing — same 2 fail on `main` (checked 2026-11-20).
