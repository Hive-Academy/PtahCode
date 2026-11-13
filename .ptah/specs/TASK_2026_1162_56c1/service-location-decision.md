# Phase 3 service location

**Decision: (b) `libs/backend/rpc-handlers`, under `src/lib/skills-sh/services/`.** Put `SkillRecommendationService`, `ProjectGuidanceService`, `SkillSelectionService`, and `SkillConsentService` beside the skills.sh implementation, with skill-owned DI tokens and registration. This is a location decision; the current files have not yet been moved.

## Rationale

Phase 5 removes agent generation features, while the skills.sh RPC surface remains in `rpc-handlers`. The skills.sh manifest entry is independent of agent wizard capabilities (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:420-424`). Its handler owns search and install (`libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:5-11`). Keeping the four services with that surface avoids retaining agent-generation registration solely for skills.

## Options checked

| Option | Cost and Phase 5 consequence |
| --- | --- |
| (a) Separate `agent-generation/src/lib/services/skills/` folder | Small file move now, but the existing skill tokens and registrations are mixed with agent selection, recommendation and templates in `agent-generation/src/lib/di/tokens.ts:75-86` and `di/register.ts:32-35,139-164`. Phase 5 must carefully split those files and preserve their skill bindings. Folder separation alone does not isolate DI. |
| (b) `rpc-handlers/src/lib/skills-sh/services/` | Move four classes, their tests, tokens, exports and registration; update the existing consent consumer. `ProjectGuidanceService` needs its analysis input type moved to a shared contract or expressed locally, since it currently imports `../types/analysis.types` (`agent-generation/src/lib/services/project-guidance.service.ts:14`). This one-time migration gives skills independent ownership. |

## Evidence and boundaries

- Both libraries have `scope:extension`, `type:feature` (`libs/backend/agent-generation/project.json:6`; `libs/backend/rpc-handlers/project.json:6`). The Nx rules permit extension-to-extension and feature-to-feature imports (`eslint.config.mjs:285-286,371-379`), but the moved services need no agent-generation runtime import.
- `skills-sh-rpc.handlers.ts:22-69` imports core, platform, SDK, harness, shared contracts, skills.sh helpers and the CLI API client; it has no agent-generation import. The Ptah forward dependency graph was still building, so this import-list check is the usable fallback.
- The requested Ptah dependents query on `agent-generation/src/lib/services/` returned `unsupported-language` because the tool accepts files, not directories. Targeted source search found the four classes registered only through `agent-generation/src/lib/di/register.ts:145-162`; the consent token is consumed by `rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1020-1023`.

## Phase 5 safety and host impact

Move the four token definitions out of `AGENT_GENERATION_TOKENS`, register the services from a skills-owned registrar in `rpc-handlers`, and switch the setup consent resolution to the new token. Move `ProjectGuidanceService`'s analysis type dependency to a stable shared or local contract. Add no imports from templates, agent selection, agent recommendation, or agent wizard RPC. Phase 5 can then remove those targets and their registration without editing the four services.

Keep registration in both host compositions. CLI bootstrap calls `registerPlatformCliServices` before `registerAgentGenerationServices` (`libs/backend/cli-engine/src/lib/container.ts:482,822`), then `registerSharedRpcHandlers` and `registerRpcSurface` (`:934,1020`); `withEngine` reaches that container through `CliDIContainer.setup` (`libs/backend/cli-engine/src/lib/bootstrap/with-engine.ts:20,201-204,596-598`). Register the skills services in the shared RPC registration path before handlers resolve them. This preserves platform-cli and cli-engine composition while Phase 5 removes agent-specific wiring.
