## Summary

- UR1 (user-requested): phase 4 generates reviewed bot drafts beside wizard skills; phase 1 reserves wizard-generated provenance/source.
- UR2 (user-requested): phase 2b adds main-agent invocation and bot identity in the existing lane UI; no phase 1 execution.
- UR3 (user-requested): phase 1 stores/edits default, explicit main-provider/model or CLI-lane runtime.
- UR4 (user-requested): phase 2b reuses plain-lane lifecycle, controls, completion and policy enforcement.
- UR5 (user-requested): phase 1 adds optional icon/image avatars, bounded opaque image storage and editable RPC fields.
- Updated only implementation-plan.md, the requested Phases addition in bots-definition.md, and this document. No tests or application commands run.
- Phase assignments adopt the coordinator proposal for planning; they are not a claim of user approval of phase numbers.

## UR3 - provider runtime (phase 1 change)

Existing identity has several namespaces. Main chat auth resolves authMethod and a provider id, with direct Anthropic for apiKey/claudeCli and a selected third-party id otherwise (`libs/backend/auth-providers/src/lib/auth/active-provider-resolver.ts:154`). Its path-scoped resolver handles a specified workspace (`:87`); its credential-aware default honors configured settings before applying fallback (`:112`). The settings default auth method is claudeCli (`libs/backend/settings-core/src/schema/auth-schema.ts:12`). DEFAULT_PROVIDER_ID is openrouter for the third-party fallback, not a universal bot default (`libs/shared/src/lib/providers/provider-registry.ts:435`).

ModelSettings reads `provider.<active auth key>.selectedModel` dynamically; empty means provider default (`libs/backend/settings-core/src/repositories/model-settings.ts:16`, `:33`). The auth key normalizes auth method and uses scoped provider settings (`libs/backend/settings-core/src/repositories/active-provider-auth-key.ts:27`). ProviderModelsService has provider-id keyed catalogs/tier config (`libs/backend/auth-providers/src/lib/provider-models.service.ts:159`, `:176`). The low-level adapter ProviderId enum is a separate namespace (`libs/shared/src/lib/types/ai-provider.types.ts:31`); do not store it as though it identified a selected provider connection.

System CLI values derive from SYSTEM_CLI_TYPES; ptah-cli is deliberately separate (`libs/shared/src/lib/types/agent-process.types.ts:86`, `:92`, `:103`). Spawn accepts raw model, ptahCliId and opus/sonnet/haiku modelTier (`:435`, `:458`, `:463`); the MCP schema restricts cli to system CLIs (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/agent-spawn-args.schema.ts:80`). The registry prefers raw model, then configured selectedModel, then tier mapping (`libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry.ts:885`). Routing also identifies lanes by cli or ptahCliId (`libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts:75`).

Plan change: BotRuntimeSchema is a strict union on kind:

- default: stores only `{kind:'default'}`. New bots follow the effective default for the run workspace. Phase 2b resolves provider and selected/default model at start, never creation.
- main: `{kind:'main', providerId, model, effort?}` with an explicit catalog/connection id and model. No credentials or account binding.
- lane: `{kind:'lane', target, model?, modelTier?, effort?}`; target is system/cli or ptah-cli/ptahCliId. Both target kinds are exclusive. Preserve the lane's own model precedence when optional fields are omitted.

Unknown providers/models, removed ptah-cli entries, uninstalled system CLIs and capability mismatches remain saved and visible as unresolved diagnostics. Syntax errors, mixed-kind fields and paths in identity fields fail validation. Catalog failure cannot silently rewrite a choice. Phase 2b must refuse unresolved required runtime before starting; phase 1 never executes.

Existing choice RPCs cover agent:detectClis and agent:listCliModels (`libs/shared/src/lib/types/rpc.types.ts:1903`, `:1950`); configured Ptah CLI list/model methods are registered in `libs/backend/rpc-handlers/src/lib/handlers/ptah-cli-rpc.handlers.ts:63`. U03 can reuse these without spawning.

The picker exposes provider/model strings with inherit sentinels and optional extra provider identities (`libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:79`, `:88`, `:432`). It does not supply the BotRuntime discriminant or lane target schema. U05 therefore adds Default/Main provider/CLI lane selection inside the existing Runtime section, reuses the picker for main, and uses explicit lane target/model/tier controls. No screen is added. Existing design places provider/model and effort together (`design-spec.md:93`).

Schema 2 is unshipped planning, so revise it in place. The labeled schema-1 compatibility fixture keeps the definition's legacy `{providerId,modelId,effort?}` shape and migrates it to explicit main. Never convert legacy explicit choices to follow-default. Existing snapshots remain immutable.

## UR2 and UR4 - bots as lanes in the main agent

Existing spawn validates AgentSpawnArgsSchema in the stdio dispatcher (`libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/agent-tool.dispatcher.ts:450`). The execute-code namespace has a separate Ptah CLI branch forwarding modelTier to registry.spawnAgent (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts:532`, `:586`, `:593`). The system runtime tracks spawns in AgentProcessManager.spawn (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:559`) and emits agent:spawned (`:1908`). Completion uses signalLaneCompletion and laneCompletion.signal (`:4030`, `:4078`). This was a bounded search/read, not a full read of the large manager.

The wiring broadcasts AGENT_MONITOR_SPAWNED, OUTPUT and EXITED (`libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts:330`, `:362`, `:420`). Its persisted session reference includes agent id, model, lifecycle, policy, ptah-cli name and provider (`:748`, `:778`). AgentMonitorStore consumes spawn/output/exit (`libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts:1508`, `:1701`, `:1847`) and preserves displayName/ptahCliName and providerId (`:1535`, `:1600`). The monitor panel composes AgentCard, SubagentLane and AgentLaneGrid (`libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:58`); agent cards show output and lane usage (`libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card.component.ts:75`, `:118`).

Proposed phase 2b work:

1. Extend both spawn entry points with `bot?: {id, expectedRevision?}`; update the public tool schema/description and SpawnAgentRequest in shared. Bot id is identity, not name. Refuse conflicting caller runtime overrides; task remains the per-run assignment. Resolve the definition under caller workspace authorization and pin one immutable revision.
2. Add a bot start application service in the owning domain. Resolve instructions, installed skill sources, runtime, memory boundary and tool requirements; intersect approval rules with parent/host ceilings. Check enabled/archive/delete state and capability support again at start. Reserve run/session identity and apply the minimal phase-2b policy gate before execution. Missing capabilities cause typed refusal, not weaker enforcement.
3. For lane runtime, project the resolved choice into the existing system or ptah-cli branch. For default/main runtime, use the appropriate provider child/session adapter behind a common lane lifecycle port. Assumption: all explicit main providers can expose that lifecycle; capability audit is required and unsupported ones must remain unavailable.
4. Carry botId, botRevision and a display-name/avatar snapshot through SpawnAgentRequest, AgentProcessInfo, persisted CLI-session references, monitor pushes, run history and completion signals. Add optional shared bot identity metadata rather than overloading cli or ptahCliId. Keep agentId as the running lane key so two invocations of one bot are separate cards.
5. Extend the store's spawn/restore projections and existing cards/panel with bot identity, keeping provider/model visible. Stop/read/message/wait/continue/retry should use the same capability checks and lifecycle as plain lanes. Resume must use the pinned revision/config rather than silently rereading edits.
6. Cover system and ptah-cli spawning, provider child execution, approval refusal, tool/skill resolution, duplicate starts, terminal completion delivery, restore after reload, parent-session isolation, concurrent bot lanes, stop/resume and missing-provider diagnostics. Compare Electron lane UI with the phase-2b design; keep CLI composition/provider-lane tests focused.

Likely files also include the source of tool descriptions and each host's bot service composition. Assumption: their exact filenames/write sets belong to the phase-2b implementation plan; no uninspected filename is asserted here. Phase 1 must keep stable bot ids/revisions, source provenance and complete runtime choices, but must not add bot spawn parameters, run registrations or lane cards yet.

## UR1 - generation in the setup wizard

The current analyze skills page uses StackSkillStore and shared review/consent components (`libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:9`). It requests recommendations (`:135`), previews exact selections (`:183`) and installs with consent records (`:202`). StackSkillStore models intent/review/consent/installing/launching stages (`libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts:10`). SetupWizardStateService already tracks skill generation progress and step transitions (`libs/frontend/setup-wizard/src/lib/services/setup-wizard-state.service.ts:150`, `:353`).

Generation RPC currently exposes submit-selection and preview-generation (`libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts:177`). GenerationPreviewService explicitly previews agent-file writes without writing (`libs/backend/rpc-handlers/src/lib/handlers/wizard-generation/generation-preview.service.ts:2`, `:21`). The generation service processes agent templates through the SDK (`libs/backend/agent-generation/src/lib/services/content-generation.service.ts:4`); the orchestration port describes validating output and verifying file writes (`libs/backend/agent-generation/src/lib/interfaces/setup-wizard-orchestrator.interface.ts:80`). WizardAgentOriginStore records hashes for wizard-written agent files (`libs/backend/agent-generation/src/lib/services/wizard-agent-origin.store.ts:2`, `:111`). That is file provenance, not evidence of an existing bot record store or bot-generation RPC.

Phase 4 should add bot-draft generation/review beside the skills step. Feed analysis and reviewed skill selections to a typed draft generator, parse generated data through Zod, and show editable name/instructions/skills/runtime/approval/avatar fields in the phase-1 editor. Keep generation separate from legacy agent-file writes. On explicit save, call bots:create with BotEditableSchema and the constrained wizard source hint; the host assigns id, timestamps and origin. Reuse bots:update and revision conflicts for later edits. Default runtime stays symbolic unless the reviewed draft explicitly chooses another runtime. Avatar input follows the same asset admission rules.

Phase 1 now reserves `{kind:'wizard-generated', generationId?:UUID}` origin and an optional constrained create source hint. This avoids a record migration in phase 4. Update cannot rewrite provenance; it is descriptive, never authorization. Manual creation remains the default. Unresolved generated skills need review/install or a visible draft diagnostic before create; do not weaken phase-1 installed-skill validation. Repeated generation should not overwrite manually edited bots or create duplicates without review; generationId is correlation, not a promise of current RPC idempotency.

Phase 4 owns wizard UI/routes, draft RPCs and generation integration, consent, cancellation, retry and source-safe reruns. It can ship after phase 1 without execution phase 2b. Test schema-rejected generation, partial skill installation, source attribution, cancellation, duplicate review, edited-bot conflict and Electron/CLI record compatibility. The exact new step layout needs the phase-4 design review; no wizard UI is added now.

## UR5 - bot image or icon

Renderer icons use lucide-angular (`libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:49`). Use a small static allowlist of Lucide names (bot, sparkles, wrench, shield, code) mapped to imports; the record never contains SVG or executable markup. New BotAvatarSchema is optional icon/name or image/imageId. The create/update editable field is the phase-1 meaning of agents can set: later agent tools call the same contract; no tool is added now.

Current image picking uses a host file dialog, reads bounded bytes and sniffs the content (`libs/backend/rpc-handlers/src/lib/handlers/file-rpc.handlers.ts:203`, `:243`, `:252`). AttachmentProcessorService converts images into base64 SDK blocks (`libs/backend/agent-sdk/src/lib/helpers/attachment-processor.service.ts:24`). The composer constructs raster data URLs (`libs/frontend/chat/src/lib/services/composer-attachments.service.ts:201`), and the attachment tray displays image data (`libs/frontend/chat/src/lib/components/molecules/attachment-tray/attachment-tray.component.ts:25`). File-view sniffing explicitly rejects SVG and recognizes raster magic (`libs/backend/rpc-handlers/src/lib/handlers/file-view-binary.ts:4`, `:64`). These are reusable precedents. No suitable durable avatar store was found in the bounded search; this is not a claim that none exists anywhere.

Choose a small SQLite BLOB asset table in the phase-1 migration, behind the existing repository and application service. The main process accepts validated base64 bytes, assigns an opaque UUID and owns storage. Neither renderer paths nor remote URLs are accepted. bots:upload-avatar stages a scoped image for 24 hours; bots:create/update atomically claims it. bots:get-avatar authorizes the bot and returns typed MIME/base64 for a normal img src data URL. No new protocol, arbitrary scheme, innerHTML or security bypass. CLI uses the same host-neutral service/database contract.

Admission: png/jpeg/webp only, MIME/signature agreement, canonical base64, encoded and decoded bounds, 2 MiB decoded cap. B06a adds bounded PNG/JPEG/WebP header parsing with <=4096 pixels per dimension and <=16 megapixels; it allocates no pixel buffer. Malformed headers fail; later renderer decode failure shows a fallback. New staging is capped at 20 MiB per scope, and expired unclaimed bytes are removed on upload. Type/memory bounds are independent of file extensions. These limits are planning choices, not existing app limits.

Archive keeps images. Replacement/removal keeps any image referenced by immutable revisions. Hard delete with history retained keeps all referenced images, inaccessible through the normal deleted-bot read path; history purge deletes all that bot's images atomically. Memory retention is independent. Reject foreign asset ids and do not delete another bot's images. The table/transaction work remains in B02/B04; B06a adds just a validation helper/spec before B06, so no existing six-file batch grows.

### Design delta

Add a small avatar before the list-row name and an Avatar control in the existing Identity section. Keep row height, hierarchy, name/accessibility and navigation unchanged. Unset shows the default Bot icon. Icon shows the chosen static glyph. Image shows the stored raster, with a preview and Replace/Remove controls in the editor. Load error shows the default icon plus a text error/retry affordance; never hide the bot or erase the saved reference. Upload pending/error stays local to the existing form and preserves the draft. Controls have visible labels and keyboard access. This is the smallest UR5 delta for coordinator/user review; design-spec.md and its approval are not changed. Future Electron review must cover unset/icon/image/load-error in both themes and list/detail widths.

## Phase 1 plan changes

- Scope/defaults; Data model runtime, optional avatar, asset table/lifecycle, wizard-generated origin and schema-1 upgrade.
- RPC schema names, runtime diagnostics, create source hint/avatar, upload/get-avatar methods and eleven-method activation.
- B01 contracts/specs; B02 migration; B03 ports; B04 asset persistence/retention; B05 catalog; B06 application/upgrade; new two-file B06a bounded image validation.
- B08/B09 atomic method/prefix/manifest activation; B10/B11 existing host wiring and compatibility specs include assets.
- U03 store holds runtime/avatar upload/read state; U04 avatar and runtime row labels; U05 kind selector and Identity avatar control in existing sections.
- Test plan, batch sequence and Revision 3 notes include all new cases; no batch exceeds six files/two projects. New helper files stay under 700 lines. Existing owner-scoped commands exercise expanded specs; B06a names its additional exact commands.
- Later-phase execution and wizard work is documented here, not implemented in phase 1. The definition receives only the new Phases subsection.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Persist symbolic default runtime | Copy current provider; symbolic choice | Scoped active auth and dynamic model selection cited in UR3 | Yes, before release; later with migration |
| Main id means catalog/connection id; keep lane identity distinct | Adapter enum; catalog id; CLI id | ai-provider.types.ts:31, provider-model-picker.component.ts:79, agent-process.types.ts:86 (full paths above) | Yes, before release |
| Keep unresolved runtime selections editable | Reject unavailable catalog entries; save with diagnostic | User UR3 and existing plan tool-diagnostic policy | Yes |
| Put invocation/UI parity in 2b, generation in 4 | Pull execution into 1; use existing phase split | bots-definition.md Phases and context.md added requirements; code seams above | Yes; phase mapping remains a planning choice |
| Reserve wizard-generated provenance now | Defer migration; widen unshipped schema 2 | Wizard file origin is separate, wizard-agent-origin.store.ts:2 (full path above) | Yes, before release |
| Store raster avatars as scoped opaque SQLite assets | Renderer paths; remote URLs; new host-owned BLOBs | Attachment flow above gives validated bytes but no observed durable avatar store | Yes, with asset migration after release |
| Add one two-file B06a helper batch; keep storage in existing owners | Grow six-file batches; add isolated helper/spec | implementation-plan.md Batches file/project limits | Yes |
| 2 MiB raster cap, bounded headers, static icon allowlist, 24h staging/20 MiB quota | Larger/unbounded input; proposed bounded limits | UR5 safety contract; existing magic-byte precedent above | Yes, as explicit schema/policy changes |
| Normal editable avatar contract, no agent setter tool yet | New phase-1 tool; reuse RPC later | Parent UR5 instruction | Yes |

## Clarifications Needed

No user-only choice blocks this planning revision. Phase numbering and the UR5 visual delta remain coordinator review items, not additional authorization gates invented by this lane. Options for the visual delta: adopt the compact row avatar/Identity control (recommended), or request another placement during design review. Recommendation preserves the approved screen layout and all five user requirements.

Assumption: the effective default for a user-scoped bot is that of its selected run workspace; a workspace-free run uses application/global settings. This follows the observed scoped resolution but phase 2b must verify the complete provider-profile path before execution. Exact provider capability parity and a full repository-wide asset-store audit were not established by this bounded review.

## Lane-introduced constraints

- Work confined to the named worktree and three permitted Markdown files; source, design-spec.md, context.md, HANDOFF.md and the other task folder were not edited.
- Checked Ptah tool availability. File search was available; direct workspace-analysis/native CLI skill loading were not exposed. Ptah execute_code help and a file lookup were used; native rg/PowerShell targeted reads supplied source evidence. No skill invocation is claimed.
- Read repository copies of ui-ux-designer and angular-frontend-patterns as fallback guidance for reuse of existing sections and signal/store ownership. This is a planning delta, not UI implementation or a rendered artifact. No screenshot or visual acceptance is claimed.
- No tests, verify/Nx/build/serve/dev/e2e/package/install commands, Git mutation, network image fetch or agent tool implementation. Commands in the plan are future lane instructions only.
- Bounded searches of the large manager/store were used. Code claims cite repository-relative file:line; proposed work is labeled as plan/proposal and unverified capability assumptions are explicit.
