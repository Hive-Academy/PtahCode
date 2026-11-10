# TASK_2026_896_1ec9 — Make review lanes honor lane settings and providers

## User request

On the `horus` machine, PR reviews end in seconds with "Partial / coverage limited".
The user does not have a Copilot subscription and wants reviews to run on the provider
they configured, not on Copilot.

## Evidence (collected on horus, 2026-11-10)

- Last 5 review attempts (PR 1047, 1048, 1050, 1051) are `partial`. Every lane ran on `copilot`.
- PR 1048/1051: lanes fail with `status-failed: 127`. `/usr/bin/copilot` on horus is a symlink
  to `/usr/share/code/bin/copilot-shim/copilot` (VS Code shim). It prints
  "GitHub Copilot CLI was not found..." and exits 127. Detection still reports it installed.
- PR 1047/1050: `CliCommandLineTooLongError` — the review prompt (~159 KB) goes on argv via
  `copilot -p`; the Linux per-argument limit is 131071 bytes.
- horus settings: `agentOrchestration.disabledClis = [copilot, claude]`; Ptah CLI agents
  `Ollama Code` (ollama-cloud) and `kimi code` (kimi-code). The review still picked copilot.

## Root causes

1. `apps/ptah-electron/src/services/review/review-lane-gateway.ts:25,40` builds lanes from
   `CliDetectionService.getInstalledClis()` only. It ignores `agentOrchestration.disabledClis`,
   never includes Ptah CLI (provider) agents, and ignores `agentOrchestration.preferredAgentOrder`.
   The agent list (`agent-namespace.builder.ts:664-729`) applies all three.
2. `ReviewLaneSelector` (`libs/backend/review-core/src/lib/lanes/review-lane-selector.ts:31`)
   takes the first non-at-limit lane, so list order decides the lane.
3. `CopilotSdkAdapter.detect()` (`copilot-sdk.adapter.ts:203-234`) marks the CLI installed
   when the binary exists, even when `--version` exits 127.
4. Review prompts larger than the argv limit cannot start on argv-prompt lanes
   (copilot, opencode, antigravity non-stream).

## Gate 0.1

- Preference source: memory (`cli-lane-context-handoffs`): use a Codex implementation lane,
  then cross-family review. Lanes mode: `enabled`. Approval mode: `lane-review`.
- `ptah_agent_list` (this machine): codex installed, confirmed room (Weekly 4%);
  copilot and claude disabled; antigravity, grok installed, limits unknown;
  Ollama Code and kimi code AT LIMIT.
- Implementer: codex lane. Reviewer: in-process Claude subagent (different family).

## Batch B1 (single batch, codex)

See the lane task in the spawn call; acceptance criteria are copied in `decisions.md`.
