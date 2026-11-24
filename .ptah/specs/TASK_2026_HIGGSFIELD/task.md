---
id: TASK_2026_HIGGSFIELD
status: in_progress
type: BUGFIX
title: Custom connector OAuth requests unsupported scopes; add Higgsfield connector
description: >-
  McpOAuthService requests the authorization server's scopes_supported, which Clerk rejects
  with invalid_scope. Select the scope per the MCP authorization spec and add Higgsfield to
  the Ptah connectors catalog.
depends_on: []
created: 2026-11-24T00:00:00.000Z
updated: 2026-11-24T00:00:00.000Z
---

## Description

Connecting the Higgsfield MCP server (https://mcp.higgsfield.ai/mcp) as a custom connector opens
what looks like a malformed auth page. Ptah asks Clerk for every scope the authorization server
supports, and Clerk refuses one the client is not allowed to request.

## Evidence (live probes, 2026-11-24)

- Higgsfield MCP: `https://mcp.higgsfield.ai/mcp`. Unauthenticated POST -> 401 with
  `WWW-Authenticate: Bearer resource_metadata="https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp", scope="openid email offline_access"`.
- PRM: `{"resource":"https://mcp.higgsfield.ai/mcp","authorization_servers":["https://higgsfield.ai/_clerk"],"scopes_supported":["openid","email","offline_access"],...}`.
- AS metadata (`https://higgsfield.ai/.well-known/oauth-authorization-server/_clerk`): Clerk,
  registration_endpoint `https://higgsfield.ai/_clerk/oauth/register`, scopes_supported
  `["openid","profile","email","public_metadata","private_metadata","offline_access","user:org:read"]`.
- DCR at Clerk succeeds (client granted scope `email offline_access openid profile public_metadata`).
- Authorize with scope = AS scopes_supported -> Clerk redirects to the redirect_uri with
  `error=invalid_scope` "The OAuth 2.0 Client is not allowed to request scope 'private_metadata'"
  (seen by the user as a malformed auth page). Authorize with scope `openid email offline_access`
  -> normal Higgsfield sign-in page.
- `https://higgsfield.ai/.well-known/oauth-authorization-server` (origin only, no path) returns
  HTML 200 (SPA). Discovery tries path forms first; an HTML 200 body must never count as metadata.

## Root cause

`libs/backend/cli-agent-runtime/src/lib/mcp-directory/oauth/mcp-oauth.service.ts:339` uses
`options.scope ?? meta.scopesSupported?.join(' ')` - the authorization server's scopes_supported.

## Fix

Scope = explicit option, else the `scope` of the 401 WWW-Authenticate challenge, else the
protected-resource metadata `scopes_supported`, else no `scope`. Never the AS scopes_supported.
Add Higgsfield to `PTAH_CONNECTORS`.
