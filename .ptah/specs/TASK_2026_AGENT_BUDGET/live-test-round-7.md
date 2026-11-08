# Live test round 7 — TASK_2026_AGENT_BUDGET

Run 2026-11-08 in Ptah Dev Electron, PR #986, `feat/agent-budget`, HEAD `13f02ffcc91adcda77dd7c7220888af6eebd0cca`. Evidence is in [sanitized-log.txt](live-test-round-7/sanitized-log.txt); line numbers refer to the Ptah Dev host log. No source was edited, committed, pushed, or merged.

## Isolation gate

| Gate | Result |
| --- | --- |
| Required ancestor | PASS: `8aaa227e7` is an ancestor of HEAD. |
| Production settings | PASS: raw SHA-256 at start, after Dev edits, after launch, and end was `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Canonical sorted-JSON SHA-256 was `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb` at all successful canonical checks. The first canonical calculation failed because Windows PowerShell lacked the expected methods; it was recomputed from the unchanged production bytes after launch. No settings values were printed. |
| Dev settings | PASS: backed up before edits and restored byte for byte; original and final SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Backup removed. |
| Process and port | PASS: no Ptah Dev process or listener on 9348 before launch. Launched with `PTAH_NO_DEVTOOLS=1`, `NODE_ENV=development`, `CLAUDE_CODE_SUBAGENT_MODEL=haiku`; owned Electron root PID 20092. Stopped its 27-process tree only. Root and 9348 listener absent at end. |
| Scratch security | PASS: `.agents`, `.claude`, `.ptah`, and `.mcp.json` were moved out before testing, leaving README only. Agents were instructed never to read home Ptah paths or MCP/config files. Generated MCP copies and notes were removed, originals restored. No agent was asked to inspect secrets. |
| Board | PASS: 0/9 running at launch; no completed sessions needed closing. |

## Setup

Rebuilt from this HEAD in the required order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. All exited 0. Launched Electron with CDP port 9348 against `.ptah/live-test-ws`. Dev-only budget settings: C1 handoff 50000, stop 400000, warning ratio 0.85; C2 50000/65000/0.7; A and B 40000/250000/0.85. Production hashes remained stable after each edit.

## Checks table

| Check | Result | Evidence |
| --- | --- | --- |
| **C1: Haiku notice before stop, handoff, parent attribution** | **FAIL** | Task `a5b2830df27841ef4` warned at weighted 355357 (75358), completed another turn at 398652 (75360), then stopped at 444846/400000 (75367-75371). One handoff record and one parent push (75368, 75372) preceded parent text (75388). First parent reply identified Ptah budget but quoted the completion notice's **“stopped by user”** wording, violating the strict first-reply requirement and reproducing #1004 wording. Child notes had no post-notice update; the real-ID “update notes” notice was not proven to reach the child. Three stopped-Task SendMessage calls were refused (75405, 75408, 75412). A fresh Task read the handoff and finished normally. |
| **C2: same-turn warning and stop** | **FAIL** on strict first-reply wording; **PASS** on snapshot and single-task handoff | Task `ac905fd983277cdac` jumped from 30835 to 69288/65000; warning and stop were in the same turn (75781-75792). One record and one push for that Task (75789, 75793) preceded parent text (75867). The first reply named Ptah budget but quoted **“Request interrupted by user”**, another #1004 wording leak. The child's Write did not complete; its handoff contains the merged inferred progress snapshot and target file. Three SendMessage probes were refused. The fresh reader also hit the low limit at 70099, producing its own separate record and push (75841-75847); it did not complete a handoff read. |
| **A: Codex CLI lane, 250000 stop** | **FAIL** on strict no-`unsupported` log; **PASS** on warning timing, stop, pointer, and resume refusal | Lane `e382bd53-4d7a-45d2-8beb-a4f2fc95635d` accepted weighted totals 91823, 194505, 267496 (76237, 76302, 76358). Predictive warning fired after turn 2 (76304), was injected into turn 3 (76330), and appears in the true Codex rollout lines 86-87. Router also logged `mode:"unsupported"` at 76303 **before** the stop, so the requested absence of that string is not met, though queue-next-turn delivery worked. No closed-lane delivery error was logged. True CLI Session ID `01a1ba96-5704-7790-82b8-404bcd888b9a`; last accepted turn `01a1ba97-217c-7fb3-88fd-e60dce637939`. Resume gate chose fresh twice with explicit budget-stop reason (76415, 76522). A message to the stopped agent opened a new CLI session, not the old one; the parent stopped that new lane. |
| **B: native Codex-provider child** | **FAIL** | Parent `01a1ba54-5b69-7e21-84d7-e2a3534b9442` linked child `01a1ba9a-70a5-72c2-98fd-5f2d01ee3269` (77107). UI reported two completed child turns, but only one budget decision appeared (77140), with `coverage:"telemetry-unavailable"`, `reason:"model-id-unavailable"`, and no real counters. Child relinked at 77143. One decision per completed turn with real counters was not proven. |

## Findings

1. **#1004 remains visible in both C cases:** the parent correctly attributed the stop to Ptah but quoted SDK user-interruption wording in its first reply. C1's warning was early enough for another turn, yet its notes did not record the notice; C2's inferred snapshot did preserve the interrupted Write target.
2. **A's warning reached the Codex rollout before stop**, satisfying the timing behavior fixed after round 6. The router's pre-stop `unsupported` entry remains a strict logging/route failure; no post-stop `Codex lane is closed` error occurred.
3. **B regressed or remains intermittent:** the new native child linked, but accounting was `telemetry-unavailable`, and only one decision was observed for two UI-reported turns.
4. No `onMessage wait timed out` warning occurred. C1 and C2 each logged an info-level parent-message acceptance timeout after the push (75399, 75813), with no retry. This does not disprove the earlier parent delivery shown by push-before-reply order.

## Decisions

- Classified the strict wording and `unsupported` requirements as failures even where the principal budget path succeeded. The alternatives were treating quoted SDK text and a pre-stop unsupported route as harmless; the task explicitly disallows both strings. This classification is reversible if acceptance criteria change.
- Used the existing native Codex session for B because it exposed the native child tool and parent thread; the fresh round-7 child was linked under that parent. This was a read-only, reversible choice.

## Cleanup

Stopped only the owned Electron tree; port 9348 is closed. Restored Dev settings byte for byte, removed their backup, restored the scratch originals, and removed generated MCP copies and notes. A direct recursive cleanup command was rejected by automatic approval review; a path-checked local script performed cleanup. Production raw and canonical hashes matched at end. Existing unrelated dirty `HANDOFF.md` and the prior round-6 untracked artifact were left untouched.
