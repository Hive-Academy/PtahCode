# B11 guidance facts report

## Work

- H1 done: `project-guidance.service.ts` reads bounded root and package files for lint, formatter, tests, TypeScript strict mode, and CI. Weak practices get `tolerate` or `do_not_copy`. Probe failures log debug and omit affected facts. The guidance handler passes the host workspace root and only forwards analysis fields present in the caller input.
- H2 done: `setup-rpc.handlers.ts` validates `ownerDecision` with Zod. The service writes `.ptah/project-guidance.md` through a temporary file and rename. The record has a date, grouped facts with evidence, owner decision, and three rules. A write failure returns facts without `recordPath`. `rpc.types.ts` includes the optional request and response fields. No new RPC method or DI registration was needed.
- F1 done: `team-builder-start.page.ts` sends the owner decision before launch on Skip and after install. Record failure sets an inline note and does not stop launch. Skip and the launch function block during loading. Framework parsing excludes `(not detected)`. `team-builder-guidance-brief.ts` puts rules before quoted fact data, strips line breaks, and keeps the size cap. The consent component reopens the native dialog after a close event during installation.
- T done: The service spec covers weak and configured repositories, a probe read error, no invented analysis facts, the record and atomic rename, and write failure. The handler spec checks invalid owner decision and confirms defaults are not passed as supplied facts. Frontend specs cover the decision call, record failure, Skip loading lock, fact quoting and order, and modal close during install.

## Focused checks

- Backend Jest, handler plus service specs: first run exit 1 because the new spec lacked `reflect-metadata`; handler suite passed, 56 tests. The import was added. Service spec rerun: exit 0, 4 tests passed. After the final probe edit, service spec rerun: exit 0, 4 tests passed. After adding the supplied fields test, handler spec rerun: exit 0, 57 tests passed.
- Frontend Jest, four team-builder specs: exit 0, 20 tests passed. After adding the modal close test, consent spec rerun: exit 0, 2 tests passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: exit 0 after final backend edit. The frontend onboarding and shared equivalents each exited 0.
- `npx eslint` on changed TypeScript files: exit 0, 0 errors, 37 warnings. Warnings include existing file size and member accessibility rules.
- `npx eslint` on the two specs changed after that run: exit 0, no output.
- Scoped `ptah_get_diagnostics`: unavailable after 45 seconds; no pass is claimed from it. The three focused TypeScript commands passed.
- Template bindings were read against the component classes for Skip, the guidance note, and modal close.

## Limits and workspace state

- A browser screenshot of the raw `team-builder-start.page.html` file showed the added guidance note markup. Angular bindings and styles were not evaluated there, so this is not a rendered Electron visual pass. The Electron renderer was not started because the brief forbids build, serve, and dev commands.
- The worktree already had other uncommitted changes, including allowed page and type files and unrelated report files. They were kept. No file outside the write set was edited.
- Skill invocation was unavailable in this CLI. No skill was loaded.
