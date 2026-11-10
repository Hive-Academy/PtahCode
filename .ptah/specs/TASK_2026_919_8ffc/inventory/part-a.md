# Settings forms inventory, part A
## Tab map
| Tab id / label | Component | File |
|---|---|---|
| claude-auth / Providers | ProvidersSettingsComponent; AgentsRoutingSettingsComponent | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts; libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts |
| orchestration / Context Management | OrchestrationSettingsComponent (outside Part A) | libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts |
| pro-features / Advanced | AdvancedSettingsComponent | libs/frontend/chat/src/lib/settings/advanced-settings.component.ts |
| tools / Search & Voice | SearchVoiceSettingsComponent | libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts |

## Controls
| # | Tab | Component file:line | Control kind | Purpose (label) | Options | Behavior | Styling source | Forms API |
|---|---|---|---|---|---|---|---|---|
| A1 | Advanced | libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:154 | toggle | Advanced setting (setting.label) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "'toggle toggle-sm toggle-primary ' + focusRing" | none (event binding + signal) |
| A2 | Advanced | libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:190 | text input | Advanced numeric setting (setting.label) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "'input input-bordered input-sm join-item min-w-0 flex-1 text-right text-sm tabular-nums te" | none (event binding + signal) |
| A3 | Advanced | libs/frontend/chat/src/lib/settings/advanced/codex-sandbox-setting.component.ts:178 | radio | Codex sandbox mode | 1 loaded option | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "'radio radio-xs mt-0.5 ' + focusRing" | none (event binding + signal) |
| A4 | Advanced | libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:165 | secret input | Membership key | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "input input-bordered input-sm w-full pr-9 font-mono text-xs text-base-content" | template-driven (ngModel) |
| A5 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:215 | text input | Name | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full text-xs text-base-content" | none (event binding + signal) |
| A6 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:259 | text input | Description | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full text-xs text-base-content" | none (event binding + signal) |
| A7 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:293 | radio | Where to save it | 1 loaded option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-xs mt-0.5" | none (event binding + signal) |
| A8 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts:34 | toggle | Keep the default coding instructions | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "toggle toggle-xs toggle-primary" | none (event binding + signal) |
| A9 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts:100 | textarea | Output style instructions | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "textarea textarea-bordered w-full text-xs font-mono leading-relaxed text-base-content" | none (event binding + signal) |
| A10 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts:157 | radio | active-output-style | 1 loaded option | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "radio radio-xs radio-primary cursor-pointer disabled:cursor-not-allowed" | none (event binding + signal) |
| A11 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts:74 | checkbox | Write output style to Claude settings | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "checkbox checkbox-xs checkbox-primary mt-0.5" | none (event binding + signal) |
| A12 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts:102 | native select | Where to write it | 1 + loaded | search no; keyboard beyond native no; groups no; states none | DaisyUI "select select-bordered select-xs w-full max-w-xs text-base-content" | none (event binding + signal) |
| A13 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:133 | checkbox | Toggle Enhanced System Prompt | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A14 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:178 | popover | Chat reasoning effort | 6 static | search no; keyboard beyond native no; groups no; states disabled | ptah-native-popover (@ptah-extension/ui); "btn btn-ghost btn-xs gap-1 px-1.5 font-normal text-base-content" | none (event binding + signal) |
| A15 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:212 | checkbox | Toggle dynamic workflows | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A16 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:237 | checkbox | Toggle Ultracode mode | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A17 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:148 | checkbox | Claude builtin tool (tool.id) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A18 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:204 | checkbox | Claude terminal skill (skill.id) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A19 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:280 | checkbox | Claude builtin skill (skill.id) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A20 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:91 | number input | MCP server port | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "input input-bordered input-xs w-28 text-base-content" | template-driven (ngModel) |
| A21 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:136 | native select | External MCP callers | 2 static | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "select select-bordered select-xs mt-1 w-full max-w-xs text-base-content" | template-driven (ngModel) |
| A22 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:172 | checkbox | MCP namespace (ns.label) | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A23 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:199 | checkbox | Allow localhost access for browser tools | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A24 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/vscode-lm-config.component.ts:93 | native select | VS Code LM model | 1 + loaded | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "select select-bordered select-xs flex-1 min-w-0 max-w-[260px] text-xs truncate text-base-c" | template-driven (ngModel) |
| A25 | Providers | libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts:203 | text input | Account display name | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "'input input-bordered input-sm min-h-8 min-w-0 flex-1 text-sm text-base-content ' + focusR" | none (event binding + signal) |
| A26 | Providers | libs/frontend/chat/src/lib/settings/providers/accounts/add-account-form.component.ts:49 | text input | Account name | n/a | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "field" | none (event binding + signal) |
| A27 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:137 | text input | Instance name | n/a | search no; keyboard beyond native no; groups no; states none | ad-hoc Tailwind "field" | none (event binding + signal) |
| A28 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:190 | native select | CLI provider | 2 + loaded | search no; keyboard beyond native no; groups no; states none | DaisyUI "'select select-bordered select-sm min-w-0 flex-1 text-xs text-base-content ' + focusRing" | none (event binding + signal) |
| A29 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:282 | radio | Use saved Claude API key | 1 static option | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "" | none (event binding + signal) |
| A30 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:283 | radio | Use separate instance key | 1 static option | search no; keyboard beyond native no; groups no; states none | ad-hoc Tailwind "" | none (event binding + signal) |
| A31 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:295 | secret input | Instance API key | n/a | search no; keyboard beyond native no; groups no; states none | ad-hoc Tailwind "field + ' pr-9 font-mono'" | none (event binding + signal) |
| A32 | Providers | libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts:103 | text input | CLI tier model ID | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "'input input-bordered input-sm min-w-0 flex-1 font-mono text-xs ' + focusRing" | none (event binding + signal) |
| A33 | Providers | libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts:115 | combobox | CLI tier model suggestions | loaded | search yes; keyboard beyond native yes; groups no; states disabled | ptah-provider-model-search-field (@ptah-extension/ui) | none (event binding + signal) |
| A34 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:84 | text input | Base URL | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A35 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:88 | text input | Models endpoint | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A36 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:94 | secret input | API key for the check | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A37 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:114 | text input | Documentation URL | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm min-w-0 flex-1 text-xs" | none (event binding + signal) |
| A38 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:126 | number input | Input price per million tokens | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm mt-1 w-full font-mono text-xs" | none (event binding + signal) |
| A39 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:130 | number input | Output price per million tokens | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm mt-1 w-full font-mono text-xs" | none (event binding + signal) |
| A40 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:343 | secret input | New API key | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full pr-9 font-mono text-xs" | none (event binding + signal) |
| A41 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/models-tiers-tab.component.ts:87 | combobox | row.label + ' model' | loaded | search yes; keyboard beyond native yes; groups no; states disabled | ptah-provider-model-picker (@ptah-extension/ui) | none (event binding + signal) |
| A42 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.ts:66 | secret input | Decision model API key | n/a | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "inputClass" | none (event binding + signal) |
| A43 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.ts:27 | text input | Base URL | n/a | search no; keyboard beyond native no; groups no; states disabled, error | ad-hoc Tailwind "error() ? invalidInputClass : inputClass" | none (event binding + signal) |
| A44 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:141 | popover | Decision model assignment | loaded | search no; keyboard beyond native yes; groups no; states disabled, loading | ptah-native-popover (@ptah-extension/ui); "consumer-cell-popover block w-full min-w-0" | none (event binding + signal) |
| A45 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:215 | native select | Decision model kind | 1 + loaded | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "selectClass" | none (event binding + signal) |
| A46 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:258 | native select | Decision model provider | 2 + loaded | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "selectClass" | none (event binding + signal) |
| A47 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:300 | text input | Decision model ID | n/a | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "fieldError('model') ? invalidInputClass : inputClass" | none (event binding + signal) |
| A48 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.ts:83 | text input | Request timeout (seconds) | n/a | search no; keyboard beyond native no; groups no; states disabled, error | ad-hoc Tailwind "error() ? invalidInputClass : inputClass" | none (event binding + signal) |
| A49 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:120 | native select | Provider connection | 2 + loaded | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "select" | none (event binding + signal) |
| A50 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:168 | native select | Account | 1 + loaded | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "select" | none (event binding + signal) |
| A51 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:185 | text input | Main agent model ID | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "'input input-bordered input-sm min-w-0 flex-1 font-mono text-xs ' + focusRing" | none (event binding + signal) |
| A52 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:195 | combobox | Main agent model suggestions | loaded | search yes; keyboard beyond native yes; groups no; states disabled | ptah-provider-model-search-field (@ptah-extension/ui) | none (event binding + signal) |
| A53 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:214 | segmented | Main agent reasoning effort | 6 static | search no; keyboard beyond native no; groups no; states disabled | ad-hoc Tailwind "[class]=effortClass(level.value)" | none (event binding + signal) |
| A54 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:222 | native select | Save to | 1 + loaded | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "select" | none (event binding + signal) |
| A55 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-catalog-modal.component.ts:34 | text input | Search providers | n/a | search yes; keyboard beyond native no; groups no; states none | DaisyUI "'input input-sm flex-1 border-none bg-transparent text-sm text-base-content ' + focusRing" | none (event binding + signal) |
| A56 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:175 | popover | Consumer model assignment (row.name) | loaded | search yes; keyboard beyond native no; groups no; states disabled, loading | ptah-native-popover (@ptah-extension/ui); "consumer-cell-popover block w-full min-w-0" | none (event binding + signal) |
| A57 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:246 | combobox | row.name | loaded | search yes; keyboard beyond native yes; groups no; states disabled | ptah-provider-model-picker (@ptah-extension/ui) | none (event binding + signal) |
| A58 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:421 | number input | Enhancement time limit in seconds | n/a | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "'input input-bordered input-sm w-24 border-base-content-muted bg-base-100 text-sm text-bas" | none (event binding + signal) |
| A59 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:440 | text input | Search providers | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A60 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:456 | radio | Choose a provider | 1 loaded option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A61 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:493 | radio | Custom provider | 1 static option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A62 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:521 | text input | Custom connection name | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A63 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:545 | radio | OpenAI compatible protocol | 1 static option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A64 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:561 | radio | Anthropic compatible protocol | 1 static option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A65 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:672 | secret input | Provider API key | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A66 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:710 | other (credential mode button) | Use CLI sign-in | 2 static | search no; keyboard beyond native no; groups no; states none | DaisyUI "btn btn-link btn-sm" | none (event binding + signal) |
| A67 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:769 | other (credential mode button) | Use API key | 2 static | search no; keyboard beyond native no; groups no; states none | DaisyUI "btn btn-link btn-sm" | none (event binding + signal) |
| A68 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:828 | text input | Server URL (first setup path) | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A69 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:856 | secret input | Optional API key (first setup path) | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A70 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:891 | text input | Server URL (second setup path) | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A71 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:919 | secret input | Optional API key (second setup path) | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A72 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:954 | text input | Server URL (third setup path) | n/a | search no; keyboard beyond native no; groups no; states none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A73 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:981 | secret input | API key (third setup path) | n/a | search no; keyboard beyond native no; groups no; states error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-ba" | none (event binding + signal) |
| A74 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1181 | combobox | tier.label | loaded | search yes; keyboard beyond native yes; groups no; states none | ptah-provider-model-picker (@ptah-extension/ui) | none (event binding + signal) |
| A75 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1260 | radio | Connect only | 1 static option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A76 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1280 | radio | Use as main agent | 1 static option | search no; keyboard beyond native no; groups no; states none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A77 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1311 | radio | Save to | 1 loaded option | search no; keyboard beyond native no; groups no; states disabled | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A78 | Providers | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:127 | popover | Main agent reassignment | loaded | search yes; keyboard beyond native no; groups no; states disabled, loading | ptah-main-agent-reassign-popover (local component) | none (event binding + signal) |
| A79 | Providers | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:255 | text input | Filter connections | n/a | search yes; keyboard beyond native no; groups no; states none | DaisyUI "'input input-bordered input-sm w-52 border-base-content-muted bg-base-100 text-sm text-bas" | none (event binding + signal) |

## Counts per control kind

- checkbox: 9
- combobox: 5
- native select: 9
- number input: 4
- other (credential mode button): 2
- popover: 4
- radio: 12
- secret input: 9
- segmented: 1
- text input: 21
- textarea: 1
- toggle: 2

## Counts per styling source

- DaisyUI: 58
- ad-hoc Tailwind: 12
- ptah-main-agent-reassign-popover: 1
- ptah-native-popover: 3
- ptah-provider-model-picker: 3
- ptah-provider-model-search-field: 2

## Shared UI components already in use (component, import path, count)

- ptah-native-popover (@ptah-extension/ui): 3
- ptah-provider-model-picker (@ptah-extension/ui): 3
- ptah-provider-model-search-field (@ptah-extension/ui): 2

## Components with no form controls

- libs/frontend/chat/src/lib/settings/settings.component.ts
- libs/frontend/chat/src/lib/settings/advanced-settings.component.ts
- libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts
- libs/frontend/chat/src/lib/settings/feedback/settings-toast.component.ts
- libs/frontend/chat/src/lib/settings/output-style/output-style-config.component.ts
- libs/frontend/chat/src/lib/settings/output-style/output-style-notices.component.ts
- libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/accounts-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/ambient-account-row.component.ts
- libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-detail-drawer.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/codex-agent-behavior.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/codex-sign-in-block.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/kimi-code-login-progress.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/overview-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/main-agent-scope-badges.component.ts
- libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts
- libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts
- libs/frontend/chat/src/lib/settings/providers/setting-scope-row.component.ts

## Notes
- Rows count template control elements, including repeated elements inside loops.
- Disabled skeleton checkboxes in Claude builtins are placeholders and are excluded.
- The ptah-ai folder is outside Part A.
