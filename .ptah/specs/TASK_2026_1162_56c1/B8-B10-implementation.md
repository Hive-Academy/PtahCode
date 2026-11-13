# B8–B10 skill discovery and consent UI

## Components and data flow

- `TeamBuilderStartPage` owns the intent → review → consent → install → chat sequence. It preserves the intent and attachment service while navigating stages and takes the attachment snapshot at launch.
- `TeamBuilderSkillStore` holds page-scoped signals for stage, selection, recommendations, search results, guidance, preview, approval, loading, and errors.
- `TeamBuilderSkillReviewComponent` presents recommendations, evidence and score when supplied, optional search, selection, guidance facts, and skip/back actions. Skill text is rendered through Angular interpolation.
- `TeamBuilderSkillConsentComponent` presents host-provided files, script files, and content hash in a modal. Script-bearing skills require individual unchecked-by-default approval before install.
- The page uses `ClaudeRpcService` for `wizard:recommend-skills`, `wizard:get-project-guidance`, `wizard:search-skills`, `wizard:preview-skills-for-consent`, and `wizard:install-skills-with-consent`. Search is debounced; stale results are ignored after workspace change or destruction. The existing launcher opens chat.
- This route has no existing deep-analysis input. It passes `{ projectType: 'unknown', frameworks: [] }`; the host reads workspace dependencies directly for recommendations. Guidance reflects whatever facts the host can derive from that fallback.

## Verification

- Component specs added for escaped skill content, stable selection keys, and explicit script approval.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: passed with `NX_DAEMON=false` and `NX_ISOLATE_PLUGINS=false`. The initial attempt failed before compilation with Nx plugin `spawn EPERM`.
- `npm run verify -- -p @ptah-extension/webview,@ptah-extension/shared -t lint,typecheck`: passed with the same Nx environment settings.
- Focused Jest run attempted with `--coverage=false --maxWorkers=2`, then `--runInBand`. Both stopped before any test executed: worker and esbuild startup returned `spawn EPERM` in this environment.
- Opened the raw Angular review template at a 760 px browser viewport and captured a screenshot. Raw template navigation does not execute Angular or load application tokens, so it cannot establish rendered app quality. No app server was started because this lane prohibits serve/dev targets.
