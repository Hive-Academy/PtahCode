# Research Report - TASK_2026_CLI_PERMISSION_DEFAULTS

## Question

- Decision this supports: which native permission and network modes each Cursor, Grok, Pi, and OpenCode lane manifest can honestly offer.
- Question: Which Ptah policy values are enforceable through each actual adapter entry point?
- Bounds: no model sessions, production edits, builds, or quota-consuming runtime tests. The full per-mode matrix and translation proposal are in `research-native-permission-flags.md` beside this file.

## Answer

Keep unverified modes unsupported. Grok's ACP entry point has an explicit `--always-approve` route for yolo, while OpenCode's run path has `--agent plan` and a candidate yolo route via `--auto` plus isolated permission config. Cursor's SDK has plan and sandbox options but no headless approval callback in installed declarations; Pi has no built-in permission policy. None of the four offers a verified general network-deny route across supported hosts and tools.

## Evidence

| Claim | Source | Date | Verified how |
|---|---|---|---|
| Cursor SDK 1.0.31 exposes `mode: agent|plan` and `sandboxOptions.enabled` | `node_modules/@cursor/sdk/package.json:2-3`; `node_modules/@cursor/sdk/dist/esm/options.d.ts:4,99-101,179,402-403` | 2026-11-07 local | Read installed types |
| Cursor headless local SDK defaults to unsandboxed tools and lacks interactive approvals | [Cursor SDK docs](https://cursor.com/docs/sdk/typescript) | undated; checked 2026-11-07 | Read vendor docs |
| Grok 1.0.77 root help lists permission modes and sandbox, but `agent --help` only lists `--always-approve` | Local `grok --version`, `grok --help`, `grok agent --help`, `grok agent stdio --help` | 2026-11-07 local | Ran help only |
| ACP entry point documents `grok agent --always-approve stdio` and ACP permissions | [xAI ACP guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md) | undated; checked 2026-11-07 | Read vendor source docs |
| Current ACP bridge auto-approves or rejects without prompting | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-permission-policy.ts:67-76,82-143` | 2026-11-07 local | Read source |
| Grok sandbox does not block in-process networking; child network restriction is platform-limited | [xAI sandbox docs](https://docs.x.ai/build/features/sandbox) | updated 2026-07-21 | Read vendor docs |
| Pi default inherits process authority; extension `tool_call` can block tools | [Pi repository](https://github.com/badlogic/pi-mono); [extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) | undated; checked 2026-11-07 | Read project docs |
| OpenCode v2.0.12 `run` offers `--agent`, `--auto`, `--standalone`; permissions can be allow/ask/deny | Local `opencode --version`, `opencode run --help`; [OpenCode permissions](https://opencode.ai/docs/permissions/) | 2026-11-07 local; docs undated | Ran help and read docs |
| Current OpenCode adapter closes stdin and already uses inline config for MCP | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:668-701,799-809` | 2026-11-07 local | Read source |
| OpenCode inline config is `OPENCODE_CONFIG_CONTENT`, but project precedence has been disputed | [OpenCode config](https://opencode.ai/docs/config/); [upstream issue](https://github.com/anomalyco/opencode/issues/11628) | undated; checked 2026-11-07 | Read docs and issue |

## Options

| Option | Fit here | Cost to adopt | Known failure mode |
|---|---|---|---|
| Expose already bound policy | OpenCode plan; current Grok ACP auto-allow behavior | Small manifest/translation change | Plan may overpromise if bash/custom tools mutate; Grok denies/hooks still apply |
| Add version-gated native translations | Grok yolo; Cursor plan/yolo; OpenCode yolo config | Adapter changes and no-model smoke checks; merge MCP JSON; isolate OpenCode server | Wrong flag position, stale resumed policy, config precedence |
| Add interactive approval modes | Grok ACP request exists; Pi needs extension UI; OpenCode needs API/UI bridge; Cursor SDK lacks callback | New per-tool request/response path and cancellation | Prompt hangs or auto-approves without user decision |
| Add network-deny mode | No complete native route found | Host isolation or proven firewall | Web-tool denial leaves bash/MCP/model routes open |

## Disagreements

- Grok root help advertises `--permission-mode plan|acceptEdits|...`; ACP `agent` help does not. The adapter spawns `agent ... stdio`, so ACP help and vendor ACP guide govern translation.
- OpenCode docs present inline config as runtime override, while [issue #11628](https://github.com/anomalyco/opencode/issues/11628) reports precedence discrepancies. Confirm effective config under `--standalone` before advertising yolo.
- Cursor SDK docs mention hooks, while installed public `AgentOptions` has no approval callback. The installed type contract governs this adapter.

## Local consequences

- `lane-spawn-policy.ts:133-136`: preserve unsupported translations until gates pass; proposed explicit Grok yolo argv is `agent --always-approve --no-leader stdio`.
- `cursor-cli.adapter.ts:415-449`: candidate `AgentOptions.mode` and `local.sandboxOptions`; ensure resume/follow-up retains policy.
- `grok/grok-acp-profile.ts:49,113` and `acp/acp-permission-policy.ts:82-143`: separate explicit full auto from a future user-routed ask request.
- `opencode-cli.adapter.ts:668-701,799-809`: merge permission JSON with MCP JSON, isolate config, and leave ask/auto-edit unsupported until approval answers can reach the CLI.
- `pi-cli.adapter.ts:249-257`: preserve unsupported modes pending a versioned extension and RPC integration.

## Unknowns

- Does Cursor plan enforce no mutation through bash/custom tools? A local executor probe and versioned test would settle it.
- Does Grok 1.0.77 accept exact `agent --always-approve --no-leader stdio` argv, and do root permission flags propagate to `agent`? Parse-only smoke test, no model session.
- Which Pi CLI version/extensions will Ptah launch? Inspect installed runtime when available, then test interception.
- Does OpenCode v2.0.12 apply `OPENCODE_CONFIG_CONTENT.permission` under `--standalone` to every turn? Inspect effective config without a model call.
