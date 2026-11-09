# Ptah MCP authentication investigation

Decision served: which change keeps a running Electron Claude session connected when its Ptah MCP credential becomes invalid? Candidate causes are workspace config rotation, session credential expiry or revocation, and server restart.

## Q1. Authentication and session tools

An interactive Claude SDK query receives its own 43-character bearer token, bound to its routing tab ID, workspace, and privileged capability. Its fixed TTL is **four hours**. The registry keeps only a SHA-256 hash in memory. The SDK sends a `/session/{tabId}/workspace/{root}` URL and `Authorization: Bearer <token>`; the HTTP gate checks hash, expiry and URL binding. The session URL supplies attribution; the credential supplies privilege. The workspace `.mcp.json` uses a different persistent, normally read-only credential and no session ID, explaining the observed read-only tool list.

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2168-2180,2218-2240` — session routing, token issue, TTL, URL and header.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:79-83,128-137,332-374` — hash, expiration and authorization.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-http-gate.ts:60-93` — bearer/path extraction and conflicting-credential rejection.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:420-429,525-532` — URL identity and caller capability propagation.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-auth.types.ts:95-123` — session/workspace binding rules.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts:529-537,1258-1259` — capability-filtered tools and session-aware spawn.

## Q2. Workspace rewrite and other sessions

Ptah's MCP service writes its `ptah` entry, while harness-sync can write other entries in the same file. Ptah compares before writing and preserves a workspace token whose file hash matches its persisted hash. An unknown or missing file token is replaced. Thus the 23:16:48 UTC mtime alone identifies neither writer nor token rotation. Even workspace token rotation would **not revoke the separate in-memory session token**. Other sessions have separately issued credentials and may have different ages. A shared server stop revokes all ephemeral tokens in that registry, which makes it less consistent with other sessions remaining connected, though different hosts or reconnection remain possible.

- `.ptah/specs/TASK_2026_MCP_AUTH_REJECT/task.md:20-37` — mtime and successful current workspace-token read-only request; no before/after token.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:915-930,975-1026` — Ptah writer, shared lock, compare-before-write.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:818-836` — file token read for reconciliation.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:177-231,246-286` — matching token kept; unknown token replaced.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:736-750` — stop revokes ephemeral credentials but retains persistent config.

## Q3. HTTP response and OAuth state

An expired, revoked or unknown well-formed bearer gets **HTTP 401**, JSON content type and a JSON-RPC `Authentication required` error. A recognized token whose URL identity mismatches its binding gets **403**. Malformed Authorization or conflicting path and header credentials also gets 401. The response writer supplies **no `WWW-Authenticate` header**. GET on OAuth well-known paths gets **405**, since only `/` and `/health` are GET routes. MCP clients interpret 401 as an authorization challenge and can attempt protected-resource discovery; labeling this “Needs authorization” is consistent with that behavior, but the exact Claude Code wording and marketplace button target are not established by repository code. Ptah exposes no OAuth metadata endpoint here.

- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:332-373` — expired/unknown to auth failure; URL mismatch to forbidden.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-caller-auth.types.ts:59-72` — 401 versus 403.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-server.handler.ts:399-418,446-467,592-607` — GET routing and exact auth response headers/body.
- [MCP authorization specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [MCP authorization-server discovery (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery) — 401 and protected-resource discovery. Applying this to the observed Claude Code UI is an **inference**.

## Q4. Sentry state

There is no evidence that `sentry` shares Ptah's credential failure. It is a separate MCP server in the reported list; Ptah's SDK builder and workspace writer set only the `ptah` key. An independently unauthenticated remote OAuth server is plausible, but its configuration and earlier authorization state are unverified.

- `.ptah/specs/TASK_2026_MCP_AUTH_REJECT/task.md:11-17` — two servers labeled “Needs authorization”; only Ptah calls reported failing.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2233-2241` — builder's local MCP override is `ptah`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:990-993,1020-1025` — workspace writer changes `ptah` entry.

## Q5. Recovery

The running transport needs a **new session bearer and reconnection using it**. Editing `.mcp.json`, marketplace authorization, or retrying `/mcp` with the same expired bearer cannot renew the in-memory record. Rebuilding the SDK MCP connection with a freshly issued credential is the immediate path if supported; otherwise recreate the affected session. A server restart discards all old ephemeral credentials. The permanent fix must cover the intended lifetime of a running session and retain explicit teardown revocation.

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:2218-2240` — fresh build issues a credential.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts:129-151,356-374` — expiry and revocation; no renewal on lookup.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1076-1079`; `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:237-244` — existing per-session teardown revocation.

## Root cause

**High confidence in the defect; medium confidence that it triggered this incident.** Proven: session credentials expire four hours after issuance without renewal, and expiry produces 401. Proven: a `.mcp.json` rewrite alone does not revoke a session credential. **Inferred:** the affected session crossed its token expiry boundary while younger sessions remained valid. The task records a successful spawn at 22:17, but not session/token issuance time; therefore the 23:16 failure cannot be attributed definitively to TTL. Individual teardown or server restart also remain possible. The current workspace token's HTTP 200 establishes only that the distinct persistent credential works.

## Fix options

| Option | Files | Risk | Recommendation |
| --- | --- | --- | --- |
| Keep the session bearer valid for the session lifetime; revoke on existing teardown, with explicit reconnect after server restart | `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/mcp-caller-token-registry.ts`; Electron session connection caller | Failed teardown leaves a credential live until process exit; restart still interrupts it | **Recommended**, with idle/maximum-age policy |
| Rotate before expiry and reconnect the SDK MCP transport with the new bearer | Same builder and registry; Electron Claude session connection manager | Token/transport switch can race tool calls | Prefer if arbitrarily long uninterrupted sessions are required |
| Give expired credentials a clear reconnect diagnostic | `mcp-caller-token-registry.ts`; `http-server.handler.ts`; Electron MCP error UI | Non-401 can violate HTTP auth semantics; hint alone does not restore access | Add after renewal/reconnect, not alone |

Stable persistent tokens across matching `.mcp.json` rewrites already exist (`mcp-caller-token-registry.ts:198-231`); changing this alone does not fix session expiry. A grace period for old *persistent* tokens would likewise not extend the session bearer.

## Decisions

- **Investigative conclusion:** prioritize session lifetime and reconnect handling over workspace-token rotation. Options considered: persistent config rotation, session expiry, OAuth configuration. Evidence: distinct credentials and four-hour TTL. **Reversible:** yes; no source changed.
- **Evidence boundary:** do not attribute the 23:16:48 rewrite to a writer or claim Sentry shares the cause. Options considered: Ptah writer, harness-sync writer, external edit; no before/after diff or writer log. **Reversible:** yes with logs/history.

## Open questions

- What was the affected credential's issuance time? Did Electron log server stop/restart or session teardown near failure?
- Did its live request return 401 or 403, and which URL/credential did Claude Code actually send?
- Which process wrote `.mcp.json` at 23:16:48 UTC, and did its `ptah` entry change?
