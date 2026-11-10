# Batch B1 backend report

## Files changed

- `libs/backend/lane-routing/src/lib/child-session/child-setting-rule.ts` and `.spec.ts`: deterministic brief ranking, including empty-catalog effort routing.
- `libs/backend/lane-routing/src/lib/child-session/child-setting-router.service.ts` and `.spec.ts`: labeled model and effort options, one decision request, 3,000 ms deadline, validation fallback and explicit-field precedence.
- `libs/backend/lane-routing/src/lib/di/tokens.ts`, `register.ts`, and `src/index.ts`: router registration and export.
- `libs/backend/cli-agent-runtime/src/lib/session-children/child-setting-router.port.ts`, `child-chat-session-host.port.ts`, `session-spawner.port.ts`, `session-spawner.service.ts`, `session-spawner.service.spec.ts`, and `index.ts`: optional router port, pre-Git routing and admission, sources on snapshots and payloads.
- `libs/backend/cli-agent-runtime/src/lib/di/tokens.ts`: optional router token.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`, `child-chat-session-host.adapter.ts`, and `libs/backend/rpc-handlers/src/lib/chat/di.ts`: catalog lookup and router binding.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-handlers.ts`: result text with both sources.

## Decisions

- Decision: route omitted model and effort independently. Options: whole-pair routing or per-field routing. Evidence: `context.md` Design 1 and 6. Reversible: yes.
- Decision: an unavailable catalog supplies no model options while effort routing continues. Options: reject the start or use the host default. Evidence: `context.md` Design 4 and 5. Reversible: yes.
- Decision: bind the optional router token in shared chat DI when lane-routing is registered. Options: register in each host root or shared chat composition. Evidence: the spawner port is optional and shared chat DI binds the existing child host adapter. Reversible: yes.

## Verification

Exact command: `npm run verify -- -p @ptah-extension/lane-routing,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,@ptah-extension/shared`

First attempt: stopped after approximately 13 minutes while an Nx test process was active; no summary was returned. The second run, after the deadline fix, waited 572 seconds for the shared verify lock and exited 1. Lint and typecheck: 10 tasks succeeded, 2 cached. Tests: 5 project tasks, 2 succeeded, 1 cached, 3 failed (`cli-agent-runtime`, `vscode-lm-tools`, `rpc-handlers`). Scoped `ptah_get_diagnostics` returned unavailable twice after its 45-second limit; the verify typecheck result above is authoritative.

Nx placed the three detailed Jest logs outside the permitted `cr` read root, so individual suite pass counts and suites not started could not be determined. No missing-`marked` cause is claimed without those logs. The Nx module-boundary lint is among the 10 successful lint/typecheck tasks.

## Open points

- Detailed causes and suite counts for the three failed test project targets require the Nx terminal logs, which are outside the allowed read root. The parent session should review them or rerun verification in an environment where the logs can be read.
- Focused test coverage for invalid labels, timeout, routed admission refusal, snapshot/payload fields, and result text remains incomplete. The new unit tests cover deterministic ranking, named-account empty catalog behavior, explicit precedence and no call when both fields are explicit.
