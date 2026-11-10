# Settings forms inventory

Scope: Settings page of the Electron renderer, `libs/frontend/chat/src/lib/settings/**`.
Method: Each template control element has one row. A control inside `@for` has one row.
Date: 2026-11-10.
Total: 114 rows.

## Tab map

| Tab id | Label | Root component | File | Proof in settings.component.html |
|---|---|---|---|---|
| claude-auth | Providers | ProvidersSettingsComponent; AgentsRoutingSettingsComponent | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts; libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:109,171,179 |
| orchestration | Context Management | OrchestrationSettingsComponent | libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:223,227 |
| pro-features | Advanced | AdvancedSettingsComponent | libs/frontend/chat/src/lib/settings/advanced-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:238,242 |
| tools | Search & Voice | SearchVoiceSettingsComponent | libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:279,283 |

The tab array is in libs/frontend/chat/src/lib/settings/settings.component.ts:200-204. `providers` is an alias normalized to `claude-auth` in that component.

## Controls

| # | Tab | Component file:line | Control kind | Purpose (label) | Options | Behavior | Styling source | Forms API |
|---|---|---|---|---|---|---|---|---|
| A25 | Providers | libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts:203 | text input | Account display name | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "'input input-bordered input-sm min-h-8 min-w-0 flex-1 text-sm text-bas? | none (event binding + signal) |
| A26 | Providers | libs/frontend/chat/src/lib/settings/providers/accounts/add-account-form.component.ts:49 | text input | Account name | n/a | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "field" | none (event binding + signal) |
| A27 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:137 | text input | Instance name | n/a | search no; keyboard native; groups no; states: none | ad-hoc Tailwind "field" | none (event binding + signal) |
| A28 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:190 | native select | CLI provider | 2 + loaded | search no; keyboard native; groups no; states: none | DaisyUI "'select select-bordered select-sm min-w-0 flex-1 text-xs text-base-con? | none (event binding + signal) |
| A29 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:282 | radio | Use saved Claude API key | 1 static option | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "" | none (event binding + signal) |
| A30 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:283 | radio | Use separate instance key | 1 static option | search no; keyboard native; groups no; states: none | ad-hoc Tailwind "" | none (event binding + signal) |
| A31 | Providers | libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts:295 | secret input | Instance API key | n/a | search no; keyboard native; groups no; states: none | ad-hoc Tailwind "field + ' pr-9 font-mono'" | none (event binding + signal) |
| A32 | Providers | libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts:103 | text input | CLI tier model ID | n/a | search no; keyboard native; groups no; states: none | DaisyUI "'input input-bordered input-sm min-w-0 flex-1 font-mono text-xs ' + fo? | none (event binding + signal) |
| A33 | Providers | libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts:115 | combobox | CLI tier model suggestions | loaded | search yes; keyboard custom; groups no; states: disabled, loading | ptah-provider-model-search-field | none (event binding + signal) |
| A34 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:84 | text input | Base URL | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A35 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:88 | text input | Models endpoint | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A36 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:94 | secret input | API key for the check | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full font-mono text-xs" | none (event binding + signal) |
| A37 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:114 | text input | Documentation URL | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm min-w-0 flex-1 text-xs" | none (event binding + signal) |
| A38 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:126 | number input | Input price per million tokens | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm mt-1 w-full font-mono text-xs" | none (event binding + signal) |
| A39 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts:130 | number input | Output price per million tokens | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm mt-1 w-full font-mono text-xs" | none (event binding + signal) |
| A40 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts:343 | secret input | New API key | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full pr-9 font-mono text-xs" | none (event binding + signal) |
| A41 | Providers | libs/frontend/chat/src/lib/settings/providers/connection-drawer/models-tiers-tab.component.ts:87 | combobox | row.label + ' model' | loaded | search yes; keyboard custom; groups no; states: disabled | ptah-provider-model-picker | none (event binding + signal) |
| A42 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.ts:66 | secret input | Decision model API key | n/a | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "inputClass" | none (event binding + signal) |
| A43 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.ts:27 | text input | Base URL | n/a | search no; keyboard native; groups no; states: disabled, error | ad-hoc Tailwind "error() ? invalidInputClass : inputClass" | none (event binding + signal) |
| A44 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:141 | popover select | Decision model assignment | loaded | search no; keyboard custom; groups no; states: disabled, loading | ptah-native-popover | none (event binding + signal) |
| A45 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:215 | native select | Decision model kind | 1 + loaded | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "selectClass" | none (event binding + signal) |
| A46 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:258 | native select | Decision model provider | 2 + loaded | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "selectClass" | none (event binding + signal) |
| A47 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts:300 | text input | Decision model ID | n/a | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "fieldError('model') ? invalidInputClass : inputClass" | none (event binding + signal) |
| A48 | Providers | libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.ts:83 | text input | Request timeout (seconds) | n/a | search no; keyboard native; groups no; states: disabled, error | ad-hoc Tailwind "error() ? invalidInputClass : inputClass" | none (event binding + signal) |
| A49 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:120 | native select | Provider connection | 2 + loaded | search no; keyboard native; groups no; states: disabled | DaisyUI "select" | none (event binding + signal) |
| A50 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:168 | native select | Account | 1 + loaded | search no; keyboard native; groups no; states: disabled | DaisyUI "select" | none (event binding + signal) |
| A51 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:185 | text input | Main agent model ID | n/a | search no; keyboard native; groups no; states: none | DaisyUI "'input input-bordered input-sm min-w-0 flex-1 font-mono text-xs ' + fo? | none (event binding + signal) |
| A52 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:195 | combobox | Main agent model suggestions | loaded | search yes; keyboard custom; groups no; states: disabled, loading, error | ptah-provider-model-search-field | none (event binding + signal) |
| A53 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:214 | segmented | Main agent reasoning effort | 6 static | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "btn btn-sm w-full px-1 text-xs font-medium; btn-primary / btn-outline" | none (event binding + signal) |
| A54 | Providers | libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts:222 | native select | Save to | 1 + loaded | search no; keyboard native; groups no; states: disabled | DaisyUI "select" | none (event binding + signal) |
| A55 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-catalog-modal.component.ts:34 | text input | Search providers | n/a | search yes; keyboard native; groups no; states: none | DaisyUI "'input input-sm flex-1 border-none bg-transparent text-sm text-base-co? | none (event binding + signal) |
| A56 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:175 | popover select | Consumer model assignment (row.name) | loaded | search yes; keyboard native; groups no; states: disabled, loading | ptah-native-popover | none (event binding + signal) |
| A57 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:246 | combobox | row.name | loaded | search no; keyboard custom; groups no; states: disabled | ptah-provider-model-picker | none (event binding + signal) |
| A58 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:421 | number input | Enhancement time limit in seconds | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "'input input-bordered input-sm w-24 border-base-content-muted bg-base-? | none (event binding + signal) |
| A59 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:440 | text input | Search providers | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A60 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:456 | radio | Choose a provider | 1 loaded option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A61 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:493 | radio | Custom provider | 1 static option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A62 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:521 | text input | Custom connection name | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A63 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:545 | radio | OpenAI compatible protocol | 1 static option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A64 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:561 | radio | Anthropic compatible protocol | 1 static option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A65 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:672 | secret input | Provider API key | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A66 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:710 | other | Use CLI sign-in | 2 static | search no; keyboard native; groups no; states: none | DaisyUI "btn btn-link btn-sm" | none (event binding + signal) |
| A67 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:769 | other | Use API key | 2 static | search no; keyboard native; groups no; states: none | DaisyUI "btn btn-link btn-sm" | none (event binding + signal) |
| A68 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:828 | text input | Server URL (first setup path) | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A69 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:856 | secret input | Optional API key (first setup path) | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A70 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:891 | text input | Server URL (second setup path) | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A71 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:919 | secret input | Optional API key (second setup path) | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A72 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:954 | text input | Server URL (third setup path) | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A73 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:981 | secret input | API key (third setup path) | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full min-h-9 border-base-content-muted? | none (event binding + signal) |
| A74 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1181 | combobox | tier.label | loaded | search no; keyboard custom; groups no; states: none | ptah-provider-model-picker (@ptah-extension/ui) | none (event binding + signal) |
| A75 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1260 | radio | Connect only | 1 static option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A76 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1280 | radio | Use as main agent | 1 static option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A77 | Providers | libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1311 | radio | Save to | 1 loaded option | search no; keyboard native; groups no; states: disabled | DaisyUI "radio radio-sm mt-0.5" | none (event binding + signal) |
| A78 | Providers | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:127 | popover select | Main agent reassignment | loaded | search yes; keyboard native; groups no; states: disabled, loading | ptah-main-agent-reassign-popover (local component) | none (event binding + signal) |
| A79 | Providers | libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:255 | text input | Filter connections | n/a | search yes; keyboard native; groups no; states: none | DaisyUI "'input input-bordered input-sm w-52 border-base-content-muted bg-base-? | none (event binding + signal) |
| B1 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:98 | number input | Max concurrent agents | n/a | search no; keyboard native; groups no; states: disabled | input input-bordered | none (event binding + signal) |
| B2 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:192 | other | Agent order | loaded | search no; keyboard native; groups no; states: disabled, loading, empty | ptah-native-popover | none (event binding + signal) |
| B4 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts:75 | custom menu | Claude account | loaded | search no; keyboard custom; groups no; states: disabled | ptah-native-popover | none (event binding + signal) |
| B5 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:34 | native select | CLI permission default | loaded | search no; keyboard native; groups no; states: disabled | select select-bordered | none (event binding + signal) |
| B6 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:47 | native select | CLI network default | loaded | search no; keyboard native; groups no; states: disabled | select select-bordered | none (event binding + signal) |
| B7 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:181 | combobox | System CLI model | loaded | search yes; keyboard custom; groups no; states: disabled, loading, error | ptah-provider-model-search-field | none (event binding + signal) |
| B8 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:214 | segmented | System CLI effort | 6 or 9 static (CLI/Pi) | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "btn btn-xs min-h-7 font-medium; btn-primary / btn-outline" | none (event binding + signal) |
| B9 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:246 | segmented | Instance CLI effort | 6 static | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "btn btn-xs min-h-7 font-medium; btn-primary / btn-outline" | none (event binding + signal) |
| B10 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:261 | combobox | Instance CLI model | loaded | search yes; keyboard custom; groups no; states: disabled, loading | ptah-provider-model-picker | none (event binding + signal) |
| B3 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts:37 | checkbox | CLI enabled | 2 static | search no; keyboard native; groups no; states: disabled | checkbox checkbox-primary | none (event binding + signal) |
| B11 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/copilot-auto-approve-toggle.component.ts:38 | toggle | Copilot auto approve | 2 static | search no; keyboard native; groups no; states: disabled | toggle toggle-xs toggle-success | none (event binding + signal) |
| B12 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts:124 | secret input | Cursor API key | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B13 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts:136 | checkbox | CLI instance enabled | 2 static | search no; keyboard native; groups no; states: disabled | checkbox checkbox-primary checkbox-sm | none (event binding + signal) |
| B19 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.ts:67 | toggle | Host routing | 2 static | search no; keyboard native; groups no; states: disabled | toggle toggle-xs toggle-success | none (event binding + signal) |
| B18 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts:111 | text input | Lane guard threshold (repeated) | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B20 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts:60 | toggle | Lane rotation | 2 static | search no; keyboard native; groups no; states: disabled | toggle toggle-xs toggle-success | none (event binding + signal) |
| B15 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:233 | toggle | Session budget boolean setting, repeated | 2 static | search no; keyboard native; groups no; states: disabled | toggle toggle-sm toggle-primary | none (event binding + signal) |
| B16 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:258 | native select | Session budget unit | 2 static | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| B17 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:295 | text input | Session budget numeric value (repeated) | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B14 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts:64 | native select | Subagent prompt cache TTL | 4 static | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| A1 | Advanced | libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:154 | toggle | Advanced setting (setting.label) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "'toggle toggle-sm toggle-primary ' + focusRing" | none (event binding + signal) |
| A2 | Advanced | libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:190 | text input | Advanced numeric setting (setting.label) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "'input input-bordered input-sm join-item min-w-0 flex-1 text-right tex? | none (event binding + signal) |
| A3 | Advanced | libs/frontend/chat/src/lib/settings/advanced/codex-sandbox-setting.component.ts:178 | radio | Codex sandbox mode | 1 loaded option | search no; keyboard native; groups no; states: disabled | DaisyUI "'radio radio-xs mt-0.5 ' + focusRing" | none (event binding + signal) |
| A4 | Advanced | libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:165 | secret input | Membership key | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "input input-bordered input-sm w-full pr-9 font-mono text-xs text-base-? | template-driven (ngModel) |
| A5 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:215 | text input | Name | n/a | search no; keyboard native; groups no; states: error | DaisyUI "input input-bordered input-sm w-full text-xs text-base-content" | none (event binding + signal) |
| A6 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:259 | text input | Description | n/a | search no; keyboard native; groups no; states: none | DaisyUI "input input-bordered input-sm w-full text-xs text-base-content" | none (event binding + signal) |
| A7 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:293 | radio | Where to save it | 1 loaded option | search no; keyboard native; groups no; states: none | DaisyUI "radio radio-xs mt-0.5" | none (event binding + signal) |
| A8 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts:34 | toggle | Keep the default coding instructions | n/a | search no; keyboard native; groups no; states: none | DaisyUI "toggle toggle-xs toggle-primary" | none (event binding + signal) |
| A9 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts:100 | textarea | Output style instructions | n/a | search no; keyboard native; groups no; states: none | DaisyUI "textarea textarea-bordered w-full text-xs font-mono leading-relaxed te? | none (event binding + signal) |
| A10 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts:157 | radio | active-output-style | 1 loaded option | search no; keyboard native; groups no; states: disabled | DaisyUI "radio radio-xs radio-primary cursor-pointer disabled:cursor-not-allowe? | none (event binding + signal) |
| A11 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts:74 | checkbox | Write output style to Claude settings | n/a | search no; keyboard native; groups no; states: none | DaisyUI "checkbox checkbox-xs checkbox-primary mt-0.5" | none (event binding + signal) |
| A12 | Advanced | libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts:102 | native select | Where to write it | 1 + loaded | search no; keyboard native; groups no; states: none | DaisyUI "select select-bordered select-xs w-full max-w-xs text-base-content" | none (event binding + signal) |
| A13 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:133 | checkbox | Toggle Enhanced System Prompt | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A14 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:178 | popover select | Chat reasoning effort | 6 static | search no; keyboard native; groups no; states: disabled | ptah-native-popover | none (event binding + signal) |
| A15 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:212 | checkbox | Toggle dynamic workflows | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A16 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:237 | checkbox | Toggle Ultracode mode | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A17 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:148 | checkbox | Claude builtin tool (tool.id) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A18 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:204 | checkbox | Claude terminal skill (skill.id) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A19 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:280 | checkbox | Claude builtin skill (skill.id) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A20 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:91 | number input | MCP server port | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "input input-bordered input-xs w-28 text-base-content" | template-driven (ngModel) |
| A21 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:136 | native select | External MCP callers | 2 static | search no; keyboard native; groups no; states: disabled | DaisyUI "select select-bordered select-xs mt-1 w-full max-w-xs text-base-conten? | template-driven (ngModel) |
| A22 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:172 | checkbox | MCP namespace (ns.label) | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A23 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:199 | checkbox | Allow localhost access for browser tools | n/a | search no; keyboard native; groups no; states: disabled | DaisyUI "checkbox checkbox-xs checkbox-primary" | none (event binding + signal) |
| A24 | Advanced | libs/frontend/chat/src/lib/settings/pro-features/vscode-lm-config.component.ts:93 | native select | VS Code LM model | 1 + loaded | search no; keyboard native; groups no; states: disabled | DaisyUI "select select-bordered select-xs flex-1 min-w-0 max-w-[260px] text-xs ? | template-driven (ngModel) |
| B26 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:234 | secret input | ElevenLabs API key | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B27 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:385 | text input | Custom ElevenLabs voice ID | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B28 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:409 | native select | ElevenLabs voice | loaded | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| B29 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:441 | native select | ElevenLabs parameter, repeated | loaded | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| B24 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts:181 | toggle | Go vet consent | 2 static | search no; keyboard native; groups no; states: disabled | toggle toggle-sm toggle-primary | none (event binding + signal) |
| B30 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:89 | radio | Local STT model source | 3 static | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "btn btn-xs flex-1" | none (event binding + signal) |
| B31 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:114 | native select | Whisper model | 9 static | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| B32 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:146 | text input | Custom STT model ID or folder | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B33 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:112 | radio | Local TTS model source | 3 static | search no; keyboard native; groups no; states: disabled | ad-hoc Tailwind "btn btn-xs flex-1" | none (event binding + signal) |
| B34 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:141 | text input | Custom TTS model ID or folder | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B35 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:204 | native select | Local TTS voice | loaded | search no; keyboard native; groups no; states: disabled | select select-bordered select-sm | none (event binding + signal) |
| B25 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts:138 | popover select | Voice provider by direction | loaded | search no; keyboard native; groups no; states: disabled, loading, error | ptah-native-popover | none (event binding + signal) |
| B21 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:163 | checkbox | Web search provider, repeated | 2 static | search no; keyboard native; groups no; states: disabled | checkbox checkbox-xs checkbox-primary | none (event binding + signal) |
| B22 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:215 | secret input | Provider API key, repeated | n/a | search no; keyboard native; groups no; states: disabled, error | input input-bordered input-sm | none (event binding + signal) |
| B23 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:286 | slider | Maximum search results | 20 static | search no; keyboard native; groups no; states: disabled | range range-xs range-primary | none (event binding + signal) |

## Corrections made in the merge

- `providers` in Part B was corrected to the active tab ID `claude-auth`.
- B2: The agent order popover changes sequence with move buttons. Kind is `other`; its panel handles loading and empty states.
- B4: The Claude account selector is a menu with `menuitemradio` options and custom keyboard handling.
- B17 and B18: Both are `type="text"` with numeric input modes. They remain text inputs.
- B14: Cache TTL has three configured choices and an Unknown option, four static options total.
- B31: Whisper has nine static choices across English and multilingual groups.
- B16: Session budget unit has two static choices: tokens and cost.
- A14 and A53: Each effort selector has six static choices.
- B23: The range has 20 discrete values, from 1 through 20.
- B30 and B33: Each source group has three static choices.
- B8 and B9: System CLI effort has six or nine static choices by CLI; instance effort has six static choices.
- A33, A52, B7: Model search fields have loading states; A52 and B7 also show load errors.
- A57 and A74: The shared picker defaults to `searchable=false`; these instances do not enable search.
- A44 and A56: Their enclosing cells render loading branches.
- B25: Voice provider choices use a radio list inside a popover. The panel has loading and error states.
- B2, B4, B25: The source line points to the trigger button. Their wrapper starts earlier in the same template.
- All behavior values use the requested keyboard and state vocabulary. All popover selectors use `popover select`.

## Counts per control kind

| Kind | Rows |
|---|---:|
| checkbox | 12 |
| combobox | 7 |
| custom menu | 1 |
| native select | 17 |
| number input | 5 |
| other | 3 |
| popover select | 5 |
| radio | 14 |
| secret input | 12 |
| segmented | 3 |
| slider | 1 |
| text input | 26 |
| textarea | 1 |
| toggle | 7 |
| **Total** | **114** |

## Counts per tab

| Tab | Rows |
|---|---:|
| Providers | 68 |
| Context Management | 7 |
| Advanced | 24 |
| Search & Voice | 15 |
| **Total** | **114** |

## Counts per forms API

| Forms API | Rows |
|---|---:|
| none (event binding + signal) | 110 |
| template-driven (ngModel) | 4 |
| **Total** | **114** |

## Counts per styling source

| Styling group | Rows |
|---|---:|
| DaisyUI checkbox md | 1 |
| DaisyUI checkbox sm | 1 |
| DaisyUI checkbox xs | 10 |
| DaisyUI input md | 1 |
| DaisyUI input sm | 34 |
| DaisyUI input xs | 1 |
| DaisyUI radio | 10 |
| DaisyUI range | 1 |
| DaisyUI select md | 5 |
| DaisyUI select sm | 7 |
| DaisyUI select xs | 3 |
| DaisyUI toggle sm with color | 3 |
| DaisyUI toggle xs with color | 4 |
| ad-hoc Tailwind | 16 |
| other | 3 |
| shared ptah-native-popover | 6 |
| shared ptah-provider-model-picker | 4 |
| shared ptah-provider-model-search-field | 3 |
| textarea | 1 |
| **Total** | **114** |

## Controls per file

| File | Tab | Rows | Kinds |
|---|---|---:|---|
| libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts | Providers | 19 | combobox, other, radio, secret input, text input |
| libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts | Providers | 6 | number input, secret input, text input |
| libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.ts | Providers | 6 | combobox, native select, segmented, text input |
| libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts | Providers | 5 | native select, radio, secret input, text input |
| libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts | Advanced | 4 | checkbox, popover select |
| libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts | Advanced | 4 | checkbox, native select, number input |
| libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts | Providers | 4 | native select, popover select, text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts | Providers | 4 | combobox, segmented |
| libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts | Search & Voice | 4 | native select, secret input, text input |
| libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts | Advanced | 3 | radio, text input |
| libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts | Advanced | 3 | checkbox |
| libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts | Providers | 3 | combobox, number input, popover select |
| libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts | Search & Voice | 3 | native select, radio, text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts | Search & Voice | 3 | native select, radio, text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts | Context Management | 3 | native select, text input, toggle |
| libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts | Search & Voice | 3 | checkbox, secret input, slider |
| libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts | Advanced | 2 | text input, toggle |
| libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts | Advanced | 2 | textarea, toggle |
| libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts | Advanced | 2 | checkbox, native select |
| libs/frontend/chat/src/lib/settings/providers/cli-tier-mapping-modal.component.ts | Providers | 2 | combobox, text input |
| libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts | Providers | 2 | popover select, text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts | Providers | 2 | number input, other |
| libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts | Providers | 2 | native select |
| libs/frontend/chat/src/lib/settings/advanced/codex-sandbox-setting.component.ts | Advanced | 1 | radio |
| libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts | Advanced | 1 | secret input |
| libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts | Advanced | 1 | radio |
| libs/frontend/chat/src/lib/settings/pro-features/vscode-lm-config.component.ts | Advanced | 1 | native select |
| libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts | Providers | 1 | text input |
| libs/frontend/chat/src/lib/settings/providers/accounts/add-account-form.component.ts | Providers | 1 | text input |
| libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts | Providers | 1 | secret input |
| libs/frontend/chat/src/lib/settings/providers/connection-drawer/models-tiers-tab.component.ts | Providers | 1 | combobox |
| libs/frontend/chat/src/lib/settings/providers/decision-model-key-field.component.ts | Providers | 1 | secret input |
| libs/frontend/chat/src/lib/settings/providers/decision-model-row.base-url-field.component.ts | Providers | 1 | text input |
| libs/frontend/chat/src/lib/settings/providers/decision-model-row.timeout-field.component.ts | Providers | 1 | text input |
| libs/frontend/chat/src/lib/settings/providers/provider-catalog-modal.component.ts | Providers | 1 | text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts | Providers | 1 | custom menu |
| libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts | Providers | 1 | checkbox |
| libs/frontend/chat/src/lib/settings/ptah-ai/copilot-auto-approve-toggle.component.ts | Providers | 1 | toggle |
| libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts | Providers | 1 | secret input |
| libs/frontend/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts | Search & Voice | 1 | toggle |
| libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.ts | Context Management | 1 | toggle |
| libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts | Context Management | 1 | text input |
| libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts | Context Management | 1 | toggle |
| libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts | Providers | 1 | checkbox |
| libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts | Context Management | 1 | native select |
| libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts | Search & Voice | 1 | popover select |

## Ranked duplication list

The patterns can overlap. Rank uses the number of matching rows.

| Rank | Pattern | Rows | Row IDs | Differences between copies | Existing polished source |
|---:|---|---:|---|---|---|
| 1 | Repeated label, hint and error markup | 44 | A25, A26, A27, A31, A32, A34, A35, A36, A37, A38, A39, A40, A42, A43, A47, A48, A51, A55, A58, A59, A62, A65, A68, A69, A70, A71, A72, A73, A79, B1, B12, B18, B17, A2, A4, A5, A6, A9, A20, B26, B27, B32, B34, B22 | label and hint placement, error text, focus ring | Label, hint, warning and error markup of libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts; setup shell of libs/frontend/setup-wizard/src/lib/components/generation-model-picker.component.ts. Not extracted yet. |
| 2 | Plain text input with label and hint | 26 | A25, A26, A27, A32, A34, A35, A37, A43, A47, A48, A51, A55, A59, A62, A68, A70, A72, A79, B18, B17, A2, A5, A6, B27, B32, B34 | size, focus ring, label, hint, error markup, disabled handling | Text input frame of libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts |
| 3 | Boolean as toggle or checkbox | 19 | B3, B11, B13, B19, B20, B15, A1, A8, A11, A13, A15, A16, A17, A18, A19, A22, A23, B24, B21 | xs/sm/default size, primary/success color, hint and disabled handling | Toggle and checkbox of libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts (`toggle toggle-primary toggle-sm`, `checkbox checkbox-xs checkbox-primary`) |
| 4 | Native select in several sizes | 17 | A28, A45, A46, A49, A50, A54, B5, B6, B16, B14, A12, A21, A24, B28, B29, B31, B35 | xs/sm/default size, focus ring, label, loading and disabled handling | Native select frame of libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts; class skin libs/frontend/ui/src/lib/extracted/setup-field/setup-field.directive.ts; rich panel of libs/frontend/ui/src/lib/native/autocomplete/native-autocomplete.component.ts |
| 5 | Radio card or source group | 14 | A29, A30, A60, A61, A63, A64, A75, A76, A77, A3, A7, A10, B30, B33 | card markup, label, selected style, disabled handling | Radio of libs/frontend/chat-ui/src/lib/molecules/setup-plugins/install-scope-field.component.ts (`radio radio-xs radio-primary`) |
| 6 | Secret or API key input | 12 | A31, A36, A40, A42, A65, A69, A71, A73, B12, A4, B26, B22 | show/hide control, save action, error hint, size, disabled handling | Text input frame of libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts. No polished secret field exists. |
| 7 | Numeric field as text or number input | 8 | A38, A39, A58, B1, B18, B17, A2, A20 | type, inputmode, step, error markup, unit hint | Text input frame of libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts. No polished number field exists. |
| 8 | Shared model picker and search field | 7 | A33, A41, A52, A57, A74, B7, B10 | fixed provider, default option, search behavior, loading and error states | libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts |
| 9 | Popover or custom menu selector | 6 | A44, A56, A78, B4, A14, B25 | dialog versus menu role, focus ring, search, empty and loading states | Panel of libs/frontend/ui/src/lib/native/autocomplete/native-autocomplete.component.ts, option row of libs/frontend/ui/src/lib/native/option/native-option.component.ts, top layer of libs/frontend/ui/src/lib/native/dropdown/native-dropdown.component.ts |
| 10 | Effort segmented control | 4 | A53, B8, B9, A14 | choice count, focus ring, disabled handling, button size | None confirmed. The plan (batch 0) must confirm the chat effort selector as the source. |

Candidate check: All named patterns occur in the merged rows. The shared model picker is already used. The autocomplete and dropdown sources exist, but no direct Settings use appears in these rows.

## Shared UI components already in use

| Component selector | Import path | Rows |
|---|---|---:|
| ptah-native-popover | `@ptah-extension/ui` | 6 |
| ptah-provider-model-picker | `@ptah-extension/ui` | 4 |
| ptah-provider-model-search-field | `@ptah-extension/ui` | 3 |

## Components with no form controls

- libs/frontend/chat/src/lib/settings/advanced-settings.component.ts
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
- libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-cells.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-detail.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card-popovers.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-grid.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-shared-defaults.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/voice-details-drawer.component.ts
- libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts
- libs/frontend/chat/src/lib/settings/settings.component.ts

## Not covered

- None of the scoped component templates were omitted from the two input inventories. This merge did not expand controls inside shared UI components.

## Notes

- Tab IDs come from the Settings tab array and the active tab conditions in the source.
- Styling groups use the literal class excerpt or shared component selector in each control row.
- Source spot checks covered every combobox, popover, custom menu, and segmented row, plus B17 and B18.
- No source files were edited.
- No rows from the two parts point to the same source element.
