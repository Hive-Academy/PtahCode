# Review: two Windows test fixes
Verdict: APPROVE

## 1. codex-account-usage.service.spec.ts
- Root cause correct. codex-account-usage.service.ts:314 sets `home = normalizeCodexHomeKey(update.home, process.platform)`
  and passes it to client.read (:356, :379). The old tests compared with raw resolve(), which differs in case on win32.
- Fix keeps the same strength: spec :461 `keyA`, :466/:470 compare to the normalized key, :505-507 same.
  No assertion removed. `normalizeCodexHomeKey` already imported (spec :19). Identity on POSIX, so POSIX unchanged.
- Production defect? Not a defect. Pull path (service :249) passes the raw `codexHome.path`,
  live path passes a normalized key. Client normalizes homes itself (per task claim, see client file
  grep), so both reach the same key. Inconsistency is cosmetic, not a bug. Optional follow-up: normalize in
  the pull path too.

## 2. review-lane-gateway.spec.ts
- Root cause correct: symlink to a directory needs privilege on Windows. `'junction'` needs none; POSIX ignores the type argument.
- The production code (review-lane-gateway.ts:86-90) does not call lstat or isSymbolicLink. It uses mkdtemp
  (`task-` fresh directory) and writeFile flag 'wx'. The test plants a link named `task`, which the
  random `task-XXXX` directory never touches. So the planted link type does not change which production
  path runs. Junction is equally valid as a trap on both platforms.
- Weakness (pre-existing, not new): the test cannot fail if the link is followed under a different name.
  Not caused by this diff.

## Lint/type
- Nothing seen by reading. Third argument of symlink is typed (`type?: 'dir'|'file'|'junction'`). No unused imports.
