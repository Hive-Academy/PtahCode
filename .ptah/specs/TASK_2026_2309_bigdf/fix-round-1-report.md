# Fix round 1: TASK_2026_2309_bigdf

Scope: decisions.md D7. Two findings from code-logic-review.md: Serious "missing-patch heuristic" and Moderate "byte cap in characters". Only `libs/backend/review-github/src/lib/github-review.adapter.ts` and its spec changed.

## Changes

### github-review.adapter.ts
- L108-111: new `omitsPatch(file)`, which is true only when `file.patch === undefined && file.changes > 0`. GitHub sends no patch and 0 changes for binary files and pure renames, so those no longer count as lost content. `changes` was already in `filesSchema` (L45, `z.number().int().nonnegative()`), so the schema needed no change.
- L253, normal path: `files.some(omitsPatch)` replaces `files.some(file => file.patch === undefined)`.
- L274, fallback assembly: `if (omitsPatch(file)) truncated = true;`. `fileSection` is unchanged, so a pure rename with no patch still gets its `diff --git`, `rename from` / `rename to` and `---`/`+++` header lines.
- L276-279, fallback byte cap: the check now uses `Buffer.byteLength(section, 'utf8')` for both the comparison and the running `size`, not `section.length`.
- Unchanged: `usable` is still set only by a file that has a patch. A fallback diff made only of binary files and renames still fails as `diff-too-large`, as before.

### github-review.adapter.spec.ts
- L141 (new, normal path): a binary file and a pure rename, both with no patch and `changes: 0`, give `truncated: false`.
- L177 (changed): the old fallback test used `logo.png` with `changes: 0` and expected `truncated: true`, which is the bug. It now uses `big.sql` with no patch and `changes: 40000`. It still expects `truncated: true` and the file's header.
- L186 (new, fallback): a binary file and a pure rename with no patch and `changes: 0` give `truncated: false`. The test checks the binary header lines and the full rename header block.
- L199 (new, fallback): two pages, each with one section of about 3M characters of `é` (about 6 MB in UTF-8). Both sections fit under 10 MiB when counted in characters, but only one fits when counted in bytes. The test expects `truncated: true`, with `src/a.ts` present and `src/b.ts` absent. The old character-based check would not have truncated.

## Verification
- `npx jest --config libs/backend/review-github/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/review-github/src/lib/github-review.adapter.spec.ts` → 1 suite, 24 passed (21 before: 3 added, 1 changed). Log: `.ptah/tmp/bigdf-fix1-jest.log`.
- `npx tsc --noEmit --project libs/backend/review-github/tsconfig.spec.json` → exit 0.
- `npx eslint` on both changed files → exit 0, no findings.
- Not run, per the brief: `npm run verify`, nx, builds, git.

## Decisions
- Rule kept as briefed: no patch AND `changes > 0` → truncated. A binary file is not given special handling, because GitHub reports binary files with 0 changes. Easy to reverse.

## Out of scope
- D8 items (pagination time against the context deadline, non-retryable codes, `getDiff` running on incremental reviews) are not touched.
