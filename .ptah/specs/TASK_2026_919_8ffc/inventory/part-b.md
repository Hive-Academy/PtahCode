# Settings forms inventory, part B
## Tab map

| Tab id/label | Component | File | Proof that it renders in Settings |
|---|---|---|---|
| providers / Providers | AgentsRoutingSettingsComponent | libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:179; CLI matrix at providers/agents-routing-settings.component.ts:63 |
| orchestration / Context Management | OrchestrationSettingsComponent | libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:227 |
| tools / Search & Voice | SearchVoiceSettingsComponent | libs/frontend/chat/src/lib/settings/search-voice-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:283; children at search-voice-settings.component.ts:20-24 |
| pro-features / Advanced | AdvancedSettingsComponent | libs/frontend/chat/src/lib/settings/advanced-settings.component.ts | libs/frontend/chat/src/lib/settings/settings.component.html:242; child folder excluded |

## Controls

| # | Tab | Component file:line | Control kind | Purpose (label) | Options | Behavior | Styling source | Forms API |
|---|---|---|---|---|---|---|---|---|
| B1 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:98 | number input | Max concurrent agents | n/a | search no; keyboard native; groups no; disabled | `input input-bordered` | none (event binding + signal) |
| B2 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:192 | popover | Agent order | loaded | search no; keyboard yes; groups no; disabled | `ptah-native-popover` | none (event binding + signal) |
| B3 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts:37 | checkbox | CLI enabled | 2 static | search no; keyboard native; groups no; disabled | `checkbox checkbox-primary` | none (event binding + signal) |
| B4 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts:75 | custom menu | Claude account | loaded | search no; keyboard yes; groups no; disabled | `ptah-native-popover` | none (event binding + signal) |
| B5 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:34 | native select | CLI permission default | loaded | search no; keyboard native; groups no; disabled | `select select-bordered` | none (event binding + signal) |
| B6 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:47 | native select | CLI network default | loaded | search no; keyboard native; groups no; disabled | `select select-bordered` | none (event binding + signal) |
| B7 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:181 | combobox | System CLI model | loaded | search yes; keyboard yes; groups no; disabled | `ptah-provider-model-search-field` | none (event binding + signal) |
| B8 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:214 | segmented | System CLI effort | loaded | search no; keyboard no; groups no; disabled | `effortClass(option.value)` | none (event binding + signal) |
| B9 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:246 | segmented | Instance CLI effort | loaded | search no; keyboard no; groups no; disabled | `effortClass(option.value)` | none (event binding + signal) |
| B10 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts:261 | combobox | Instance CLI model | loaded | search yes; keyboard yes; groups no; disabled | `ptah-provider-model-picker` | none (event binding + signal) |
| B11 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/copilot-auto-approve-toggle.component.ts:38 | toggle | Copilot auto approve | 2 static | search no; keyboard native; groups no; disabled | `toggle toggle-xs toggle-success` | none (event binding + signal) |
| B12 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts:124 | secret input | Cursor API key | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B13 | Providers | libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts:136 | checkbox | CLI instance enabled | 2 static | search no; keyboard native; groups no; disabled | `checkbox checkbox-primary checkbox-sm` | none (event binding + signal) |
| B14 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/subagent-cache-ttl-setting.component.ts:64 | native select | Subagent prompt cache TTL | static | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |
| B15 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:233 | toggle | Session budget boolean setting, repeated | 2 static | search no; keyboard native; groups no; disabled | `toggle toggle-sm toggle-primary` | none (event binding + signal) |
| B16 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:258 | native select | Session budget unit | static | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |
| B17 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:295 | text input | Session budget numeric field, repeated | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B18 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts:111 | text input | Lane guard numeric threshold, repeated | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B19 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/host-routing-setting.component.ts:67 | toggle | Host routing | 2 static | search no; keyboard native; groups no; disabled | `toggle toggle-xs toggle-success` | none (event binding + signal) |
| B20 | Context Management | libs/frontend/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts:60 | toggle | Lane rotation | 2 static | search no; keyboard native; groups no; disabled | `toggle toggle-xs toggle-success` | none (event binding + signal) |
| B21 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:163 | checkbox | Web search provider, repeated | 2 static | search no; keyboard native; groups no; disabled | `checkbox checkbox-xs checkbox-primary` | none (event binding + signal) |
| B22 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:215 | secret input | Provider API key, repeated | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B23 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:286 | slider | Maximum search results | 20 static | search no; keyboard native; groups no; disabled | `range range-xs range-primary` | none (event binding + signal) |
| B24 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts:181 | toggle | Go vet consent | 2 static | search no; keyboard native; groups no; disabled | `toggle toggle-sm toggle-primary` | none (event binding + signal) |
| B25 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts:138 | popover | Voice provider by direction | loaded | search no; keyboard yes; groups no; disabled | `ptah-native-popover` | none (event binding + signal) |
| B26 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:234 | secret input | ElevenLabs API key | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B27 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:385 | text input | Custom ElevenLabs voice ID | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B28 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:409 | native select | ElevenLabs voice | loaded | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |
| B29 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:441 | native select | ElevenLabs parameter, repeated | loaded | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |
| B30 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:89 | radio | Local STT model source | 3 static | search no; keyboard no; groups no; disabled | `ad-hoc Tailwind` | none (event binding + signal) |
| B31 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:114 | native select | Whisper model | static | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |
| B32 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:146 | text input | Custom STT model ID or folder | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B33 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:112 | radio | Local TTS model source | 3 static | search no; keyboard no; groups no; disabled | `ad-hoc Tailwind` | none (event binding + signal) |
| B34 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:141 | text input | Custom TTS model ID or folder | n/a | search no; keyboard native; groups no; disabled, error | `input input-bordered input-sm` | none (event binding + signal) |
| B35 | Search & Voice | libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:204 | native select | Local TTS voice | loaded | search no; keyboard native; groups no; disabled | `select select-bordered select-sm` | none (event binding + signal) |

## Counts per control kind

| Kind | Rows |
|---|---:|
| number input | 1 |
| popover | 2 |
| checkbox | 3 |
| custom menu | 1 |
| native select | 8 |
| combobox | 2 |
| segmented | 2 |
| toggle | 5 |
| secret input | 3 |
| text input | 5 |
| slider | 1 |
| radio | 2 |
| **Total** | **35** |

## Counts per styling source

| Source | Rows |
|---|---:|
| `input input-bordered` | 1 |
| `ptah-native-popover` | 3 |
| `checkbox checkbox-primary` | 1 |
| `select select-bordered` | 2 |
| `ptah-provider-model-search-field` | 1 |
| `effortClass(option.value)` | 2 |
| `ptah-provider-model-picker` | 1 |
| `toggle toggle-xs toggle-success` | 3 |
| `input input-bordered input-sm` | 8 |
| `checkbox checkbox-primary checkbox-sm` | 1 |
| `select select-bordered select-sm` | 6 |
| `toggle toggle-sm toggle-primary` | 2 |
| `checkbox checkbox-xs checkbox-primary` | 1 |
| `range range-xs range-primary` | 1 |
| `ad-hoc Tailwind` | 2 |
| **Total** | **35** |

## Shared UI components already in use (component, import path, count)

| Component | Import path | Count |
|---|---|---:|
| NativePopoverComponent | `@ptah-extension/ui` | 3 |
| ProviderModelSearchFieldComponent | `@ptah-extension/ui` | 1 |
| ProviderModelPickerComponent | `@ptah-extension/ui` | 1 |

## Components with no form controls

`capability-matrix-setting.component.ts`, `cli-capability-cells.component.ts`, `cli-capability-detail.component.ts`, `cli-orchestration-matrix.component.ts`, `cli-provider-card-popovers.component.ts`, `cli-provider-grid.component.ts`, `cli-shared-defaults.component.ts`, `orchestration-settings.component.ts`, `voice-details-drawer.component.ts`.

## Notes

- Repeated `@for` controls have one row per template control element.
- The CLI matrix renders through the Providers tab at `providers/agents-routing-settings.component.ts:63`.
- No external frontend-library component was confirmed directly in the Settings page template.
- Advanced settings, providers and root settings files were excluded per scope.

