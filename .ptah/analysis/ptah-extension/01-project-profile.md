# Project Profile — ptah-extension

Sources: root `package.json`, `nx.json`, `tsconfig.base.json`, `.nvmrc`, every `project.json`,
`git ls-files` (tracked files only), and the Ptah workspace analysis. Collected 2026-11-17 on
branch `main` (head `b4ab8f096`).

## Tech Stack

### Languages

| Language | Version | Evidence |
| --- | --- | --- |
| TypeScript | 6.0.3 (exact pin) | `package.json` devDependencies `typescript` |
| JavaScript (ESM `.mjs`, CJS `.cjs`, `.js`) | — | scripts, configs (`eslint.config.mjs`, `esbuild.config.cjs`) |
| HTML (Angular templates, index pages) | — | `apps/*/src/index.html`, lib templates |
| CSS (Tailwind + PostCSS) | — | `apps/ptah-extension-webview/src/styles.css`, `postcss.config.js` |
| Markdown / MDX | — | `.ptah/`, `.claude/`, `plugins/`, `apps/ptah-docs` |

TypeScript compiler options in `tsconfig.base.json`: `target: ES2022`, `module: esnext`,
`moduleResolution: node16`, `lib: [es2022, dom]`, `experimentalDecorators: true`,
`emitDecoratorMetadata: false`, `importHelpers: true`, `strict: false`, `skipLibCheck: true`,
`sourceMap: true`, `declaration: false`. It defines 112 `paths` aliases.

### Frameworks

| Framework | Version | Evidence |
| --- | --- | --- |
| Angular (core, common, compiler, forms, router, platform-browser, platform-server, ssr) | ~22.2.0 | `package.json` dependencies |
| `@angular/aria` | 22.2.6 | `package.json` dependencies |
| `@angular/cdk`, `@angular/build`, `@angular/compiler-cli` | ~22.2.0 | `package.json` devDependencies |
| Electron | ^44.4.3 | `package.json` devDependencies |
| Nx | 24.0.0 | `package.json` devDependencies (`nx`, `@nx/*`) |
| Astro | ^7.3.3 | `package.json` dependencies; `apps/ptah-docs/astro.config.mjs` |
| Astro Starlight | ^0.42.2 | `package.json` dependencies |
| Tailwind CSS | ^3.4.18 | `package.json` devDependencies; `tailwind.config.js` in webview and landing apps |
| daisyUI | ^4.12.24 | `package.json` devDependencies |
| RxJS | 7.8.2 | `package.json` dependencies |
| zone.js | 0.16.3 | `package.json` dependencies |

### Runtime environment

- Node.js `24.x` (`package.json` `engines.node`); `.nvmrc` contains `24`.
- Package manager: npm (`package-lock.json`, `.npmrc`).
- Electron main process bundle: ESM (`main.mjs`), esbuild `platform: node`, `target: node20`
  (`apps/ptah-electron/project.json` target `build-main`).
- Electron app package: `ptah-desktop` version `2.0.0`, `main: main.mjs`
  (`apps/ptah-electron/package.json`).
- Root package: `@ptah-extension/source` version `0.0.0`, `private: true`, license `MIT`.

## Dependencies

### Production dependencies (notable)

| Area | Packages |
| --- | --- |
| AI / agent SDKs | `@anthropic-ai/claude-agent-sdk` >=0.3.318, `@anthropic-ai/sdk` 0.127.0, `@openai/codex-sdk` >=0.165.0, `@cursor/sdk` ^1.0.13, `@agentclientprotocol/sdk` 1.7.0, `@modelcontextprotocol/sdk` ^1.29.0 |
| Local ML / speech | `@huggingface/transformers` 3.8.1, `kokoro-js` 1.2.1, `gpt-tokenizer` ^4.0.0, `ffmpeg-static` 5.3.0 |
| Persistence | `better-sqlite3` ^13.0.3, `sqlite-vec` 0.1.9 |
| Dependency injection | `tsyringe` ^4.10.0, `reflect-metadata` ^0.2.2 |
| Validation | `zod` 4.6.5 |
| Code parsing | `web-tree-sitter` ^0.27.0, `@vscode/tree-sitter-wasm` ^0.3.0 |
| Editor / rendering | `@codemirror/*` (commands 6.11.1, language 6.12.4, language-data 6.5.2, state 6.7.6, view 6.43.13), `shiki` 4.4.3, `marked` ^18.0.13, `mermaid` ^11.17.2, `@pierre/diffs` 1.5.1, `dompurify` ^3.3.3, `gridstack` ^12.5.0, `lucide-angular` ^1.0.0, `@floating-ui/dom` ^1.7.4, `@hive-academy/angular-gsap` ^1.1.0 |
| Messaging platforms | `@slack/bolt` 5.1.0, `discord.js` 14.27.0, `grammy` 1.46.0 |
| Web search | `@tavily/core` ^0.7.2, `exa-js` ^2.22.1 |
| File system / process | `@parcel/watcher` 2.6.0, `chokidar` ^5.0.0, `fast-glob` 3.3.3, `minimatch` 10.2.6, `picomatch` 4.0.7, `cross-spawn` ^7.0.6, `which` ^7.0.0 |
| Browser automation | `chrome-launcher` ^1.2.1, `chrome-remote-interface` ^0.34.0 |
| Networking / scheduling | `axios` ^1.15.0, `ws` ^8.21.0, `bottleneck` ^2.19.5, `croner` ^10.0.1 |
| Telemetry | `@sentry/node` ^10.75.0 |
| Utilities | `yaml` ^2.9.1, `gray-matter` ^4.0.3, `jsonrepair` 3.15.0, `json2md` ^2.0.3, `lru-cache` ^11.5.3, `ulid` 3.0.2, `uuid` ^11.1.0, `eventemitter3` 5.0.4, `culori` ^4.0.2, `temporal-polyfill` ^1.0.2, `gifenc` ^1.0.3, `jpeg-js` ^0.4.4 |
| Docs site | `astro` ^7.3.3, `@astrojs/starlight` ^0.42.2, `starlight-links-validator` ^0.27.0 |

### Dev dependencies

| Area | Packages |
| --- | --- |
| Monorepo / build | `nx` 24.0.0, `@nx/angular`, `@nx/esbuild`, `@nx/eslint`, `@nx/eslint-plugin`, `@nx/jest`, `@nx/js`, `@nx/web`, `@nx/workspace` (all 24.0.0), `esbuild` ^0.28.2, `ng-packagr` ~22.2.0, `@swc/core` ~1.16.2, `@swc-node/register` ~1.12.1, `ts-node` ^10.9.2, `tslib` ^2.3.0 |
| Desktop packaging | `electron` ^44.4.3, `electron-builder` 26.16.1 |
| Testing | `jest` ^30.0.2, `@jest/globals` ^30.0.0, `ts-jest` ^29.4.0, `jest-preset-angular` 17.0.0, `jest-environment-jsdom` ^30.3.0, `jest-environment-node` ^30.0.2, `@playwright/test` ^1.50.0, `@axe-core/playwright` ^4.12.1, `axe-core` ^4.12.1 |
| Linting / formatting | `eslint` ^10.11.0, `@eslint/js` ^10.0.1, `typescript-eslint` ^8.29.0, `@typescript-eslint/utils` ^8.40.0, `angular-eslint` 22.6.0, `jsonc-eslint-parser` ^3.1.0, `prettier` ^3.8.1 |
| Git hooks / commits | `husky` ^9.1.7, `lint-staged` ^17.5.1, `@commitlint/cli` ^21.2.3, `@commitlint/config-conventional` ^21.2.3 |
| Styling | `tailwindcss` ^3.4.18, `postcss` ^8.5.6, `autoprefixer` ^10.4.22, `daisyui` ^4.12.24 |
| Other | `gsap` ^3.14.2, `ngx-markdown` ^22.0.2, `ts-morph` ^28.0.0, `svgo` ^4.1.0, `cross-env` ^7.0.3, `@types/vscode` ^1.103.0, `@types/node` ^24.13.6 |

### Dependency count summary (root `package.json`)

| Group | Count |
| --- | --- |
| dependencies | 76 |
| devDependencies | 66 |
| optionalDependencies (`@nx/nx-*` native binaries, 24.0.0) | 5 |
| **Total** | **147** |

- `overrides`: `lucide-angular` (Angular peer pins), `tar` >=7.5.11, `onnxruntime-node` 1.24.3,
  `@hono/node-server` ^1.19.13, `@module-federation/dts-plugin` → `axios` 1.15.0.
- `apps/ptah-electron/package.json` declares 45 dependencies of its own.
- 43 `package.json` files are tracked in the repository.

### Stack Summary

```stack-summary
{"items":[
{"kind":"language","name":"TypeScript 6.0.3","evidence":"package.json devDependencies typescript: 6.0.3; 8370 tracked .ts files","sourcePhase":"project-profile"},
{"kind":"language","name":"JavaScript (ESM/CJS)","evidence":"113 .mjs, 58 .js, 12 .cjs tracked files; eslint.config.mjs, apps/ptah-electron/esbuild.config.cjs","sourcePhase":"project-profile"},
{"kind":"framework","name":"Node.js 24.x","evidence":"package.json engines.node: 24.x; .nvmrc: 24","sourcePhase":"project-profile"},
{"kind":"framework","name":"Angular 22.2","evidence":"package.json dependencies @angular/core ~22.2.0; apps/ptah-extension-webview and apps/ptah-landing-page use @angular/build:application","sourcePhase":"project-profile"},
{"kind":"framework","name":"Electron 44","evidence":"package.json devDependencies electron ^44.4.3; apps/ptah-electron/src/main.ts and preload.ts","sourcePhase":"project-profile"},
{"kind":"framework","name":"Nx 24.0.0","evidence":"nx.json; package.json devDependencies nx 24.0.0; 92 project.json files","sourcePhase":"project-profile"},
{"kind":"framework","name":"Astro 7 + Starlight","evidence":"apps/ptah-docs/astro.config.mjs; package.json astro ^7.3.3, @astrojs/starlight ^0.42.2","sourcePhase":"project-profile"},
{"kind":"framework","name":"Angular SSR","evidence":"package.json @angular/ssr ~22.2.0; apps/ptah-landing-page/src/main.server.ts","sourcePhase":"project-profile"},
{"kind":"framework","name":"Tailwind CSS 3.4","evidence":"package.json tailwindcss ^3.4.18; apps/ptah-extension-webview/tailwind.config.js","sourcePhase":"project-profile"},
{"kind":"library","name":"daisyUI 4","evidence":"package.json daisyui ^4.12.24; webview build styles include node_modules/daisyui/dist/themes.css","sourcePhase":"project-profile"},
{"kind":"library","name":"RxJS 7.8.2","evidence":"package.json dependencies rxjs 7.8.2","sourcePhase":"project-profile"},
{"kind":"library","name":"tsyringe","evidence":"package.json dependencies tsyringe ^4.10.0, reflect-metadata ^0.2.2","sourcePhase":"project-profile"},
{"kind":"library","name":"Zod 4","evidence":"package.json dependencies zod 4.6.5","sourcePhase":"project-profile"},
{"kind":"library","name":"better-sqlite3 + sqlite-vec","evidence":"package.json dependencies better-sqlite3 ^13.0.3, sqlite-vec 0.1.9; libs/backend/persistence-sqlite","sourcePhase":"project-profile"},
{"kind":"library","name":"Claude Agent SDK","evidence":"package.json dependencies @anthropic-ai/claude-agent-sdk >=0.3.318, @anthropic-ai/sdk 0.127.0","sourcePhase":"project-profile"},
{"kind":"library","name":"OpenAI Codex SDK","evidence":"package.json dependencies @openai/codex-sdk >=0.165.0; libs/backend/codex-runtime","sourcePhase":"project-profile"},
{"kind":"library","name":"Model Context Protocol SDK","evidence":"package.json dependencies @modelcontextprotocol/sdk ^1.29.0","sourcePhase":"project-profile"},
{"kind":"library","name":"Agent Client Protocol SDK","evidence":"package.json dependencies @agentclientprotocol/sdk 1.7.0","sourcePhase":"project-profile"},
{"kind":"library","name":"web-tree-sitter","evidence":"package.json dependencies web-tree-sitter ^0.27.0, @vscode/tree-sitter-wasm ^0.3.0; assets/tree-sitter","sourcePhase":"project-profile"},
{"kind":"library","name":"Hugging Face Transformers.js","evidence":"package.json dependencies @huggingface/transformers 3.8.1; overrides onnxruntime-node 1.24.3","sourcePhase":"project-profile"},
{"kind":"library","name":"CodeMirror 6","evidence":"package.json dependencies @codemirror/view 6.43.13, @codemirror/state 6.7.6","sourcePhase":"project-profile"},
{"kind":"library","name":"Shiki","evidence":"package.json dependencies shiki 4.4.3","sourcePhase":"project-profile"},
{"kind":"library","name":"Mermaid","evidence":"package.json dependencies mermaid ^11.17.2","sourcePhase":"project-profile"},
{"kind":"library","name":"Sentry (Node)","evidence":"package.json dependencies @sentry/node ^10.75.0","sourcePhase":"project-profile"},
{"kind":"library","name":"Slack Bolt / discord.js / grammY","evidence":"package.json dependencies @slack/bolt 5.1.0, discord.js 14.27.0, grammy 1.46.0; libs/backend/messaging-gateway","sourcePhase":"project-profile"},
{"kind":"library","name":"esbuild","evidence":"package.json devDependencies esbuild ^0.28.2; apps/ptah-electron build-main uses @nx/esbuild:esbuild","sourcePhase":"project-profile"},
{"kind":"library","name":"electron-builder","evidence":"package.json devDependencies electron-builder 26.16.1; apps/ptah-electron/electron-builder.yml","sourcePhase":"project-profile"},
{"kind":"test-tool","name":"Jest 30","evidence":"package.json devDependencies jest ^30.0.2, jest-preset-angular 17.0.0; jest.preset.js, jest.config.ts; 3565 tracked .spec.ts files","sourcePhase":"project-profile"},
{"kind":"test-tool","name":"Playwright","evidence":"package.json devDependencies @playwright/test ^1.50.0; apps/ptah-electron-e2e/playwright.config.ts, apps/ptah-landing-page-e2e/playwright.config.ts","sourcePhase":"project-profile"},
{"kind":"test-tool","name":"ESLint 10 + typescript-eslint","evidence":"package.json devDependencies eslint ^10.11.0, typescript-eslint ^8.29.0, angular-eslint 22.6.0; eslint.config.mjs","sourcePhase":"project-profile"}
]}
```

## File Structure

### Directory tree (depth 2–3)

```text
ptah-extension/
├── apps/
│   ├── ptah-docs/                 astro.config.mjs, public/, scripts/, src/
│   ├── ptah-electron/             src/ (main.ts, preload.ts), worker-host/, esbuild-plugins/,
│   │                              scripts/, electron-builder.yml, esbuild.config.cjs
│   ├── ptah-electron-e2e/         src/, scripts/, playwright.config.ts (+ 5 other *.config.ts)
│   ├── ptah-extension-webview/    src/ (main.ts, index.html, styles.css), public/, scripts/
│   ├── ptah-landing-page/         src/ (main.ts, main.server.ts, index.html), public/
│   └── ptah-landing-page-e2e/     src/, playwright.config.ts
├── libs/
│   ├── backend/                   42 libraries
│   ├── frontend/                  30 libraries
│   ├── shared/                    1 library
│   ├── web/                       core/, landing/, legal/, ui/
│   └── worker-protocol/           1 library
├── tools/                         ci/, degradation-audit/, di-lint/, mcp-bench/, migration/,
│                                  perf/, process-sampler/, review-eval/, role-census/,
│                                  ui-class-audit/
├── plugins/                       ptah-angular/, ptah-core/, ptah-dotnet/, ptah-nx-saas/,
│                                  ptah-react/ (skills/, commands/)
├── scripts/                       agent-usage/, brand-icons/, dev/, diagnostics/,
│                                  orchestration-skill/, perf/, windows-hide-patch/, verify.mjs, …
├── assets/tree-sitter/
├── docs/                          design-system/, development/
├── type-dts/vscode.d.ts
├── __mocks__/vscode.ts
├── .github/                       workflows/ (15), actions/setup-ci/, ci/, dependabot.yml
├── .husky/  .claude/  .codex/  .opencode/  .cursor/  .vscode/  .do/  .semgrep/  .ptah/
└── package.json, package-lock.json, nx.json, tsconfig.base.json, jest.preset.js,
    jest.config.ts, eslint.config.mjs, eslint.angular.config.mjs,
    eslint.spec-change-detection.mjs
```

### Tracked files by top-level directory (`git ls-files`, 12,867 total)

| Directory | Files |
| --- | --- |
| `libs/` | 8,146 |
| `.ptah/` | 2,893 |
| `apps/` | 856 |
| `tools/` | 361 |
| `plugins/` | 222 |
| `.claude/` | 204 |
| `scripts/` | 85 |
| `.github/` | 19 |
| `.codex/`, `.opencode/` | 14 each |
| other (root files, `.vscode`, `docs`, `assets`, `.husky`, …) | 53 |

### Tracked files by type

| Extension | Count |
| --- | --- |
| `.ts` | 8,370 (of which 3,565 are `.spec.ts`) |
| `.md` | 3,287 |
| `.json` | 504 |
| `.mjs` | 113 |
| `.png` | 94 |
| `.html` | 81 |
| `.js` | 58 |
| `.jsonl` | 54 |
| `.css` | 51 |
| `.webp` | 41 |
| `.woff2` | 28 |
| `.txt` | 26 |
| `.mdx` | 26 |
| `.yml` / `.yaml` | 19 / 3 |
| `.toml` | 14 |
| `.cjs` | 12 |
| `.ndjson` | 11 |
| `.mp4` / `.webm` | 11 / 7 |
| `.jpg` | 8 |
| `.svg` | 6 |
| `.cts` | 4 |
| `.sh` | 3 |
| `.py` | 2 |

The Ptah workspace index (which applies its own excludes and includes untracked files) reports
10,657 files: `.ts` 8,363, `.html` 550, `.json` 502, `.js` 177, `.css` 48, `.scss` 1.

## Entry Points & Configuration

### Application entry points

| App | Entry | Evidence |
| --- | --- | --- |
| `ptah-electron` (main process) | `apps/ptah-electron/src/main.ts` → `dist/apps/ptah-electron/main.mjs` | `project.json` target `build-main` (`@nx/esbuild:esbuild`, format `esm`) |
| `ptah-electron` (preload) | `apps/ptah-electron/src/preload.ts` | target `build-preload`, `tsconfig.preload.json` |
| `ptah-electron` (workers) | separate bundles: embedder, search, tree-sitter, integrity, wal-checkpoint, workspace-watch-host, worker-host, state-storage, voice | targets `build-*-worker` / `build-worker-host` / `build-workspace-watch-host`; one `tsconfig.*.json` each |
| `ptah-extension-webview` (renderer) | `apps/ptah-extension-webview/src/main.ts`, `src/index.html`, `src/styles.css` | target `build` (`@angular/build:application`), output `dist/apps/ptah-extension-webview` |
| `ptah-landing-page` | `apps/ptah-landing-page/src/main.ts`, `src/main.server.ts`, `src/index.html` | `project.json` targets `build`, `serve`, `serve-static` |
| `ptah-docs` | `apps/ptah-docs/astro.config.mjs`, `apps/ptah-docs/src/` | targets `build`, `dev`, `serve`, `preview`, `screenshots`, `videos`, `check-screenshots` |
| `ptah-electron-e2e` | `apps/ptah-electron-e2e/playwright.config.ts` | targets `e2e`, `e2e:nightly`, `typecheck` |
| `ptah-landing-page-e2e` | `apps/ptah-landing-page-e2e/playwright.config.ts` | targets `e2e`, `e2e:p0`, `typecheck`, `lint` |

`ptah-electron` targets: `build-main`, `build-preload`, nine worker/host build targets, `build`,
`build-dev`, `copy-renderer`, `copy-renderer-dev`, `rebuild-native`, `serve`, `serve:watch`,
`package`, `package-local-production`, `typecheck`, `validate-deps`, `test`, `lint`.

`ptah-extension-webview` targets: `build`, `serve`, `extract-i18n`, `test`, `serve-static`,
`verify-eager-bundle`, `typecheck`, `typecheck-templates`.

### Root npm scripts (selection)

| Script | Command |
| --- | --- |
| `build` | `nx build ptah-electron` |
| `dev` | `nx serve:watch ptah-electron` |
| `verify` | `node scripts/verify.mjs` |
| `test` | `nx run-many -t test -p ptah-electron ptah-extension-webview shared` |
| `lint` | `nx run-many -t lint -p ptah-electron ptah-extension-webview shared` |
| `electron:package` | `nx package ptah-electron` |
| `landing` | `cross-env PORT=4200 nx serve ptah-landing-page` |
| `docs` | `npx nx dev ptah-docs` |
| `postinstall` | `rebuild-native.js`, `patch-transformers-onnx-dep.js`, `patch-windows-hide-deps.js` |
| `prepare` | `husky \|\| true` |

### Key configuration files

| File | Role |
| --- | --- |
| `nx.json` | Nx workspace config; plugins `@nx/eslint/plugin` (two registrations: `eslint:lint` and `lint` with an explicit include list) |
| `tsconfig.base.json` | Shared compiler options and 112 path aliases |
| `jest.preset.js`, `jest.config.ts` | Root Jest preset and config; per-project `jest.config.ts` |
| `eslint.config.mjs`, `eslint.angular.config.mjs`, `eslint.spec-change-detection.mjs` | ESLint flat configs |
| `.prettierrc`, `.prettierignore`, `.editorconfig`, `.markdownlint.json` | Formatting |
| `.commitlintrc.json`, `.lintstagedrc.mjs`, `.husky/` | Commit and hook rules |
| `apps/ptah-electron/esbuild.config.cjs`, `esbuild-plugins/` | Electron bundling |
| `apps/ptah-electron/electron-builder.yml`, `electron-builder.local-production.cjs` | Desktop packaging |
| `apps/ptah-extension-webview/tailwind.config.js`, `postcss.config.js` | Renderer styling |
| `apps/ptah-landing-page/tailwind.config.js` | Landing page styling |
| `apps/ptah-docs/astro.config.mjs` | Docs site |
| `apps/ptah-electron-e2e/*.config.ts` | `playwright`, `design-preview`, `docs-screenshots`, `docs-videos`, `git-dock-preview`, `visual-parity` |
| `.github/workflows/*.yml` (15) | `ci`, `electron-e2e`, `webview-e2e`, `publish-electron`, `deploy-docs`, `deploy-landing`, `nightly-coverage`, `semgrep`, `mcp-bench`, `content-manifest`, `connectors-probe`, `model-lists-probe`, `decision-model-live-eval`, `sync-release-branch`, `authorize-workstation-key` |
| `.github/dependabot.yml`, `.coderabbit.yaml`, `.sonarcloud.properties`, `.semgrep/` | Dependency updates, review and static-analysis services |
| `content-manifest.json`, `agent-pack-manifest.json` | Generated manifests (`npm run manifest:generate`) |
| `.nxignore`, `.gitattributes`, `.gitignore`, `.npmrc`, `.nvmrc` | Tooling |
| `CLAUDE.md`, `CONVENTIONS.md`, `CONTRIBUTING.md`, `DESIGN.md`, `PRODUCT.md`, `SECURITY.md`, `README.md`, `LICENSE.md` | Root documentation |

### Environment configuration files

- `.env` and `.env.prod` exist at the workspace root; neither is tracked by git.
- `.mcp.json` (and `.mcp.json.bak`) exist at the root; not tracked by git.
- `.do/` (2 tracked files) and `scripts/do-build.sh`, `scripts/do-docs-build.sh`.

## Monorepo Structure

- Tool: **Nx 24.0.0** (`nx.json`; detected type `nx`). Single root `package.json`, npm lockfile.
- 92 `project.json` files: 6 apps, 78 libraries, 8 tools.
- Project tags in use: `scope:extension` 36, `scope:webview` 30, `scope:shared` 5, `scope:web` 4,
  `scope:electron` 3, `scope:cli` 3, `scope:landing` 2, `scope:e2e` 2, `scope:docs` 1;
  `type:feature` 57, `type:util` 9, `type:tool` 8, `type:core` 5, `type:app` 5, `type:ui` 4,
  `type:data-access` 2, `type:e2e` 2, `type:test-harness` 1; `platform:angular` 12;
  `domain:vscode` 1.
- Library import names follow `@ptah-extension/<name>` (workspace analysis).

### Apps (`apps/`)

| Project | Type | Tags |
| --- | --- | --- |
| `ptah-electron` | Electron desktop app (main, preload, worker bundles; packaged with electron-builder) | — |
| `ptah-extension-webview` | Angular application (the renderer copied into the Electron build by `copy-renderer`) | — |
| `ptah-landing-page` | Angular application with a server entry | `scope:landing`, `type:app` |
| `ptah-docs` | Astro + Starlight docs site | `scope:docs`, `type:app` |
| `ptah-electron-e2e` | Playwright tests for the Electron app | `scope:e2e`, `type:e2e`, `scope:electron`, `type:app` |
| `ptah-landing-page-e2e` | Playwright tests for the landing page | `scope:e2e`, `type:e2e`, `scope:landing` |

### Backend libraries (`libs/backend/`, 42)

`agent-generation`, `agent-sdk`, `auth-providers`, `auth-providers-tokens`, `cli-agent-runtime`,
`cli-engine`, `codex-runtime`, `cron-scheduler`, `gateway-chat-bridge`, `harness-sync`,
`lane-outcomes`, `lane-routing`, `memory-contracts`, `memory-curator`, `messaging-gateway`,
`output-styles`, `persistence-sqlite`, `platform-cli`, `platform-core`, `platform-electron`,
`plugin-marketplace`, `remote-machines`, `review-contracts`, `review-core`, `review-github`,
`rpc-handlers`, `session-organization`, `settings-core`, `skill-synthesis`, `task-end-hook`,
`task-specs`, `thoth-runtime`, `tool-output-reducers`, `usage-analytics`,
`user-layer-composition`, `voice-contracts`, `voice-providers`, `vscode-core`,
`vscode-lm-tools`, `worker-host`, `worker-runtime`, `workspace-intelligence`.

### Frontend libraries (`libs/frontend/`, 30)

`canvas`, `chat`, `chat-execution-tree`, `chat-routing`, `chat-state`, `chat-streaming`,
`chat-types`, `chat-ui`, `command-center`, `core`, `cron-scheduler-ui`, `dashboard`,
`declarative-dashboard`, `git-ui`, `machines-ui`, `markdown`, `marketplace`, `mcp-apps-page`,
`memory-curator-ui`, `messaging-gateway-ui`, `notification-center`, `onboarding`,
`review-runs-ui`, `setup-wizard`, `skill-synthesis-ui`, `tasks-ui`, `thoth-shell`, `ui`,
`webview-e2e-harness`, `workspace-indexing`.

### Shared and other libraries (6)

| Project | Path |
| --- | --- |
| `shared` | `libs/shared` |
| `worker-protocol` | `libs/worker-protocol` |
| web `core`, `landing`, `legal`, `ui` | `libs/web/*` |

### Tool projects (`tools/`, 8 with `project.json`)

`degradation-audit`, `di-lint`, `mcp-bench`, `migration`, `process-sampler`, `review-eval`,
`role-census`, `ui-class-audit`. `tools/ci` and `tools/perf` have no `project.json`.

### Non-Nx content packages

`plugins/ptah-angular`, `plugins/ptah-core`, `plugins/ptah-dotnet`, `plugins/ptah-nx-saas`,
`plugins/ptah-react` hold `skills/` (and `commands/` in `ptah-core` and `ptah-nx-saas`);
222 tracked files, mostly Markdown.

## Language Distribution

Based on 12,867 git-tracked files.

| Language / format | Files | Approx. share |
| --- | --- | --- |
| TypeScript (`.ts`, `.cts`) | 8,374 | 65.1% |
| Markdown / MDX (`.md`, `.mdx`) | 3,313 | 25.7% |
| JSON family (`.json`, `.jsonl`, `.ndjson`) | 569 | 4.4% |
| JavaScript (`.mjs`, `.js`, `.cjs`) | 183 | 1.4% |
| Images / media / fonts (`.png`, `.webp`, `.jpg`, `.svg`, `.ico`, `.mp4`, `.webm`, `.woff2`) | 197 | 1.5% |
| HTML | 81 | 0.6% |
| CSS | 51 | 0.4% |
| YAML / TOML | 36 | 0.3% |
| Shell / Python | 5 | <0.1% |
| Other (`.txt`, `.snap`, dotfiles, no extension) | 58 | 0.5% |

Among source-code files only (TypeScript, JavaScript, HTML, CSS; 8,689 files): TypeScript 96.4%,
JavaScript 2.1%, HTML 0.9%, CSS 0.6%. Of the 8,370 `.ts` files, 3,565 (42.6%) are `.spec.ts`.
