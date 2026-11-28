## Verdict

REVISE

Review family: codex (implementer family: antigravity)

The shared accumulator fixes the persisted summary key issue, duplicate pairing, pending bound, and issuance-order metric. Privacy still fails the requested full fallback-path rule: the blob reader returns raw tool names and inputs in its `calls` records, despite using sanitized keys for the fallback summary. No evidence those call records reach the formatted report, but they remain exposed by the reader API.

## Defect status

| Defect | Status | Evidence |
|---|---|---|
| 1. Privacy of tool names | PARTLY FIXED | Summary keys use strict identifier validation and server buckets: `libs/shared/src/lib/tool-guidance/tool-call-summary.ts:62-80,166-196`. But fallback reader copies original names and tool input into returned records: `scripts/agent-usage/agent-output-blob.reader.ts:145-150`. Summary fallback itself is sanitized at `:172-179`; report aggregation uses it at `scripts/agent-usage/tool-call-share.ts:201-208`. No accumulator log statements were found. |
| 2. Pending bound and lifecycle release | FIXED | Bound is 256 and eviction deletes oldest keyed entry without settling its unknown outcome: `libs/shared/src/lib/tool-guidance/tool-call-summary.ts:7-8,203-212`. Release deletes WeakMap state: `:275-285`. Buffer discard releases summaries at `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-output-buffer.service.ts:250-262`; terminal and resume cleanup paths are listed and tested in `batch-b-fix-report.md:14-29`. Timeout itself only pauses/requests handoff; cleanup follows exit, stop, TTL, or disposal, so no standalone timeout leak was evidenced. |
| 3. Duplicate/missing IDs | FIXED | Pending duplicate ID is ignored before counting: `libs/shared/src/lib/tool-guidance/tool-call-summary.ts:158-164`; keyed results settle once and unknown/settled IDs do nothing: `:238-249`; id-less pairing is only the immediately preceding unkeyed call and is cleared on the next call/keyed result: `:158-160,240-248`. Tests assert duplicate, settled, and adjacency behavior: `libs/shared/src/lib/tool-guidance/tool-call-summary.spec.ts:74-145`. |
| 4. First successful Ptah call order | FIXED | Doc defines issuance-order minimum among successful Ptah calls, ignoring earlier errors/missing results: `libs/shared/src/lib/tool-guidance/tool-call-summary.ts:223-226`; implementation updates the minimum ordinal only on successful Ptah result: `:266-272`. Regression test covers out-of-order success and missing earlier result: `libs/shared/src/lib/tool-guidance/tool-call-summary.spec.ts:176-198`. |

## Name replay

Table applies `normalizeToolSummaryKey(rawName, classifyToolCall({name: rawName}).server)`. Allowed strict identifiers remain as-is; rejected names are replaced whole with the server bucket.

| Name | Stored key |
|---|---|
| `Read` | `Read` |
| `mcp__ptah__ptah_grep` | `mcp__ptah__ptah_grep` |
| `ptah_read_symbol` | `ptah_read_symbol` |
| `use_tool` | `use_tool` |
| `Run: cat C:/secret/file.txt` | `native:other` |
| `bash -c "curl https://x/?token=abc"` | `native:other` |
| `view_file /home/dev/secret.txt` | `native:other` |
| `a` repeated 500 times | `native:other` |
| name containing newline | `native:other` |
| `git.status` | `git.status` |
| `functions.exec_command` | `functions.exec_command` |
| `mcp__github__create_issue` | `mcp__github__create_issue` |
| empty string | `native:other` |

Tests cover adversarial raw strings and verify none appear in serialized summary: `libs/shared/src/lib/tool-guidance/tool-call-summary.spec.ts:15-72`. The script fallback's persisted `fallbackSummary` uses the same shared summarizer and key normalizer. However, its separate `calls` return field carries raw name/input (`scripts/agent-usage/agent-output-blob.reader.ts:145-150`); fix by returning normalized name and omitting `input` there, or stop exposing `calls` if unused. The usage report consumes summary totals, not `calls`. No log near the accumulator includes a tool name.

## New defects

None introduced by this fix round. The raw `calls` exposure is recorded under the still-partly-fixed privacy defect above, not counted again.

## Not reviewed

- `ptah_lsp_references` on `saveAgentOutput` found 15 type/use references in agent-sdk, its specs, and migration code; the attempt on the summary type position failed because the supplied position had no identifier. The fix report additionally records the RPC handler, renderer, Electron replay sanitizer, lane resumer, and script readers checked. Page responses project only `items`, cursor, and done; optional header fields stay in the blob.
- No schema validator rejecting missing or unknown header fields was identified in the reviewed blob reader/store code; reader summary parsing validates required summary fields while ignoring unknown fields and absent header metadata.
- Shared additions import only local shared modules and type-only summary types; no Node imports or conspicuously heavy dependencies. Public exports add classifier and summary wildcards at `libs/shared/src/index.ts:124-125`; the fix report records `index.zod-free.spec.ts` passing. No collision found in inspected export lines.
- Summary counters update incrementally per segment; there is no `JSON.stringify` on the hot path. Classification does inspect name/input strings, and first insertion into `byTool` enumerates at most 100 keys (`libs/shared/src/lib/tool-guidance/tool-call-summary.ts:89-105,166-196`).
- No tests or diagnostics run in this re-review; coordinator-owned Jest gate was in progress. Prior verification is reported in `batch-b-fix-report.md` and was not independently rerun.
