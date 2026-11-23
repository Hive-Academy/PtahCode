# Code logic review of coordinator changes

Review family: codex (reviewer) vs claude (author)

**Verdict: REVISE.** Two Serious, one Moderate, and one Minor finding. **Score 5/10.** The normal upgrade and the test edits are sound. A simultaneous upgrade can take persistence offline in one host, and a single-file reindex can read outside the selected workspace through a filesystem link.

## Findings

1. **Serious — A shared upgrade can execute migration 0077 twice.**  
   `libs/backend/persistence-sqlite/src/lib/migration-runner.ts:84`, `:117`, `:308`; `libs/backend/persistence-sqlite/src/lib/migrations/0077_code_symbol_files.ts:23`.  
   If Electron and CLI both read the v76 migration ledger before either commits v77, both select 0077. After the first connection commits, the second can acquire the writer lock and run the same SQL using its stale snapshot. The two table declarations tolerate the replay, then the column addition fails with a duplicate-column error. The loser rolls back and `sqlite-connection.service.ts:270` closes that connection and classifies persistence as unavailable. A later reopen can succeed because the winner's schema and ledger commit together. The 0077 comment on line 9 promises exactly-once application. The existing shared-file case at `migrations/0077_code_symbol_files.spec.ts:314` awaits the first open before starting the second, leaving the stale-snapshot case uncovered.  
   **Fix.** Recheck the migration ledger under `BEGIN IMMEDIATE` before executing static migration SQL. If already applied, release the transaction, report the migration as skipped, and include the observed version in the runner result. Keep SQL, ledger insert and `user_version` in the same transaction. Cover two connections starting from v76 with both initial ledger reads before the first commit.

2. **Serious — A lexical child can resolve outside the workspace.**  
   `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:1336`, `:1349`, `:1533`.  
   An existing symlink under the workspace can resolve to an out-of-root file or directory. The lexical relative path looks in scope. The ancestor probe checks for `.git` along the requested path, and a target without that marker passes. Electron and CLI then follow the link in their filesystem providers' `readFile` methods and the indexer can store the resulting symbols under the workspace root (indexer line 1716). A Windows directory junction has the same scope problem. The direct tool caller checks ownership of the root and the file's language (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts:504`), leaving this check to the indexer.  
   **Fix.** Use the existing filesystem provider's `realpath` for the root and the file, check resolved containment before reading, and read the validated resolved path. Keep lexical checks for the requested path and retain its index identity. Exercise both a file link and a linked directory or junction in the scope coverage.

3. **Moderate — The absolute-path check and the containment check use different path grammars.**  
   `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:1331`–`:1346`.  
   On POSIX, a drive-qualified path such as `C:/…` passes the Win32 absolute check, while native `path.relative` and the Electron and CLI Node providers treat it as relative to the process working directory. The guard can accept it when that working directory is inside the workspace and the POSIX path resolves inside the root. The same request can be excluded when the host starts elsewhere. This is an absolute-input and identity bug even when the local file is physically inside the root. Replacing backslashes before POSIX normalization also makes a Windows UNC spelling look like a local slash-rooted path. On Windows, ordinary same-share UNC children use native containment. A different drive or share yields an absolute or upward relative result, and ordinary `..` traversal across the boundary is rejected.  
   **Fix.** Require native absolute paths and use the same native grammar for normalization, containment and filesystem access. Use native absolute fixture roots, including in `code-symbol-indexer.exports.integration.spec.ts:69`. Cover foreign drive syntax, Windows same-share and different-share UNC paths, and ordinary parent segments.

4. **Minor — The force option doc overstates its effect and omits the explicit agent caller.**  
   `libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:85`.  
   A caller reading “Parse every selected file” can expect a forced run to parse tombstoned files or files when the runtime is unavailable. Both branches still return without parsing (lines 1480 and 1510). An explicit full reindex from the agent tool also sets force (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts:285`–`:296`).  
   **Fix.** Document that force bypasses the unchanged-fingerprint shortcut for an explicit full reindex, including the agent tool.

## Scope results

| Item | Result |
| --- | --- |
| 1. Migration 0077 and registration | Finding 1 covers shared startup. The SQL is static and registered immediately after 0076 (`migrations/index.ts:526`–`:527`). The nullable column preserves existing row IDs and yields NULL on old rows. The FTS triggers reference named columns (`migrations/0013_code_symbols.ts:31`–`:45`), so this schema change leaves the trigger and FTS row mapping intact. The index is on `code_symbols(text_hash)`. The `IF NOT EXISTS` clauses on the tables and index tolerate existing objects with the intended definitions. They provide no protection for the column addition. Normal failure after the lock rolls schema and bookkeeping back together. |
| 2. Latest-version assertions | No findings. All 27 modified specs assert their own filename version N at position N − 1. The remaining references to 76 in the migration specs are predecessor, fixture, or position checks. |
| 3a. Force doc | Finding 4. |
| 3b. Scope guard | Findings 2 and 3. |
| 4. Integration test doubles | No findings. The exports helper at `code-symbol-indexer.exports.integration.spec.ts:212` and the grammar stubs at `php-ruby-cpp-grammar.integration.spec.ts:854` and `:1028` return the expected async boolean for fixtures with no ignore rules. The direct reindex tests still assert the resulting parse coverage. |

## Five logic questions

1. **How does it fail silently?** A resolved path outside the root can produce ordinary analyzed coverage and be persisted under the current workspace (finding 2).
2. **What user action produces unexpected behaviour?** Opening Electron and CLI while both need to upgrade the shared database can disable persistence in one host for that open (finding 1).
3. **What input produces a wrong answer?** A foreign drive-qualified path can pass the POSIX absolute gate and be interpreted against the process working directory (finding 3).
4. **What happens when a dependency fails?** A static DDL failure rolls back and propagates to the connection service. Failure to acquire the writer lock propagates directly to that service. A nested `.git` probe error deliberately counts as absent under D1.3 (`nested-repo-scan.ts:11`–`:20`). A read failure produces failed coverage and no symbol write (indexer lines 1533–1544).
5. **What did the requirements leave implicit?** They call for shared-file coverage without specifying synchronized startup, and describe normalized path containment without specifying how to handle filesystem links or paths from another host grammar.

## Verification

Reviewed the diffs against main, the task context and D1/D2, the migration ledger and connection lifecycle, the FTS definitions, the reindex call path, and the edited doubles. Compared all 27 new migration position assertions with their filename versions and inspected the remaining references to v76. Main has no 0077 registration or migration file. Ptah parsed the reviewed TypeScript structure. `ptah_search_files` returned zero task-folder hits, so native `rg` with ignored files included located the task documents. The host exposed no skill loader, and this review assigned no skill.

Existing `.ptah/tmp/b2a-jest.log` records six passing tests, including FTS preservation, sequential reopen, and sequential shared-file access. The reviewer ran no fresh test or typecheck. The race and path findings are from control-flow inspection. Actual concurrent native startup and Windows filesystem behavior were not exercised in this review.

## Decisions

- Treated a resolved file outside the opened root as out of scope. The alternatives were lexical containment alone or checking both the requested and resolved paths. D1.3 places containment before the read, and the Electron and CLI providers follow links. An indexer-local check is reversible and can preserve existing index keys.
- Used the approved plan plus existing scoped test evidence and static tracing. A repeat of the six existing cases would cover the same sequential opens. This choice can be revisited with a concurrent regression test and native path coverage.
