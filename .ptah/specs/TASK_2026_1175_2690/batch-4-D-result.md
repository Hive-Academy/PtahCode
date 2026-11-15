# Batch 4 D result

## Files changed

- `libs/frontend/onboarding/src/lib/analyze/agent-recommendation-list.component.ts:77`: disable empty selection controls and show a clear empty catalog state using existing tile styles.
- `libs/frontend/onboarding/src/lib/analyze/choose-agents.page.ts:421`: block preview and confirmation for empty or stale IDs.
- `libs/frontend/onboarding/src/lib/analyze/{agent-recommendation-list.component,choose-agents.page}.spec.ts`: cover empty display and blocked generation.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:108` and `agent-marks.spec.ts:17`: remove the last special role mark and cover the generic Bot fallback for legacy `team-leader` events.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/{onboarding-analyze,onboarding-generate}.fixtures.ts`: use `reviewer` for the active example row and generation outcome.
- `apps/ptah-docs/src/content/docs/agents/{built-in-agents.md,index.mdx,agent-orchestration.md,cli-agents.md,custom-agents.md}`: describe the empty catalog and phase workflow; preserve the `team-leader` to `batch` alias.
- `apps/ptah-docs/src/content/docs/{setup/setup-wizard.md,templates/index.md,templates/template-storage.md,reference/glossary.md}`: remove active built-in role claims and deleted template examples.

## Checks

- Onboarding focused Jest: exit 0, 2 suites and 36 tests passed.
- Chat UI focused Jest: exit 0, 1 suite and 15 tests passed.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json`: exit 1. Errors in `generate-agents.page.spec.ts` and shared BigInt targets; none in changed specs.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/frontend/chat-ui/tsconfig.spec.json`: exit 1. Errors in other chat UI specs and shared BigInt targets; none in changed spec.
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/frontend/webview-e2e-harness/tsconfig.spec.json`: exit 1. Existing `import.meta` module settings and unrelated settings spec type errors.
- `npx eslint` on all eight changed TypeScript files: exit 0, nine member accessibility warnings and no errors. Nx boundary rule skipped because no cached project graph exists.

## Extra files read

- `.ptah/specs/TASK_2026_1175_2690/step-4-plan.md`
- `.ptah/specs/TASK_2026_1175_2690/step-3-lane-rules.md`
- `.claude/skills/angular-frontend-patterns/SKILL.md`
- `.claude/skills/ui-ux-designer/SKILL.md`
- `libs/frontend/onboarding/src/lib/analyze/{choose-agents.page.ts,agent-recommendation-list.component.ts}` and their specs.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts` and its spec.
- Onboarding harness fixtures and agent, setup, template, and glossary documentation.

## Decisions

- The setup RPC empty catalog is owned by backend batch C. This lane handles its UI result.
- The role icon table had only `team-leader` after step 3. It is now empty, and legacy events use the existing Bot fallback.
- The `built-in-agents` documentation page remains as a phase and alias reference, so links to it remain valid.

## Not done

- UI rendering and screenshot inspection: this lane forbids serve/dev/e2e, so visual quality was not checked against a rendered reference.
- Manifest generation: the coordinator owns `agent-pack-manifest.json` and `content-manifest.json` after all batches.
- Spec TypeScript projects did not pass due to errors outside this lane's changed files.

## Needs another batch

- Backend batch C must return an empty built-in catalog through setup RPC while keeping custom generation, storage, mirror, and history intact.
- Coordinator should resolve the pre-existing spec TypeScript errors if a clean spec type check is required.
