# Native lane permission controls — decision evidence

## Decision question

Which of Ptah's `plan`, `ask`, `auto-edit`, `yolo` and network `allow`/`deny` values can each current adapter enforce at spawn, and which require a new approval transport or isolation mechanism? Options: expose a value now, expose it after a specified integration check, or leave it unsupported. **Recommendation:** only advertise a mode after the adapter's actual entry point and prompt path enforce it. This research made no source edits or model calls.

## Scope and evidence standard

Repository paths below are relative to this worktree; line citations are to the checked checkout. `verified-local` means a local binary help/type declaration was inspected, **not** a model-session behavior test. `documented` means vendor docs/source; `inferred` is a proposed mapping needing a smoke test. Local versions: Grok `1.0.77 (50ca579fa996)`, OpenCode `v2.0.12`, `@cursor/sdk` installed `1.0.31` (`node_modules/@cursor/sdk/package.json:2-3`; root asks for `^1.0.13`), ACP SDK `1.7.0` (`package.json`). Cursor CLI and Pi CLI are absent, so their CLI versions and runtime behavior are unverified. Official web pages were checked 2026-11-07; dated Grok sandbox page says updated 2026-07-21. The plan's existing manifest map is `implementation-plan.md` under this task, `## Current-state map` and `## Decisions`.

## Cursor via `@cursor/sdk` 1.0.31

Local declarations: `AgentModeOption = "agent" | "plan"` (`node_modules/@cursor/sdk/dist/esm/options.d.ts:4`); `AgentOptions.mode` (`:402-403`); `local.sandboxOptions?: {enabled:boolean}` (`:99-101,179`). The adapter uses `Agent.create/resume(agentOptions)` and `agent.send(prompt)` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts:415-449`) and currently offers no policy translation (`lane-spawn-policy.ts:133-136`). [Cursor TypeScript SDK docs](https://cursor.com/docs/sdk/typescript) say local sandbox is off by default; unsandboxed headless tool calls run without human approval, and no headless approval flow is built in. The docs mention hooks, but the installed public `AgentOptions` declaration has no permission callback; do not assume a hook API can be bound through this SDK version.

| Ptah value | Native mechanism and verdict | Confidence | Ask route |
|---|---|---|---|
| plan | `Agent.create({mode:'plan'})`; SDK has a real plan enum, but verify write/tool restrictions on this exact local executor before declaring Ptah's no-mutation guarantee. Candidate only. | verified-local type; behavior documented/inferred | none needed if read-only is confirmed |
| ask | No SDK permission callback or headless prompt channel found. **Unsupported.** | verified-local type + documented | no routable request; headless run does not wait for Ptah |
| auto-edit | No “allow edits, ask other tools” SDK policy option. **Unsupported.** | verified-local type | no routable request |
| yolo | `local.sandboxOptions:{enabled:false}`, `mode:'agent'` permits unrestricted local tools per SDK docs. Candidate if disabling sandbox is acceptable and runtime verifies it. | verified-local type + documented | no prompt; executes automatically |
| network allow | Unsandboxed local agent reaches network by default, per SDK docs. Candidate with yolo only. | documented | — |
| network deny | `sandboxOptions.enabled:true` is a broad sandbox toggle, not a specific network-deny guarantee or a complete model/web-tool firewall. **Unsupported.** | verified-local type + documented | — |

`mode` may also be supplied per `send` (`node_modules/@cursor/sdk/dist/esm/agent.d.ts:40`); the current adapter does not. For a resumed session, reapply and verify policy on every turn, rather than relying on an initial agent setting.

## Grok ACP via `grok agent --no-leader stdio` 1.0.77

Local `grok --help` offers `--permission-mode <MODE>` (`default, acceptEdits, auto, dontAsk, bypassPermissions, plan`), `--allow`, `--deny`, `--disable-web-search`, and `--sandbox <PROFILE>` (`GROK_SANDBOX`). **But** `grok agent --help` offers `--always-approve` and does not list those root flags; `grok agent stdio --help` lists no permission/sandbox flag. The [official ACP guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md) puts agent flags before `stdio` and documents `grok agent --always-approve stdio` and ACP permission requests. `grok/grok-acp-profile.ts:49,113` uses `agent --no-leader stdio` today. Do not translate root `--permission-mode plan|acceptEdits|...` into that argv without testing that `agent` accepts it; root help alone does not prove subcommand inheritance.

Local help excerpt: `grok agent --help` → `--always-approve` / `Auto-approve all tool executions`; `grok --help` → `--sandbox <PROFILE>` / `Sandbox profile for filesystem and network access [env: GROK_SANDBOX=]`.

| Ptah value | Native mechanism and verdict | Confidence | Ask route |
|---|---|---|---|
| plan | Root `--permission-mode plan` exists, but no verified ACP entry-point binding or session config key. **Unsupported now.** | verified-local root help; ACP mapping inferred | — |
| ask | Omit `--always-approve`; Grok ACP can send `session/request_permission`. **Possible after Ptah gains per-request UI routing.** Current `acp/acp-permission-policy.ts:67-76,82-143` auto-selects `allow_once` by default, and with auto-approve off rejects; neither asks a user. | documented ACP + verified-local code | ACP request can be answered by Ptah; current runner answers automatically |
| auto-edit | Root `acceptEdits` is advertised, but no verified ACP binding or edit-scope semantics for `agent stdio`. **Unsupported.** | verified-local root help; behavior unverified | ACP request could be routed after bridge work |
| yolo | `grok agent --always-approve --no-leader stdio` (before `stdio`); deny rules/hooks can still reject. **Candidate supported** after argument-order smoke test. Existing ACP policy already auto-selects `allow_once` for requests (`acp-permission-policy.ts:91-108`), so this is the explicit native route. | verified-local agent help + documented | no prompt expected |
| network allow | No network restriction is the normal profile (`off`); **candidate with yolo**. | documented | — |
| network deny | `--disable-web-search` removes two tools but cannot block shell or model/network use. [Grok sandbox docs](https://docs.x.ai/build/features/sandbox) say child network enforcement is Linux-only, no-op on macOS for `read-only`/`strict`, and in-process model/web network is not blocked. On this Windows host, **unsupported** as general deny. | documented + inferred for Windows | — |

The [Grok permissions docs](https://docs.x.ai/build/features/permissions) distinguish ask, auto-classifier, always-approve and independent plan mode. They do **not** establish `acceptEdits` for ACP or a complete network-deny route. The root help and ACP help disagree on accepted options; prefer ACP help for Ptah's argv.

## Pi RPC (CLI absent)

Pi's [project repository](https://github.com/badlogic/pi-mono) states its default process has the user's authority and recommends containerization/sandboxing for boundaries. [RPC docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md) describe command/response and extension UI records; [extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) document a `tool_call` event that can block before execution. [Official example sandbox extension](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts) is opt-in (`pi -e ./sandbox`) with configurable filesystem/network rules. These are extension mechanisms, not a native Pi permission flag. Current `pi-cli.adapter.ts:249-257` declares all permission and network-deny values unsupported.

| Ptah value | Native mechanism and verdict | Confidence | Ask route |
|---|---|---|---|
| plan | No built-in no-mutation mode in the checked RPC/docs; custom extension or OS sandbox required. **Unsupported.** | documented | — |
| ask | Custom `tool_call` extension could call Pi RPC extension UI, but Ptah has no installed extension or approval bridge. **Unsupported.** | documented mechanism; integration inferred | RPC extension UI could route; current adapter does not |
| auto-edit | Custom extension would have to distinguish edit/write from bash and every extension tool; no native switch. **Unsupported.** | inferred | none today |
| yolo | Pi's ordinary process authority runs tools without built-in approval; explicit absence of an isolation extension may correspond to full auto, but installed CLI/version and extension loadout are unknown. **Keep unsupported until runtime inventory and test.** | documented default; runtime unverified | no prompt expected |
| network allow | Process default allows network; candidate only after CLI/version/runtime check. | documented | — |
| network deny | Optional extension/container may restrict subprocess network; no built-in per-lane general deny, and model API still needs network. **Unsupported.** | documented + inferred | — |

## OpenCode `opencode run` v2.0.12

Local `opencode run --help`: `--agent string`, `--auto` (“Auto-approve permissions that are not explicitly denied”), `--standalone`, `--format json`. [Official permission docs](https://opencode.ai/docs/permissions/) define `permission` rules `allow|ask|deny` for `edit`, `bash`, `webfetch`, `websearch`, `external_directory` and others; `--auto` approves pending asks while explicit denies remain. [Config docs](https://opencode.ai/docs/config/) document `OPENCODE_CONFIG_CONTENT` as inline runtime config. A repository [issue on precedence](https://github.com/anomalyco/opencode/issues/11628) reports discrepancies with project overrides; isolate and verify effective config. Existing adapter already uses `OPENCODE_CONFIG_CONTENT` for MCP (`opencode-cli.adapter.ts:694-701`), defaults to `--auto` unless `autoApprove:false` (`:668-672`), closes stdin (`:809`), and prefers `--standalone` when detected (`:676-679`). Permission JSON must **merge with the existing MCP object**; replacing it breaks Ptah tools. Background server reuse may also defeat per-process env isolation, so require `--standalone` for per-lane policy or prove server-bound config behavior.

Local help excerpt: `opencode run --help` → `--auto  Auto-approve permissions that are not explicitly denied`; `--agent string  Agent to use`.

| Ptah value | Native mechanism and verdict | Confidence | Ask route |
|---|---|---|---|
| plan | `--agent plan`; current manifest/translation supports it (`opencode-cli.adapter.ts:364-372`, `lane-spawn-policy.ts:206-210`). Verify no mutation by bash/custom tools before promising a hard guarantee. | verified-local flag + local code | plan-specific prompts not routed |
| ask | `OPENCODE_CONFIG_CONTENT={"permission":"ask"}` and no `--auto` is native policy syntax. **Unsupported in current one-shot adapter:** stdin is closed, stdout event stream has no approval answer handling. | documented + verified-local code | likely waits for OpenCode UI/API or fails; Ptah cannot answer today |
| auto-edit | `{"permission":{"*":"ask","edit":"allow"}}` and no `--auto` is a plausible rule map, but bash/other asks still lack a Ptah answer path. **Unsupported.** | documented config; mapping inferred | same blocked approval path |
| yolo | `--auto` plus `{"permission":"allow"}` is an explicit native all-allow policy (subject to managed hard denies). **Candidate supported** after isolated `--standalone` effective-config test; existing default `--auto` alone is weaker because explicit denies remain. | verified-local flag + documented config | no prompt expected |
| network allow | No deny rule; normal mode allows web tools and bash networking. Candidate with plan/yolo. | documented/inferred | — |
| network deny | `webfetch:'deny', websearch:'deny'` blocks OpenCode web tools, **not** `bash` network, MCP tools, plugins, or provider API. **Unsupported** as Ptah-wide network deny. | documented tool scope + inferred gaps | — |

## Proposed manifest and translation (subject to stated gates)

```ts
// Current enforceable public contract, before the listed smoke tests:
cursor:   { plan: unsupported, ask: unsupported, autoEdit: unsupported, yolo: unsupported, network: {allow: supported, deny: unsupported} }
grok:     { plan: unsupported, ask: unsupported, autoEdit: unsupported, yolo: supported, network: {allow: supported, deny: unsupported} }
pi:       { plan: unsupported, ask: unsupported, autoEdit: unsupported, yolo: unsupported, network: {allow: supported, deny: unsupported} }
opencode: { plan: supported,   ask: unsupported, autoEdit: unsupported, yolo: unsupported, network: {allow: supported, deny: unsupported} }

// Candidate translations after versioned behavior checks:
cursor.plan -> Agent.create({mode:'plan'}); cursor.yolo -> Agent.create({mode:'agent',local:{sandboxOptions:{enabled:false}}});
grok.yolo -> ['agent','--always-approve','--no-leader','stdio'];
opencode.yolo -> ['run','--standalone','--format','json','--auto'] + merge OPENCODE_CONFIG_CONTENT.permission='allow';
// No network-deny translation for these four on all supported hosts.
```

`allow` means no Ptah network restriction, not proof that the provider always has connectivity. Grok yolo is the one candidate with both installed-binary and official ACP-entry-point evidence; preserve current ACP decision behavior until argv smoke-tested. Cursor and Pi should retain unsupported permissions in the shipped manifest. OpenCode yolo should not be labeled supported until config isolation and the existing MCP merge are tested.

## Tests to add before promotion

1. Pure policy/manifest matrix specs: reject every unsupported permission/network pair; verify no fallback silently widens plan or deny; preserve explicit invalid-policy errors.
2. Cursor SDK adapter spec with typed fake `Agent.create/resume/send`: capture plan/yolo options, prove resume and follow-up retain policy; add a harmless local executor smoke test for plan mutation attempts before promoting it.
3. Grok profile/ACP runner specs: assert `--always-approve` sits before `stdio`, ACP permission request auto-response remains explicit, and a future ask bridge can select/reject offered IDs with timeout/cancel. CLI parse-only smoke test for the exact argv; no model request needed.
4. Pi RPC/extension integration spec if supported modes are pursued: confirm a `tool_call` gate covers built-ins and extension tools, extension UI requests round-trip, and subprocess/network bypasses are blocked by the chosen sandbox.
5. OpenCode spawn spec: merge permission with MCP JSON, force `--standalone` for per-lane config, ensure `--auto` only for yolo, verify plan argv and all-allow effective config using local debug/config inspection; no model request. Separate approval bridge test before ask/auto-edit promotion.

## Decisions

- Prefer the actual adapter entry point over root CLI help when flags differ. Evidence: Grok `agent --help` versus `grok --help`; reversible by adding verified flags later.
- Leave `network: deny` unsupported for all four. Tool-specific web denial and child-process sandboxing do not cover every route; reversible when a tested host-level isolation layer exists.
- Treat “native option exists” and “Ptah can answer a prompt” as separate requirements. Evidence: ACP bridge and closed OpenCode stdin; reversible after approval UI/API wiring.
