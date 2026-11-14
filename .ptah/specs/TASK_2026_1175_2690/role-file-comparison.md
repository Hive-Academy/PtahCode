# Role file comparison

Read-only research. Each workspace file in `.claude/agents/<role>.md` was compared with `libs/backend/agent-generation/templates/agents/<role>.template.md` (`git diff --no-index`).

## How the workspace file differs from the template (all roles)

These differences are generated. They are not learned content:

- The frontmatter is replaced by `name`, `description`, `model` and `disallowedTools`.
- The `<!-- STATIC:... -->` partials are expanded (working rules, skill use, task specs, decisions, replacement policy, CLI lanes).
- The `Required Skills:` lines are removed and replaced by a "Skill use" section.
- The `<!-- LLM:... -->` markers are removed. The wizard fills the section text.
- project-manager and team-leader also get the coordinator task-spec block.

A difference is "learned" only when the wizard filled an LLM section with repository facts.

## Summary table

| Role | Lines (workspace / template) | Verdict |
| --- | --- | --- |
| backend-developer | 222 / 230 | learned differences |
| frontend-developer | 235 / 247 | learned differences |
| devops-engineer | 177 / 175 | generated-only differences |
| code-logic-reviewer | 262 / 250 | learned differences |
| code-style-reviewer | 261 / 242 | learned differences |
| senior-tester | 250 / 244 | learned differences |
| visual-reviewer | 312 / 304 | generated-only differences |
| project-manager | 258 / 238 | generated-only differences |
| software-architect | 279 / 287 | learned differences |
| researcher-expert | 155 / 147 | generated-only differences |
| technical-content-writer | 346 / 343 | generated-only differences |
| ui-ux-designer | 138 / 128 | generated-only differences |
| modernization-detector | 149 / 139 | generated-only differences |
| team-leader | 546 / 535 | generated-only differences |

No role is "identical". Every role has at least the generated differences.

Notes on the generated-only roles:

- devops-engineer: the "Build and deploy surface" section is the unfilled wizard placeholder. Only the markers were removed.
- visual-reviewer: the "Visual review focus for this repository" section keeps the generic "Until the wizard fills this section" text. The workspace file has no `disallowedTools` line.
- team-leader: the batch template and executor prompt text changed only through the removal of `Required Skills:` and the partial expansion.

## Proposed targets

Phase files are in `plugins/ptah-core/skills/orchestration/phases/`. Observed in the phase files:

- `review.md:17` already covers module boundaries, host branching, registration, framework idioms, contract strictness and unsafe rendering.
- `implement.md:26` already bans silent errors and bypassed validation.
- `tests.md:24` already bans a second runner and a chased coverage number.

I did not read every phase file in full. Check the exact wording before you mark an item "already present".

Most learned facts are repository facts, not role rules. Put them in `CLAUDE.md` or "drop" them. The repository `CLAUDE.md` today holds only the verify rules, commitlint scopes and di-lint in the pre-push hook.

### backend-developer

Learned sections: "Backend framework conventions", "Backend architecture patterns".

- tsyringe `@injectable()` and `@inject(TOKEN)`, checked by `tools/di-lint/check-injects.ts`. Target: drop (repository fact). Put in `CLAUDE.md` if wanted.
- `Symbol.for` tokens, `PLATFORM_TOKENS` in `libs/backend/platform-core/src/di/tokens.ts`. Target: drop.
- Electron registration files and `expected-resolvable.ts`. Target: drop.
- `registerMethod` with zod parse, RPC types in `libs/shared`, `rpc-surface.spec.ts`. Target: `phases/implement.md` only as the generic rule "validate input at the boundary". The file names: drop.
- Injected `Logger`, no `console`. Target: drop.
- `tools/degradation-audit/check-degradation.ts`. Target: drop.
- Module boundaries (`scope:*`, `type:*` tags). Target: `nx-workspace-architect` stack skill.
- Hexagonal ports, composition roots, `vscode-core` anti-leak rule. Target: `ddd-architecture` stack skill (generic part). The repository names: drop.
- Lib barrels and `import type`. Target: `nx-workspace-architect`.
- One handler class per RPC sub-domain, god files as anti-examples. Target: drop.
- Boundary validation at `ipc-bridge.ts` and `http-server.handler.ts`. Target: drop.
- Builders repository note. Target: drop.

### frontend-developer

Learned sections: "Frontend framework conventions", "Frontend architecture patterns".

- Angular standalone, OnPush, `inject()`, `input()`, signals. Target: `angular-frontend-patterns` stack skill (verify it is not already there).
- Root services in `libs/frontend/core`, `app.config.ts`. Target: drop.
- RPC only through `claude-rpc.service.ts` and `message-router.service.ts`. Target: drop.
- Markdown only through `markdown-block.component.ts`, no `[innerHTML]`. Target: `phases/review.md` (unsafe rendering is already there). File names: drop.
- Lucide icons, Tailwind and DaisyUI. Target: drop.
- Specs next to files, `mock-message-router.ts`. Target: drop.
- `scope:webview` boundaries, atoms/molecules/organisms layout. Target: `nx-workspace-architect` or drop.
- `tab-manager.service.ts` size rule. Target: drop.
- `dependency-boundaries.spec.ts` and `@defer` brand-mark import. Target: drop.
- Webview specs for routing and tokens. Target: drop.

### code-logic-reviewer

Learned section: "Logic review focus for this repository".

- Registrations before runtime. Target: `phases/review.md` (partly present at line 17).
- Ports serve their consumers. Target: drop.
- Shims hide failures (`apps/ptah-electron/src/shims/`). Target: drop.
- Validate RPC input. Target: `phases/review.md` (generic: validate at the boundary).
- Coded RPC errors with `RpcUserError` and `rpc-error-codes.types.ts`. Target: drop.
- Errors must not leak (`file-settings-errors.ts`). Target: `phases/review.md` as a generic rule.
- Concurrent settings writes (`file-settings-manager.ts`). Target: drop.
- Sanitize rendered output (DOMPurify, URI allowlist). Target: `phases/review.md` (unsafe rendering present).
- Shared RPC types change all hosts. Target: drop.

### code-style-reviewer

Learned section: "Style review focus for this repository".

- Module boundaries, `eslint-disable` as a blocker. Target: `phases/review.md` (boundaries present). The blocker rule: add to `review.md`.
- Barrel imports mapped in `tsconfig.base.json`. Target: `nx-workspace-architect`.
- Hexagonal rule, new Electron port needs binding and contract runner. Target: drop.
- `vscode` leak, DI phase files. Target: drop.
- Naming rules (`Symbol.for` tokens, `I*` ports with `export type`, kebab-case suffixes). Target: drop.
- Typed RPC contract split by domain. Target: drop.
- Non-strict `tsconfig.base.json`, review as if strict. Target: `phases/review.md` (contract strictness present).
- `.commitlintrc.json` scopes. Target: drop (already in `CLAUDE.md`).

### senior-tester

Learned section: "Test infrastructure in this repository".

- Specs next to code as `*.spec.ts`. Target: drop.
- `jest.preset.js` worker cap and `marked` mapping. Target: drop (worker cap is in `CLAUDE.md`).
- ts-jest for backend, jest-preset-angular for Angular, `transformIgnorePatterns`. Target: drop.
- `*.real-git.spec.ts` with `jest.real-git.config.ts`. Target: drop.
- Per-project `coverageThreshold`. Target: drop.
- Shared doubles in `/testing` aliases, contract runners in `platform-core/src/testing/contracts/`, root `__mocks__/vscode.ts`. Target: drop.
- `npm run verify -- -t test -p <project>`, never e2e. Target: drop (already in `CLAUDE.md`).

### software-architect

Learned section: "Existing patterns in this repository".

- Ports and Electron adapters. Target: `ddd-architecture` (generic) or drop.
- Composition root phases and `expected-resolvable.ts`. Target: drop.
- RPC method wiring in `register-shared-rpc-handlers.ts` and allow-list specs. Target: drop.
- `RpcUserError`, `MESSAGE_HANDLERS` multi-provider. Target: drop.
- `scope:*` and `type:*` tags. Target: `nx-workspace-architect`.
- Builders repository note. Target: drop.

### Roles with generated-only differences

devops-engineer, visual-reviewer, project-manager, researcher-expert, technical-content-writer, ui-ux-designer, modernization-detector, team-leader: no learned differences. Nothing to move. All generated differences: drop.

## Open points

- Phase files were only sampled. A full read could show more "already present" items.
- A decision is needed from the user on one question. Do repository facts move to `CLAUDE.md`, or does the team drop them? The default here is "drop".
