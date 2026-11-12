# Cleanup plan: form controls step 6

## Baseline update

- Command: `npx nx run ui-class-audit:update-baseline`
  (runs `ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts --update-baseline`).
- Exit code: 0.
- Diff: `git diff tools/ui-class-audit/baseline.json` is empty. No entry decreased or increased.
  The baseline already locks the form tokens. The audit found no dead code.

## Files modified

- None. `baseline.json` is unchanged. `check-ui-classes.ts` is unchanged (radio not added).
- Only new files: the reports in `.ptah/specs/TASK_2026_1008_step6/`.

## Verification

- `npm run verify -- -p ui,ptah-extension-webview` was NOT run, because `check-ui-classes.ts` did not change.

## Next steps

1. Review `exceptions-allow-list.md` and confirm the radio decision.
2. Commit the task folder only if the team wants the reports in the repository.
3. Push and open a pull request. Without a code change, the pull request may be unnecessary.
4. Plan a separate task: migrate the raw radios, then add `radio` to `BLOCKED_ROOTS`.
