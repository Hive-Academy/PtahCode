# B7b report

## Files changed

- `codex-rollout-usage.reader.ts`: bounded Codex replay collector, root discovery, native UUID validation, cumulative deltas.
- `codex-rollout-usage.stream.spec.ts`: synthetic stream and discovery tests.
- `src/index.ts`: public exports.

## New exported names (with signatures)

- `class CodexRolloutUsageCollector implements UsageCollector`; constructor takes `Pick<IFileSystemProvider, 'lstat' | 'readFileRangeNoFollow'>`; `collect(file: string, cursor: UsageSourceCursor | null, budgetBytes: number): Promise<{ events: readonly SessionUsageContribution[]; next: UsageSourceCursor; more: boolean }>`
- `selectedCodexUsageRoots(): readonly string[]`
- `listCodexRolloutFiles(sessionsDir?: string): AsyncGenerator<string>`

## Verification

- `npm run verify -- -t lint,typecheck -p @ptah-extension/cli-agent-runtime | Select-Object -Last 40; exit $LASTEXITCODE`: `2 tasks: 1 succeeded, 1 failed`; exit code 1. Typecheck reports three TS18048 errors in `antigravity-cli.adapter.ts` lines 840-842, outside B7b write set.
- `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=codex-rollout | Select-Object -Last 40; exit $LASTEXITCODE`: `1 task: 1 succeeded`; exit code 0.

## Tests added

- Cumulative deltas, append resume with stable fingerprint, reset, filename and session_meta UUID match, newest-first date discovery, selected CODEX_HOME.

## Out-of-set edits

- None.

## Extra reads

- Existing Claude collector and its spec, usage collector contract, Codex rollout fixture and reader spec, Codex home resolver, project config, public index, Codex auth selection lines, platform file system contract, Nx typecheck log. No real transcripts or databases read.

## Decisions

- Keep child rollout replay independently billable: the available synthetic session_meta fixture has only its own ID and no verified parent relation. Reversible when a verified parent field is available.
- Use stable first-line fingerprint and native thread filename UUID. Reversible implementation detail; required for append-safe cursors.

## Open problems

- Child thread ownership remains unproven.
- Project typecheck is blocked by another lane's antigravity adapter errors.

