# Live test round 6 — TASK_2026_AGENT_BUDGET

Run on 2026-11-08 in Ptah Dev Electron for PR #986, `feat/agent-budget`, HEAD `a512e806c74e9c40b6e74451a08efbab18e2dbf3`. The companion [sanitized log](live-test-round-6/sanitized-log.txt) preserves original host-log line numbers and excludes settings values, tokens, and agent prompts.

## Isolation gate

| Gate | Result |
| --- | --- |
| Required ancestor | PASS: `8aaa227e7` is an ancestor of HEAD. |
| Production settings | PASS: raw SHA-256 at start, after each Dev edit, after launch, and at end was `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`; canonical sorted-JSON SHA-256 at those checkpoints was `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. Hashes only were inspected. |
| Dev settings | PASS: backed up before edits and restored byte for byte; original and final raw SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Backup removed. |
| Process and port | PASS: no Ptah Dev process or listener on port 9348 before launch; launched with `PTAH_NO_DEVTOOLS=1`; stopped only the owned Electron process tree rooted at PID 32316. Root is absent and port 9348 has no listener at end. Production Ptah processes were left alone. |
| Scratch workspace | PASS: original `.agents`, `.claude`, `.ptah`, and `.mcp.json` were moved aside before testing and restored afterward. Agents were confined to README and explicit handoff files; no request to read home Ptah settings, MCP files, or tokens was made. Generated MCP copies were removed. |

## Setup

Rebuilt from this HEAD with the required verify lock: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`, then `node scripts/copy-wasm.js dist/apps/ptah-electron`, then `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. All exited 0. Launched `dist/apps/ptah-electron` on CDP port 9348 with `NODE_ENV=development`, `PTAH_NO_DEVTOOLS=1`, and `CLAUDE_CODE_SUBAGENT_MODEL=haiku`. The board had room (0 of 9 running); no old session was closed or deleted. Dev-only budget settings were tuned between checks: B and A used `handoffContextTokens=40000` and A used `stopWeightedTokens=250000`, `warnRatio=0.85`; C used 180000/0.85, 65000/0.7, and 110000/0.7 to probe notice timing.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| **B — native Codex child** | **PASS** for linkage, measured accounting, and advisory; reconnect **NOT EXERCISED** | Host linked parent thread `01a1ba54-5b69-7e21-84d7-e2a3534b9442` to child `01a1ba54-8908-7830-9d00-8ad8645e4e11` (line 70687). Two completed child turns produced two decisions, each with `coverage:"complete"`, observed model `gpt-6-luna`, and real counters: context/input/output 30818/28923/1895 with `warning:true` (70991), then 31989/30992/997 with `warning:false` (71021). The advisory was raised near the 40000 context-token limit; `handoff:false` and no forced handoff was observed. No `Codex early child event buffer overflow` appeared. No reconnect occurred, so duplicate-charge protection on relink was not tested. |
| **C — Haiku SDK subagent** | **FAIL** for full notice/stop behavior | At a 65000 stop, Task `a73cb73c91623dc65` went from weighted 30550 to 68805; warning and stop occurred in the same turn (69655–69676), so a pre-stop notice with the real Task ID and instruction to update notes was not proven to reach the child. A fresh Task `a85ec0d556fb3943a` read the prior handoff and also stopped at 70284 (69719–69750). At 110000, Task `aa6512b7adf8502d5` queued a warning at context 38131 and exited normally; its handoff was published (70040–70076), but no post-notice child note update or stop was observed. Every relevant Task produced one `.handoff.md` and one parent handoff; the stopped Task's notes held a substantive inferred snapshot rather than only a stub. The parent read the stopped handoff and a fresh Task used it. The obsolete `Handoff not read by the parent in time` warning did not appear. The host instead logged four parent-message acknowledgment timeouts even though records were read by another path. A denial burst was not exercised. |
| **A — Codex CLI lane regression** | **FAIL** for warning before stop and rollout delivery | First lane accepted six turns through weighted 240239 at 0.961 of its limit (72027–72330). The resume gate refused that CLI session and chose fresh because the warning threshold had been reached (72399). In a second lane, the fourth turn ended at 209587, just below the 212500 warning threshold; the fifth jumped to 251031 and triggered the budget stop (73113, 73158–73161). The warning route returned `mode:"unsupported"`, then `Budget warning failed` / `Codex lane is closed` (73160–73163). Consequently no warning appeared in the Codex rollout before stop. The parent UI showed the true second CLI Session ID `01a1ba5e-6c3a-7301-a03d-66f3a6f0d84d` and last completed turn `01a1ba5f-3873-7073-8bdb-946dc99a8a6f`; the reference persisted (73173–73175). Resume refusal specifically after a budget stop was not exercised. |

## Findings

1. **A regression remains:** crossing both warning and stop thresholds in one Codex CLI turn closes the lane before warning delivery. The `unsupported` route and closed-lane error are direct evidence; this fails the requested warning-before-stop guarantee.
2. **B's fix is live:** child linkage and model/counter capture are measurable, with one decision per completed child turn. The second decision includes `stopReason:"budget"` while `handoff:false`; the UI did not show a forced handoff, so this field should be interpreted cautiously.
3. **C's timing is unresolved:** the low-limit child hit warning and stop in the same turn. The handoff recovery path supplied substantive notes and the parent consumed them, but a real-ID notice delivered before stop and a post-notice notes write were not demonstrated. The parent UI initially called the first Ptah budget stop “stopped by user” before later attributing it to Ptah after reading the handoff. This is an explicit **#1004 behavior regression**. No user action caused the stop. Four new acknowledgment-timeout warnings warrant investigation; they are different from the obsolete false “Handoff not read by the parent in time” wording.

## Decisions

- Used the task's specified live end-to-end checks and thresholds, then varied C's Dev-only limits to create a warning-before-stop opportunity. This was reversible and did not change source or production settings.
- Classified B as PASS for its observed core requirements, with reconnect separately NOT EXERCISED; C and A as FAIL because mandatory notice/delivery evidence was missing. These classifications follow the observed host logs and UI, and can be revised after a targeted rerun.

## Cleanup

Stopped the owned Electron tree and verified port 9348 closed. Restored Dev settings and the scratch workspace originals; removed the Dev backup, generated MCP copies, generated command/harness copies, and temporary CDP/hash/expression/PID helpers. Retained the sanitized log and child handoff records under the round 6 evidence directory. Production raw and canonical hashes matched at end. No source was edited by this lane; no commit, push, or merge was made.
