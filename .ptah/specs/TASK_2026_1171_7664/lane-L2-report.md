# Lane L2: Codex MCP attachment diagnostics

## Findings

- Cause 1, delayed initialization: plausible but **not confirmed**. The fallback probe is 15 seconds (`mcp-attachment-probe.port.ts:18`; `agent-process-manager.service.ts:1484-1488`). The native Codex lane emits a tool call timeout, not an MCP startup timeout (`codex-lane-thread-config.ts:118-164`). No code evidence establishes lazy initialization or an adapter MCP startup deadline, so the conditional deadline change was not made.
- Cause 2, auth or URL mismatch before observation: **confirmed code path, not runtime cause**. The handler rejects before recording successful attachment (`http-server.handler.ts:420-482,556-570`); token lookup and URL binding can reject (`mcp-caller-token-registry.ts:346-369`). The new attempt record exposes auth-required, invalid-credential, or forbidden by agent and port without changing authorization.
- Cause 3, config/regex/port mismatch: the native lane binds port, agent ID and token to the MCP profile (`agent-process-manager.service.ts:1039-1091`; `codex-app-server-lane.adapter.ts:317-346`; `codex-lane-profile.ts:128-175`). A successful handshake is keyed by valid agent ID and socket local port (`http-server.handler.ts:556-570`). The native config's table collision is ruled out by its profile construction (`codex-lane-thread-config.ts:107-164`); runtime URL, agent and port mismatch remains unobserved.

## Changes

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.ts:5-106`: bounded, expiring attempt records keyed by agent and port, with port cleanup.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:381-475,551-570`: record sanitized rejected requests and authenticated requests. Rejections retain existing responses and do not count as attachments.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1421-1490`: warning and logger preserve `handshake-timeout` cause and add `no-request-seen`, `rejected:<reason>`, or `seen-but-not-initialize` detail; successful late attachment still clears warning.
- Specs: `mcp-attachment-observer.spec.ts:24-34`, `http-server.handler.spec.ts:1148-1171`, `agent-process-manager.service.spec.ts:827-933`, `codex-lane-activation.spec.ts:319-349` cover attempt shape, rejection, timeout clearing, successful handshake, and bound native config/observer key.

## Checks

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.spec.ts`: observer suite passed (3 tests); handler suite could not load because Jest's `marked` mapping points to absent `node_modules/marked/lib/marked.umd.js`. Log: `.ptah/tmp/l2-vscode-jest.log`.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: passed before final spec edits (empty log). Log: `.ptah/tmp/l2-cli-tsc.log`.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/codex-lane-activation.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-attachment-observer.spec.ts`: 0 errors, 4 warnings (existing unused/import and file-length warnings). Log: `.ptah/tmp/l2-eslint.log`.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/codex-lane-activation.spec.ts`: both suites could not load because of the same absent `marked.umd.js` Jest mapping; 0 tests ran. An earlier invocation caught a spec inference error, which was corrected before this retry. Log: `.ptah/tmp/l2-cli-jest-retry.log`.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: passed, including the final sanitizer edit (empty log). Log: `.ptah/tmp/l2-vscode-tsc-final.log`.
- `ptah_get_diagnostics` scoped to changed files: unavailable twice because compiler checks exceeded its 45-second call window.

## Decisions

- Keep the 15-second fallback probe: no source establishes Codex lazy MCP initialization or a longer adapter startup timeout. Reversible if a runtime trace shows a different startup deadline.
- Classify auth failures using existing status and fixed error code/message. A token with no registry binding is `invalid-credential`; a valid token on another agent URL is `forbidden`. Reversible; no secret is stored or logged.

## Remaining limitations

The observed lane has no captured HTTP request, Codex configuration snapshot, or attachment event. A runtime trace of request path (without token), local port, agent ID, auth result code, and first JSON-RPC method is still needed to identify its actual cause. A rejection before JSON body parsing records HTTP `POST` as method; it cannot safely claim the JSON-RPC method.
