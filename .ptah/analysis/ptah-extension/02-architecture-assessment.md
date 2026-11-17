# Architecture Assessment — ptah-extension

Phase 2 of the workspace analysis. Input: `01-project-profile.md`. Collected 2026-11-17 on branch
`main` (head `b4ab8f096`).

**Method.** A static scan of every `.ts` file under `libs/` and `apps/` (84 projects with a
`project.json`), resolving `@ptah-extension/*` imports through the `paths` of
`tsconfig.base.json` to the owning project. Pattern counts are regular-expression counts over
production files (files matching `.spec.ts`, `.test.ts`, `/testing/` or `__mocks__` are
excluded unless stated). The counts are approximate; the import graph is exact to the level of
"project A has a production import of project B". Project tags come from each `project.json`,
and the boundary rules from `eslint.config.mjs`.

Headline numbers:

| Measure | Value |
| --- | --- |
| Projects scanned | 84 |
| Project-to-project import pairs | 479 (470 with a production import, 9 test-only) |
| Dependency cycles between projects (production imports) | 0 |
| Two-way project pairs (production or test imports) | 0 |
| Tag-rule violations (scope and type rules re-applied to the graph) | 0 |
| Production (non-test) `.ts` files / lines in `libs/` + `apps/` | 4,459 / about 1.06 million |

---

## Folder Structure Assessment

### Nx 24 monorepo — follows conventions

| Expected convention | Observed | Verdict |
| --- | --- | --- |
| `apps/` holds thin deployables, `libs/` holds the code | 6 apps, 78 libs. `libs/` has 8,146 tracked files against 856 in `apps/` | Followed |
| Libraries grouped by scope folder | `libs/backend`, `libs/frontend`, `libs/shared`, `libs/web`, `libs/worker-protocol` | Followed |
| Every project carries `scope:*` and `type:*` tags | All 84 scanned projects have both | Followed |
| Boundaries enforced by `@nx/enforce-module-boundaries` | `eslint.config.mjs:232`, severity `error`, with scope and type `depConstraints` | Followed |
| One public entry (`src/index.ts`) per lib, imported by alias | 112 aliases in `tsconfig.base.json`; cross-project relative imports exist only in 3 spec files (see Dependency Flow) | Followed in production code |
| Folder position matches scope tag | Three libs sit in a folder that contradicts their tag (below) | Partially followed |

Misplaced or misleading locations:

- `libs/backend/review-contracts` is tagged `scope:shared, type:util` and is imported by
  `libs/shared/src/lib/types/rpc-review.types.ts:2` and by `libs/frontend/review-runs-ui`
  (11 production imports). A contract package used by the renderer lives under `libs/backend/`.
- `libs/backend/platform-core` is tagged `scope:shared, type:util` but lives under
  `libs/backend/`. No frontend lib imports it, so the folder is right and the tag is wider than
  the usage.
- `libs/frontend/markdown` is tagged `scope:shared, type:ui` but lives under `libs/frontend/`.
- `libs/backend/memory-contracts` and `libs/backend/voice-contracts` have no workspace
  dependencies (same depth as `review-contracts`) but are tagged `scope:extension, type:core`.
  The three `*-contracts` libs do not share one tagging rule.
- `libs/shared/src/angular/index.ts` puts an Angular entry point inside the framework-neutral
  `shared` lib. It is a separate entry point, so backend bundles do not pull Angular, but the
  code is UI-scope code in a shared-scope project.
- `libs/frontend/webview-e2e-harness` (`type:test-harness`) imports `node:fs`/`path` in
  `src/lib/fixture-server.ts` and two scenario capture files. It is Node-side test tooling in the
  renderer scope folder.
- The `vscode` module alias for the Electron bundle points into another scope's library:
  `apps/ptah-electron/project.json:329` maps `vscode` to
  `./libs/backend/cli-engine/src/lib/shims/vscode-shim.ts` (`cli-engine` is `scope:cli`).
- `apps/ptah-extension-webview/src/app/` holds about 20 design-contract spec files
  (`glass-roles.spec.ts`, `state-ink-contrast.spec.ts`, `theme-pre-paint-parity.spec.ts`, …)
  beside the app shell. They test tokens of `libs/frontend/ui` from the app folder.

### Angular 22 (renderer and landing page) — follows conventions

| Expected convention | Observed | Verdict |
| --- | --- | --- |
| Standalone components, no NgModules | 0 `@NgModule` in `libs/frontend`, `libs/web` and both Angular apps | Followed |
| `app.config.ts` + `app.routes.ts` composition root | `apps/ptah-extension-webview/src/app/app.config.ts`, `app.routes.ts` | Followed |
| Lazy routes | 16 `loadComponent`/`loadChildren` uses in `app.routes.ts` | Followed |
| OnPush everywhere | 646 `OnPush` for 649 `@Component` in `libs/frontend`; 20/20 in `libs/web`; 19/20 in the webview app | Followed |
| Built-in control flow | 3,646 `@if`/`@for` against 2 `*ngIf`/`*ngFor` in `libs/frontend` | Followed |
| Feature libs split into `components/` + `services/` | True for 10 of 30 libs (`cron-scheduler-ui`, `machines-ui`, `memory-curator-ui`, `setup-wizard`, …). Others use feature-slice folders (`git-ui`: 14 slices; `onboarding`: 9), atomic folders (`chat-ui`: `atoms`, `molecules`, `organisms`) or a flat `src/lib` (`chat-state`: 24 root files, `chat-streaming`: 28) | Three layouts in use |

### Electron 44 — follows conventions

| Expected convention | Observed | Verdict |
| --- | --- | --- |
| Separate main, preload and renderer | `apps/ptah-electron/src/main.ts`, `src/preload.ts`; renderer is the separate project `apps/ptah-extension-webview` | Followed |
| Heavy work off the main thread | Nine worker/host bundles (`build-*-worker` targets); `apps/ptah-electron/worker-host/` | Followed |
| IPC in one place with sender checks | `apps/ptah-electron/src/ipc/ipc-bridge.ts`, `ipc-sender-policy.ts` | Followed |
| No `electron` import in shared libraries | 0 `from 'electron'` imports in `libs/backend`, `libs/frontend`, `libs/shared`; 32 files in `apps/ptah-electron/src` | Followed |
| Thin main entry | `main.ts` is 576 lines; boot logic is in `src/activation/` (26 files) and `src/di/` (20 files) | Followed |

### Backend libraries (tsyringe, Node) — partially follows

There is no framework-defined layout here; the workspace's own convention is
`src/lib/di/` (tokens + `register*` function) plus domain folders.

- 26 of 42 backend libs have a `di/` folder under `src/lib` (or `src/` for the older ones).
- Five libs have no `src/lib` at all and put domain folders directly under `src/`:
  `platform-cli`, `platform-electron`, `settings-core`, `vscode-core`,
  `workspace-intelligence`.
- Several libs keep most code flat in `src/lib`: `codex-runtime` (30 root files),
  `memory-curator` (28), `worker-runtime` (26), `task-specs` (19), `skill-synthesis` (18),
  `agent-sdk` (18 root files beside 14+ folders).
- `libs/backend/platform-core/src/` mixes port interfaces (`interfaces/`, 40+ files) with
  concrete services and one-off migrations at the root
  (`agent-pack-download.service.ts`, `content-download.service.ts`,
  `legacy-threshold-migration.ts`, `session-budget-measure-migration.ts`).

**Overall adherence: follows conventions**, with partial adherence in (a) folder-versus-tag
placement of the contract/shared libs and (b) the inner layout of backend libs.

---

## Detected Patterns

| # | Pattern | Evidence | Confidence |
| --- | --- | --- | --- |
| 1 | **Nx tagged monorepo with enforced module boundaries** | `eslint.config.mjs:232-400` (`depConstraints` for 9 scope tags and 8 type tags); tags in all 84 `project.json` files | High |
| 2 | **Layered acyclic library graph** | Scan result: 0 cycles; longest dependency chain is 12 levels, from `libs/backend/review-contracts` (level 0) to `libs/backend/worker-host` (level 12) | High |
| 3 | **Ports and adapters (hexagonal) for the host platform** | Ports: `libs/backend/platform-core/src/interfaces/*.interface.ts` (file system, secret storage, state storage, user interaction, editor, process spawner, …). Adapters: `libs/backend/platform-electron/src/implementations/electron-*.ts` (26 files), `libs/backend/platform-cli/src/implementations/`. Tokens: `libs/backend/platform-core/src/di/tokens.ts` | High |
| 4 | **Dependency injection with symbol tokens (tsyringe)** | 535 `@injectable()` classes and 2,222 `@inject(` parameters in `libs/backend`; token files such as `libs/backend/vscode-core/src/di/tokens.ts` (293 lines, 86 token lines); 55 exported `register*` functions | High |
| 5 | **Phased composition root** | `apps/ptah-electron/src/di/container.ts` (85 lines) with `phase-0-platform.ts`, `phase-1-infra.ts`, `phase-2-libraries.ts`, `phase-3-storage.ts`, `phase-4-handlers.ts`; `expected-resolvable.ts`; boot sequencing in `apps/ptah-electron/src/activation/boot-coordinator.ts` | High |
| 6 | **Typed RPC over IPC with a shared contract** | Contract: `libs/shared/src/lib/types/rpc.types.ts` (4,311 lines) and 122 sibling type files. Server: `libs/backend/vscode-core/src/messaging/rpc-handler.ts` (`RpcHandler.registerMethod`), handlers in `libs/backend/rpc-handlers/src/lib/handlers/*-rpc.handlers.ts` with a paired `*-rpc.schema.ts`. Client: `libs/frontend/core/src/lib/services/claude-rpc.service.ts`. Transport: `apps/ptah-electron/src/ipc/ipc-bridge.ts` | High |
| 7 | **Boundary validation with Zod** | 1,010 `z.object(` in `libs/backend`, 100 in `libs/shared`, 51 in `libs/worker-protocol` (`frames.ts`, `methods.ts`); per-handler schema files such as `chat-rpc.schema.ts` | High |
| 8 | **Push-message router with multi-provider handlers** | `MESSAGE_HANDLERS` in `libs/frontend/core/src/lib/services/message-router.service.ts` and `message-router.types.ts`; `provideMessageRouter()` in `app.config.ts:238` | High |
| 9 | **Signal-based services as stores (no global store library)** | `libs/frontend`: 1,979 `signal(`, 3,147 `computed(`, 565 `.asReadonly()`, 0 `BehaviorSubject`, 0 `@ngrx/`; e.g. `libs/frontend/tasks-ui/src/lib/services/tasks-store.service.ts`, `libs/frontend/core/src/lib/services/plan-limits.store.ts` | High |
| 10 | **Standalone, OnPush, signal-input components** | 2,301 `input()` / 863 `output()` against 0 `@Input(`/`@Output(` in `libs/frontend`; 646/649 OnPush | High |
| 11 | **Dependency inversion in the renderer through `InjectionToken`s** | `libs/frontend/core/src/lib/tokens/` (11 token files, e.g. `workspace-coordinator.token.ts`, `file-link-opener.token.ts`, `lazy-view-components.token.ts`); bound in `app.config.ts` | High |
| 12 | **Secondary entry points for bundle splitting** | `libs/frontend/tasks-ui/src/services.ts`, `presentation.ts`; `libs/frontend/marketplace/src/services.ts`, `harness.ts`; `libs/frontend/chat-ui/src/mermaid.ts`, `vitals.ts`; rule exceptions listed at `eslint.config.mjs:258-278` | High |
| 13 | **Atomic design (one lib)** | `libs/frontend/chat-ui/src/lib/atoms`, `molecules`, `organisms` | High for `chat-ui`; not used elsewhere |
| 14 | **Design-system library** | `libs/frontend/ui/src/lib/` (`button`, `card`, `form-controls`, `overlays`, `foundation`, `motion`, …), 22 dependent projects | High |
| 15 | **Feature-sliced libs** | `libs/frontend/git-ui/src/lib/` (`commit`, `conflict`, `history`, `stash`, `source-control`, …); `libs/backend/harness-sync/src/lib/` (`reconciler`, `manifest`, `quarantine`, `repair`, …) | High |
| 16 | **Contract libraries** | `libs/backend/memory-contracts`, `voice-contracts`, `review-contracts`, `libs/frontend/chat-types`, `libs/worker-protocol` — all at level 0–2 of the graph | High |
| 17 | **Worker offloading with a versioned protocol** | `libs/worker-protocol/src/lib/frames.ts`, `methods.ts`, `version.ts`; `libs/backend/worker-host`, `worker-runtime`; state-storage worker in `libs/backend/platform-electron/src/implementations/electron-state-storage-worker*.ts` | High |
| 18 | **Adapter/strategy for external providers** | `libs/backend/messaging-gateway/src/lib/adapters/adapter.interface.ts` with `discord/`, `slack/`, `telegram/`; `libs/backend/auth-providers/src/lib/providers/` | High |
| 19 | **Local ports inside a feature lib** | `libs/backend/task-end-hook/src/lib/ports/*.port.ts` (9 ports); `libs/backend/settings-core/src/ports/` | High |
| 20 | **Repository + migration runner for SQLite** | `libs/backend/persistence-sqlite/src/lib/migration-runner.ts`, `migrations/`, `session-store/`; `libs/backend/settings-core/src/repositories/` | Medium (file names read, bodies not audited) |
| 21 | **Compatibility shim for a legacy host API** | `libs/backend/cli-engine/src/lib/shims/vscode-shim.ts`, aliased as `vscode` in `apps/ptah-electron/project.json:329`; `apps/ptah-electron/src/shims/` | High |
| 22 | **Custom static check for DI wiring** | `tools/di-lint/check-injects.ts` (run by the pre-push hook per `CLAUDE.md`) | High |
| 23 | **Service locator (anti-pattern, limited)** | About 190 `container.resolve`-style calls in `libs/backend` outside `di/`, registration and bootstrap files; e.g. `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` (10) | Medium (regex count) |

Not detected: DDD tactical patterns (aggregates, value objects, domain events as a layer), CQRS,
MVC controllers, NgRx/Redux-style global store, micro-frontends.

---

## Stack Summary

```stack-summary
{"items":[
{"kind":"pattern","name":"Nx tagged monorepo with enforced module boundaries","evidence":"eslint.config.mjs:232 @nx/enforce-module-boundaries 'error' with scope:* and type:* depConstraints; all 84 scanned project.json files carry both tags","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Acyclic layered library graph","evidence":"Import scan of libs/ and apps/: 470 production project pairs, 0 cycles, 12 levels from libs/backend/review-contracts to libs/backend/worker-host","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Ports and adapters for the host platform","evidence":"libs/backend/platform-core/src/interfaces/*.interface.ts implemented by libs/backend/platform-electron/src/implementations/electron-*.ts and libs/backend/platform-cli/src/implementations","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"tsyringe dependency injection with symbol tokens","evidence":"libs/backend/vscode-core/src/di/tokens.ts and libs/backend/platform-core/src/di/tokens.ts; 535 @injectable() classes in libs/backend","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Phased composition root","evidence":"apps/ptah-electron/src/di/container.ts with phase-0-platform.ts through phase-4-handlers.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Per-library DI registration functions","evidence":"55 exported register* functions in libs/backend, e.g. libs/backend/vscode-core/src/di/register.ts and libs/backend/platform-electron/src/registration.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Typed RPC over IPC with shared contract","evidence":"libs/shared/src/lib/types/rpc.types.ts; libs/backend/vscode-core/src/messaging/rpc-handler.ts; libs/frontend/core/src/lib/services/claude-rpc.service.ts; apps/ptah-electron/src/ipc/ipc-bridge.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"RPC handler classes with paired Zod schemas","evidence":"libs/backend/rpc-handlers/src/lib/handlers/chat-rpc.handlers.ts beside chat-rpc.schema.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Zod validation at process boundaries","evidence":"libs/worker-protocol/src/lib/frames.ts and methods.ts; 1010 z.object( uses in libs/backend production files","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Push-message router with multi-provider handlers","evidence":"MESSAGE_HANDLERS in libs/frontend/core/src/lib/services/message-router.service.ts; provideMessageRouter() in apps/ptah-extension-webview/src/app/app.config.ts:238","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Signal-based service stores","evidence":"libs/frontend/tasks-ui/src/lib/services/tasks-store.service.ts; libs/frontend/core/src/lib/services/plan-limits.store.ts; 1979 signal( and 0 BehaviorSubject in libs/frontend","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Standalone OnPush components with signal inputs","evidence":"libs/frontend: 646 OnPush for 649 @Component, 2301 input() and 0 @Input(), 0 @NgModule","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Zoneless change detection with zone fallback","evidence":"apps/ptah-extension-webview/src/app/app.config.ts:194-195 selects provideZoneChangeDetection or provideZonelessChangeDetection","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Lazy-loaded routes","evidence":"apps/ptah-extension-webview/src/app/app.routes.ts has 16 loadComponent/loadChildren uses","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"InjectionToken dependency inversion in the renderer","evidence":"libs/frontend/core/src/lib/tokens/workspace-coordinator.token.ts and 10 sibling token files","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Secondary entry points for bundle splitting","evidence":"libs/frontend/tasks-ui/src/services.ts and presentation.ts; exceptions listed in eslint.config.mjs:258-278","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Atomic design in chat-ui","evidence":"libs/frontend/chat-ui/src/lib/atoms, molecules, organisms","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Design-system library","evidence":"libs/frontend/ui/src/lib (button, card, form-controls, overlays, foundation); imported by 22 projects","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Feature-sliced library folders","evidence":"libs/frontend/git-ui/src/lib (commit, conflict, history, stash, source-control); libs/backend/harness-sync/src/lib","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Contract libraries","evidence":"libs/backend/memory-contracts, libs/backend/voice-contracts, libs/backend/review-contracts, libs/frontend/chat-types, libs/worker-protocol","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Worker offloading with versioned protocol","evidence":"libs/worker-protocol/src/lib/version.ts and frames.ts; libs/backend/worker-host; nine worker build targets in apps/ptah-electron/project.json","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Provider adapter interface","evidence":"libs/backend/messaging-gateway/src/lib/adapters/adapter.interface.ts with discord, slack, telegram folders","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Feature-local ports","evidence":"libs/backend/task-end-hook/src/lib/ports/*.port.ts (9 files); libs/backend/settings-core/src/ports","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"SQLite migration runner and repositories","evidence":"libs/backend/persistence-sqlite/src/lib/migration-runner.ts and migrations/; libs/backend/settings-core/src/repositories","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"vscode API compatibility shim","evidence":"apps/ptah-electron/project.json:329 aliases vscode to libs/backend/cli-engine/src/lib/shims/vscode-shim.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Custom DI wiring lint","evidence":"tools/di-lint/check-injects.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Service locator calls outside composition code","evidence":"about 190 container.resolve-style calls outside di/registration files in libs/backend, e.g. libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts","sourcePhase":"architecture-assessment"},
{"kind":"pattern","name":"Hub orchestration libraries","evidence":"libs/backend/rpc-handlers imports 32 projects; libs/backend/cli-engine imports 33; libs/frontend/chat imports 17","sourcePhase":"architecture-assessment"}
]}
```

---

## Pattern Consistency

### Applied correctly

- **Module boundaries.** Re-applying the scope and type rules of `eslint.config.mjs` to the
  scanned import graph gives 0 violations. No `scope:webview` lib imports a `scope:extension`
  lib. The only `libs/frontend` → `libs/backend` edge is `review-runs-ui` → `review-contracts`,
  which the `scope:shared` tag allows.
- **Platform isolation.** `electron` is imported only inside `apps/ptah-electron/src`
  (32 files). `vscode` is imported in `libs/backend/vscode-core` (16 files) and in four other
  places, each a named platform seam:
  `libs/backend/auth-providers/src/lib/providers/copilot/vscode-copilot-auth.service.ts`,
  `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/ide-capabilities.vscode.ts`,
  `libs/backend/agent-generation/src/lib/services/wizard/webview-lifecycle.service.ts`,
  `libs/backend/cli-engine/src/lib/shims/vscode-shim.ts`.
- **Angular component conventions.** OnPush on 646 of 649 components, signal inputs/outputs
  only, `inject()` (1,925 uses) instead of constructor injection, no NgModules, built-in
  control flow. This is uniform across all 30 frontend libs.
- **Renderer state.** No `BehaviorSubject` or `Subject` in any `libs/frontend` production file;
  one `Subject` in `apps/ptah-extension-webview/src/app/app.ts`.
- **Composition root.** Container wiring is concentrated in `apps/ptah-electron/src/di/`
  (250 resolve calls there) and in per-lib `di/` folders (about 351 resolve-style calls in
  `di/`, registration and bootstrap files).
- **RPC handlers.** Handler classes follow one naming scheme (`<domain>-rpc.handlers.ts` +
  `<domain>-rpc.schema.ts`) in `libs/backend/rpc-handlers/src/lib/handlers/`.

### Where patterns break down

| Breakdown | Evidence |
| --- | --- |
| **Service locator outside composition code.** Classes resolve dependencies from the container instead of receiving them | `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` (10 calls; 44 in the lib), `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts` (15; 33 in the lib), `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` (11; 27 in the lib), `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts` (7), `libs/backend/workspace-intelligence/src/composite/workspace-analyzer.service.ts`. Some of these (`wiring/`, `boot-*`) are composition code under another name, so the true count is lower than 190 |
| **`vscode-core` is the host-neutral backend core, not a VS Code layer.** 30 projects import it, including `platform-electron`, `platform-cli` and `persistence-sqlite`; it owns `RpcHandler`, logging, git services, licence, Sentry and the main `TOKENS` | `libs/backend/vscode-core/src/messaging/rpc-handler.ts`, `src/services/git-info.service.ts` (3,900 lines), `src/di/tokens.ts`; heaviest importers `rpc-handlers` (231 imports), `agent-sdk` (142). The name contradicts the "Electron first" rule of `CLAUDE.md`, and the lib still imports `vscode` in 16 production files that Electron satisfies through the shim alias |
| **Port layer is not pure.** `platform-core` holds concrete services and migrations beside the interfaces, and one interface file touches the container | `libs/backend/platform-core/src/agent-pack-download.service.ts`, `content-download.service.ts`, `legacy-threshold-migration.ts`; `src/interfaces/memory-writer.interface.ts` (1 resolve-style call) |
| **Adapter folder naming.** Platform adapters use `implementations/`; other libs use `adapters/`, `providers/` or `ports/` for the same role | `libs/backend/platform-electron/src/implementations/`, `libs/backend/messaging-gateway/src/lib/adapters/`, `libs/backend/auth-providers/src/lib/providers/`, `libs/backend/task-end-hook/src/lib/ports/` |
| **Library layout is not uniform.** Five backend libs have no `src/lib`; 16 backend libs have no `di/` folder; frontend libs use three different inner layouts | `libs/backend/vscode-core/src/`, `libs/backend/settings-core/src/`; `libs/frontend/chat-ui/src/lib/atoms` vs `libs/frontend/git-ui/src/lib/commit` vs `libs/frontend/chat-state/src/lib/*.ts` |
| **Contract libs tagged by two rules** | `review-contracts`: `scope:shared, type:util`; `memory-contracts` and `voice-contracts`: `scope:extension, type:core` |
| **`type:util` used for stateful infrastructure.** A util lib is expected to be stateless helpers | `libs/backend/persistence-sqlite` (`type:util`, owns the SQLite connection, migrations, backups), `libs/backend/vscode-core` (`type:util`, owns services and the RPC dispatcher), `libs/backend/platform-core` (`type:util`) |
| **Libs import their own alias.** 14 libs have production imports of `@ptah-extension/<self>` | `libs/frontend/ui` (7), `libs/frontend/marketplace` (4), `libs/frontend/tasks-ui` (3), `libs/backend/agent-generation` (2). These are mostly secondary entry points reaching the main barrel; they are a path to an intra-lib cycle that the Nx rule does not see |
| **Single-responsibility at file level.** Several files exceed 2,400 lines | `libs/backend/vscode-lm-tools/src/lib/mcp-core/protocol-dispatcher.ts` (4,679), `libs/shared/src/lib/types/rpc.types.ts` (4,311), `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` (4,288), `libs/backend/vscode-core/src/services/git-info.service.ts` (3,900), `libs/backend/rpc-handlers/src/lib/session/chat-session.service.ts` (3,487), `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` (3,386), `libs/backend/agent-sdk/src/lib/session-metadata-store.ts` (2,976), `libs/frontend/tasks-ui/src/lib/services/tasks-store.service.ts` (2,764), `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts` (2,462) |
| **Stale test reference** | `libs/frontend/chat/src/lib/services/workspace-coordinator.service.spec.ts` references `@ptah-extension/editor/services`, which matches no alias in `tsconfig.base.json` |

---

## Dependency Flow

### Direction

Dependencies point inward and downward. Production import pairs by group:

| From → To | Project pairs | Production imports |
| --- | --- | --- |
| `apps` → `libs/backend` | 38 | 304 |
| `apps` → `libs/frontend` | 35 | 68 |
| `apps` → `libs/shared` | 7 | 49 |
| `libs/backend` → `libs/backend` | 239 | 2,342 |
| `libs/backend` → `libs/shared` | 62 | 1,100 |
| `libs/backend` → `libs/worker-protocol` | 3 | 30 |
| `libs/frontend` → `libs/frontend` | 175 | 1,396 |
| `libs/frontend` → `libs/shared` | 45 | 767 |
| `libs/frontend` → `libs/backend` | 1 | 11 (`review-runs-ui` → `review-contracts`) |
| `libs/shared` → `libs/backend` | 1 | 1 (`shared` → `review-contracts`) |
| `libs/worker-protocol` → `libs/shared` | 1 | 2 |
| any lib → `apps` | 0 | 0 |
| `libs/backend` → `libs/frontend` | 0 | 0 |

Layer order found by longest dependency chain (level 0 has no workspace dependency):

| Level | Projects |
| --- | --- |
| 0 | `memory-contracts`, `voice-contracts`, `review-contracts`, `frontend/markdown` |
| 1 | `shared` |
| 2 | `platform-core`, `auth-providers-tokens`, `worker-protocol`, `frontend/ui`, `frontend/core`, `frontend/chat-types` |
| 3 | `vscode-core`, `settings-core`, `codex-runtime`, `lane-routing`, `frontend/chat-state`, `frontend/tasks-ui`, `frontend/git-ui`, … |
| 4 | `persistence-sqlite`, `workspace-intelligence`, `harness-sync`, `platform-electron`, `frontend/chat-streaming`, … |
| 5 | `agent-sdk`, `task-specs`, `review-core`, `messaging-gateway`, `frontend/chat-ui`, `frontend/chat-routing` |
| 6 | `auth-providers`, `memory-curator`, `cron-scheduler`, `platform-cli`, `frontend/marketplace`, `frontend/machines-ui`, `frontend/dashboard` |
| 7 | `cli-agent-runtime`, `skill-synthesis`, `usage-analytics`, `frontend/chat` |
| 8 | `vscode-lm-tools`, `frontend/canvas`, `frontend/command-center`, `frontend/setup-wizard`, `frontend/mcp-apps-page`, `frontend/thoth-shell` |
| 9 | `rpc-handlers`, `gateway-chat-bridge`, `frontend/onboarding` |
| 10 | `thoth-runtime`, `worker-runtime`, app `ptah-extension-webview` |
| 11 | `cli-engine`, app `ptah-electron` |
| 12 | `worker-host` |

### Violations and weak points

1. **`shared` is not the bottom layer.** `libs/shared/src/lib/types/rpc-review.types.ts:2`
   has `import type { ReviewRpcSchemas } from '@ptah-extension/review-contracts'`. It is a
   type-only import and the tags allow it, but it means the library that 66 projects depend on
   itself depends on a lib under `libs/backend/`.
2. **Cross-project relative imports (tests only).** 11 imports in 3 spec files reach into
   another project's `src/` by relative path, which bypasses both the public barrel and the
   Nx rule:
   - `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-approval-presentation.spec.ts`
     → `../../../../../agent-sdk/src/lib/system-abort-permission-message` (and one more)
   - `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-host-ports.spec.ts`
     → `agent-sdk/src/lib/...` (3 imports)
   - `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-native-contract.spec.ts`
     → `codex-runtime/src/lib/codex-event-translator` (and 3 more)
   - `apps/ptah-electron/src/shims/vscode-shim.integration.spec.ts`
     → `../../../../libs/backend/agent-sdk/src/lib/helpers/config-watcher` (and one more)
3. **Alias outside the lint graph.** `apps/ptah-electron/project.json:329` wires `vscode` to a
   file in `libs/backend/cli-engine`. A bundler alias is not an import, so the boundary rule
   does not check that `scope:electron` → `scope:cli` edge.
4. **The Nx rule is project-granular.** The exception list at `eslint.config.mjs:258-278`
   (8 subpaths plus `@ptah-extension/shared`) records that eager/lazy correctness depends on
   which entry point is imported. That invariant is guarded by comments and a bundle check
   (`verify-eager-bundle` target), not by the dependency rule itself.
5. **`scope:electron` and `scope:cli` may import all `scope:extension` libs**
   (`eslint.config.mjs:315-329`), and `type:feature` may import any `type:feature`. With 57 of
   84 projects tagged `type:feature`, 153 of 470 production pairs are feature → feature. The
   rules prove direction (no cycles) but do not limit how wide a feature may reach.

**Layer boundary assessment: sound.** Renderer and main-process code are fully separated,
there are no upward imports and no cycles. The weak points are the width of feature-to-feature
dependencies and the naming/tagging of the lowest layers.

---

## Coupling Analysis

### Fan-in (stability) — number of projects with a production import

| Project | Dependents | Note |
| --- | --- | --- |
| `libs/shared` | 66 | Expected for a contract lib; holds 272 production files and 61,525 lines |
| `libs/backend/platform-core` | 35 | Ports — expected |
| `libs/backend/vscode-core` | 30 | Concrete infrastructure with high fan-in |
| `libs/frontend/core` | 23 | Renderer infrastructure |
| `libs/frontend/ui` | 22 | Design system |
| `libs/backend/agent-sdk` | 15 | Concrete feature lib (80,458 lines) with high fan-in |
| `libs/backend/persistence-sqlite` | 15 | Concrete storage |
| `libs/frontend/chat-state` | 12 | |
| `libs/backend/settings-core`, `libs/frontend/chat-types` | 11 each | |

### Fan-out — number of projects imported

| Project | Dependencies | Note |
| --- | --- | --- |
| app `ptah-electron` | 38 | Composition root — expected |
| `libs/backend/cli-engine` | 33 | Second composition root (CLI host) living in a lib |
| `libs/backend/rpc-handlers` | 32 | 31 of the other 41 backend libs, plus `shared` |
| app `ptah-extension-webview` | 23 | Composition root — expected |
| `libs/frontend/chat` | 17 | Imports more than half of the frontend libs |
| `libs/backend/cli-agent-runtime` | 13 | |
| `libs/backend/vscode-lm-tools` | 12 | |

### Tight-coupling hotspots

1. **`libs/backend/rpc-handlers` (84,136 lines, 292 files, fan-out 32).** It is the API layer
   and also holds application services (`src/lib/session/chat-session.service.ts`, 3,487 lines;
   `src/lib/services/`, `src/lib/harness/`, `src/lib/migrations/`). Every backend feature
   change tends to touch it, and it has 231 imports of `vscode-core` alone. It is used by only
   5 projects (`ptah-electron`, `cli-engine`, `thoth-runtime`, `worker-host`,
   `worker-runtime`), so the coupling is outward only.
2. **`libs/frontend/chat` (105,530 lines, 392 files, fan-out 17).** The largest project in the
   workspace. It contains the chat feature and also settings (`src/lib/settings/`), the update
   dialog and provider wizards. It imports peer feature libs: `machines-ui/services` (4 files),
   `tasks-ui/presentation` (4), `marketplace/services` (3). Five other feature libs import it
   (`canvas` 19 imports, `command-center` 8, `onboarding` 6, `setup-wizard`, `mcp-apps-page`).
3. **`libs/backend/vscode-core` (fan-in 30, 23,930 lines).** High fan-in on a lib of concrete
   classes: a change to `git-info.service.ts` or `tokens.ts` invalidates the Nx cache of 30
   projects. The single `TOKENS` object (`src/di/tokens.ts`, 293 lines) is a shared edit point.
4. **`libs/shared/src/lib/types/rpc.types.ts` (4,311 lines).** One file is the contract for
   every RPC method. With `shared` at fan-in 66, any RPC change is a cache miss for the whole
   workspace and a merge-conflict point for parallel work.
5. **`libs/backend/agent-sdk` (80,458 lines, fan-in 15, fan-out 9).** Large, concrete and both
   widely used and widely dependent; `src/lib` has 18 root files beside 14+ folders.
6. **`libs/backend/cli-engine` (fan-out 33).** A library that acts as a composition root for
   the CLI host. It also owns the `vscode` shim that the Electron build uses, which couples
   the two hosts through a file path.

### Loose-coupling examples

- **Platform ports.** `libs/backend/platform-core/src/interfaces/` lets 35 projects depend on
  interfaces; `platform-electron` has only 3 imports of `vscode-core` and no lib imports
  `platform-electron` or `platform-cli` except host composition code.
- **Renderer inversion tokens.** `libs/frontend/core/src/lib/tokens/` (11 tokens) lets
  low-level libs call upward without importing feature libs
  (`workspace-coordinator.token.ts`, `attention-lane-opener.token.ts`).
- **Contract libs.** `memory-contracts`, `voice-contracts`, `review-contracts`, `chat-types`
  and `worker-protocol` have zero or one workspace dependency each.
- **Leaf feature libs.** `cron-scheduler-ui`, `messaging-gateway-ui`, `review-runs-ui`,
  `workspace-indexing`, `notification-center` sit at level 3 and depend only on `core`, `ui`
  and `shared`.
- **Feature-local ports.** `libs/backend/task-end-hook/src/lib/ports/` (9 ports) keeps that
  lib independent of git, PR and curation implementations.
- **`libs/web/*`** (landing site) has no imports from, and no dependents in, the product libs.

---

## State Management

### Renderer (`libs/frontend`, `apps/ptah-extension-webview`)

- **Mechanism: Angular signals held in injectable services.** There is no store library
  (0 `@ngrx/` imports). Counts in `libs/frontend` production files: 1,979 `signal(`,
  3,147 `computed(`, 438 `effect(`, 565 `.asReadonly()`, 19 `linkedSignal(`, 292
  `@Injectable(` services.
- **Store shape.** Private writable signal, public read-only signal, methods as the only
  writers. Examples: `libs/frontend/tasks-ui/src/lib/services/tasks-store.service.ts`,
  `libs/frontend/core/src/lib/services/plan-limits.store.ts`,
  `libs/frontend/chat-state/src/lib/queued-follow-up.store.ts`,
  `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts`.
- **State libraries.** `chat-state` (`type:data-access`: tab manager, session bindings,
  registries), `chat-streaming` (stream reduction), `core` (app, auth, model, provider, theme
  state in `src/lib/services/*-state.service.ts`).
- **Server state.** Pulled by RPC calls (`claude-rpc.service.ts`, `rpc-call.util.ts`) and
  pushed by main-process messages routed through `MESSAGE_HANDLERS`
  (`message-router.service.ts`). Angular `resource()`/`httpResource()` is not used; there is
  no HTTP layer in the renderer.
- **RxJS.** Minimal: 19 `.subscribe(` in 15 files (router events, DOM triggers, e.g.
  `libs/frontend/chat/src/lib/directives/at-trigger.directive.ts`), 5 `toSignal(`, no
  Subjects in libs.
- **Change detection.** Zoneless by default with a zone fallback switch:
  `app.config.ts:194-195`. `zone.js` remains a dependency for the fallback.
- **Persistence.** Per-feature helpers such as
  `libs/frontend/chat-state/src/lib/tab-persistence.ts` and
  `libs/frontend/core/src/lib/services/electron-layout-persisted-state.ts`.

### Main process (`libs/backend`, `apps/ptah-electron`)

- **Singleton services in the tsyringe container** hold in-memory state.
- **Durable state** goes through ports: `state-storage.interface.ts`,
  `secret-storage.interface.ts`, `session-record-repository.interface.ts` in `platform-core`,
  with Electron implementations (`electron-state-storage*.ts`, worker-backed) and SQLite
  (`libs/backend/persistence-sqlite`: connection service, migration runner, session store).
- **Settings** have their own lib with repositories, schema, scope and a reactive layer
  (`libs/backend/settings-core/src/repositories`, `schema`, `scope`, `reactive`).
- **Eventing** is mostly direct calls and callbacks; 18 `EventEmitter` uses and 13
  `.subscribe(` in `libs/backend`.

### Consistency

Consistent. One mechanism (signals in services) is used across all renderer libs, with no
competing store. Two gaps:

- **Store size.** `agent-monitor.store.ts` (3,386 lines), `tasks-store.service.ts` (2,764) and
  `app-state.service.ts` (1,486) each combine many concerns in one class.
- **Naming.** Stores are named `*.store.ts`, `*-store.service.ts`, `*-state.service.ts`,
  `*.registry.ts` and `*.facade.ts` without a stated rule for which is which.

---

## Pattern Comparison

### Patterns in use

Nx tagged monorepo with enforced boundaries; acyclic layered libs; ports and adapters for the
host; tsyringe DI with symbol tokens and a phased composition root; typed RPC over IPC with Zod
schemas; push-message routing; signal stores; standalone OnPush zoneless Angular; lazy routes
and secondary entry points; design-system lib; worker offloading with a versioned protocol;
contract libs; SQLite migrations.

### Recommended for this stack

| Recommendation (Nx + Angular 22 + Electron + Node) | Status here |
| --- | --- |
| Tag-enforced boundaries on two axes (scope, type) | **Met** — `error` severity, 0 violations |
| No circular dependencies | **Met** — 0 cycles |
| Thin apps, logic in libs | **Met** |
| Main / preload / renderer separation with validated IPC | **Met** |
| Standalone, OnPush, signals, zoneless, built-in control flow | **Met** |
| Lazy feature routes | **Met** |
| Constructor injection only; container access only in the composition root | **Partly met** — about 190 resolve-style calls outside `di/` and registration files |
| Small, focused libs (Nx guidance: split when a lib becomes a merge and cache hotspot) | **Partly met** — 78 libs, but `chat` (105k lines), `rpc-handlers` (84k), `agent-sdk` (80k), `shared` (62k) and `cli-agent-runtime` (59k) hold 37% of all production lines |
| `feature` libs depend on `data-access`/`ui`/`util`, not on peer features | **Not met** — 153 feature → feature pairs; only 2 `type:data-access` libs exist |
| A third tag axis (domain / bounded context) to limit feature reach | **Not present** — `domain:vscode` is used once |
| Contract-first RPC split per domain | **Partly met** — per-domain handler and schema files exist, but the type contract is one 4,311-line file |
| Names that match the role | **Partly met** — `vscode-core` is the host-neutral core; `provideVSCodeService()` and `vscode.service.ts` are the renderer host bridge |
| Uniform inner layout per lib type | **Partly met** — three frontend layouts; five backend libs without `src/lib` |
| Stateless `util` libs | **Partly met** — `persistence-sqlite`, `vscode-core`, `platform-core` are `type:util` with stateful services |

### Gap analysis

| # | Gap | Impact | Suggested direction |
| --- | --- | --- | --- |
| 1 | Hub libraries (`rpc-handlers`, `chat`, `agent-sdk`) concentrate code and dependencies | Slow tests and cache misses on every change; merge conflicts for parallel lanes; hard to reason about ownership | Move application services out of `rpc-handlers` into their domain libs so handlers stay thin; split `chat` (settings and provider wizards are separable — `src/lib/settings/`) |
| 2 | Feature → feature dependencies are unrestricted | The graph stays acyclic only by convention; depth is already 12 levels | Add a `domain:*` tag axis, or promote shared state/services into `type:data-access` libs so features stop importing peer features |
| 3 | `vscode-core` name and content | Misleads contributors and lanes under the Electron-first rule; 16 files still import `vscode` and run through a shim | Split into a host-neutral infrastructure lib (RPC, logging, git, licence) and a small VS Code adapter; rename tokens and `vscode.service.ts` over time |
| 4 | `shared` is large and has one giant RPC type file; it depends on `backend/review-contracts` | Any contract edit rebuilds 66 projects | Split `rpc.types.ts` by domain; move `review-contracts` beside `shared` (or under `libs/shared/`) so the bottom layer is in one place |
| 5 | Service-locator calls in handlers and services | Hidden dependencies; `tools/di-lint` cannot see them as constructor edges | Convert to constructor injection; keep `container.resolve` to `di/`, `wiring/` and boot files and make that a lint rule |
| 6 | Tag semantics drift (`type:util` for stateful infrastructure; two rules for contract libs; folder ≠ scope for three libs) | Type rules lose meaning: `util → util` permits storage-to-core edges | Introduce `type:infra` (or reuse `type:data-access`) for `persistence-sqlite`/`vscode-core`; one tag rule for `*-contracts` |
| 7 | Cross-project relative imports in 3 spec files | Tests bind to private file paths of other libs and break on internal moves | Export the needed symbols from a `testing` entry point or the barrel |
| 8 | `vscode` shim aliased from `cli-engine` into the Electron build | An unlinted cross-scope dependency between two hosts | Move the shim to a `scope:shared` or `scope:extension` lib that both hosts import |
| 9 | Inner layout differs between libs | Higher search cost; generators and lanes cannot assume a shape | Document one layout per lib type (feature, data-access, ui, contracts) in `CONVENTIONS.md` and apply it to new libs |
| 10 | Very large files (9 files above 2,400 lines) | Review and merge cost; single classes with many responsibilities | Split along existing seams (per-domain RPC types, git read/write, process lifecycle vs. I/O) |

### Summary

The architecture is deliberate and well enforced. Direction is correct everywhere that was
measured: no cycles, no renderer-to-main imports, no tag violations, and the Angular and
Electron conventions are applied almost without exception. The risks are about **size and
width**, not direction: a few hub libraries and one contract file carry a large share of the
code and the dependencies, feature libraries may depend on any other feature library, and the
names and tags of the lowest backend layer (`vscode-core`, `type:util`) no longer describe what
that layer does.
