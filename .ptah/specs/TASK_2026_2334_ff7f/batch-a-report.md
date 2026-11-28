## Changed files

- `scripts/agent-usage/tool-call-share.ts` and `tool-call-share.spec.ts`
- `scripts/agent-usage/tool-call-classify.ts` and `tool-call-classify.spec.ts`
- `scripts/agent-usage/agent-output-blob.reader.ts` and `agent-output-blob.reader.spec.ts`
- `scripts/agent-usage/claude-transcript.reader.ts` and its spec
- `scripts/agent-usage/__fixtures__/agent-output.synthetic.json`
- `package.json` (`usage:tool-call-share`)
- `.ptah/tmp/tool-call-share.json` (requested machine output)
- This report

No existing doc lists the `scripts/agent-usage` commands, so no docs section was added. No file under `apps/**` or `libs/**` was changed.

## Data sources found

- Lane blobs are `agent-output.<agentId>.json`, written by `SessionMetadataStore.saveAgentOutput` (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:2511-2544`; basename builder `:827-829`). The persisted header has `agentId`, `savedAt`, and `segments` (`:685-693`). Segment pairing uses `tool-call`, `tool-result`, `tool-result-error`, `toolName`, `toolCallId`, and optional `toolArgs`/`toolInput` (`libs/shared/src/lib/types/agent-process.types.ts:727-789`).
- Accumulated segments stop at 500 (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager-helpers.ts:122`; enforced in `agent-output-buffer.service.ts:103`). The reader marks a blob truncated at 500 segments, or when it is empty. No byte cap for this blob was found.
- Vendor, model, and start time are persisted on `CliSessionReference` as `cli`, optional `model`, and `startedAt`, joined by `agentId` (`libs/shared/src/lib/types/agent-process.types.ts:831-859`). `SessionMetadataStore` keeps these references in `ptah.sessionMetadata` (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:620,699`). The Electron store writes workspace state under `workspace-storage` (`apps/ptah-electron/src/di/phase-1-infra.ts:139-159`). The reader checks sibling JSON and the Ptah workspace-state profiles for a matching reference. No such metadata record was available for the 97 local blobs, so their vendor/model/start are `unknown`/`null`; timestamp filtering falls back to blob `savedAt`.
- No persisted lane-call total exists in the blob or `CliSessionReference`. `LaneCompletionSignal` has an optional `toolCalls` count (`libs/shared/src/lib/types/agent-process.types.ts:963-1007`), but it is a completion payload and is not stored by `SessionMetadataStore`. Counts therefore come from paired tool-call segments. Stored-total mismatch coverage is zero when no stored total exists.
- Claude main-chat calls are read through `claude-transcript.reader.ts`. It now exposes per-call name/input and outcome, pairing transcript tool results and checking explicit `is_error` (`:58-65,160-229`). Sessions with the Ptah lane contract marker are excluded using the existing reader marker flag.

## Classification

Lane vendors could not be joined for the local data, so the first column records the applicable vendor set rather than asserting a vendor from a tool name. Name patterns below are privacy-safe normalized forms; shell input is classified in memory and never emitted.

| Vendor/source | Name form | Classification |
|---|---|---|
| Any lane; Claude main chat | `ptah_*`, `ptah__*`, `mcp__ptah__*`, `mcp_ptah_lane_ptah_*`, MCP server `ptah` | Ptah / `ptah` |
| Any lane; Claude main chat | `mcp__<server>__*`, server other than `ptah` | other MCP / `mcp:<server>` |
| Any lane; Claude main chat | `ToolSearch`, `search_tool`, `list_tools`, similar discovery forms | discovery |
| Any lane; Claude main chat | `Grep`, `rg`, shell `rg`/`grep`/`Select-String`/`findstr`, `git grep` | native-substitutable / text-search |
| Any lane; Claude main chat | `Read`, view-file forms, shell `cat`/`Get-Content`/`type`/`sed -n`/`head`/`tail` | native-substitutable / file-read |
| Any lane; Claude main chat | `Glob`, list forms, shell `ls`/`dir`/`Get-ChildItem`/`find`/`git ls-files` | native-substitutable / path-listing |
| Any lane; Claude main chat | shell `git status`/`diff`/`log`/`show`/`branch` | native-substitutable / git-read |
| Any lane; Claude main chat | writes, tests, builds, package-manager calls, state-changing git, or other unclassified native calls | native-other |

The shell substitutions listed in `TOOL_SUBSTITUTIONS` include `find`, `grep`, `rg`, `sed -n`, `cat`, and `git status` (`libs/shared/src/lib/tool-guidance/tool-substitutions.ts:104-195`); the classifier adds the remaining names in its script-local table. Shell parsing takes the first command word and, for git, the next word; it handles leading `cd`, environment assignments, and pipelines.

## Run on this machine

Ran the requested `--since 12h --json` command and saved its JSON to `.ptah/tmp/tool-call-share.json`. The following is the complete run summary: totals, coverage, and the two requested lane rows.

```json
{
  "totals": {
    "total": 4297,
    "ptah": 1715,
    "native": 2582,
    "ptahErrors": 45,
    "unknown": 149,
    "discovery": 40,
    "beforeFirstPtahSuccess": 725,
    "nativeSubstitutable": { "text-search": 337, "file-read": 562, "path-listing": 56, "git-read": 102 },
    "otherMcp": {}
  },
  "vendorTotals": {
    "unknown": { "total": 3782, "ptah": 1573, "native": 2209, "ptahErrors": 36, "unknown": 149, "discovery": 16, "beforeFirstPtahSuccess": 699, "nativeSubstitutable": { "text-search": 308, "file-read": 451, "path-listing": 48, "git-read": 79 }, "otherMcp": {} },
    "claude": { "total": 515, "ptah": 142, "native": 373, "ptahErrors": 9, "unknown": 0, "discovery": 24, "beforeFirstPtahSuccess": 26, "nativeSubstitutable": { "text-search": 29, "file-read": 111, "path-listing": 8, "git-read": 23 }, "otherMcp": {} }
  },
  "coverage": {
    "lanesFound": 97,
    "lanesTruncatedOrEmpty": 43,
    "lanesUnreadable": 0,
    "laneTotalMismatches": 0,
    "vendorsWithNoData": ["codex", "copilot", "cursor", "antigravity", "opencode", "pi", "grok", "ptah-cli"]
  },
  "referenceRows": [
    { "id": "03a54af7-44c4-4a39-b589-ecbfb749b6b6", "vendor": "unknown", "model": null, "startedAt": null, "total": 23, "ptah": 17, "native": 6, "ptahErrors": 1, "unknown": 0, "discovery": 0, "beforeFirstPtahSuccess": 0, "nativeSubstitutable": { "text-search": 0, "file-read": 0, "path-listing": 2, "git-read": 2 } },
    { "id": "25281fb8-3d47-4462-882a-d5f691868e92", "vendor": "unknown", "model": null, "startedAt": null, "total": 49, "ptah": 7, "native": 42, "ptahErrors": 0, "unknown": 5, "discovery": 0, "beforeFirstPtahSuccess": 0, "nativeSubstitutable": { "text-search": 3, "file-read": 26, "path-listing": 0, "git-read": 3 } }
  ]
}
```

Both reference totals reproduce: 23 calls / 17 Ptah and 49 calls / 7 Ptah.

## Verification

- Baseline `lane-metrics.spec.ts` passed with the supplied Jest config. The complete `scripts/agent-usage` spec set passed: 8 suites, 105 tests.
- Focused ESLint on changed TypeScript files passed with zero warnings and errors. Folder ESLint had zero errors; its 12 warnings were all in the pre-existing `probe-plan-usage.ts`.
- `npx.cmd tsc --noEmit -p scripts/tsconfig.json`: zero errors in changed files; 1,177 errors in unrelated existing workspace files under that broad config. Scoped `ptah_get_diagnostics` reported no issues in requested files.
- `node scripts/check-home-paths.mjs` passed for changed files, fixture, package manifest, and this report.

## Limits

- The local lane metadata join was unavailable, leaving 97 lane vendor/model/start values unknown. The profile has no matching workspace-state metadata files for those blobs. Rows use blob `savedAt` for window filtering when `startedAt` is unavailable.
- There is no stored tool-call total in the persisted lane reference; counted total is limited to the saved blob and capped blobs can undercount.
- The 500-segment cap can make exactly-500 blobs appear truncated even when they ended at that boundary. No byte-level cap or explicit truncation marker is saved.
- A native read targeting a path outside the workspace or a file later edited cannot be detected reliably, so substitutable native calls may be over-counted.

## Not done

None for Phase A. No runtime behavior or store was changed.
