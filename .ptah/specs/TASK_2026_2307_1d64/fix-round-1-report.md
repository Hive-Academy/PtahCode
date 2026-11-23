# TASK_2026_2307_1d64 fix round 1

Paths beginning with `providers/` below are relative to `libs/frontend/chat/src/lib/settings/`.

## 1. Model read-back

- For a Settings write without a session ID, `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts:240–243` calls `() => this.modelSettings.selectedModel.set(model, applyTo)`. The computed handle parses the string and writes the validated value at `libs/backend/settings-core/src/repositories/computed-setting-handle.ts:66–83`. This stores `''` as the empty provider default and `'default'` as a literal string. The RPC read at `config-rpc.handlers.ts:329–330` is:

  ```ts
  const stored = this.modelSettings.selectedModel.get() || '';
  return { model: stored || 'default' };
  ```

- `libs/frontend/core/src/lib/services/providers-commit.service.ts:112–114` compares the read-back with `params.model || 'default'`. `providers/main-agent-reassign-popover.component.ts:507` uses a null draft when choosing Provider default on the current provider. The empty model write remains available when switching providers.
- `libs/frontend/core/src/lib/services/providers-commit.service.spec.ts:437` checks that the empty workspace write followed by the backend's `default` response completes as saved. `providers/main-agent-reassign-popover.component.spec.ts:634,904` covers the provider-switch write and the same-provider no-op.

## 2. Main agent status tone

- `providers/main-agent-section.component.ts:14,87` maps a warning to the badge's `warn` tone, success to `ok`, and neutral states such as Checking… and Not set to `neutral`. The round-one review supplies the warning-tone requirement for Needs attention.
- `providers/main-agent-section.component.spec.ts:120` asserts the rendered warning and Not set tones.

## 3. Sign-in shortcut and draft

- `providers/provider-setup-wizard.component.ts:551,2527–2563` sends the row click to the existing close review. A dirty wizard or nonempty search holds the clicked provider ID until Discard. Keep editing and modal dismissal clear that intent. An empty wizard emits the shortcut immediately. The search-only check applies to the shortcut so ordinary wizard close keeps its existing criteria.
- `providers/providers-settings.component.ts:1517–1532,1555–1559` closes the wizard and starts external sign-in without the generic close announcement.
- `providers/provider-setup-wizard.component.spec.ts:431,451` exercises the immediate path and the discard review for both a provider selection and a search draft. `providers/providers-settings.component.spec.ts:1690` verifies parent sign-in, dismissal, focus return and announcement suppression. It also verifies step 2 sign-in keeps the wizard open.

## 4. Blocked consumer assignment

- `providers/provider-consumer-assignments.component.ts:709–740` tracks whether a write succeeded in the current save loop. A subsequent blocked pick invokes the existing revert against the refreshed row. An initially blocked choice still shows the setup guidance.
- `providers/provider-consumer-assignments.component.spec.ts:435` queues a blocked Ollama choice during the Anthropic save and checks that the picker returns to the saved Anthropic assignment after one write.

## 5. Decision matrix icon

- `libs/frontend/chat/src/lib/settings/settings.component.ts:182–185,206–210` restores `TableProperties` to the navigation child and uses the same icon for the active page heading. The existing connector comes from the shared Settings layout, which was outside this fix.
- `libs/frontend/chat/src/lib/settings/settings.component.spec.ts:291–302` checks the icon on the Decision matrix navigation entry for each supported legacy deep link.

## 6. Dialog test support

- `providers/provider-setup-wizard.stored-key.spec.ts:78–85` installs the same local jsdom `showModal` and `close` shims as the main wizard suite. No shared test helper was found.
- A chat-wide `rg` search for `ProviderSetupWizardComponent` and `ptah-provider-setup-wizard` identified the main wizard suite and Providers settings as the other direct mounts. Both already have dialog shims at `providers/provider-setup-wizard.component.spec.ts:224–232` and `providers/providers-settings.component.spec.ts:63–71`. The Settings shell spec's wizard deep-link fixture uses a Providers stub.

## Checks

The focused Jest runs covered every spec named above, including both wizard suites.

```bash
p=libs/frontend/chat/src/lib/settings/providers
s=libs/frontend/chat/src/lib/settings
c=libs/frontend/core/src/lib/services

node scripts/verify.mjs --exec --task providers-fix-round-1-chat -- npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath "$p"/main-agent-reassign-popover.component.spec.ts "$p"/main-agent-section.component.spec.ts "$p"/provider-consumer-assignments.component.spec.ts "$p"/providers-settings.component.spec.ts "$p"/provider-setup-wizard*.spec.ts libs/frontend/chat/src/lib/settings/settings.component.spec.ts
node scripts/verify.mjs --exec --task providers-fix-round-1-core -- npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-commit.service.spec.ts
node scripts/verify.mjs --exec --task providers-fix-round-1-lint -- npx eslint "$p"/main-agent-reassign-popover.component{,.spec}.ts "$p"/main-agent-section.component{,.spec}.ts "$p"/provider-consumer-assignments.component{,.spec}.ts "$p"/provider-setup-wizard.component{,.spec}.ts "$p"/provider-setup-wizard.stored-key.spec.ts "$p"/providers-settings.component{,.spec}.ts "$s"/settings.component{,.spec}.ts "$c"/providers-commit.service{,.spec}.ts
node scripts/verify.mjs --exec --task providers-fix-round-1-types -- npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
git diff --check
```

- Chat Jest passed, 7 suites and 345 tests. The stored-key suite's 6 tests passed.
- Core Jest passed, 1 suite and 59 tests. Node emitted an ES module loading warning for the Jest configuration.
- ESLint passed across the 15 edited TypeScript files with 0 errors and 4 `max-lines` warnings for already-oversized components.
- Chat TypeScript passed with 0 errors. `git diff --check` passed.

Ptah identified the workspace and both wizard suites. Dependency queries reported that the index was building, so `rg` supplied the caller and test audit. I used the repository copies of the Angular frontend and UI design skills. The scoped TypeScript command supplied the requested diagnostics.

Electron visual review remains unverified. No live renderer was connected to this worktree, and the task limits execution to the focused checks above. The Jest assertions verify the badge tone, icon data, and discard flow in jsdom.
