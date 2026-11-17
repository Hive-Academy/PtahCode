# Elevation Plan — ptah-extension

Phase 4 of the workspace analysis. Inputs: `01-project-profile.md`, `02-architecture-assessment.md`,
`03-quality-audit.md`. Written 2026-11-17 on branch `main` (head `b4ab8f096`).

**How to read this plan.** Items are ordered by impact against effort inside each tier. "Before"
snippets marked *(read)* were read from the source for this phase. "After" snippets are
proposals, and snippets marked *(sketch)* show a shape, not code that was compiled. No test,
lint or build target was run.

**Corrections to earlier phases, found while collecting examples.**

| Earlier finding | What the source shows | Effect on the plan |
| --- | --- | --- |
| Phase 3: `git-info.service.ts` needs a new logger overload for context objects | `Logger.error` already accepts `Error \| Record<string, unknown>` (`libs/backend/vscode-core/src/logging/logger.ts:156-159`) | The casts can be deleted with no logger change (item 1.1) |
| Phase 2: `workspace-coordinator.service.spec.ts` has a stale reference to `@ptah-extension/editor/services` | Line 897 is a comment that describes old behaviour, not an import | Not a defect; no item |
| Phase 3 #11: make `getState` asynchronous | `apps/ptah-extension-webview/src/index.html:110-116` calls `window.vscode.getState()` synchronously in the pre-paint theme script | `getState` must stay synchronous for first paint; item 2.6 removes the second blocking call a different way |
| Phase 3: no CSP found for the renderer | Confirmed. In addition, `apps/ptah-electron/src/config/renderer-csp-strip.spec.ts` shows that `copy-renderer.js` removes a CSP `<meta>` from the copied document | A CSP must be added by `copy-renderer.js` itself, after the strip step (item 3.2) |

**Rules that apply to every item** (from the project `CLAUDE.md`): work in a task worktree,
verify with `npm run verify -- --related -p <projects>` and
`npm run verify -- -t lint,typecheck -p <projects>`, run the full gate once before the push, and
add `-t typecheck-templates -p ptah-extension-webview` after a template change.

---

## Priority Tier 1: Quick Wins (< 1 hour each)

### 1.1 Delete the `as unknown as Error` casts on logger calls

- **What and why.** Five call sites pass a context object to `logger.error` through a double
  cast. The logger already takes a context object as its second parameter, so the cast only
  hides the type. This file holds 22 of the 214 production `as unknown as` casts.
- **Files.** `libs/backend/vscode-core/src/services/git-info.service.ts` (lines 1219, 1249, 1292,
  1314, 1511).
- **Before** *(read, lines 1215-1219)*:

  ```typescript
  this.logger.error('[GitInfoService] stageFiles failed', {
    workspacePath,
    paths,
    error: outcome.error,
  } as unknown as Error);
  ```

- **After**:

  ```typescript
  this.logger.error('[GitInfoService] stageFiles failed', {
    workspacePath,
    paths,
    error: outcome.error,
  });
  ```

- **Expected impact.** Five casts removed in a file that 30 projects depend on. The log output
  does not change if the logger already treats a non-`Error` second argument as context; confirm
  this in `logger.ts:160-175` before the edit.
- **Verify.** `npm run verify -- -t typecheck -p vscode-core`.

### 1.2 Turn on `strict` in the three small contract libraries

- **What and why.** `memory-contracts`, `voice-contracts` and `auth-providers-tokens` inherit
  `strict: false` from `tsconfig.base.json:304`. They hold types and schemas that other libraries
  trust, and they are small, so the change is cheap.
- **Files.** `libs/backend/memory-contracts/tsconfig.json`,
  `libs/backend/voice-contracts/tsconfig.json`, `libs/backend/auth-providers-tokens/tsconfig.json`.
- **Before** (same shape as `libs/backend/settings-core/tsconfig.json`, *read*):

  ```json
  "compilerOptions": {
    "ignoreDeprecations": "6.0"
  }
  ```

- **After** (the options that 79 other projects already set):

  ```json
  "compilerOptions": {
    "ignoreDeprecations": "6.0",
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
  ```

- **Expected impact.** 82 of 84 projects strict; only `settings-core` (item 2.1) and
  `apps/ptah-docs` remain.
- **Verify.** `npm run verify -- -t typecheck -p memory-contracts,voice-contracts,auth-providers-tokens`.

### 1.3 Type the `json2md` block arrays

- **What and why.** `mcp-response-formatter.ts` has the most `any` in production (8 of 67), all
  the same pattern.
- **Files.** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts`
  (lines 335, 712, 1931, 2139, 2306, 2324, 2727).
- **Before** *(read, line 335)*:

  ```typescript
  const blocks: any[] = [{ h2: 'Workspace Analysis' }];
  ```

- **After** *(sketch; extend the union with each block key the file uses)*:

  ```typescript
  type Json2MdBlock =
    | { h2: string }
    | { h3: string }
    | { p: string | string[] }
    | { ul: string[] }
    | { ol: string[] }
    | { code: { language?: string; content: string | string[] } }
    | { table: { headers: string[]; rows: (string[] | Record<string, string>)[] } };

  const blocks: Json2MdBlock[] = [{ h2: 'Workspace Analysis' }];
  ```

- **Expected impact.** Production `any` drops from 67 to about 59, and a misspelled block key
  becomes a compile error.

### 1.4 Replace `@ts-ignore` with `@ts-expect-error`

- **What and why.** `@ts-ignore` stays silent after the type is fixed. `@ts-expect-error` fails
  the build then, so the suppression is removed.
- **Files.** The 6 real sites from Phase 3: `wasm-bundle-dir.ts` (2), `agentic-analysis.service.ts`,
  `sdk-query-options-builder.ts`, `cli-worker-thread-process.ts`,
  `apps/ptah-electron/src/config/build-artifact-gate.ts`.
- **Before / after**:

  ```typescript
  // @ts-ignore
  // @ts-expect-error <one-line reason>
  ```

- **Expected impact.** Any suppression that is already unnecessary shows up as a compile error
  and is deleted. Then add `'@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true,
  'ts-expect-error': 'allow-with-description' }]` in `eslint.config.mjs` so that new ones need a
  reason. The 8 rule-text hits in `workspace-intelligence/src/quality/rules/` are strings and are
  not affected.

### 1.5 Use one tag rule for the `*-contracts` libraries

- **What and why.** `review-contracts` is `scope:shared, type:util`; `memory-contracts` and
  `voice-contracts` are `scope:extension, type:core`. All three sit at level 0 with no workspace
  dependencies, so the wider tag is safe for all of them and lets a renderer lib import them
  later without a new exception.
- **Files.** `libs/backend/memory-contracts/project.json`, `libs/backend/voice-contracts/project.json`.
- **Before / after**:

  ```json
  "tags": ["scope:extension", "type:core"]
  ```

  ```json
  "tags": ["scope:shared", "type:util"]
  ```

- **Expected impact.** One rule for contract libs. Write the rule in `CONVENTIONS.md` in the same
  change. Verify with `npm run verify -- -t lint -p memory-contracts,voice-contracts` plus the
  libs that import them; a `scope:shared` source may import only `scope:shared`, which holds for
  libs without dependencies.
- **Skill.** `nx-workspace-architect` for tag and boundary rules.

---

## Priority Tier 2: Small Improvements (1-4 hours each)

### 2.1 Make `settings-core` strict

- **What and why.** The settings layer (46 production files, 9 specs) is the largest library
  without null checks. After it, the root default can change.
- **Files.** `libs/backend/settings-core/tsconfig.json`, then the files under
  `libs/backend/settings-core/src/repositories`, `schema`, `scope`, `reactive` that fail.
- **Before / after.** As in item 1.2. Expect implicit-`any` and possibly-`undefined` errors; fix
  them with real checks, not with `!`.
- **Follow-up in the same change.** Set `"strict": true` at `tsconfig.base.json:304`. The 79
  projects that already override it see no change, and a new library is strict by default.
- **Expected impact.** Closes Phase 3 anti-pattern #10 and security concern #6.

### 2.2 Add an XSS spec for the streaming-markdown `[innerHTML]` path

- **What and why.** `execution-node.component.ts:262` is the only `[innerHTML]` binding in
  production templates, the component has no same-named spec, and Phase 3 could not confirm that
  `streamingMarkdown.render` (line 682) uses the DOMPurify configuration of
  `libs/frontend/markdown`.
- **Files.** New
  `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.spec.ts`;
  the streaming renderer if the spec fails.
- **After** *(sketch)*:

  ```typescript
  it.each([
    '<img src=x onerror="window.__xss = 1">',
    '<a href="javascript:window.__xss = 1">x</a>',
    '<svg><script>window.__xss = 1</script></svg>',
  ])('renders %s without executable markup', (payload) => {
    const html = streamingMarkdown.render(payload);
    expect(html).not.toMatch(/onerror|javascript:|<script/i);
  });
  ```

- **Expected impact.** The second HTML path gets the same proof as the first. If the test fails,
  the fix is to call the shared sanitizer from the streaming renderer so both paths have one
  configuration.
- **Skill.** `angular-frontend-patterns`.

### 2.3 Replace cross-project relative imports in specs

- **What and why.** Four spec files import another project's private files by relative path.
  This passes the Nx boundary rule unseen and breaks when the other library moves a file.
- **Files.**
  `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-approval-presentation.spec.ts`,
  `codex-chat-host-ports.spec.ts`, `codex-chat-native-contract.spec.ts`,
  `apps/ptah-electron/src/shims/vscode-shim.integration.spec.ts`.
- **Before** *(read, `codex-chat-approval-presentation.spec.ts:16-17`)*:

  ```typescript
  jest.requireActual<
    typeof import('../../../../../agent-sdk/src/lib/system-abort-permission-message')
  >('../../../../../agent-sdk/src/lib/system-abort-permission-message');
  ```

- **After** (export the symbols from a `testing` entry of `agent-sdk` and `codex-runtime`, with
  an alias in `tsconfig.base.json`, as `platform-core/src/testing` already does):

  ```typescript
  jest.requireActual<typeof import('@ptah-extension/agent-sdk/testing')>(
    '@ptah-extension/agent-sdk/testing',
  );
  ```

- **Expected impact.** 11 private-path imports removed. Then add a `no-restricted-imports`
  pattern for `**/libs/*/*/src/**` relative paths in spec files so the pattern cannot return.

### 2.4 Add `no-console` with an allowlist and fix the top files

- **What and why.** 235 `console.log/info/debug` calls bypass log levels and redaction.
- **Files.** `eslint.config.mjs`; `apps/ptah-electron/src/activation/plugin-activation.ts`
  (lines 233, 247, 294, 433, 482); `libs/backend/thoth-runtime/src/lib/boot-thoth-runtime.ts`
  (12 calls).
- **Before** *(read, `plugin-activation.ts:294`)*:

  ```typescript
  console.log(
    `[Ptah Electron] Plugin loader initialized (${pluginPaths.length} plugin paths)`,
  );
  ```

- **After**:

  ```typescript
  logger.info('[Ptah Electron] Plugin loader initialized', {
    pluginPaths: pluginPaths.length,
  });
  ```

  ```javascript
  // eslint.config.mjs — start at 'warn', like the max-lines tripwire
  {
    files: ['libs/**/*.ts', 'apps/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/boot-trace.ts', '**/*worker*.ts', '**/preload.ts'],
    rules: { 'no-console': ['warn', { allow: ['warn', 'error'] }] },
  }
  ```

- **Expected impact.** New console calls get a warning; the two files with the most calls are
  clean. Where the logger does not exist yet at boot, keep the call and add the file to the
  allowlist with a comment.

### 2.5 Make the file-size rule block new large files

- **What and why.** `max-lines` is `warn` at 700 lines (`eslint.config.mjs:520-523`) because 137
  files were already over the limit. A warning does not stop growth: 9 files are above 2,400
  lines. A baseline keeps old files committing and makes the rule an error for the rest.
- **Files.** `eslint.config.mjs`; new `tools/ci/max-lines-baseline.json` (the list of files over
  700 lines today).
- **Before** *(read)*:

  ```javascript
  files: ['**/*.ts'],
  ignores: ['**/*.spec.ts', '**/*.d.ts'],
  rules: {
    'max-lines': ['warn', { max: 700, skipBlankLines: true, skipComments: true }],
  },
  ```

- **After** *(sketch)*:

  ```javascript
  const MAX_LINES_BASELINE = JSON.parse(
    readFileSync('tools/ci/max-lines-baseline.json', 'utf8'),
  );
  // ...
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.d.ts', ...MAX_LINES_BASELINE],
    rules: { 'max-lines': ['error', { max: 700, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: MAX_LINES_BASELINE,
    rules: { 'max-lines': ['warn', { max: 700, skipBlankLines: true, skipComments: true }] },
  },
  ```

- **Expected impact.** No new file can pass 700 lines, and the baseline can only shrink. This
  removes the reason recorded in the rule comment for keeping `warn` (an `error` would block
  every commit).

### 2.6 Remove one of the two blocking IPC calls at renderer start

- **What and why.** `preload.ts` blocks the renderer twice: `sendSync('get-startup-config')`
  (line 18) and `sendSync('get-state')` on each `getState()` call (line 25). The pre-paint script
  in `index.html` needs a synchronous answer, so the call cannot become asynchronous. The state
  snapshot can travel in the startup config instead.
- **Files.** `apps/ptah-electron/src/preload.ts`; the main-process handler of
  `get-startup-config`; `apps/ptah-electron-e2e/src/specs` (startup config and state specs).
- **Before** *(read)*:

  ```typescript
  const rawStartupConfig = ipcRenderer.sendSync('get-startup-config');
  const startupConfig = parseStartupConfig(rawStartupConfig);
  contextBridge.exposeInMainWorld('vscode', {
    getState: () => {
      return ipcRenderer.sendSync('get-state');
    },
    setState: (state: unknown) => {
      ipcRenderer.send('set-state', state);
    },
  });
  ```

- **After** *(sketch)*:

  ```typescript
  const rawStartupConfig = ipcRenderer.sendSync('get-startup-config');
  const startupConfig = parseStartupConfig(rawStartupConfig);
  let stateSnapshot: unknown = startupConfig?.initialState ?? null;
  contextBridge.exposeInMainWorld('vscode', {
    getState: () => stateSnapshot,
    setState: (state: unknown) => {
      stateSnapshot = state;
      ipcRenderer.send('set-state', state);
    },
  });
  ```

- **Expected impact.** One blocking round trip at start instead of two or more. Check first
  whether anything other than the renderer writes this state (a second window, the main
  process); if so, keep `sendSync` and close this item as "no change".

### 2.7 Run `typecheck-templates` automatically when a template changed

- **What and why.** `typecheck` does not compile Angular templates, and `typecheck-templates` is
  outside the default verify targets, so a template type error can pass the gate (Phase 3).
- **Files.** `scripts/verify.mjs`.
- **After** *(sketch)*:

  ```javascript
  const changed = execFileSync('git', ['diff', '--name-only', 'main...HEAD'], { encoding: 'utf8' });
  const touchesTemplates = /^(libs\/frontend|apps\/ptah-extension-webview)\/.*\.(html|component\.ts)$/m
    .test(changed);
  if (touchesTemplates && !userPassedTargets) {
    queue.push({ target: 'typecheck-templates', projects: ['ptah-extension-webview'] });
  }
  ```

- **Expected impact.** The gate covers templates without relying on the author. The cost (about
  90 s and 2 GB) is paid only on renderer changes, and the run stays under the existing verify
  lock.

### 2.8 Add specs for the two untested files that decide deletions

- **What and why.** Of the ten large files without a same-named spec, two can delete user data.
- **Files.** New specs for
  `libs/backend/user-layer-composition/src/lib/user-layer/user-layer-orphan-reaper.ts` (693
  lines) and `libs/backend/task-end-hook/src/lib/dispose/disposal-input.collector.ts` (813).
- **After** *(sketch; use a real temp directory, not a mocked `fs`)*:

  ```typescript
  it('does not remove a file that the manifest still owns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reaper-'));
    await writeFile(join(root, 'owned.md'), 'x');
    await reaper.reap({ root, manifest: manifestOwning('owned.md') });
    expect(existsSync(join(root, 'owned.md'))).toBe(true);
  });
  ```

- **Expected impact.** The negative cases (what must not be deleted) are pinned. First search for
  behaviour-named specs that already import these files; Phase 3 did not confirm that there are
  none.

### 2.9 Extend the floating-promise check beyond three directories

- **What and why.** `no-floating-promises` was rejected for cost (`eslint.config.mjs:468-480`).
  The AST check in `tools/degradation-audit` covers `apps/ptah-electron/src`, `thoth-runtime` and
  `persistence-sqlite` only, while 924 `void fn()` statements exist in production.
- **Files.** `tools/degradation-audit` (the `floating-promise` pattern and its directory list).
- **Change.** Add `libs/backend/rpc-handlers/src`, `libs/backend/agent-sdk/src` and
  `libs/backend/cli-agent-runtime/src` (the three largest backend libs), record the current
  count as the ratchet baseline, and fail only on an increase.
- **Expected impact.** New unhandled promises in 220k more lines are caught without a type-aware
  lint.

### 2.10 Restrict container lookups to composition code

- **What and why.** About 190 `container.resolve`-style calls sit outside `di/`, registration and
  boot files. `tools/di-lint` cannot see them as constructor edges.
- **Files.** `eslint.config.mjs` (a `no-restricted-syntax` selector, like
  `IN_MAIN_RECURSIVE_WATCH_SELECTORS`).
- **After** *(sketch)*:

  ```javascript
  const CONTAINER_RESOLVE_SELECTOR = {
    selector:
      "CallExpression[callee.property.name='resolve'][callee.object.name=/[cC]ontainer$/], " +
      "CallExpression[callee.property.name='resolve'][callee.object.property.name=/[cC]ontainer$/]",
    message: 'Resolve dependencies through the constructor. Container access belongs in di/, wiring/ and boot-* files.',
  };
  // files: ['libs/backend/**/*.ts'], ignores: ['**/di/**', '**/wiring/**', '**/boot-*.ts',
  //   '**/registration.ts', '**/*.spec.ts'], severity 'warn' until item 3.5 is done
  ```

- **Expected impact.** The count stops growing and each existing site is visible in lint output.

---

## Priority Tier 3: Medium Efforts (1-2 days each)

### 3.1 Give the `execute_code` sandbox a hard timeout

- **What and why.** This is the only Medium security finding with a concrete failure mode. The
  timeout is a `setTimeout` raced against the run, in the same thread as the model-written code.
  `while (true) {}` never yields, so the timer and the abort listener cannot fire and the host
  process stays blocked. The file header (lines 30-33) already names a worker isolate as the next
  step.
- **Files.** `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/code-execution.engine.ts`;
  a new worker entry beside it; `apps/ptah-electron/project.json` (one more worker build target,
  like the nine that exist); `libs/backend/platform-cli` wiring so the CLI host keeps working.
- **Before** *(read, lines 413-453, shortened)*:

  ```typescript
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Execution timeout (${timeout}ms)`)),
      timeout,
    );
  });
  // ...
  const result = await Promise.race([executionPromise, timeoutPromise, cancelPromise]);
  ```

- **After** *(sketch)*:

  ```typescript
  const worker = new Worker(SANDBOX_WORKER_PATH, {
    workerData: { code: wrappedCode, shapeJson },
    resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
  });
  // The bridge is already (path, argsJson) => Promise<string>: it maps to messages unchanged.
  worker.on('message', async (m: BridgeCall) => {
    worker.postMessage({ id: m.id, json: await bridge(m.path, m.argsJson) });
  });
  const timer = setTimeout(() => void worker.terminate(), timeout); // stops synchronous loops
  signal?.addEventListener('abort', () => void worker.terminate(), { once: true });
  ```

- **Migration steps.**
  1. Add a spec that runs `while (true) {}` with a 200 ms timeout in a **child Jest process**
     with its own kill timer, so the failing case cannot hang the suite. It fails today.
  2. Interim guard, same day: call the runner through
     `vm.runInContext('run(src)', context, { timeout })`. This stops a synchronous loop before
     the first `await`. It does not stop one after an `await`, so it is not the fix.
  3. Move the realm creation and `SANDBOX_BOOTSTRAP` into a worker entry. Keep the JSON
     marshalling: only strings cross the boundary today, which is what `postMessage` needs.
  4. Route `bridge` and `logConsole` over messages; terminate the worker on timeout and abort.
  5. Add the build target and the `expected-resolvable`/artifact checks for the new bundle.
  6. Run the existing engine specs unchanged against the worker path; then delete the in-thread
     path.
- **Expected impact.** Closes security concerns #1 and #2: a timeout that always fires, a memory
  limit, and a second isolation layer under `node:vm`. Cost: worker start time per call; measure
  it and keep a warm worker if it is above a few tens of milliseconds (a fresh realm per call
  must be kept either way).

### 3.2 Add a Content-Security-Policy to the renderer document

- **What and why.** No CSP exists for the main document. The renderer shows model output and
  repository content, so a CSP is the second line behind DOMPurify.
- **Files.** `apps/ptah-electron/scripts/copy-renderer.js` (it already rewrites `base href` and
  strips old CSP metas); `apps/ptah-electron/src/config/renderer-csp-strip.spec.ts`;
  `apps/ptah-extension-webview/src/index.html` (one inline script, lines 61-192).
- **Before** *(read, `index.html`)*: no CSP `<meta>`; one inline `<script>`.
- **After** *(sketch; the meta is written at copy time with the hash of the inline script)*:

  ```html
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self' 'sha256-<hash of the theme boot script>';
                 style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
                 font-src 'self' data:; connect-src 'self'; frame-src ptah-artifact: blob:;
                 object-src 'none'; base-uri 'self'" />
  ```

- **Migration steps.**
  1. Read the history of the strip step in `copy-renderer.js` to learn why a CSP was removed
     before; do not repeat that failure.
  2. List what the renderer loads: Shiki and Mermaid (inline styles, possibly `wasm-unsafe-eval`),
     CodeMirror, web workers (`worker-src`), the `ptah-artifact:` frames, PDF `blob:` URLs
     (`display-file-viewer.component.ts:74`), remote images in markdown.
  3. Generate the meta in `copy-renderer.js` after the strip step, with the script hash computed
     from the copied file.
  4. Ship it first in the `build-dev` copy only, and run the Electron e2e suite with a
     `securitypolicyviolation` listener that fails the test.
  5. Enable it for the packaged build when the suite is clean.
- **Expected impact.** Injected inline script and `eval` are blocked even if a sanitizer gap
  appears. Risk: a too-strict policy breaks Mermaid, Shiki or workers; step 4 exists for that.

### 3.3 Split `rpc.types.ts` by domain

- **What and why.** One 4,311-line file is the type contract for every RPC method, in a library
  with fan-in 66. It is a merge-conflict point for parallel lanes. Per-domain handler and schema
  files already exist, so the seams are known.
- **Files.** `libs/shared/src/lib/types/rpc.types.ts`; new `libs/shared/src/lib/types/rpc/*.types.ts`.
- **Before**: one file with every `'<domain>:<method>': { params; result }` entry.
- **After** *(sketch; `rpc-review.types.ts` already uses this shape)*:

  ```typescript
  // rpc/chat.rpc.types.ts
  export interface ChatRpcMethodRegistry {
    'chat:send': { params: ChatSendParams; result: ChatSendResult };
  }
  // rpc.types.ts (kept as the public file, now about 100 lines)
  export interface RpcMethodRegistry
    extends ChatRpcMethodRegistry, GitRpcMethodRegistry, ReviewRpcMethodRegistry { /* … */ }
  export * from './rpc/chat.rpc.types';
  ```

- **Migration steps.**
  1. Freeze the public surface: generate the list of exported names of `rpc.types.ts` and keep it
     as a test fixture.
  2. Move one domain at a time (start with the domains whose handlers are named
     `<domain>-rpc.handlers.ts`), re-exporting from `rpc.types.ts`.
  3. After each move run `npm run verify -- -t typecheck -p shared,rpc-handlers,core`.
  4. Compare the exported-name list with the fixture at the end. No importer changes.
- **Expected impact.** Parallel RPC work stops conflicting in one file. The Nx cache impact does
  not change (the project is still `shared`); that needs item 4.4.
- **Skill.** `humanize-library` for a behaviour-preserving split.

### 3.4 Put the bottom layer in one place

- **What and why.** `libs/shared` (fan-in 66) imports `libs/backend/review-contracts`
  (`rpc-review.types.ts:2`), and the Electron build takes its `vscode` module from a file in the
  CLI host library (`apps/ptah-electron/project.json:329` →
  `libs/backend/cli-engine/src/lib/shims/vscode-shim.ts`), an edge that lint cannot see.
- **Files.** `libs/backend/review-contracts` → `libs/shared-contracts/review` (or
  `libs/shared/review-contracts`); `tsconfig.base.json` paths; the shim → a host-neutral lib
  such as `libs/backend/platform-core/src/shims/` or a new `libs/backend/vscode-shim`;
  `apps/ptah-electron/project.json:329`; `libs/backend/cli-engine`.
- **Before / after** (`project.json:329`):

  ```json
  "vscode": "./libs/backend/cli-engine/src/lib/shims/vscode-shim.ts"
  ```

  ```json
  "vscode": "./libs/backend/vscode-shim/src/index.ts"
  ```

- **Migration steps.**
  1. Move `review-contracts` with `nx g @nx/workspace:move`; the alias `@ptah-extension/review-contracts`
     stays, so no import changes.
  2. Create the shim lib with tags `scope:extension, type:util`; move the shim file; re-export it
     from `cli-engine` for one release.
  3. Point the Electron alias at the new lib and run
     `npm run verify -- -p ptah-electron,cli-engine,platform-cli`.
  4. Keep `apps/ptah-electron/src/shims/vscode-shim.integration.spec.ts` green (it is one of the
     files of item 2.3).
- **Expected impact.** `shared` depends only on libs in the shared folder; the two hosts no
  longer share a file by path. The benchmark libs (`platform-cli`, `cli-engine`) keep working,
  as `CLAUDE.md` requires.
- **Skill.** `nx-workspace-architect`.

### 3.5 Convert the service-locator calls in `agent-rpc.handlers.ts` to injection

- **What and why.** The handler asks a runtime container for optional dependencies at call time
  (10 calls; 44 in `rpc-handlers`). The dependencies are hidden from `tools/di-lint`.
- **Files.** `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` (lines 744, 781,
  1140, 1358); `apps/ptah-electron/src/di/phase-4-handlers.ts`; `libs/backend/cli-engine/src/lib/container.ts`.
- **Before** *(read, lines 1139-1142)*:

  ```typescript
  if (this.runtimeContainer.isRegistered(TOKENS.CODE_EXECUTION_MCP)) {
    const mcp = this.runtimeContainer.resolve<IMcpExternalCallerAccessUpdater>(
      TOKENS.CODE_EXECUTION_MCP,
    );
  ```

- **After** *(sketch; an optional dependency becomes an injected provider function)*:

  ```typescript
  constructor(
    @inject(RPC_TOKENS.MCP_ACCESS_UPDATER_PROVIDER)
    private readonly getMcpAccessUpdater: () => IMcpExternalCallerAccessUpdater | undefined,
  ) {}
  // ...
  const mcp = this.getMcpAccessUpdater();
  if (mcp) { /* … */ }
  ```

  ```typescript
  // phase-4-handlers.ts — the only place that touches the container
  container.register(RPC_TOKENS.MCP_ACCESS_UPDATER_PROVIDER, {
    useValue: () =>
      container.isRegistered(TOKENS.CODE_EXECUTION_MCP)
        ? container.resolve(TOKENS.CODE_EXECUTION_MCP)
        : undefined,
  });
  ```

- **Migration steps.**
  1. For each call, note whether the dependency is optional (`isRegistered` guard) or late (a
     cycle or boot-order reason). Optional → provider function; late → `delay()`/lazy token.
  2. Register the providers in both composition roots (Electron phases and `cli-engine`).
  3. Update `apps/ptah-electron/src/di/expected-resolvable.ts`.
  4. Repeat for `vscode-lm-tools/.../ptah-api-builder.service.ts` (7) and
     `workspace-analyzer.service.ts`; then raise the rule of item 2.10 to `error` for
     `rpc-handlers`.
- **Expected impact.** Dependencies of the largest handler are visible in its constructor, and
  its specs no longer need a container.

### 3.6 Split `git-info.service.ts` behind its current class

- **What and why.** 3,900 lines in a class that 30 projects can reach; read, write and watch
  concerns in one file. Every edit invalidates the cache of 30 projects, so fewer and smaller
  edits matter here.
- **Files.** `libs/backend/vscode-core/src/services/git-info.service.ts` → `services/git/`
  (`git-read.service.ts`, `git-write.service.ts`, `git-watch.service.ts`, `git-exec.ts`).
- **After** *(sketch; the public class stays as a facade)*:

  ```typescript
  @injectable()
  export class GitInfoService {
    constructor(
      private readonly read: GitReadService,
      private readonly write: GitWriteService,
      private readonly watch: GitWatchService,
    ) {}
    stageFiles(workspacePath: string, paths: string[]) {
      return this.write.stageFiles(workspacePath, paths);
    }
  }
  ```

- **Migration steps.**
  1. Do item 1.1 first (same file).
  2. Extract the shared process-execution and outcome helpers (`thrownOutcome`, …) to `git-exec.ts`.
  3. Move write methods (`stageFiles`, unstage, commit, …), then read methods, then watch; one
     commit each, with the existing specs unchanged.
  4. Register the three services in `libs/backend/vscode-core/src/di/register.ts`; no token
     change for callers.
  5. Remove the file from the baseline of item 2.5 when it is under 700 lines.
- **Expected impact.** One of the 9 largest files gone, with no caller change. The same recipe
  applies to `agent-process-manager.service.ts` (lifecycle against I/O) and
  `protocol-dispatcher.ts` (one module per tool family); plan each as its own task.
- **Skill.** `humanize-library`; `resilient-nestjs-patterns` has the facade-plus-layers
  decomposition, which applies outside NestJS as a pattern.

### 3.7 Raise the coverage floors by ratchet

- **What and why.** 22 of 84 projects have a `coverageThreshold`; `agent-sdk` (80k lines) is at
  50% statements / 35% branches and `rpc-handlers` at 65% / 40%.
- **Files.** The `jest.config.ts` of each project; `.github/workflows/nightly-coverage.yml`.
- **Before / after** *(sketch, `libs/backend/agent-sdk/jest.config.ts`)*:

  ```typescript
  coverageThreshold: { global: { statements: 50, branches: 35 } },
  ```

  ```typescript
  // measured nightly value minus 2 points; raise only, never lower
  coverageThreshold: { global: { statements: 68, branches: 52 } },
  ```

- **Migration steps.**
  1. Read the last nightly coverage report per project (do not run coverage locally for all
     projects; the memory rules forbid wide runs).
  2. Set each floor to the measured value minus 2 points, including the projects with no floor.
  3. Add floors first to the libs with the lowest spec ratio: `settings-core` (0.20),
     `voice-providers`, `cron-scheduler`, `review-github`.
  4. Add a nightly step that proposes a higher floor when coverage has risen by 3 points.
- **Expected impact.** Coverage cannot fall in any project; the real numbers become visible.

---

## Priority Tier 4: Large Initiatives (1+ week each)

### 4.1 Extract settings and provider wizards from `libs/frontend/chat`

- **What and why.** `chat` is the largest project (105,530 lines, 392 files, fan-out 17) and five
  feature libs import it. It also holds settings (`src/lib/settings/`), provider wizards and the
  update dialog, which are not chat. `provider-setup-wizard.component.ts` alone is 2,462 lines.
- **Files.** `libs/frontend/chat/src/lib/settings/**` → new `libs/frontend/settings-ui`
  (`scope:webview, type:feature`); `apps/ptah-extension-webview/src/app/app.routes.ts`;
  `tsconfig.base.json`; importers in `canvas`, `command-center`, `onboarding`, `setup-wizard`,
  `mcp-apps-page`.
- **Before / after** (`app.routes.ts`, *sketch*):

  ```typescript
  loadComponent: () => import('@ptah-extension/chat').then((m) => m.SettingsComponent),
  ```

  ```typescript
  loadChildren: () => import('@ptah-extension/settings-ui').then((m) => m.SETTINGS_ROUTES),
  ```

- **Migration steps.**
  1. List the imports from `settings/` into the rest of `chat` and back. Anything that both
     sides need (provider state, model state) goes down to `libs/frontend/core` or
     `chat-state`, or behind a token in `libs/frontend/core/src/lib/tokens/`.
  2. Generate the new lib; move `settings/` with history (`git mv`), one sub-folder per commit.
  3. Re-export the moved public symbols from `@ptah-extension/chat` for one release, then remove.
  4. Split `provider-setup-wizard.component.ts` into a store plus step components while it moves.
  5. Update `verify-eager-bundle` expectations and run `typecheck-templates`.
  6. Visual review in Electron only (project rule).
- **Dependencies and prerequisites.** Item 2.5 (so the new lib starts under the size rule);
  item 2.7 (template gate). No backend change.
- **Risk assessment.** Medium. A hidden two-way dependency between settings and chat would
  create a cycle: step 1 finds it before any move. Lazy-chunk regressions are caught by
  `verify-eager-bundle`. Open settings pull requests conflict during the move, so do it in a
  quiet window and in small commits.
- **Expected impact.** `chat` loses an estimated 15-20% of its lines; settings changes stop
  running the chat test suite, and the reverse.
- **Skills.** `nx-workspace-architect` (library split), `angular-frontend-patterns` (store plus
  step components), `humanize-library`.

### 4.2 Make `rpc-handlers` a thin API layer

- **What and why.** `rpc-handlers` (84,136 lines, fan-out 32) is both the API layer and the home
  of application services (`chat-session.service.ts`, 3,487 lines; `src/lib/services/`,
  `harness/`, `migrations/`). Almost every backend change touches it.
- **Files.** `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`,
  `src/lib/services/**`, `src/lib/harness/**`, `src/lib/migrations/**` → the owning domain libs
  (`agent-sdk`, `harness-sync`, `persistence-sqlite`) or a new `libs/backend/chat-session`.
- **Before / after** *(sketch)*:

  ```typescript
  // before: handler and orchestration in the same lib
  import { ChatSessionService } from '../chat/session/chat-session.service';
  ```

  ```typescript
  // after: the handler validates, delegates and maps errors
  import { ChatSessionService } from '@ptah-extension/chat-session';

  this.rpc.registerMethod('chat:send', async (raw) => {
    const params = ChatSendParamsSchema.parse(raw);
    return this.chatSession.send(params);
  });
  ```

- **Migration steps.**
  1. Classify each folder of `rpc-handlers/src/lib` as "handler + schema" or "application
     service", with its imports.
  2. Start with the folders that have the fewest imports back into handlers (`migrations/`,
     `harness/`).
  3. Create `libs/backend/chat-session` (`scope:extension, type:feature`); move
     `chat-session.service.ts` and its 25 behaviour-named specs together.
  4. Split the class along the spec names (`follow-up-queue`, `auth`, …): each spec file marks a
     responsibility that can become a collaborator.
  5. Register the new lib in the Electron phases and in `cli-engine`; update
     `expected-resolvable.ts`.
  6. Add a lint rule: files under `rpc-handlers/src/lib/handlers/` may not exceed the size rule
     and may not contain the service-locator selector of item 2.10.
- **Dependencies and prerequisites.** Item 3.5 (injection in handlers) and item 3.3 (per-domain
  RPC types) make each move smaller. Item 2.3 must be done first, because three specs in
  `rpc-handlers` reach into `agent-sdk` by path.
- **Risk assessment.** High for chat sessions: this is the core path of the product. Mitigation:
  move without changing behaviour, keep the 25 specs unchanged, and run the Electron e2e chat
  specs after each step. Both hosts must keep working, so each step includes `cli-engine`.
- **Expected impact.** Feature changes run the tests of one domain lib instead of an 84k-line
  hub; parallel lanes stop meeting in one project.
- **Skills.** `resilient-nestjs-patterns` (splitting an orchestrator service into layers),
  `orchestration` to run the phases as file-disjoint batches.

### 4.3 Split and rename `vscode-core`

- **What and why.** `vscode-core` is the host-neutral backend core (RPC dispatcher, logging, git,
  licence, Sentry, the main `TOKENS`) with fan-in 30. Its name contradicts the Electron-first
  rule, and 16 of its files import `vscode` and run through a shim in Electron.
- **Files.** `libs/backend/vscode-core/src/**`; `tsconfig.base.json`; 30 importing projects
  (`rpc-handlers` 231 imports, `agent-sdk` 142); `libs/frontend/core` (`vscode.service.ts`,
  `provideVSCodeService()`) as a later, separate rename.
- **Before / after** *(sketch)*:

  ```typescript
  import { Logger, TOKENS, RpcHandler } from '@ptah-extension/vscode-core';
  ```

  ```typescript
  import { Logger, TOKENS, RpcHandler } from '@ptah-extension/backend-core';
  // libs/backend/vscode-core keeps only the 16 files that import 'vscode'
  ```

- **Migration steps.**
  1. Create `libs/backend/backend-core` with a new tag `type:infra` and a boundary rule in
     `eslint.config.mjs` (this also fixes the "`type:util` for stateful infrastructure" drift;
     apply the same tag to `persistence-sqlite`).
  2. Move the host-neutral folders (`messaging/`, `logging/`, `di/tokens.ts`, `services/` after
     item 3.6).
  3. Make `@ptah-extension/vscode-core` re-export everything from `backend-core`, so the 30
     importers keep compiling.
  4. Rewrite imports one project at a time with a codemod (`tools/migration` and `ts-morph` are
     already in the workspace); one pull request per group of projects.
  5. When no project imports the old alias for host-neutral symbols, reduce `vscode-core` to the
     VS Code adapter files.
  6. Rename the renderer bridge (`vscode.service.ts`) as a separate task.
- **Dependencies and prerequisites.** Item 3.6 (split `git-info.service.ts` before moving it),
  item 3.4 (shim location), item 1.5 (tag rules).
- **Risk assessment.** Medium. The re-export step means no "big bang" change, but each import
  rewrite invalidates the Nx cache of the touched projects, so the gate runs are long; schedule
  them with the verify lock in mind. Token identity must not change: move `TOKENS` once and
  re-export the same object, or DI resolution breaks at runtime (covered by `tools/di-lint` and
  `expected-resolvable.ts`).
- **Expected impact.** Names match roles; lanes and new contributors stop treating the core as a
  VS Code layer; the `vscode` shim surface in Electron shrinks to a small adapter lib.
- **Skill.** `nx-workspace-architect`.

### 4.4 Limit feature-to-feature reach

- **What and why.** 57 of 84 projects are `type:feature`, and 153 of 470 production pairs are
  feature → feature. The graph is acyclic by convention only and is 12 levels deep. Only 2
  `type:data-access` libs exist.
- **Files.** `eslint.config.mjs:279-400` (`depConstraints`); every `project.json` (a new
  `domain:*` tag); the eager entry points (`tasks-ui/services`, `machines-ui/services`,
  `marketplace/services`) that `chat` imports.
- **Before / after** *(sketch)*:

  ```javascript
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:util', 'type:core'] }
  ```

  ```javascript
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:util', 'type:core'] },
  { sourceTag: 'domain:chat', onlyDependOnLibsWithTags: ['domain:chat', 'domain:platform'] },
  ```

- **Migration steps.**
  1. Assign a `domain:*` tag to each project (chat, tasks, git, review, machines, marketplace,
     memory, platform). `domain:vscode` exists once today; replace it.
  2. Add the domain rules at `warn` and read the violation list: this is the real work list.
  3. For each feature → feature pair, choose: promote the shared store to a `type:data-access`
     lib (the `…/services` secondary entries are ready-made candidates), or invert through a
     token in `libs/frontend/core/src/lib/tokens/`.
  4. Tighten the `type:feature` rule to exclude `type:feature`, with a temporary allowlist that
     shrinks.
  5. Move the rules to `error` per domain when the domain is clean.
- **Dependencies and prerequisites.** Items 4.1 and 4.2 remove the two widest hubs first;
  without them the violation list is dominated by `chat` and `rpc-handlers`.
- **Risk assessment.** Low per step (rules start at `warn`), high in total effort. The main risk
  is a rule set that people work around with exceptions; keep the allowlist in one named
  constant with a count that a test asserts can only go down.
- **Expected impact.** The acyclic graph is enforced by rule, depth can fall, and the blast
  radius of a feature change is bounded by its domain.
- **Skills.** `nx-workspace-architect` for tags; `ddd-architecture` to decide the domain
  (bounded-context) list. Phase 2 found no DDD tactical patterns, and none are needed here.

### 4.5 Replace partial mocks with typed fakes

- **What and why.** Test code has 22,723 `jest.fn/mock/spyOn` calls and 5,513 `as unknown as`
  casts. Specs built on partial doubles keep passing when the real contract changes.
- **Files.** `libs/backend/platform-core/src/testing/` (the existing model: contract suites per
  port); new `testing` entries for `vscode-core` (logger, RPC handler), `agent-sdk`,
  `persistence-sqlite` (in-memory SQLite); the largest specs first
  (`agent-process-manager.service.spec.ts`, 5,905 lines; `session-loader.service.spec.ts`, 5,335).
- **Before / after** *(sketch)*:

  ```typescript
  const logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger;
  const fs = { readFile: jest.fn().mockResolvedValue('x') } as unknown as IFileSystem;
  ```

  ```typescript
  import { createFakeLogger } from '@ptah-extension/vscode-core/testing';
  import { InMemoryFileSystem } from '@ptah-extension/platform-core/testing';

  const logger = createFakeLogger();                      // implements the full Logger type
  const fs = new InMemoryFileSystem({ '/a.txt': 'x' });   // passes the port contract suite
  ```

- **Migration steps.**
  1. Count which types are cast most often in specs (`as unknown as <Type>`); the top ten types
     define the first fakes.
  2. Build each fake so that it passes the same contract suite as the real adapter.
  3. Add a lint rule for spec files that warns on `as unknown as` for the types that have a fake.
  4. Convert specs when they are touched for other reasons; convert the six specs above 4,000
     lines as dedicated tasks, splitting them by behaviour at the same time.
- **Dependencies and prerequisites.** Item 2.3 creates the first `testing` entries.
- **Risk assessment.** Low. Tests change, production code does not. A fake that differs from the
  real adapter gives false confidence, which is why step 2 ties each fake to a contract suite.
- **Expected impact.** Contract changes break the specs that depend on them; the cast count in
  tests falls measurably each quarter.

---

## Summary Matrix

| # | Item | Tier | Effort | Impact | Files |
|---|------|------|--------|--------|-------|
| 1.1 | Delete `as unknown as Error` logger casts | 1 | 20 min | Medium | `libs/backend/vscode-core/src/services/git-info.service.ts` |
| 1.2 | `strict: true` in three contract libs | 1 | 30-60 min | Medium | `libs/backend/{memory-contracts,voice-contracts,auth-providers-tokens}/tsconfig.json` |
| 1.3 | `Json2MdBlock` type in place of `any[]` | 1 | 45 min | Low | `libs/backend/vscode-lm-tools/.../mcp-response-formatter.ts` |
| 1.4 | `@ts-ignore` → `@ts-expect-error` plus lint rule | 1 | 30 min | Low | 6 files; `eslint.config.mjs` |
| 1.5 | One tag rule for `*-contracts` libs | 1 | 30 min | Low | `memory-contracts/project.json`, `voice-contracts/project.json`, `CONVENTIONS.md` |
| 2.1 | `settings-core` strict, then root `strict: true` | 2 | 2-4 h | High | `libs/backend/settings-core/**`, `tsconfig.base.json` |
| 2.2 | XSS spec for the streaming `[innerHTML]` path | 2 | 2 h | High | `libs/frontend/chat/.../execution-node.component.ts` and new spec |
| 2.3 | Remove cross-project relative imports in specs | 2 | 2-3 h | Medium | 3 specs in `rpc-handlers/.../codex-host/`, `vscode-shim.integration.spec.ts` |
| 2.4 | `no-console` with allowlist; fix top files | 2 | 2-3 h | Medium | `eslint.config.mjs`, `plugin-activation.ts`, `boot-thoth-runtime.ts` |
| 2.5 | File-size rule as `error` with a baseline | 2 | 2 h | High | `eslint.config.mjs`, `tools/ci/max-lines-baseline.json` |
| 2.6 | One blocking IPC call at start instead of two | 2 | 2-3 h | Low | `apps/ptah-electron/src/preload.ts`, startup-config handler |
| 2.7 | Auto-run `typecheck-templates` on template changes | 2 | 2 h | Medium | `scripts/verify.mjs` |
| 2.8 | Specs for the two files that decide deletions | 2 | 3-4 h each | High | `user-layer-orphan-reaper.ts`, `disposal-input.collector.ts` |
| 2.9 | Extend the floating-promise AST check | 2 | 2-3 h | Medium | `tools/degradation-audit` |
| 2.10 | Lint rule for container lookups | 2 | 2 h | Medium | `eslint.config.mjs` |
| 3.1 | Hard timeout for the `execute_code` sandbox (worker) | 3 | 2 days | High | `code-execution.engine.ts`, new worker entry, `apps/ptah-electron/project.json` |
| 3.2 | Renderer Content-Security-Policy | 3 | 1-2 days | High | `apps/ptah-electron/scripts/copy-renderer.js`, `index.html` |
| 3.3 | Split `rpc.types.ts` by domain | 3 | 1-2 days | Medium | `libs/shared/src/lib/types/rpc.types.ts` |
| 3.4 | Move `review-contracts` and the `vscode` shim | 3 | 1 day | Medium | `libs/backend/review-contracts`, `cli-engine/.../vscode-shim.ts`, `apps/ptah-electron/project.json:329` |
| 3.5 | Injection in place of service locator in handlers | 3 | 1-2 days | Medium | `agent-rpc.handlers.ts`, `phase-4-handlers.ts`, `cli-engine/src/lib/container.ts` |
| 3.6 | Split `git-info.service.ts` behind a facade | 3 | 2 days | Medium | `libs/backend/vscode-core/src/services/git-info.service.ts` |
| 3.7 | Coverage floors by ratchet | 3 | 1 day | Medium | per-project `jest.config.ts`, `nightly-coverage.yml` |
| 4.1 | Extract settings and wizards from `chat` | 4 | 1-2 weeks | High | `libs/frontend/chat/src/lib/settings/**`, `app.routes.ts` |
| 4.2 | Thin `rpc-handlers`; move application services | 4 | 2-3 weeks | High | `libs/backend/rpc-handlers/src/lib/{chat/session,services,harness,migrations}` |
| 4.3 | Split and rename `vscode-core` | 4 | 2-3 weeks | Medium | `libs/backend/vscode-core/**`, 30 importing projects |
| 4.4 | Domain tags; limit feature → feature | 4 | 3+ weeks | High | `eslint.config.mjs:279-400`, all `project.json` |
| 4.5 | Typed fakes in place of partial mocks | 4 | ongoing | Medium | `libs/backend/*/src/testing`, largest specs |

**Suggested order.** Tier 1 in one pull request per item. Then 2.2, 2.5, 2.8 and 3.1 (security
and data-loss items). Then 2.1, 2.3, 2.10 and 3.5, which prepare 4.2. Start 4.1 before 4.2: it
touches only the renderer and has the lower risk. Use the `orchestration` skill to run each
Tier 3 and Tier 4 item as phased batches in its own worktree.
