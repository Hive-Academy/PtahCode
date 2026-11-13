# Phase 3: Setup skills by tech stack — Context

Phase 3 transforms the setup wizard from agent selection to skill selection with project guidance.

## Scope

Transform the setup experience to:
1. **Tech stack detection** with skill search via `skillsSh` (detectRecommended, search)
2. **Relevance gate:** select skills only when dependencies prove the technology
3. **Project guidance** with labeled facts (follow, tolerate, do not copy)
4. **Weak repository rules:** owner decision at setup, scope rule, debt recording, verdict "cannot verify"
5. **UI transformation** (Electron first): agent setup step becomes skills + guidance step
6. **Keep agent generation** callable until Phase 5

## Acceptance criteria

- This repository selects Angular, Nx, NestJS skills; does not select Fastify or Vitest
- Weak practices repository shows labeled facts and owner decision prompt
- No skill installed without consent if it contains scripts
- Setup analysis, storage and lifecycle services stay in place (keep decision)

## Phase 3 capabilities (from parity inventory)

To move/transform:
1. Recommend agents → **recommend skills** (wizard:recommend-agents becomes wizard:recommend-skills)
2. Preview, submit, retry agent generation → **preview, submit skills** (skill install UX)
3. Browse and install agent packs → **browse and install skills** (skill catalog UX)

To keep:
1. Persist workspace analysis/checkpoints
2. Detect stale analysis
3. Run multi-phase analysis
4. Deep analyze and resume workspace
5. List and load previous analyses
6. Cancel analysis
7. Propagate selected skills to providers (harness-sync)
8. Rewrite skill Markdown for rival providers

## Related files to examine

- Setup RPC handlers: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
- Frontend setup wizard: `libs/frontend/setup-wizard/src/lib/`
- Frontend onboarding: `libs/frontend/onboarding/src/lib/`
- Renderer webview: `apps/ptah-extension-webview/src/`
- Agent generation services: `libs/backend/agent-generation/src/lib/services/`
- Harness sync skill gate: `libs/backend/harness-sync/src/lib/state/skill-sync-gate.spec.ts`

## Key design decisions needed

1. **Skill search integration:** call skillsSh:detectRecommended and skillsSh:search from setup
2. **Project guidance source:** generate from workspace analysis or external catalog?
3. **Weak repository UI:** inline in setup or separate decision step?
4. **Agent generation compatibility:** keep old RPC but make it optional/deprecated

## Dependencies

- Phase 1 (phase contract) must merge first (PR #1147)
- Phase 2 (executor neutrality) runs in parallel with Phase 3 on branch feat/executor-neutrality
- Phase 3 does not touch files in scope of Phase 2

## Risks

- Frontend changes require visual review in Electron
- Skill search may not be fully integrated; fallback needed
- Project guidance catalog may not exist yet; may need mock data
- RPC backward compatibility needed for existing clients
