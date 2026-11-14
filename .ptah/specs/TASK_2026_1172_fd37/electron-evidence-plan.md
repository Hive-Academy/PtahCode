## Path per item (real vs synthetic, why)

1. **Real Electron settings UI.** `prepareDocsProfile()` supplies disposable HOME, USERPROFILE, APPDATA, LOCALAPPDATA, user data, and PTAH_DB_PATH. Select Codex `auto-edit`, reload the Electron renderer, assert the selection, and compare the real `~/.ptah/settings.json` SHA-256 before and after. No mock RPC or synthetic renderer event is used.
2. **Real Claude chat turn and real Codex CLI lane.** The renderer RPC registry has lane status and permission methods but no spawn method (`host-source-registry.baseline.ts`). The HTTP MCP endpoint requires a caller credential minted for a live session; the spec cannot derive that credential from a fresh renderer tab without the real chat/SDK path. The closest real alternative is to create a Claude chat tab and ask it to call `ptah_agent_spawn` with `cli: codex`, `permission: auto-edit`, and a one-command `pwd` task. The matching requested/effective string is asserted in the real tool result shown in the chat transcript, then captured. This item does require an LLM chat turn.
3. **Real Claude chat turn and real Plan Codex CLI lane.** Ask `ptah_agent_spawn` for `permission: plan` and a one-file write task. The lane prompt contract instructs a Plan lane to refuse writes with `BLOCKED: plan mode`. Assert that text in the real agent monitor. This item also requires an LLM chat turn and an authenticated Codex CLI.
4. **Real Claude chat turn and real Claude CLI lane.** Ask `ptah_agent_spawn` for `cli: claude`, `permission: ask`, and a single Bash `pwd` task. Assert the actual Allow and Deny controls in the current Claude tab's agent monitor. This item requires an authenticated Claude chat session and Claude CLI. Approval is left pending while the screenshot is taken.

No screenshot uses injected push messages. All captures use Electron's actual `BrowserWindow` page. Items 2-4 keep the real HOME for CLI authentication, use a disposable `--user-data-dir` and `PTAH_DB_PATH`, and change no settings. The app may write normal Claude/Codex session data under the real HOME.

## Run command

From the worktree root, **after** `npx nx run ptah-electron:build-dev` and `npx nx run ptah-electron:copy-renderer-dev`:

```powershell
$env:PTAH_EVIDENCE='1'; npx playwright test --config=apps/ptah-electron-e2e/playwright.config.ts apps/ptah-electron-e2e/src/specs/permission/lane-permission-evidence.spec.ts --workers=1 --reporter=list
```

Clear the variable afterward with `Remove-Item Env:PTAH_EVIDENCE`. The spec is skipped in ordinary runs.

## Expected screenshots

All under `.ptah/tmp/electron-evidence/`:

- `1-settings-saved.png`, `1-settings-saved-crop.png` — saved Codex lane default after reload; crop is the CLI matrix.
- `2-spawn-matched.png`, `2-spawn-matched-crop.png` — `requested auto-edit -> effective auto-edit` in the spawn tool card.
- `3-plan-blocked.png`, `3-plan-blocked-crop.png` — `BLOCKED: plan mode` in the agent monitor.
- `4-claude-tab-approval.png`, `4-claude-tab-approval-crop.png` — pending Allow/Deny row inside the Claude tab agent monitor.

## Risks

- Items 2-4 rely on real LLM tool choice and authenticated installed CLIs. A model may decline, alter arguments, or choose a different tool. The assertion will fail rather than produce misleading evidence.
- The Claude CLI lane may complete or time out its approval before the row is captured. The task is intentionally tiny, but permission timeout remains a race.
- The spec opens the Agents panel via its toggle. If the coordinator build uses a different tab layout or label, this selector may need adjustment.
- `page.reload()` is a renderer reload, not an Electron restart; it validates the saved setting through a fresh renderer read.
- The spec has not been run, per instruction. Visual content and runtime selectors are unverified.

## Decisions

- Used the real chat/SDK MCP caller route for items 2-4 because no direct renderer spawn RPC exists and an unauthenticated standalone MCP request cannot spawn. This is explicitly real, not synthetic, but does need an LLM chat turn.
- Used Codex for Plan refusal and Claude CLI for the ask approval because the requested behavior is supported by their respective lane permission paths.
- Kept all code in the single requested spec file. Skill discovery found only the local `angular-developer` skill; no matching Playwright/Electron skill was invocable, so no skill was applied. Ptah workspace analysis was attempted but did not return a usable result; targeted native reads were used.

## Check results

- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json` — exit 0, no output.
- `npx eslint apps/ptah-electron-e2e/src/specs/permission/lane-permission-evidence.spec.ts` — exit 0, no output.
- Playwright, nx, build, and e2e were not run.
- `git status --short` shows an unrelated untracked `HANDOFF.md`; this lane did not create or edit it.


