# PR #1534 CI fixes

## Degradation audit

The state-write queue used `.catch(() => undefined)` to continue after a failed predecessor. The audit flagged the literal return because it hid the rejection. The handler now logs the previous write failure with the workspace path and error message through the service logger. The queued write still loads the last committed state and attempts its own save.

- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts:829`

## Skill-description routing

The trimmed descriptions omitted routing phrases that distinguish primary skills, compatible siblings and the explicit handoff trigger. The following description lines were updated in both copies. The routing spec stayed as written.

| Skill | Characters | Local path | Plugin path |
| --- | ---: | --- | --- |
| angular-frontend-patterns | 232 | `.claude/skills/angular-frontend-patterns/SKILL.md:3` | `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md:3` |
| angular-3d-scene-crafter | 246 | `.claude/skills/angular-3d-scene-crafter/SKILL.md:3` | `plugins/ptah-angular/skills/angular-3d-scene-crafter/SKILL.md:3` |
| angular-gsap-animation-crafter | 197 | `.claude/skills/angular-gsap-animation-crafter/SKILL.md:3` | `plugins/ptah-angular/skills/angular-gsap-animation-crafter/SKILL.md:3` |
| agent-lanes | 219 | `.claude/skills/agent-lanes/SKILL.md:3` | `plugins/ptah-core/skills/agent-lanes/SKILL.md:3` |
| resilient-nestjs-patterns | 153 | `.claude/skills/resilient-nestjs-patterns/SKILL.md:3` | `plugins/ptah-nx-saas/skills/resilient-nestjs-patterns/SKILL.md:3` |
| ddd-architecture | 145 | `.claude/skills/ddd-architecture/SKILL.md:3` | `plugins/ptah-core/skills/ddd-architecture/SKILL.md:3` |
| ptah-surface-authoring | 172 | `.claude/skills/ptah-surface-authoring/SKILL.md:3` | `plugins/ptah-core/skills/ptah-surface-authoring/SKILL.md:3` |
| session-handoff | 129 | `.claude/skills/session-handoff/SKILL.md:3` | `plugins/ptah-core/skills/session-handoff/SKILL.md:3` |

The three descriptions above 200 characters preserve the spec's required phrases and the prose connecting them. The frontend and scene phrases alone total 202 and 216 characters respectively. The agent-lanes phrases total 190 before separators and the words connecting the spawn mechanic to the workflow and panel.

Regenerated `content-manifest.json:4` for the shipped plugin edits.

## OpenCode agent round trip

The spec at `libs/backend/harness-sync/src/lib/targets/transformers/opencode-agent-transformer.spec.ts:149` pinned the previous backend-developer description prefix. The shortened text in `.claude/agents/backend-developer.md:3` is valid. The spec now verifies that the quoted output description parses to the exact nonblank source value. The mode, ownership, Claude model removal and body assertions still apply. The frontmatter helper at line 52 accepts LF and CRLF checkouts.

## Checks

- Focused Jest for `skill-description-shape.spec.ts` passed all 12 tests.
- Focused Jest for `opencode-agent-transformer.spec.ts` passed all 15 tests using the shared Jest binary and `NODE_OPTIONS=--no-strip-types` on Node 26.
- The degradation audit's changed-file scan exited 0 with no findings in the updated service.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` exited 0 after scanning 4,780 files. It reported `TOTAL 0 unsuppressed site(s)`, including zero for agent-generation. The per-directory list was empty because the scan found no violations.
- `npx eslint` on the two changed TypeScript files exited 0 with zero errors. The service emitted one pre-existing `max-lines` warning (1,158 counted lines, limit 700).
- `npm run -s manifest:generate` and `npm run -s manifest:check` exited 0. The manifest check confirmed 222 files and hash `sha256:6049db6b3c338ce6714bdcddd3d243f4123a16329c7416d8e17720c581377f11`. Both commands warned that the agent template directory is absent and reported zero templates.
- All eight local and plugin description lines match.
- `git diff --check` exited 0.

The CLI exposed no dedicated skill loader. I read the repository's `skill-creator` instructions through Ptah's read tool.
