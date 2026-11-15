# Changes

- Extracted the git:info 2.5 s success TTL, per-root in-flight/trailing reads, and invalidation generation into git/git-info-read-cache.ts. GitInfoService delegates reads, refreshes, and invalidation; public API and watcher behavior remain unchanged.
- Limited settled entries to 32 recent roots. Unavailable results and rejected reads do not enter the cache. Generation bookkeeping is retained only while a root has an active flight.
- Added path-free counts for hits, joins, misses, invalidations, reads, and aggregate read duration. One activity summary is emitted through the injected logger at most once per 60 s.
- Added cache unit specs covering joining, TTL, invalidation during flight, failures, LRU, and bounded logging.

# Checks

- npx jest --config libs/backend/vscode-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-core/src/services/git/git-info-read-cache.spec.ts libs/backend/vscode-core/src/services/git-info.service.spec.ts: pass, 2 suites, 201 tests (.ptah/tmp/batch2-jest.log).
- Same Jest form for other git-info*.spec.ts under services: pass, 1 suite, 14 tests (.ptah/tmp/batch2-other-jest.log). The standard Jest config excludes the 13 *.real-git.spec.ts files.
- Final post-edit cache-spec rerun: pass, 1 suite, 5 tests (.ptah/tmp/batch2-final-jest.log).
- ptah_get_diagnostics on changed source and spec: clean, 0 errors, 0 warnings.
- npx tsc --noEmit --project libs/backend/vscode-core/tsconfig.lib.json: pass, 0 errors (.ptah/tmp/batch2-tsc.log).
- npx eslint on the four allowed files: pass, 0 errors, 2 existing warnings in git-info.service.ts (file length and non-null assertion; .ptah/tmp/batch2-eslint.log).

# Decisions

- Kept generic cached reads and their single-flight state in the facade because other Git query methods use them. Moved the git:info state only, so no second status cache exists. Evidence: getGitInfo and refreshGitInfo were the only infoCache callers. Reversible: yes.
- Preserved watcher invalidation before background reads and bypassed the TTL for watcher refreshes. Evidence: existing refreshGitInfo sequencing and regression specs. Reversible: yes.

# Open issues

- The requested standard Jest config does not run real-Git specs; its testPathIgnorePatterns excludes them.

