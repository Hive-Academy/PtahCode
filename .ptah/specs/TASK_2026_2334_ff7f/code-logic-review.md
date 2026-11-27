## Verdict

REVISE

Review family: codex (implementer families: codex for the script, antigravity for the runtime summary).

The report-script portion is a same-family read and therefore weaker evidence than the runtime review. I did not rely on its tests as proof of script correctness.

## Defects

1. **Serious — sensitive vendor tool names are persisted verbatim.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts:43-48,136` trims and truncates `segment.toolName` but keeps the content as the persistent `byTool` key. A vendor event with `toolName: "shell: cat /Users/alice/private.txt"` or an ACP title embedding a command/path writes that text to `agent-output.<agentId>.json`; the 128-character limit does not sanitize it. The script also takes the key through unchanged in `scripts/agent-usage/agent-output-blob.reader.ts:65-75`, although current formatting does not print `byTool`. Normalize keys to a fixed known tool identifier or a bounded category before persistence; do not preserve arbitrary vendor names.

2. **Moderate — pending result correlation grows without a bound.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts:138-148` inserts every nonempty call ID into a map and removes it only when a matching result arrives (`:168-173`). A lane that emits many calls without results (including stream interruption or a vendor that omits IDs/results) grows this transient map with no cap for the lane lifetime. Bound pending entries and retire them safely while keeping outcomes unknown; avoid retaining raw call IDs beyond their useful pairing window.

3. **Moderate — reuse of a tool-call ID misattributes results.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts:142-148,168-173` overwrites the prior map entry when a second call reuses an ID. For calls `ptah_grep(id=x)`, `Read(id=x)`, then a successful result for `x`, the first call stays unknown and the result marks the second call successful, changing error/unknown and before-first-success metrics. Reconcile duplicate IDs explicitly (for example, refuse ambiguous pairing and leave affected outcomes unknown).

4. **Moderate — first successful Ptah result is not necessarily the first Ptah success in call order.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts:188-193` sets the metric to the ordinal of whichever successful result is observed first, and only lowers it for a later-arriving result with a smaller ordinal. Trigger: Ptah call A is issued, then Ptah call B; B returns successfully before A, and later A errors or never returns. The stored value is B's ordinal even though the report calls this “calls before first Ptah success” and call A preceded that success in issuance order. Define this metric in event/call order and avoid treating an unresolved earlier Ptah call as a success boundary.

## Checked and sound

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-output-buffer.service.ts:105-119` updates the summary before enforcing the 500-segment accumulated-output cap, so calls after that cap still contribute. Summary exceptions are caught at `:259-285` and do not escape the output path.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts:2526-2555,2580-2607` stores summary and optional header fields with the blob; it still accepts absent fields. `scripts/agent-usage/agent-output-blob.reader.ts:34-91` rejects malformed summary shapes and supports legacy blobs without summary metadata.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/tool-call-summary.ts:51-67` caps the number of distinct `byTool` keys at 100, with overflow counting. `:198-227` persists only summary counters and tool keys, not input/result payload objects; defect 1 is specifically the untrusted tool key.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:4201-4207,4323-4330` flushes before discarding on normal process exit; stop and disposal also discard output-buffer state at `:3699-3705,3755-3767`. The pending map is weakly keyed by summary, so it does not itself retain an otherwise unreachable summary.
- `libs/shared/src/lib/tool-guidance/tool-call-classify.ts:18-23,36-59,77-90` classifies command input in memory and returns only categories; common PowerShell spellings are covered, and package-manager/node commands fall through to native-other. Coverage remains incomplete for wrappers/options such as `sudo`, `env`, and `git -C path status`.
- `scripts/agent-usage/tool-call-share.ts:187-207,233-281` chooses the persisted summary when present and falls back to calls parsed from segments for legacy blobs. Output labels are sanitized at `:52-54`; script output contains aggregate rows, not raw arguments, results, commands, or filesystem paths.
- `scripts/agent-usage/claude-transcript.reader.ts:203-208` pairs Claude tool results with calls by ID and records explicit error outcome without returning result text in the tool-call record.
- Diff scope was `git diff main` (commit `96f10046c` plus uncommitted batch B); no writes were made outside this deliverable. No tests, Nx targets, builds, or diagnostics were run, per task restrictions.

## Not reviewed

- Full compatibility census across all blob header readers/writers, renderer/RPC/Electron/VS Code consumers, and dependency impact was not completed. No `ptah_lsp_references` or `ptah_get_dependents` result was obtained.
- Full shell-classifier adversarial matrix (PowerShell aliases, nested shells, POSIX wrappers, state-changing git variants) and CLI argument/window edge cases were not exhaustively evaluated.
- No runtime or focused spec execution was performed. The script changes are same-family work, so the logic assessment there is source-level and lower confidence.
