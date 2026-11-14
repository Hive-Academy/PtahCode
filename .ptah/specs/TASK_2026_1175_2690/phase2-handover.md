# Hand-over from Phase 2 to the Phase 4 plan

Task `TASK_2026_1161_9efb` (Phase 2 "Executor neutrality"), program `TASK_2026_977_0876`.
This note lists the items that Phase 2 leaves open. The coordinator updates it until the Phase 2
pull request is ready. Each item names its decision record in `decisions.md`.

## 1. Machine capability tokens in the phase definition files (O-20, O-21)

- State after Phase 2: the router has one machine capability vocabulary in `lane-routing`. The
  first value is `browser`. The router derives it from the effective tool list of a candidate
  (a `ptah_browser_*` tool is in the list).
- The field `requiredCapabilities` in the 12 phase definition files
  (`plugins/ptah-core/skills/orchestration/phases/*.md` and the copy under `.claude/skills/`) is
  prose. The router does not read it as machine tokens.
- Phase 2 default table (batch B5b), used when the route request carries no machine capability
  list for a phase:

  | Phase kind | Required machine capability |
  | --- | --- |
  | `visual-review` | `browser` |
  | `design` | `browser` |
  | all other kinds | none |

- Work for Phase 4: add a machine field to the phase definition contract (Phase 1 contract,
  versioned), fill it in the 12 files in both skill copies (byte-identical), make the resolver
  parse it strictly, make the route request producer send it, then remove the default table.

## 2. Role aliases that stay until Phase 4

- `phase.role` on a route request and `role` on a lane spawn stay as compatibility inputs (B5).
- `lane-outcomes` `task-kind-mapping.ts` keeps role slugs as aliases behind the phase kind (B6).
- Phase 4 removes each alias when it retires the role.

## 3. Items to confirm when Phase 2 ends

The coordinator fills this section from the last batch reports and the full-diff review:
executors with no tool profile adapter, accepted limits of the tool profile (O-18), and each
finding that the full-diff review marks as deferred.

### 3.1 Tool profile status per executor (B4d, B4f-mcp, B5d)

| Executor | Status | What is filtered |
| --- | --- | --- |
| Claude (SDK and lane) | `filtered` when the adapter confirms it, else `unfiltered` | Built-in tools (SDK denials) and Ptah MCP tools |
| Ptah CLI | `filtered` when the registry confirms both points, else `unfiltered` | Built-in tools and Ptah MCP tools |
| Codex, Cursor, Copilot, OpenCode, Grok, Antigravity | `filtered` when the lane MCP token is issued, else `unfiltered` | Ptah MCP tools only (the credential carries the denials). Their own built-in tools are not filtered: these CLIs have no deny channel |
| Pi | `unfiltered` | Nothing. Pi gets no lane MCP token (B5d token rule) |

Phase 4 item: a deny channel for the built-in tools of the non-Claude CLIs, where the vendor
CLI supports one. Until then the result names these executors as not fully filtered.

### 3.2 Accepted limits of the tool profile (O-18)

- The tool profile reduces context cost. It is not a security boundary (program definition,
  Phase 2 scope).
- When a phase credential denies one or more `ptah_*` tools, `execute_code` is also hidden and
  refused. A per-operation map inside `execute_code` was not built (large, can drift).
- Credentials with no phase stay unfiltered: the codex chat host session credential
  (`codex-chat-host-ports.ts`, chat host, not a phase executor), and in-process and stdio MCP
  requests (no binding).
- `buildOneShotHooks` uses a synthetic `internal-query-*` id and an `internal-query` credential.
  That is not a phase session path, so it has no phase kind.

### 3.3 Other open items

- `effective-tool-list.spec.ts` has a full-definition snapshot (about 8168 lines). Each tool
  definition change needs `-u`. Phase 4 can replace it with a smaller name-and-order check.
- Usage totals (`getUsageDimensionTotals`) have no RPC, MCP or UI surface. The B8 check reads
  SQLite directly.

### 3.4 Findings that the full-diff review marks as deferred

Filled in Phase 4 from the parent answer (Q5): final review of PR 1174 (APPROVE 86) and
decisions O-38 to O-41 in `TASK_2026_1161_9efb/decisions.md`. This edit makes the file differ
from the Phase 2 original (decision P4-11).

| ID | Finding | State | Phase 4 use |
| --- | --- | --- | --- |
| a | D2 restart residual: `SessionChildRegistry` is in memory. After a host restart, a known phase child with no metadata record cannot be detected until TASK_2026_580 persists the registry (O-41) | Deferred to TASK_2026_580 | Step real-task proofs on a child session must not restart the host in the middle of a run |
| b | The `isChildSession` term is kept and fails closed (O-41) | Kept | None |
| c | `findByCwd` has no production caller and is kept (minor) | Kept | None |
| d | `toolProfileApplied` is builder evidence. It does not prove that the final `Options` reach `query()` (D3, documented) | Documented | Do not cite it as proof of a tool denial in a step test plan |
| e | Attach is not idempotent. An idempotency key is deferred (O-40) | Deferred | None |
| f | A pin with no capability record fails closed (O-39). `sdk-subagent` is kept for proven subagent turns (O-38) | Kept | Step routing changes must keep both rules |
| g | The Electron acceptance B8 did not run. The steps are in the PR 1174 test plan | Open | Step 0 test plan repeats the relevant B8 steps |
