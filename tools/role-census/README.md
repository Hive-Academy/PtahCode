# Role census

Counts tracked, readable text files containing any of the 14 retired role names. Each matching line counts once. Paths are assigned to the first matching bucket rule; the baseline records matching lines and files.

Run `npx ts-node --transpile-only tools/role-census/check-role-census.ts`. After removing references, run the same command with `--update` to lower the baseline. A baseline raise requires user approval and `--update --force-raise --reason "<approved reason>"`.

To exclude a migration map that must name old roles, add `{ "path": "path/glob/**", "reason": "why it must retain names" }` to `baseline.json`'s `excludes` array. Exclusions without a reason fail the check.

## Limits

The check compares matching lines within each bucket only. The `files` and `total` counts are records. A baseline left above the current count creates slack for future lines in that bucket, so each program phase must run `--update` in the same pull request that removes role names.
