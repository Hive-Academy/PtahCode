# Batch 4 C result

## Files changed

- Deleted and staged `libs/backend/agent-generation/templates/agents/team-leader.template.md` and its template-only policy spec. Batch A's audit confirms durable guidance was transferred before deletion.
- Agent-generation services: emptied the recommendation catalog, coordinator-template list, and built-in tool-policy map; removed the dead REVIEW_FOCUS prompt topic. Updated catalog, generation, custom-skill, partial, and empty-corpus specs. Preserved custom generation, zero-selection, user-layer clone/quarantine, and history tests.
- Agent-generation types and interfaces: changed current-role documentation examples to the custom `reviewer` ID.
- RPC handlers: setup RPC now returns an empty built-in list. Repaired setup, preview fidelity, synthesis rebase, and retired-role guard specs with custom IDs; the guard explicitly refuses `team-leader`.
- CLI agent-role resolver spec was verified without edits; its explicit same-name user-file read remains at line 548.

## REVIEW_FOCUS evidence

- `rg -n REVIEW_FOCUS libs/backend/agent-generation/templates` found no shipped template using the marker after deletion.
- The only production hit was the `SECTION_TOPICS` prompt entry in `content-generation.service.ts`; removed it. Dynamic `<!-- LLM:<id> -->` parsing remains generic and supports custom templates.
- Generic resolver, marker stripping, and validator fixtures now use `CUSTOM_SECTION`. No `REVIEW_FOCUS` hits remain under agent-generation source or templates.

## Checks

- Agent-generation focused Jest, 10 listed suites: exit 0; 437 passed, 18 skipped template-per-file cases for the empty corpus. Zero-template corpus assertion remains active; per-file cases run if templates return.
- RPC-handlers focused Jest, 4 listed suites: exit 0; 235 passed.
- CLI agent-role resolver focused Jest: exit 0; 45 passed, including same-name user file read.
- `npx tsc --noEmit --project <lib>/tsconfig.lib.json` and `tsconfig.spec.json` for agent-generation, rpc-handlers, and cli-agent-runtime: all six exit 0.
- `npx eslint <changed TypeScript files>`: exit 0; 0 errors, 228 warnings including existing lint warnings and the unavailable cached Nx project graph.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: exit 0 after staging the two deletions. Counts: templates 0, skills 62, generated-agents 176, docs 66, test 865, source 72, other 95; total 1,336 lines in 234 files; 0 unreadable.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; agent-generation 1/1 baseline, rpc-handlers 1/1, cli-agent-runtime 1/1; total 221 unsuppressed sites within baseline.
- `git diff --check`: exit 0.

## For the coordinator

- Regenerate `agent-pack-manifest.json` and `content-manifest.json` after all batches; this lane did not edit them.
- Cross-project search found remaining `team-leader` references in B/D-owned retired aliases, historical UI display and docs, legacy/task attribution specs, and recorded ACP fixtures. D-owned e2e comments in `config-menu-absent.e2e.spec.ts` and `marketplace-visual.e2e.spec.ts` still call a worker a team-leader; review their wording if the final audit requires it. `workspace-intelligence/src/ast/language-registry.spec.ts:255` also has a historical comment.
- D reports that the empty-state UI was not rendered or screenshot-inspected and that frontend spec typechecks have unrelated errors. These remain integration follow-up items.

## Decisions

- Keep generic generation and marker parsing for explicit custom agents; Phase 5 owns removal of generation services.
- Keep same-name custom user files, origin/quarantine, and history fixtures readable. Do not restore a built-in role to satisfy old fixture assumptions.
- CLI skill invocation was unavailable for this backend catalog scope; inspected the local skill catalog and found no matching skill.

## Not done

- No commit, push, manifest regeneration, build, serve, dev, e2e, package, Nx, or workspace-wide check.

