# Context — TASK_2026_2306_livemodels

## Request
User (2026-11-22): static/fallback model lists must be deleted, not refreshed. "a fall back
means a major issue in our workflow that we need to fix rather just show a list of old models".
Approved plan: delete static lists, live -> persisted live catalog -> explicit error; replace the
drift probe with a live parser check; run a live check at the end. Closes #1455.

## Evidence gathered before the task (main @ 6fb8d480c)
- Drift probe `libs/backend/auth-providers/src/lib/model-lists.live.spec.ts` fails 7/10 live.
- Every provider has a live fetcher (`provider-rpc.handlers.ts` 289/384/430/566/579,
  `local-native.strategy.ts`, `local-proxy.strategy.ts`, `opencode-live-routes.ts`).
- OpenCode `/zen/v1/models` (105) and `/zen/go/v1/models` (31): every row has `api`,
  `recommended_api`, `type`, `capabilities.tools`, `limit.context`, `cost`.
- Static readers: `provider-models.service.ts` 301,449,586; `copilot-translation-proxy.ts` 74,132,155;
  `kimi-code-translation-proxy.ts` 104; `sakana-translation-proxy.ts` 116;
  `opencode-translation-proxy.ts` 83; `ollama-model-discovery.service.ts` 126-433;
  `workspace-provider-profile-resolver.ts` 907; `stored-model-offer.ts` 43.

## Gate 0.1
- Lane preference: no ptah_agent_* / ptah_route_decide tools in this session -> lanes `disabled`
  (not spawnable). Approval mode: `user`. Phases run on built-in subagents.

## Worktree
`D:\projects\PtahCode\.claude-worktrees\live-only-model-lists`, branch `fix/live-only-model-lists`.
