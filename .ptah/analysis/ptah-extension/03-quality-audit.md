# Quality Audit — ptah-extension

Phase 3 of the workspace analysis. Inputs: `01-project-profile.md`, `02-architecture-assessment.md`.
Collected 2026-11-17 on branch `main` (head `b4ab8f096`).

**Method.** Regular-expression counts over every `.ts` file under `libs/` and `apps/`, split into
production files (4,436 files, about 1.05 million lines) and test files (3,622 files, about
1.35 million lines; `.spec.ts`, `.test.ts`, `/testing/`, `__mocks__`, `*-e2e/`). The counts are
approximate. Each file-level finding below was then read in the source; where a finding rests on
a count only, it says so. No test, lint or build target was run for this audit.

## Overall Quality Score

**84 / 100.**

| Factor | Effect | Evidence |
| --- | --- | --- |
| Type discipline in production code | + | 67 `any` uses and 3 `as any` in 1.05 million production lines; 79 of 84 projects set `strict: true` |
| Electron hardening | + | `contextIsolation`, `sandbox`, `webSecurity` on every window; navigation guard; IPC sender check; permission policy |
| Untrusted-content handling in the renderer | + | One `[innerHTML]` binding in all production templates; DOMPurify chokepoint; 3 narrowly-scoped sanitizer bypasses |
| Process spawning | + | 0 real `shell: true` in production code (all 9 regex hits are comments that explain its removal) |
| Error handling | + | 3 empty `catch {}` hits, none of them real; swallowed errors carry an audit comment; global handlers in the main process |
| Test volume and assertions | + | 3,457 spec files, about 53,000 tests, 2.8 `expect` per test, 5 snapshot assertions, 76 Electron e2e specs |
| File and class size | − | 9 files above 2,400 lines; 33 Angular components above 800 lines; the file-size lint is `warn` only |
| Sandbox timeout gap | − | `execute_code` timeout cannot stop synchronous code (see Security) |
| No type-aware promise lint | − | `no-floating-promises` rejected for cost; 924 `void fn()` statements rely on review |
| Strictness gaps | − | Root `strict: false`; 4 libraries inherit it, including `settings-core` (46 production files) |
| Test doubles and casts | − | 22,723 `jest.fn/mock/spyOn` and 5,513 `as unknown as` in test code |
| Coverage floors | − | 22 projects have a `coverageThreshold`; `agent-sdk` floor is 50% lines / 35% branches |
| Service-locator calls, `console.*` in production | − | About 190 container lookups outside composition code (Phase 2); 235 `console.log/info/debug` |

The code is consistently careful where it matters most (process boundary, untrusted HTML, child
processes), and most deviations are documented in place with a task reference. The score is held
down by size (very large files and classes), by a few systematic gaps that tooling does not
close (floating promises, the sandbox timeout, four non-strict libraries), and by test code that
depends heavily on mocks and casts.

## File-Level Findings

### `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/code-execution.engine.ts`

*Why:* it runs model-written code (`execute_code`); the highest-risk code path in the product.

- **Medium — the timeout does not cover synchronous code.** `executeCode` (line 296) builds a
  `node:vm` context (line 401) and races the run against a `setTimeout` promise (lines 413–451).
  The user code is compiled with `new AsyncFunction(...)` inside the context and called directly
  (bootstrap lines 172–181); no `timeout` option of `vm` is applied to that call. A synchronous
  loop (`while (true) {}`) never yields, so the timer and the abort listener cannot fire and the
  hosting process stays blocked. (Read from the code; not executed.)
- **Low — documented residual risk.** The header (lines 30–33) states that `node:vm` is not a
  provable boundary and names a worker/child-process isolate as the next step. That step is not
  done.
- *Observations:* strong design otherwise. A fresh realm per call, a null-prototype global, one
  bridge function, and JSON marshalling of every value across the boundary. The header records
  the earlier escape (`({}).constructor.constructor`) and why the new design closes it.

### `libs/backend/vscode-lm-tools/src/lib/mcp-core/protocol-dispatcher.ts` (4,679 lines)

*Why:* largest production file; dispatches every MCP tool call.

- **Medium — size.** One file holds protocol handling for all tools, including the
  `execute_code` call at line 4443. Review and merge cost is high.

### `libs/backend/vscode-core/src/messaging/rpc-handler.ts` (382 lines)

*Why:* single dispatcher for every renderer → main call.

- No issue found. Method names must match `ALLOWED_METHOD_PREFIXES` (line 46, checked at
  registration, line 178). Handler errors are caught (line 247); `RpcUserError` is logged at
  `warn` with repeat suppression; other errors go to Sentry through a wrapped reporter
  (line 372–380). Slow handlers are logged (line 300–320).
- *Observation:* parameter validation is not done here; it lives in each handler's
  `*-rpc.schema.ts`. A handler without a schema has no validation. Not audited per handler.

### `apps/ptah-electron/src/ipc/ipc-bridge.ts` (957 lines), `ipc-sender-policy.ts`, `preload.ts`

*Why:* the process boundary.

- No critical issue. `isTrustedIpcSender` accepts only a `file:` URL of the app's own document,
  and only from the main frame. Permission, question and agent-permission replies are parsed
  with Zod `safeParse` (lines 678, 729, 761).
- **Low — synchronous IPC.** `preload.ts` uses `ipcRenderer.sendSync` for `get-state` (line 25)
  and `get-startup-config` (line 18). Each call blocks the renderer until the main process
  answers.
- **Low — size.** 957 lines; the three reply channels repeat the same parse/catch shape.

### `apps/ptah-electron/src/windows/main-window.ts`, `window-guards.ts`, `permission-policy.ts`

*Why:* window security settings.

- No issue found. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true` (`main-window.ts:58-61`, `create-child-window.ts:21-24`,
  `electron-browser-capabilities.ts:515-518`). `installNavigationGuard` cancels every navigation
  except a same-document reload, denies `window.open`, and passes only safe schemes to
  `shell.openExternal` (`window-guards.ts:47-93`). A permission request handler is set
  (`permission-policy.ts:174`).

### `libs/backend/vscode-core/src/services/git-info.service.ts` (3,900 lines)

*Why:* large, high fan-in (30 dependent projects), most `as unknown as` casts in production (22).

- **Medium — casts that defeat the logger's type.** Lines 1219, 1249, 1292, 1314, 1511 pass a
  plain context object as `{ … } as unknown as Error`. The logger signature expects an `Error`;
  the cast hides that the call sites want a context-object overload.
- **Medium — size.** One class covers git read, write and watch concerns.

### `libs/backend/memory-curator/src/lib/code-symbol.store.ts`

*Why:* second-highest cast count (16).

- **Low.** Lines 438–466 cast `db.transaction(fn)` through `unknown` to a hand-written function
  type. The `better-sqlite3` generic transaction type is not used.

### `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts`

*Why:* most `any` in production (8).

- **Low.** `const blocks: any[]` at lines 335, 712, 1931, 2139, 2306, 2324, 2727 (input for
  `json2md`). A small union type for the block shapes would remove all of them.

### `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts` (773 lines)

*Why:* the only `[innerHTML]` binding in production templates (line 262).

- **Low.** `block.html` comes from `streamingMarkdown.render(content)` (line 682). The value is
  bound without `bypassSecurityTrustHtml`, so Angular's built-in sanitizer still applies. This
  audit did not confirm that the streaming renderer also runs the DOMPurify configuration used
  by `MarkdownBlockComponent`; the two paths should share it.
- No spec file with the same base name exists for this component.

### `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts` (2,462 lines), `chat-view.component.ts` (2,246), `chat-input.component.ts` (1,871)

*Why:* largest components.

- **Medium — size.** 33 production components exceed 800 lines (list in the Angular section).
  These three hold template, state and orchestration in one class.

### `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts` (3,487 lines)

*Why:* largest file without a same-named spec.

- **Medium — size.** Not a coverage gap: 25 spec files import it, split by behaviour
  (`chat-session.follow-up-queue.spec.ts`, `chat-session-auth.spec.ts`, …). The class is the
  problem, not its tests.

### `libs/backend/settings-core` (46 production files, 9 spec files)

*Why:* lowest spec ratio of any non-contract library, and not strict.

- **Medium.** `tsconfig.json` and `tsconfig.lib.json` set no `strict` flag, so the library
  inherits `strict: false` from `tsconfig.base.json:304`. Null checks and implicit `any` are not
  enforced in the settings layer.

### `apps/ptah-electron/src/activation/plugin-activation.ts`, `bootstrap.ts`; `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts`

*Why:* most `console.log` calls in production.

- **Low.** `plugin-activation.ts:233, 247, 294, 433, 482` and 12 calls in
  `boot-thoth-runtime.ts` write to the console instead of the injected `Logger`. In boot code
  the logger may not exist yet; the calls are still outside log levels and redaction.

## Anti-Pattern Inventory

| # | Anti-pattern | Location | Severity | Suggested fix |
| --- | --- | --- | --- | --- |
| 1 | Cooperative timeout around code that can block | `code-execution.engine.ts:413-451` (`executeCode`) | Medium | Run the sandbox in a worker thread or child process and terminate it on timeout; or compile with `vm.Script` and run the synchronous part with the `timeout` option |
| 2 | God files / god classes | `protocol-dispatcher.ts` (4,679), `agent-process-manager.service.ts` (4,288), `git-info.service.ts` (3,900), `chat-session.service.ts` (3,487), `agent-monitor.store.ts` (3,386), `session-metadata-store.ts` (2,976), `tasks-store.service.ts` (2,764) | Medium | Split along existing seams; raise the file-size lint from `warn` to `error` for new files with a recorded baseline for the old ones |
| 3 | Oversized components | 33 components above 800 lines, e.g. `provider-setup-wizard.component.ts`, `chat-view.component.ts`, `chat-input.component.ts`, `smithery-surface.component.ts` (1,512), `chat-transcript.component.ts` (1,504) | Medium | Move orchestration into services/stores; extract child components |
| 4 | Double cast to satisfy a signature | `git-info.service.ts:1219-1511` (`as unknown as Error`); 214 `as unknown as` in production over 97 files | Medium | Add a logger overload that takes a context object; type SQLite transactions with the library generics |
| 5 | Service locator outside composition code | About 190 calls (Phase 2), e.g. `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts`, `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts` | Medium | Constructor injection; restrict container access to `di/`, `wiring/`, `boot-*` with a lint rule |
| 6 | Unchecked fire-and-forget promises | 924 `void fn()` statements in production; no type-aware lint (`eslint.config.mjs:468-480`) | Medium | Extend the `floating-promise` AST check in `tools/degradation-audit` beyond its three directories, or run a type-aware lint in CI only |
| 7 | Silent `.catch(() => undefined)` | 89 in production over 64 files, e.g. `voice-rpc.handlers.ts:370, 447`, `machines-service.ts:113, 120` | Low | Keep the pattern for broadcasts, but log at `debug`; several sites already carry a `degradation-audit: reported` comment and others do not |
| 8 | Comment-only `catch` blocks | 223 in production over 161 files, e.g. `libs/frontend/core/src/lib/services/theme.service.ts` (7), `integrity-worker-protocol.ts` (5), `code-execution.engine.ts` (4) | Low | Acceptable for storage/teardown paths; add a `debug` log where the failure changes behaviour |
| 9 | `console.*` in production | 235 `log/info/debug`, 714 `warn/error`; top files in File-Level Findings | Low | Route through `Logger`; add `no-console` with an allowlist for boot and worker entry files |
| 10 | Non-strict libraries | `libs/backend/settings-core`, `auth-providers-tokens`, `memory-contracts`, `voice-contracts` (inherit `strict: false`) | Medium | Set `strict: true` in each `tsconfig.json`; then flip the root default |
| 11 | Synchronous IPC | `apps/ptah-electron/src/preload.ts:18, 25` | Low | Keep for startup config if first paint needs it; make `getState` asynchronous |
| 12 | Mock-heavy specs with casts | 22,723 `jest.fn/mock/spyOn`, 5,513 `as unknown as`, 171 `as any` in test code | Medium | Typed fakes from `testing/` entry points (some libs already have them, e.g. `platform-core/src/testing/contracts`) |
| 13 | Very large spec files | `agent-process-manager.service.spec.ts` (5,905), `session-loader.service.spec.ts` (5,335), `sdk-agent-adapter.spec.ts` (4,644) | Low | Split by behaviour, as already done for `chat-session.*.spec.ts` |
| 14 | Stringly-built documents typed as `any[]` | `mcp-response-formatter.ts` (8 sites) | Low | Declare a `Json2MdBlock` union |
| 15 | `track $index` in `@for` | 72 uses in renderer templates (count only) | Low | Track by a stable id where the list can reorder |

Not found: `eval(` or `new Function(` in production code (0 hits outside the sandbox bootstrap
string), `@ts-nocheck` on real code (the 7 hits are rule-text strings in
`workspace-intelligence/src/quality/rules/`), focused tests (`fit`/`.only`: the 2 hits are not
tests), hardcoded credentials (0 hits for common key formats and for a Sentry DSN literal).

## Framework Best Practices Compliance

### Angular 22 (renderer `apps/ptah-extension-webview`, `libs/frontend`, `libs/web`)

| Best practice | Status | Evidence |
| --- | --- | --- |
| Standalone components, no NgModules | Followed | 0 `@NgModule` (Phase 2) |
| OnPush change detection | Followed | 696 component files scanned; the only production component without OnPush is the root `apps/ptah-extension-webview/src/app/app.ts:39`, which sets `ChangeDetectionStrategy.Eager` on purpose. The other regex hits are two `*.testing.ts` harnesses and two services |
| Signal inputs/outputs | Followed | 2,301 `input()` / 863 `output()`, 0 `@Input`/`@Output` (Phase 2) |
| `inject()` over constructor injection | Followed | 1 component with constructor parameter injection: `libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts` |
| Signal queries (`viewChild()`), host bindings in metadata | Mostly followed | 34 signal queries; legacy decorators or `ngOnChanges` remain in 5 files: `canvas-lane-tabs.component.ts`, `transcript-motion.directive.ts`, `transcript-prepend-anchor.directive.ts`, `theme-toggle.component.ts`, `motion-stage.directive.ts` (outdated pattern, not a violation) |
| Built-in control flow | Followed | 3,646 `@if`/`@for` against 2 `*ngIf`/`*ngFor` (Phase 2) |
| `[class]`/`[style]` bindings over `ngClass`/`ngStyle` | Mostly followed | 14 `ngClass`/`ngStyle` uses in 6 files, e.g. `session-list-row.component.ts`, `agent-monitor-panel.component.ts` (outdated pattern) |
| Signals over RxJS for state; subscriptions torn down | Followed | 20 `.subscribe(` in the renderer; 1 file without a visible teardown: `libs/web/core/src/lib/services/github-release.service.ts` |
| `effect()` used sparingly, with `untracked` | Partly followed | 439 `effect(` in production renderer code, 343 `untracked(`. The volume suggests effects are used to propagate state in places where `computed`/`linkedSignal` would do; not audited per site |
| Zoneless change detection | Followed | `app.config.ts:194-195`, with a zone fallback switch |
| Lazy loading and deferred views | Followed | 16 lazy routes; 98 `@defer` blocks; secondary entry points guarded by `verify-eager-bundle` |
| Small, focused components | Violated | 33 components above 800 lines; three above 1,800 |
| Stable `track` expressions | Partly followed | 72 `track $index` |
| Sanitized HTML | Followed | 1 `[innerHTML]` binding; comments in 15+ components forbid it; markdown goes through `libs/frontend/markdown` (DOMPurify) |
| Accessibility attributes | Followed | 3,337 `aria-*` bindings; `@angular/aria` in use; 14 `<div (click)>` handlers to review |
| Event listeners removed | Followed | 125 `addEventListener`; 2 files without a visible removal: `rpc-call.util.ts`, `theme.service.ts` (both app-lifetime singletons) |
| Strict templates | Followed | `strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers` in lib `tsconfig.json`; a separate `typecheck-templates` target (not in the default verify list — a template type error can pass the default gate) |

### Electron 44

| Best practice | Status | Evidence |
| --- | --- | --- |
| `contextIsolation`, `sandbox`, no `nodeIntegration` | Followed | All three window factories (see File-Level Findings) |
| Minimal `contextBridge` surface | Followed | `preload.ts` exposes `vscode` (3 functions), `ptahConfig`, `ptahClipboard`, `ptahDiag`; no raw `ipcRenderer` is exposed |
| Validate the sender of every IPC message | Followed | `ipc-sender-policy.ts` `isTrustedIpcSender`, used in `ipc-bridge.ts:482` |
| Block navigation and new windows | Followed | `window-guards.ts:79-93` |
| Restrict `shell.openExternal` | Followed | `openExternalSafely` + `isSafeExternalUrl`; fixed URLs in `application-menu.ts` |
| Permission request handler | Followed | `permission-policy.ts:174` |
| Content-Security-Policy for the app document | Not confirmed | No CSP `<meta>` in `apps/ptah-extension-webview/src/index.html`, and the only `Content-Security-Policy` header in `apps/ptah-electron/src` is for the artifact protocol (`artifacts/artifact-protocol.ts:11`). If a CSP is injected elsewhere (build step, session header), this audit did not find it |
| Avoid synchronous IPC | Partly followed | 2 `sendSync` calls in `preload.ts` |
| Heavy work off the main thread | Followed | Nine worker bundles (Phase 1) |
| Global error handlers | Followed | `activation/main-process-error-guard.ts`, `activation/boot-trace.ts`, `services/diagnostics/process-lifecycle-recorder.ts` (`render-process-gone`) |

### Node backend (tsyringe, Zod, SQLite)

| Best practice | Status | Evidence |
| --- | --- | --- |
| Validate at process boundaries | Followed | 1,010 `z.object(` in `libs/backend`; `safeParse` on IPC replies; versioned worker frames |
| No shell for child processes | Followed | `cross-spawn` with argument arrays; file headers in `claude-cli-detector.ts`, `skills-sh-cli.ts`, `cli-adapter.utils.ts` record why `shell: true` was removed |
| Constructor injection | Partly followed | Service-locator calls outside composition code (Phase 2) |
| Structured logging | Partly followed | Injected `Logger` is the norm; 235 `console.log/info/debug` remain |
| Typed errors, no string throws | Followed | 3 `throw '…'` hits in production; `RpcUserError` separates refusals from faults |
| Migrations for schema change | Followed | `persistence-sqlite/src/lib/migration-runner.ts` (not audited in depth) |

### Nx 24

| Best practice | Status | Evidence |
| --- | --- | --- |
| Enforced module boundaries | Followed | 0 violations (Phase 2) |
| Affected-only CI | Followed | `.github/workflows/ci.yml:124-218` (`nx affected -t build/lint/typecheck/validate-deps`) |
| Per-project coverage gates | Partly followed | 22 projects define `coverageThreshold` |
| Strict TypeScript by default | Violated at the root | `tsconfig.base.json:304` `strict: false`; each project must opt in, and 4 libraries do not |

### Jest 30 / Playwright

| Best practice | Status | Evidence |
| --- | --- | --- |
| Assertions in every test | Followed | 0 spec files with tests and no `expect`; 9 trivial `expect(true).toBe(true)` |
| Few snapshots | Followed | 5 snapshot assertions |
| No committed focused/skipped tests | Mostly followed | 0 focused; 33 skip/todo markers, e.g. `quality/rules/rules.spec.ts` (6), `mcp-mandate-manifest.spec.ts` (4), `session-loader.service.spec.ts` (2) |
| Deterministic time | Followed | 854 `useFakeTimers` |
| Accessibility checks in e2e | Present | `@axe-core/playwright` is a dependency (Phase 1); usage not audited |

## Type Safety Assessment

**`any` usage.** 67 hits in production code over 47 files (about one per 15,700 lines); only 3
are `as any`. Concentrations: `mcp-response-formatter.ts` (8), `chrome-launcher-browser-capabilities.ts`
(6), `vscode-core/src/api-wrappers/webview-manager.ts` (3). The 5 hits in
`workspace-intelligence/src/quality/rules/typescript-rules.ts` are rule text. Only 1 production
`eslint-disable` targets `no-explicit-any`. Test code has 287 `any` hits and 171 `as any`.

**Suppressions.** 14 `@ts-ignore` and 2 `@ts-expect-error` in production; 8 of the 14 are rule
text. Real ones: `wasm-bundle-dir.ts` (2), `agentic-analysis.service.ts`,
`sdk-query-options-builder.ts`, `cli-worker-thread-process.ts`,
`apps/ptah-electron/src/config/build-artifact-gate.ts`. `@ts-ignore` should be
`@ts-expect-error` so that a fixed type removes the suppression. 52 `eslint-disable` comments in
41 production files.

**Unsafe casts.** 214 `as unknown as` in production over 97 files. The top two files hold 38
(`git-info.service.ts` 22, `code-symbol.store.ts` 16); see File-Level Findings.
`libs/backend/cli-engine/src/lib/container.ts` has 7 (DI registration), `git-rpc.handlers.ts` 6,
`settings-rpc.handlers.ts` 5. Test code has 5,513, which is the usual way a partial mock is
passed where a full type is expected.

**Non-null assertions.** About 168 regex hits in production over 58 files (count only; the
pattern over-matches). Highest: `agent-generation/src/lib/services/orchestrator.service.ts`,
`chat-ui/.../inspector-session-stats.component.ts`, `cli-adapters/antigravity-cli.adapter.ts`.
Low for this code size.

**Compiler strictness.** `tsconfig.base.json` sets `strict: false`. 79 of 84 projects override it
with `strict: true`, and most add `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`. Not strict: `settings-core`, `auth-providers-tokens`,
`memory-contracts`, `voice-contracts` (and `apps/ptah-docs`, which has one `.ts` file).
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not set in the files read.

**Missing types.** No pattern of untyped exports was found. `JSON.parse(` appears 327 times in
production; whether each result is validated before use was not audited, and that is the main
remaining source of implicit `any`-like data.

**Generics.** Typed RPC maps method name to params and result (`libs/shared/src/lib/types/rpc.types.ts`),
and Zod schemas give inferred types at boundaries. Weak spots are the hand-written function
types around `better-sqlite3` transactions and the logger call sites noted above.

## Error Handling Evaluation

**Empty catch blocks.** 3 regex hits in production, none real:
`workspace-intelligence/src/quality/rules/error-handling-rules.ts` (2, rule text) and
`agent-sdk/src/lib/peer-sessions/process-start-time.probe.ts:184` (inside a generated script
string).

**Comment-only catch blocks.** 223 in production over 161 files. Sampled sites are deliberate
(storage access in `theme.service.ts`, worker teardown in `integrity-worker-protocol.ts`,
process cleanup in `acp-process-transport.ts`). They are silent: no log at any level.

**Swallowed promise rejections.** 89 `.catch(() => undefined | {})` in production over 64 files.
The common case is a best-effort broadcast to the renderer (`voice-rpc.handlers.ts:370, 447`;
`machines-service.ts:113, 120`). Several sites carry a `degradation-audit: reported` comment
that a tool checks (`tools/degradation-audit`); the convention is not applied at every site.

**Unhandled promise rejections.** The main process installs `uncaughtException` and
`unhandledRejection` handlers (`main-process-error-guard.ts:59-79`, `boot-trace.ts:139-140`) that
log and report to Sentry. There is no compile-time guard: `@typescript-eslint/no-floating-promises`
was measured and rejected (`eslint.config.mjs:468-480`, about 70 s for one project and failures
on spec files), and an AST check in `tools/degradation-audit` covers three directories only. 924
statements start with `void fn(`, which is correct only when the callee handles its own errors.

**RPC errors.** `RpcHandler` (`rpc-handler.ts:241-262`) converts every handler failure into a
`{ success: false }` reply, separates user refusals (`RpcUserError`, logged at `warn`, repeats
counted) from faults (Sentry), and records a hang breadcrumb before the handler runs.

**Error boundaries.** Main process: present (above), plus `render-process-gone` recording.
Renderer: `process-lifecycle-recorder.ts:25` refers to a webview error handler; it was not read.
Angular has no component-level error boundary, so a throwing `computed` or template expression
depends on that global handler.

**Typed errors.** 3 string throws in production
(`internal-query.service.ts`, `persistence-rpc.handlers.ts`, `elevenlabs-client.ts`).
`catch (e: any)` does not occur (0 hits); `catch (error: unknown)` with an `instanceof Error`
check is the house style.

## Security Concerns

| # | Concern | Severity | Location | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | Sandbox timeout does not stop synchronous code; model-written code can block the hosting process until it is killed | Medium | `code-execution.engine.ts:413-451`; bootstrap `run()` lines 172–181 | Run the sandbox in a worker thread or child process and terminate on timeout |
| 2 | `node:vm` is the only isolation for model-written code | Medium | `code-execution.engine.ts:30-33` (stated in the file) | Same isolate as #1; it also gives memory limits (`resourceLimits`) |
| 3 | No Content-Security-Policy found for the main renderer document | Medium (if confirmed) | `apps/ptah-extension-webview/src/index.html`; no CSP header in `apps/ptah-electron/src` outside `artifact-protocol.ts` | Add a CSP `<meta>` or a `webRequest.onHeadersReceived` header: `default-src 'self'`, no `unsafe-eval`, explicit `frame-src ptah-artifact:` |
| 4 | Second HTML path for streaming markdown | Low | `execution-node.component.ts:262` | Confirm `streamingMarkdown.render` uses the shared DOMPurify config; add a spec that feeds a `<img onerror>` payload |
| 5 | `bypassSecurityTrustResourceUrl` | Low | `artifact-viewer.component.ts:239` (after `VIEWER_URL_PATTERN`), `display-file-viewer.component.ts:74` (a `blob:` URL the component created, PDF only) | None needed; both are constrained. Keep the pattern test |
| 6 | Four libraries compile without `strict`, including the settings layer | Low | `libs/backend/settings-core/tsconfig.json` | `strict: true` |
| 7 | 327 `JSON.parse` calls in production, validation not audited per site | Low | `libs/backend`, `libs/frontend` | Parse through a Zod schema where the source is a file, a child process or the network |
| 8 | Renderer web storage | Low | 48 `localStorage`/`sessionStorage` uses in renderer code | Confirm no token or key is stored there (not audited; secrets have a `secret-storage` port in the main process) |
| 9 | Console output outside the logger's redaction | Low | 235 `console.log/info/debug` in production | Route through `Logger` |

Checked and clean:

- **Command injection.** No production `shell: true`; `cross-spawn` and `which` with argument
  arrays throughout. `agent-process-manager.service.ts:201-203` records that the metacharacter
  list is kept for reference only because no shell is used.
- **Electron window settings and navigation.** See the Electron table.
- **IPC origin.** Main-frame `file:` sender check before any RPC dispatch.
- **RPC surface.** Method-prefix allowlist at registration.
- **Hardcoded secrets.** 0 hits for OpenAI/Anthropic-style keys, AWS keys, GitHub tokens, Slack
  tokens, private-key headers or a Sentry DSN literal in `libs/` and `apps/`. `.env` and
  `.env.prod` are untracked (Phase 1).
- **`eval`.** 0 production uses outside the sandbox bootstrap.
- **Static analysis in CI.** `semgrep` workflow, SonarCloud config, Dependabot (Phase 1); their
  current results were not read for this audit.

No critical or high-severity issue was found in the code that was read.

## Test Coverage Analysis

### What is tested

- **Volume.** 3,457 spec files under `libs/` and `apps/`, about 53,200 test cases and 149,300
  `expect` calls (2.8 per test). Test code is larger than production code (1.35 against 1.05
  million lines).
- **Co-location.** 2,581 of 3,889 logic files (66%; barrels, type files, schema files, tokens
  and fixtures excluded) have a spec with the same base name. Others are covered by
  behaviour-named specs, e.g. 25 specs for `chat-session.service.ts`.
- **Error paths.** 4,870 `toThrow`/`rejects` assertions.
- **End to end.** 76 Playwright spec files for the Electron app (`apps/ptah-electron-e2e/src/specs`:
  chat, git, permission, lifecycle, auto-updater, clipboard, startup config, state, perf, and
  regression specs named after tasks), plus landing-page e2e and a webview e2e harness library.
- **Contract tests.** `libs/backend/platform-core/src/testing/contracts/` runs one contract
  suite against each platform adapter.
- **Design contracts.** About 20 token/contrast/theme specs in `apps/ptah-extension-webview/src/app/`.
- **CI gate.** Tests run with coverage in four shards; a project below its `coverageThreshold`
  fails the job (`.github/workflows/ci.yml:279-321`). A nightly coverage workflow exists.

### What is critically untested (or under-tested)

Files with no spec of the same base name (other-named specs may cover part of them; not
confirmed per file):

| File | Lines | Why it matters |
| --- | --- | --- |
| `libs/backend/harness-sync/src/lib/reconciler/harness-reconciler.service.ts` | 1,145 | Writes and repairs user harness files |
| `libs/backend/cli-engine/src/lib/container.ts` | 1,163 | Composition root of the CLI host |
| `libs/backend/workspace-intelligence/src/ast/tree-sitter-engine.ts` | 989 | Parser behind code search and AST tools |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-handlers.ts` | 833 | MCP tool handlers |
| `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts` | 813 | Feeds worktree/branch cleanup decisions |
| `libs/backend/user-layer-composition/src/lib/user-layer/user-layer-orphan-reaper.ts` | 693 | Deletes files |
| `libs/backend/vscode-core/src/validation/message-validator.service.ts` | 653 | Boundary validation |
| `libs/backend/review-core/src/lib/publication/publication-outbox.repository.ts` | 630 | Outbox persistence |
| `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts` | 773 | Holds the `[innerHTML]` binding |
| `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts` | 789 | App shell |

Project-level gaps:

- `libs/backend/settings-core`: 9 specs for 46 production files (ratio 0.20), and not strict.
- `libs/backend/voice-providers` (0.39), `cron-scheduler` (0.40), `review-github` (0.40),
  `libs/frontend/messaging-gateway-ui` (0.29), `cron-scheduler-ui` (0.36).
- No specs at all: `libs/web/core`, `libs/web/legal`, `libs/web/ui`, and the contract libraries
  `memory-contracts`, `voice-contracts`, `auth-providers-tokens`, `chat-types` (types and
  schemas; a schema round-trip spec would still be cheap).
- Coverage floors exist for 22 projects only. Low floors on the largest libraries:
  `agent-sdk` 50% statements / 35% branches, `rpc-handlers` 65% / 40%.
- The sandbox engine has no test for a synchronous non-terminating script (follows from
  Security #1; the behaviour was not exercised here).

### Test quality

- **Good:** every spec asserts; almost no snapshots; fake timers are common; behaviour-named
  spec files for the largest services; contract suites for ports; regression e2e specs tied to
  task ids; 0 focused tests.
- **Weak:** heavy mocking (22,723 `jest.fn/mock/spyOn`, about 6.6 per spec file) and 5,513
  `as unknown as` casts in tests mean many specs check interactions with partial doubles, not
  behaviour against real collaborators; such tests keep passing when the mocked contract
  changes. 33 skipped/todo tests. Six spec files exceed 4,000 lines. Three spec files import
  another project's private files by relative path (Phase 2).
- **Process:** the memory-safe verify rules (`CLAUDE.md`) cap local runs at 2 Jest workers, and
  `typecheck-templates` is outside the default verify targets, so template type errors rely on
  the author running it.

## Strengths

- **Security decisions are written down where the code is.** File headers explain the threat
  and the fix with a task reference: the sandbox realm (`code-execution.engine.ts`), the removal
  of `shell: true` (`claude-cli-detector.ts`, `skills-sh-cli.ts`), the navigation guard
  (`window-guards.ts`), the artifact URL pattern (`artifact-viewer.component.ts`).
- **Electron is hardened by default**: isolated, sandboxed windows; a four-object preload
  surface; sender verification; deny-by-default navigation and `window.open`; scheme-checked
  `openExternal`; a permission policy.
- **Untrusted HTML has one chokepoint.** DOMPurify in `libs/frontend/markdown`, sanitized
  Mermaid SVG, one `[innerHTML]` binding, and comments in components that forbid it.
- **Very low `any`** for a codebase of this size, with `strict: true` in 79 of 84 projects and
  strict Angular templates.
- **Uniform modern Angular**: standalone, OnPush, signal inputs and queries, `inject()`,
  built-in control flow, zoneless, `@defer`, lazy routes — with single-digit exceptions.
- **Validation at every process boundary** with Zod (RPC schemas, IPC replies, worker frames).
- **Error handling has a house style**: `catch (error: unknown)`, typed `RpcUserError`, Sentry
  reporting wrapped so it cannot throw, hang breadcrumbs, repeat-suppressed warnings, and global
  handlers in the main process.
- **Custom guard rails beyond lint**: `tools/di-lint`, `tools/degradation-audit` (swallowed
  errors and floating promises), `verify-eager-bundle`, `no-restricted-syntax` selectors for
  watcher and message-literal rules, a file-size tripwire, commitlint and pre-push gates.
- **Large, assertion-dense test suite** with contract tests for ports, 76 Electron e2e specs and
  a required per-project coverage gate in CI.
- **Lint decisions are measured.** Rejected or softened rules carry the measurement and the task
  reference in `eslint.config.mjs` (for example the `no-floating-promises` timing and the
  file-size baseline of 137 files above 700 lines).
- **Almost no debt markers**: 7 `TODO`/`FIXME`/`HACK` in 1.05 million production lines.
