## Project-Specific Guidance

### Project Context
Ptah is an AI coding-agent desktop app built as an Nx 24 monorepo (npm, Node 24.x, TypeScript 6.0.3): 6 apps, 78 libs, 8 tool projects, ~1.06M production lines.

- **Priority host: Electron 44** (`apps/ptah-electron`: ESM main `main.ts`, `preload.ts`, nine worker/host bundles built with esbuild, packaged with electron-builder). Plan, build and verify for Electron first.
- **Renderer: Angular 22.2** (`apps/ptah-extension-webview`) — despite the name it is the Electron renderer, not a VS Code host. Styling: Tailwind 3.4 + daisyUI 4; rendering with CodeMirror 6, Shiki, marked, Mermaid, DOMPurify.
- **Other apps:** `ptah-landing-page` (Angular SSR), `ptah-docs` (Astro 7 + Starlight), two Playwright e2e projects.
- **Backend libs (`libs/backend`, 42):** tsyringe DI, Zod 4 validation, better-sqlite3 + sqlite-vec persistence, agent SDKs (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, `@cursor/sdk`, ACP, MCP), web-tree-sitter, Transformers.js, Slack/Discord/Telegram gateways, Sentry.
- **Frontend libs (`libs/frontend`, 30)**, `libs/shared` (RPC contract), `libs/worker-protocol`, `libs/web/*` (landing site).
- A second host exists: the CLI (`libs/backend/platform-cli`, `cli-engine`). Keep it and provider CLI lanes working.
- `plugins/` holds skill content packages (ptah-core, ptah-angular, ptah-nx-saas, …), not Nx projects.

_(section shortened to fit the prompt budget)_

### Framework Guidelines
**Angular 22 (renderer, `libs/frontend`, `libs/web`)** — follow `angular-frontend-patterns`:
- Standalone components only, `ChangeDetectionStrategy.OnPush`, `inject()` instead of constructor injection, `input()`/`output()` and signal queries (`viewChild()`); never `@Input`/`@Output`/`@NgModule`.
- Use built-in control flow (`@if`, `@for`, `@defer`); use `[class]`/`[style]`, not `ngClass`/`ngStyle`. Give `@for` a stable id in `track`, not `$index`, when the list can reorder.
- State lives in injectable signal stores: private writable `signal`, public `.asReadonly()`, methods as the only writers. No NgRx, no `BehaviorSubject`/`Subject`. Prefer `computed`/`linkedSignal` over `effect` for derived state; use `untracked` inside effects.
- The app is zoneless by default (`app.config.ts`); do not rely on zone-triggered change detection.
- Server data comes through RPC (`claude-rpc.service.ts`) and pushed messages via `MESSAGE_HANDLERS`; there is no HTTP layer in the renderer.
- Never add `[innerHTML]` or `bypassSecurityTrust*`; route markdown through `libs/frontend/markdown` (DOMPurify).
- Keep components small (33 already exceed 800 lines): move orchestration into stores, extract child components.
- Add new routes as lazy `loadComponent`/`loadChildren`; respect secondary entry points (`…/services`, `…/presentation`) guarded by `verify-eager-bundle`.
- After a template change run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.

**Electron 44**

_(section shortened to fit the prompt budget)_

### Coding Standards
**Type safety**
- Write strict code everywhere: 79 of 84 projects set `strict: true` (root default is `false`, so a new lib must opt in with `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`).
- No `any`, no `as any`; avoid `as unknown as` — fix the type instead (e.g. `Logger.error` already accepts a context object). No non-null `!` to silence errors.
- Use `@ts-expect-error <reason>`, never `@ts-ignore`.
- Parse external data (`JSON.parse`, files, child processes, IPC, network) through a Zod schema.

**Error handling**
- `catch (error: unknown)` with an `instanceof Error` check. Throw typed errors; use `RpcUserError` for user refusals. Never throw strings.
- No empty catch blocks. A deliberate swallow needs a comment (use the `degradation-audit: reported` convention) and a `debug` log when behaviour changes.
- `void fn()` only when the callee handles its own errors; there is no floating-promise lint.
- Log through the injected `Logger`, not `console.*` (allowed only in boot/worker entry files).

**Process and security**
- Spawn with `cross-spawn`/`which` and argument arrays; never `shell: true`. No `eval`/`new Function`. No hardcoded secrets; secrets go through the secret-storage port.

**Structure and naming (SOLID)**
- Single responsibility: keep files under 700 lines (`max-lines`); do not grow the existing god files — split along seams behind a facade (`humanize-library`).

_(section shortened to fit the prompt budget)_

### Architecture Notes
**Boundaries (enforced, `@nx/enforce-module-boundaries` at `error`, 0 violations, 0 cycles)**
- Every project carries a `scope:*` and a `type:*` tag; rules live in `eslint.config.mjs`. A new lib needs both tags, an alias in `tsconfig.base.json` and one public `src/index.ts`. Use `nx-workspace-architect` for new libs, tags or moves.
- Direction is strictly downward: apps → libs; `libs/frontend` never imports `libs/backend` (sole exception: the `scope:shared` `review-contracts`); `libs/backend` never imports `libs/frontend`; no lib imports an app.
- Do not add feature → feature imports. Share state through a `type:data-access` lib or a secondary entry (`tasks-ui/services`), or invert with an `InjectionToken` in `libs/frontend/core/src/lib/tokens/`.

**Layers (bottom to top)**
1. Contracts: `memory-contracts`, `voice-contracts`, `review-contracts`, `chat-types`, `worker-protocol`, then `shared` (RPC types; fan-in 66).
2. Ports: `platform-core/src/interfaces/*.interface.ts` and its tokens. Keep new concrete services out of it.
3. Infrastructure: `vscode-core` — despite the name this is the host-neutral backend core (`RpcHandler`, `Logger`, git, licence, Sentry, main `TOKENS`); `settings-core`, `persistence-sqlite` (migration runner, repositories).
4. Adapters: `platform-electron/src/implementations/electron-*.ts`, `platform-cli`. Only host composition code imports these.
5. Domain features: `agent-sdk`, `workspace-intelligence`, `harness-sync`, `task-specs`, `memory-curator`, `messaging-gateway` (adapter interface per provider), …
6. API layer: `rpc-handlers` — keep handlers thin (validate, delegate, map errors); put new application services in the owning domain lib.
7. Composition roots: `apps/ptah-electron/src/di/` (`phase-0-platform` … `phase-4-handlers`, `expected-resolvable.ts`) and `cli-engine` container. A new injectable must be registered in both; `tools/di-lint` checks wiring on push.

**Key abstractions**
- Typed RPC over IPC: contract in `libs/shared/src/lib/types/` (add new domains as a separate `rpc-<domain>.types.ts`, not into the 4,311-line `rpc.types.ts`), server `RpcHandler.registerMethod` (method names must match the allowed prefixes), client `claude-rpc.service.ts`, transport `apps/ptah-electron/src/ipc/ipc-bridge.ts`.

_(section shortened to fit the prompt budget)_
