## Changes

- `libs/shared/src/lib/types/session-budget.types.ts`: default automatic handoff to true so unset settings hand off at 100%.
- `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts`: log each limit skip reason once per session and log queued or sent handoffs.
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts`: explain the enabled default.
- `apps/ptah-docs/src/content/docs/sessions/cost-summary.md`: document the new default.

## Tests

- `session-budget.types.spec.ts`: asserts the enabled default.
- `session-budget-config.provider.spec.ts`: unset and malformed values expect true; existing explicit false case remains.
- `session-auto-handoff-coordinator.service.spec.ts`: checks once-per-reason skip logging and successful send logging.
- Updated old-default assertions in the provider spec (unset and malformed cases).

## Verification

`npm run verify -- -p @ptah-extension/shared,@ptah-extension/agent-sdk,@ptah-extension/chat 2>&1 | Select-Object -Last 60`

Blocked: the single invocation remained active beyond the requested 20-minute wait and produced no output tail because `Select-Object -Last 60` buffers until completion. No pass/fail counts were available at report time. `ptah_get_diagnostics` returned: `TypeScript check still running after 45s. It was not cancelled — retry shortly and the completed result is served from cache.`

## Decisions

- Keep explicit saved false effective; the shared settings table supplies the fallback. Reversible.
- No VS Code contribution or separate provider fallback declared for this key; provider already reads the shared table.
- `.claude/skills/session-handoff/SKILL.md` directs HANDOFF.md to the task folder or current worktree root. It does not permit a path outside the open workspace.
- Skill loader unavailable in this lane; read repository Angular skill guidance directly.

## Not done

- Host refusal for an outside-workspace HANDOFF.md path was report-only; no host behavior changed.
