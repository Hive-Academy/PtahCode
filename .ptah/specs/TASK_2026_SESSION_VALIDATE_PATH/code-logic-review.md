# Code Logic Review - session:validate project-dir encoding

Verdict: REVISE (no blocking issues; two moderate issues worth fixing before merge, rest minor).

## Check results

1. Sanitizer fidelity - MATCHES. Bundled SDK (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`, `core-*.mjs`): `nl(e)=e.replace(/[^a-zA-Z0-9]/g,"-")`, cap 200, `${slice(0,200)}-${Math.abs(hash(e)).toString(36)}`, hash = `(h<<5)-h+charCodeAt|0` (same as `Math.imul(31,h)+c|0`). Helper `libs/shared/src/lib/utils/claude-project-dir.ts` is identical, case preserved, drive letter (`D:\` -> `D--`) and UNC (`\\srv\x` -> `--srv-x`) fall out of the same rule. Not handled (pre-existing, uncertain): the CLI's env override of the project key (`Ea()`/`Rr`) and any cwd normalization (realpath/NFC) before sanitizing.
2. Back-compat - OK. `resolveSessionsDir` (session-rpc.handlers.ts ~2078) keeps exact, case-insensitive, `[-_]`-normalized and adds the old `[:\\/]` key. `findSessionFile` (~1991-2032) probes every candidate for `<id>.jsonl`; the id is a file name so a decoy dir only matters if it holds the same id (UUID collision, negligible).
3. Call sites - behavior preserved. jsonl-reader/session-importer (listing), session-resumability, chat-ptah-cli probe only swap the key function; fallbacks unchanged. Listing never enables the partial match in resolveSessionsDir, so no cross-workspace leakage added. Dotted workspaces now hit the exact key, which reduces use of the existing guess fallbacks.
4. Tests - session-rpc spec has the decoy case (`C--Temp-ptah-live-test-ws-claude` listed before the real dir) and a second all-candidates test; both would fail on old code (old key lacked dot folding, first-match fallback picked the decoy). Helper spec covers dots, spaces, underscore and the >200 hash. Module boundaries: `libs/shared` is `scope:shared`, importable from all; exported through `libs/shared/src/lib/utils/index.ts`. Confirm it is re-exported by `libs/shared/src/index.ts` (the existing `WorkspacePathEncoder` line suggests `export * from './lib/utils'`; not verified).
5. Other old-encoding users - see findings 3-4.

## Findings

1. MODERATE - session-rpc.handlers.ts ~2008-2018 / 2022: `findSessionFile` with `recoverStaged:true` runs `recoverStagedSessionFiles` (a mutating restore) on every candidate, including `exactDir` that may not exist and every other project whose name merely contains the workspace basename. Restore is scoped to the session id, so harm is low, but a nonexistent exactDir may log an error ("not restored; will retry") on every validate, and other projects' dirs are touched. Fix: only call recover on dirs that exist, and prefer to run it only on the exact/matching dirs, probing substring candidates read-only.
2. MODERATE - session-rpc.handlers.ts ~2010-2016: the substring candidate filter is unbounded. A short or empty basename (`/`, `C:\`, workspace `a`, `ws`) makes `includes('')` true for every dir, giving O(all projects) access/recover calls per validate. Fix: skip the substring pass when basename length is under ~3, and/or cap candidate count and run it only after exact candidates miss (lazy, not eager).
3. MINOR - libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:249: `path.resolve(workspace).replace(/[^A-Za-z0-9]/g,'-')` is the right rule but lacks the 200-char cap/hash, so for long workspace paths the expected subagent transcript path is wrong and the transcript is rejected. Use `claudeProjectDir(path.resolve(workspace))`.
4. MINOR - apps/ptah-electron-e2e/src/support/session-seed.ts:64 and jsonl-reader.account-context.spec.ts:27 and jsonl-reader.service.spec.ts:390/416 still use `[:\\/]`. Pass today because test paths contain no dots/underscores; they would seed a dir the app no longer finds for dotted temp paths. Switch to the helper.
5. MINOR - jsonl-reader.service.ts (~499) and session-importer.service.ts (~1075) still use first-match guess fallbacks (`path.basename` / `endsWith`), which can attach a wrong workspace's dir for listing when the exact key is absent. Pre-existing, unchanged scope; noted only. Also `path.basename` there is host-specific, whereas rpc-handlers uses `path.win32.basename`; inconsistent for Windows paths on POSIX hosts.
6. MINOR - `[-_]` normalize passes are now redundant (the key already folds `_`); harmless. The test uses a hand-copied hash loop that mirrors the implementation, so it does not independently prove the CLI value; add one fixed known-good literal from a real CLI-created dir.
7. MINOR - session-resumability.ts: the old-key variant is not tried (unlike resolveSessionsDir). Since only the CLI creates these dirs, acceptable.

## Summary

Core encoding is exact and the validate fix is correct. Revise to scope the staged-recovery side effects and bound the substring candidate scan (findings 1-2), and update the leftover old-encoding users (3-4).

## Round 1 re-review

Verdict: REVISE (one new moderate regression; everything requested otherwise verified).

Verified:
- Basename scan (session-rpc.handlers.ts ~2023-2033): skipped when basename < 3 chars (drive roots and `/` give ''), candidates sorted, `slice(0, 20 - exactCandidates.length)` with exact candidates first (max 4), so total probes <= 20. OK.
- Other candidates are read-only probes (fs.access only). OK.
- e2e `session-seed.ts:5,64` and both agent-sdk specs use `claudeProjectDir`. OK.

New defect:
1. MODERATE - session-rpc.handlers.ts ~2008-2010 / 2035: `recoveryKey` uses case-sensitive `dirs.includes(exactKey)` / `dirs.includes(olderKey)`, but the lookup also accepts case-insensitive and `[-_]`-normalized matches (`matchingDirs`). When the real directory differs only in case (typical on Windows: `d:\...` vs `D--...`, which the old resolveSessionsDir handled case-insensitively), recovery is skipped, so a session whose delete was interrupted is not restored and validate reports it missing. Fix: derive `recoveryKey` from `matchingDirs[0]` (first case-insensitive/normalized/old-key match) rather than exact `includes`, keeping partial candidates read-only.
2. MINOR - sorting + cap of 20 is alphabetical, so a real directory beyond the 20th substring match is never probed; acceptable bound, but note it.

## Round 2 re-review

Verdict: APPROVE.

- R1 fixed: `recoveryKey = matchingDirs[0]` (session-rpc.handlers.ts:2013) covers exact, case-insensitive, normalized and old-key matches; recovery still runs only on that dir, partial candidates stay read-only; the 20-probe cap and 3-char floor are unchanged. Case-variant recovery spec added (spec ~2486).
- No new defect found. Residual minor: only the first matching dir is recovered if two variants coexist; the 20-candidate alphabetical bound is accepted.
