# Live chat session attribution

- Export an optional live chat resolver port and DI token from platform-core, a dependency of both MCP and CLI agent runtime. Model resolved, unresolved and ambiguous results. Include trusted permission metadata alongside runtime, canonical id, tab alias and workspace.
- Electron composes the Claude lifecycle, native Codex chat map and live provider-session adapter. Match both canonical ids and tab aliases, count all owners and reject collisions. Read workspace and permissions from the owning runtime. Hosts without the port retain their existing lookups.
- Switch CodeExecutionMCP artifact workspace and tab injection to the port. Preserve artifact scope checks and leave transport authentication intact.
- Switch PtahAPIBuilder attribution for session link, harness proposals, cron creator and worktree organization. Use the port for lane spawn permission while retaining existing lane parent normalization. Keep the existing conservative cap for unidentified parents and uncapped resume policy. Preserve child/lane authorization and routing.
- Update SessionHandoffService to use runtime ownership, trusted paths and permission when building the predecessor record. Follow the same routed source-session start path used by agent child session start in ChatSessionService, preserving the successor as a top-level tab. Use the port for successor reconciliation and canonical id binding where native ownership differs from Claude lifecycle.
- Retire the predecessor through its owning runtime after the existing flush guard. Preserve the persisted acknowledgement store and its successor id/tab, path and compare-and-set checks. Resolve live aliases only when binding the same recorded successor, and use the existing host tab closer after retirement.
- Test all three registry sources, alias resolution, unknown and ambiguous ids, and exercise the changed tool paths. Run only focused Jest, changed-project TypeScript and ESLint commands from the brief.

## Decisions

- Use platform-core for the port instead of agent-sdk to preserve the MCP library dependency direction, as documented by its local lifecycle token. Electron owns composition, and the optional injection makes the wiring reversible.
