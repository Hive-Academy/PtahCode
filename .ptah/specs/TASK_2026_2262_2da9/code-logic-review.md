# Code Logic Review — TASK_2026_2262_2da9

**Verdict: APPROVE WITH NOTES — 7/10.** No demonstrated authentication bypass in the changed content predicate. Two minor issues in this change; one pre-existing source-location gap. The shared predicate and passing focused checks support 7 rather than 6; cancellation semantics and incomplete direct regression coverage prevent 8.

Paths below are relative to `libs/backend/`; `scan` means `auth-providers/src/lib/accounts/claude-auth-settings-scan.ts`, `scan.spec` its spec, `certifier` means `auth-providers/src/lib/accounts/claude-route-certifier.ts`, and `certifier.spec` its spec.

## Findings — defect in this change

1. **minor — Cancellation can emit a source-refusal diagnostic.** `scan:450–454` checks cancellation only before awaiting `resolve`. If the signal aborts during an ancestor read that subsequently fails, or during an aborted registry query, the new callback fires and the result is `unsupported-source`. Thus it is not guaranteed to stay silent on cancellation. Suggested fix: capture the resolution result, check `signal.aborted` immediately after the await, and return `run.refusal('cancelled')` before calling the callback. Test cancellation during both a pending file read and registry query. The old result-code race already existed; emitting the new misleading diagnostic is new.

2. **minor — New S4 negative coverage is incomplete.** `scan.spec:575–587` proves ancestor `apiKeyHelper` and EACCES refusals; `590–603` proves the nested-worktree success. Neither changed spec directly tests malformed ancestor JSON. Existing malformed/non-object/oversize coverage at `scan.spec:477–482` exercises S1, not S4. Suggested fix: parameterize the ancestor test for malformed JSON, non-object JSON, oversize data, auth env variables, enabled plugins and forced login settings. Add callback count (`toHaveBeenCalledTimes(1)`), success/cancellation silence, symlink/directory/ENOENT cases, and an earlier benign ancestor followed by a refusing one. `certifier.spec:322–340` proves refusal logging and benign certification, but not callback cardinality.

## Findings — gap that existed before

3. **major, out of scope — Filesystem ancestry does not resolve the main checkout of every Git worktree.** `scan:354–368` only visits lexical parents containing `.git`. On platforms where Claude loads main-checkout local settings, a worktree outside that checkout's subtree can therefore miss an auth override in the main checkout. The old S4 walk had exactly this limitation. Suggested follow-up: resolve Git's common directory/main checkout with bounded, validated operations and scan the effective local-settings locations, with tests for sibling/external worktrees and symlinked cwd paths.

## Answers and five logic questions

**1. How does this fail silently? Security and actual CLI loading.** For every file S4 actually visits, it is exactly as strict as S3: both call `scanFile` (`scan:296–297,320–326,368`). The shared `agent-sdk/src/lib/helpers/claude-certified-launch.ts:243–249,574–597` rejects credential helpers, AWS/GCP refresh/export, forced organization, a login method other than `claudeai`, non-allowlisted env names and nonempty `enabledPlugins`. No bypass for those selectors was found. This is a content-predicate equivalence claim, not proof against every future CLI setting or files changing after the read.

Claude does load repository-root local settings, including the main checkout's file for worktrees, subject to exceptions including Windows, ownership and home-directory roots. It also reads a legacy cwd-local file. Shared `settings.json` comes from the primary working directory. These are documented in [Claude's settings locations](https://code.claude.com/docs/en/settings.md#where-claude-code-keeps-the-local-file-in-a-git-repository). A content scan covers the recognized static overrides at locations it actually visits; it does not solve finding a non-ancestor main checkout. The installed CLI binary was not independently inspected or launched in this review.

**2. What user action produces unexpected behaviour?** Cancelling during a failing scan can log a source refusal (finding 1). The requested nested-worktree case now passes for benign content (`scan.spec:590–603`). External worktrees retain finding 3.

**3. What input produces a wrong answer? Should ancestor `settings.json` be scanned?** Arbitrary ancestor shared settings are not documented as inherited, so scanning every ancestor `settings.json` is not required by the documented loading model. S2 remains cwd-only (`scan:294–295`), and S4 never scanned ancestor shared settings before. If a particular supported CLI build loads such a file, that omission is pre-existing, not introduced here; add a version-specific reproduction and effective-path scan before widening policy. New malformed-ancestor coverage is missing, although the implementation refuses it through the shared parser.

**4. What happens when a dependency fails?** Production wiring uses Node `readFile(..., 'utf8')` and `lstat` (`auth-providers/src/lib/di/register.ts:157–161`). A symlink is followed: benign target passes, override target refuses; dangling target/vanished file yielding ENOENT passes as absent (`scan:320–326`). A directory read yielding EISDIR, EACCES, ELOOP or other non-ENOENT error refuses. On systems returning directory bytes, those still face size/JSON/object checks. More than 64 ancestors refuses before scanning; `.git` ENOENT skips the ancestor and all other `.git` lstat errors refuse (`scan:354–365`; boundary tests `scan.spec:619–629`). Reads are not atomic with later CLI reads: replacement races already existed for S3 and now apply to S4 too.

**5. What is missing that the requirements never mentioned? Logging and callers.** With a normal nonthrowing callback, an actual source refusal calls it once and immediately returns; success, initial cancellation, and coverage/version rejection do not call it (`scan:440–465`). Finding 1 qualifies cancellation. The callback receives only a source identifier; the certifier logs fixed text and `{ source }`, with no path/content (`certifier:444–445`). An observer throwing would reject the scan because it is unguarded; the current logger already has that dependency elsewhere (`certifier:195`).

Repository search found only one production direct caller, `certifier:436`. Its auth-context, coverage and launch-boundary scans therefore inherit the fix (`certifier:199–208,339–350,371–375`). Electron and CLI use shared registration (`apps/ptah-electron/src/di/phase-2-libraries.ts:262`, `cli-engine/src/lib/container.ts:746`, `auth-providers/src/lib/di/register.ts:177–181`). No additional platform-cli caller or dependency on existence-only S4 was found.

## Verification and decisions

Read all four reviewed files, the shared override predicate, task context and repository guidance. No plan, task-description or style-review document exists in this task folder. Skill discovery/loading was unavailable. Ptah symbol search returned zero hits; native search supplied caller evidence.

Focused Jest invocation: **2 suites passed, 156 tests passed** (Jest emitted an ESM config warning). Scoped Ptah TypeScript diagnostics: **0 errors, 0 warnings**. No source/spec edits, full gate, installed-CLI test or real-account launch performed.

**Decision:** keep ancestor shared-settings expansion outside this fix: alternatives were scanning every parent or matching effective CLI locations; current documentation supports the latter. This is reversible and does not require weakening the shared content predicate.
