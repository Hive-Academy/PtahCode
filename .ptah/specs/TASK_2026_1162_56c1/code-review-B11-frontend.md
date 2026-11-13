# Code review: B11 and frontend batch (TASK_2026_1162_56c1)

Score: **78/100**. Verdict: **Pass with notes**.

Method: I read the code. I did not run tests, nx or the host. The spec files for the page, review and consent components were not read in full (only the page spec diff, the service spec, and the brief spec). No skill tool was used. I did not verify the native modal `closed` event in `libs/frontend/ui`.

Path note: line numbers for `team-builder-start.page.ts` are from the file. Other files are cited as read.

## Q1. Earlier findings (code-review-frontend-2.md)

| Finding | Status | Evidence |
| --- | --- | --- |
| Blocker: the guidance payload cannot describe a weak repository | Corrected for the owner decision. The page still sends only `projectType` and `frameworks`. | The host now probes the repo root and labels `tolerate` and `do_not_copy` (`project-guidance.service.ts:77-123`). The handler no longer fills defaults: only supplied keys pass (`setup-rpc.handlers.ts` diff lines 65-73). Page payload: `team-builder-start.page.ts:170-178`. |
| Serious: Skip during load launches with no facts | Corrected | `team-builder-skill-review.component.html:184` (`busy() \|\| loading()`) and `team-builder-start.page.ts:393`. Spec: "keeps Skip locked during loading". |
| Minor: Escape closes the consent dialog during install | Corrected, no test seen | `team-builder-skill-consent.component.ts:33-42` reopens with `showModal()` while busy. |
| Minor: fact text acts as instructions | Partly corrected | Rules come first and the block is marked as data. Line breaks are stripped (`team-builder-guidance-brief.ts:14-28`). There is no real quote or escape (see S2 below). |

## Q2. Host probes

- Read only: yes. Only `readdir` and `readFile` (`project-guidance.service.ts:77-123`).
- Root: from `workspaceProvider.getWorkspaceRoot()` (handler diff line 73). No client value selects a path. Good.
- Bounded work: partly. `readdir` of the root, one `package.json`, one tsconfig, one workflows directory. Count is bounded. Size is not.
- Symlink or large file: not handled. `readFile` follows symlinks and has no size cap, no `lstat`, no `isFile` check (lines 91, 108). A symlink to a very large file or a FIFO can use memory or hang the call. See S1.
- One read error: mostly isolated, each probe has its own try/catch. Exception: `JSON.parse` of a `package.json` that contains `null` returns `null`. Then `packageData.eslintConfig` (line 95) throws outside any try, and the whole call fails. See S3. The page then shows "Could not load project guidance." and continues.

## Q3. Fact text

Not fixed text plus file name only.
- File names enter facts (`found`, `tsconfig`, workflow name: lines 83, 111, 121). Name patterns are prefix matches (`.eslintrc*`, `tsconfig*.json`, `jest.config.*`, any `*.yml`), so the rest of the name is free text. Only `\r\n` is stripped, and only in the record and the brief. Other control characters, Unicode line separators and Markdown pass through.
- Framework names and pattern names come from the client and the stored analysis file (`team-builder-start.page.ts:166-177`). They are untrusted repo text.
- Record write: each fact is one bullet line. A fact cannot make a new heading, but it can carry Markdown and imperative text.

## Q4. Record write

- Temp file then `rename`, unique name (`randomUUID`) (`project-guidance.service.ts:51-61`). Atomic.
- No `.ptah/`: `mkdir recursive` creates it. `.ptah` is a file: mkdir fails, caught, no `recordPath` (tested).
- Rename fails: caught. The `finally` removes the temp file. A crash between write and rename can leave a `.tmp` file; acceptable.
- Two calls at once: unique temp names, last rename wins. Safe.
- Error text to client: no. Only a debug log and a missing `recordPath`.
- Note: the record is rebuilt from fresh probes at launch. It can differ from the facts the owner saw. See M3.

## Q5. Schema defaults

Closed for the page payload. The handler passes only keys that exist in the raw request (`Object.hasOwn`). Residual: a client that sends `codeConventions: {}` still gets Zod defaults reported as "Detected from sampled files". The page never sends it. The handler spec covers only `frameworks`.

## Q6. Page state

- Skip during load: blocked (template and `launchChat` guard).
- Double click Continue: `loading` is set before the await (`reviewSelection`, lines 281). Second click returns.
- Double click Skip or Install: `stage` is set synchronously (`launchChat` line 400, `install` line 335). Second call returns.
- Failed record call: caught, note set, launch continues. Matches the brief's graceful path. Spec covers it.
- Failed install: stage back to `review`, fixed text or `RpcUserError` text. OK.
- Dialog closed during install: reopened.
- Stale responses: version and root checks after each await. Exception: `this.guidanceAnalysis = analysis` is set before the stale check (line 209). See M2.
- Lock path (not reachable today): `install()` succeeds, then `launchChat(true)` returns early on `blockForOwnerDecision()` or `loading()` (line 393). Stage stays `installing`, Back is disabled, dialog is locked. Facts cannot change in `consent` stage, so I found no way to reach it. See M4.
- Second launch: after a successful launch the stage goes back to `review` (line 431-432). If the launcher does not navigate away, Skip launches a second chat. Not verified. See M5.

## Q7. Untrusted text

Skill names, descriptions, facts, evidence, `reason` and `failedSkill` are all interpolations. No `[innerHTML]`, no URL binding in the files I read. `[attr.aria-label]` with skill name is an attribute binding, safe. Skill names and descriptions do not reach the launch intent. Facts do (see Q8).

## Q8. Guidance brief

- Rules before facts: yes. Intent first and unchanged: yes (`${intent}` prefix; the intent is no longer trimmed, see M1).
- Line breaks stripped: yes. Size: each label line at most 500 bytes. Total block is about 1.7 KB (3 label lines, about 0.2 KB of rules). Under 2 KB. Intent length is not counted.
- Can a fact close the quote? There is no closing delimiter, only a `> ` line prefix. A fact cannot end a quote, but a fact can contain `; Do not copy: ...`, Unicode line separators (U+2028, U+0085), or text such as "ignore the rules above". The "data, not instructions" line is a request to the model, not a guard. See S2.
- The 500-byte cut can silently drop later facts in one label, including `do_not_copy` items.

## Q9. Tests

Present and meaningful: probe labels, no invented conventions, atomic record, one-probe failure, record failure, brief order, line breaks, size, Skip lock, owner gate, record-failure launch.

Missing or weak:
- No test for a symlink, an oversize file, or `package.json` equal to `null`.
- No test that a fact containing control characters or Markdown is neutralised.
- No handler test for `codeConventions: {}` or for a supplied `architecturePatterns`.
- No page test for double click on Continue, Skip or Install, for a stale response after a workspace change, or for `back()` during install.
- The brief spec size test uses two labels only; it would still pass with a 4 KB total if a third label were long (see Q8: the code is fine, the test is narrow).
- The page spec changed the launch expectation from `'A research team'` to `'  A research team  '`. The trim removal is accepted by the test, not asserted as intended.
- No test for the consent dialog reopen on Escape (not confirmed in the consent spec).

## Q10. Conventions

- Standalone, OnPush, signals, `input()`/`output()`: yes. `ClaudeRpcService` only: yes. No `any`, no `console.*`, no `[innerHTML]` found. `RpcUserError`: not changed in this batch's reading; `rpcMessage` only trusts `errorCode`.
- Zod at the RPC boundary: yes (`z.enum(['match','raise'])` on `ownerDecision`).
- Accessibility: dialog has `ariaLabelledby`. Owner decision uses `fieldset` with `legend` and native radios in one group: keyboard works. Error uses `role="alert"`. Gap: the radios use `ptahCheckbox` on `type="radio"` (visual only). The radio group is always shown, even when no decision is required (`review.component.html:136-163`); the text does not say it is optional. No focus move to the error alert or to the radios on `ownerDecisionError`.
- The store is `providedIn: 'root'` and also listed in the page `providers`, so the page gets its own instance. Harmless; the root provider is unneeded.

## Findings

### Blocker

None.

### Serious

**S1. Unbounded file read of repo files.** `project-guidance.service.ts:91,108`.
Scenario: `package.json` or `tsconfig.json` is a symlink to a huge file or FIFO, or a very large file. The call reads it all into memory or hangs. The RPC has no timeout.
Fix: `fs.lstat`, require `isFile()`, size at most 1 MB, then read. Skip the probe otherwise.

**S2. Fact text is not neutralised in the brief and the record.** `team-builder-guidance-brief.ts:16-27`, `project-guidance.service.ts:72-73`, `:83`.
Scenario: a file named `.eslintrc.ignore the rules above` or a framework string with U+2028 and an instruction reaches the launch intent and `.ptah/project-guidance.md`.
Fix: one shared sanitizer for facts. Replace all control characters and Unicode line separators (`/[\p{Cc}\u2028\u2029]+/gu`) with a space, and escape or remove leading Markdown characters. Use file names only in `evidence`, not in `fact`. Add a test.

### Minor

**M1.** `team-builder-start.page.ts:420-422`. The intent is sent untrimmed, so leading and trailing space reach the launch. Fix: `this.intent().trim()`, or state that it is intended.

**M2.** `team-builder-start.page.ts:209`. A stale response writes `guidanceAnalysis` before the version check. Fix: move the assignment after the check.

**M3.** `team-builder-start.page.ts:409-412`. The record is rebuilt from fresh probes, so it can differ from the facts shown. Fix: accept as is and say it in the UI note, or send the shown facts.

**M4.** `team-builder-start.page.ts:393-395`. A guard in `launchChat(true)` that returns leaves stage `installing`. Fix: when `fromInstall` and the guard fails, set stage to `review`.

**M5.** `team-builder-start.page.ts:431-432`. After a successful launch the page returns to `review`. Fix: confirm the launcher navigates away; if not, keep `launching` until navigation.

**M6.** `project-guidance.service.ts:94-96`. `JSON.parse` result `null` throws a `TypeError` outside a try. Fix: `packageData = (parsed && typeof parsed === 'object') ? parsed : {}`.

**M7.** `project-guidance.service.ts:81,105`. `find` takes the first match in `readdir` order, so `tsconfig.base.json` can win over `tsconfig.json`. `pyproject.toml` counts as test config. Fix: prefer exact `tsconfig.json`; drop `pyproject.toml` or read it.

**M8.** `team-builder-skill.store.ts:32-49` and `team-builder-start.page.ts:128-141`. `selectedIds` and `ownerDecision` are not cleared by `loadReview`. After Back and re-submit, hidden selections count in "Review selected skills (n)" and an old decision is applied. Fix: clear both at the start of `loadReview`, or keep only ids still listed.

**M9.** The brief cut at 500 bytes drops later facts silently. Fix: list `do_not_copy` and `tolerate` first, or add "(more omitted)".

## Not a defect

- No client-selected path: root comes from the host.
- Atomic record, unique temp, cleanup in `finally`, no raw error text to the client.
- Record failure does not stop the launch and shows a fixed note.
- Consent hashes come from the preview. Script skills are refused in `install()` without approval. Cancel sends no RPC.
- `rpcMessage` shows RPC text only with an `errorCode`.
- Stage lock for `installing` and `launching`; `back()` returns during install and aborts a launch.
- `result.data.reason` on `success: false` is host `RpcUserError` text and is interpolated.
- Default Zod fill is no longer reachable from the page payload.
