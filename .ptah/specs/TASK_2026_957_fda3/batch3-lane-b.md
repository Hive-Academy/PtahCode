# Badge adoption batch 3 — lane B

## Changes

- `local-tts-panel.component.ts`: converted both download status spans to outline Ptah badges and registered `PtahBadgeDirective`.
- `ptah-cli-instances.component.ts`: converted instance, runtime, key, and capability badges. Status and key states now use typed tone bindings; the directive is registered. `ptah-cli-instances.component.spec.ts` queries badge data attributes.
- `voice-config.component.ts`: converted the engine status span to an outline Ptah badge and registered the directive.
- `web-search-config.component.ts`: converted key status, test result, and max results spans to outline Ptah badges. The pure number uses `count`; the directive is registered. `web-search-config.component.spec.ts` queries badge data attributes.

No companion HTML files exist for these components. No badge in the target files was left raw; all badge hosts are spans. Layout utility classes were retained. `tools/ui-class-audit/baseline.json` was untouched.

## Verification

- `git diff --check` passed.
- Scoped `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns='(local-tts-panel|ptah-cli-instances|voice-config|web-search-config)'`: local TTS, voice config, and web search suites passed (89 tests). The CLI instances suite could not start because Jest maps `marked` to the absent worktree `node_modules/marked/lib/marked.umd.js`.
- Scoped Ptah diagnostics first timed out, then returned no diagnostics in the four changed component files. It reported existing errors in sibling chat files.
- No Electron visual review ran because the task prohibits starting the app.
