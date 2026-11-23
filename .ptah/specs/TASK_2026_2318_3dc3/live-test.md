# Live test: nested class member names (TASK_2026_2318_3dc3)

Method follows `.ptah/specs/TASK_2026_2317_973a/live-test.md`.
Build: `node scripts/verify.mjs --exec --task ast-nested-live-build -- npm run electron:build:dev`
from this worktree, after the last source edit (exit 0). The build and the run were repeated after the last source edit (review round 4 fix); the results below are from the last run, after the review-delta fixes of the lookup guard (build exit 0). One earlier run of that build stopped on a socket close by the test app after two reads; the script now retries a failed call, and the next run passed in full.
Run: `node scripts/verify.mjs --exec --task ast-nested-live-run -- node .ptah/tmp/live/run.mjs`,
exit 0 (script copy: `live/run.mjs`).

## Isolation
- Temporary `HOME`, `USERPROFILE`, `XDG_*`, `PTAH_SETTINGS_DIR`, `PTAH_DB_PATH`, `--user-data-dir`
  under `/tmp/ptah-live-ast`. Workspace `/tmp/ptah-live-ast/ws` (scratch git repository).
- `/opt/Ptah` (pid 915832) kept running and kept port 51820. The test instance took a free port
  (51821 in the last run).
- sha256 of `~/.codex/config.toml` and `~/.gemini/config/mcp_config.json`: in the final run the two
  files differed from my first snapshot (another process wrote them between the snapshots), but
  they were equal before and after my run (`90f188d5...` and `36897b74...`). My run did not change them.
- A first attempt left its test instance running after the script ended; I stopped only that process
  group (`kill -- -<pid>`), then made the script stop its group with SIGTERM and SIGKILL.
  After the last run only `/opt/Ptah` remains.

## Real tool path
Real MCP HTTP calls (`tools/call`) to the test instance, with the workspace-bound token URL that the
instance wrote to `ws/.mcp.json`.
Fixture `src/nested.ts`: 12 classes `Outer0..11`; each `make()` holds `const Inner = class {...}` with
150 methods and a method `deepen()` that holds `const Deep = class { go() }`; then `Plain` and a
one-line class `OneLine`. 38 classes in all.

`ptah_ast_analyze` result (full note in `live-ast.json`):
- `truncated.classes = {shown:1, total:38, omittedMembers:1837}`.
- `omittedNames` (116 names, ends with `…` at the 1800-character cap; same as in the first run):
  `Outer0.Inner,Outer0.Inner.Deep,Outer1,Outer1.Inner,Outer1.Inner.Deep,Outer2,...,Outer0.Inner.m0,...`
- `hint` carries the new sentence: "pass its name from omittedNames as it is (the name carries the
  outer classes, as in Outer.Inner.method)".

`ptah_read_symbol` with names copied from `omittedNames`, each answered with one declaration:

| name | answer header |
| --- | --- |
| `Outer0.Inner` | `src/nested.ts:3-462 class Outer0.Inner` |
| `Outer1.Inner` | `src/nested.ts:469-928 class Outer1.Inner` |
| `Outer0.Inner.Deep` | `src/nested.ts:455-459 class Outer0.Inner.Deep` |
| `Outer0.Inner.m0` | `src/nested.ts:4-6 method Outer0.Inner.m0` |
| `Outer0.Inner.m1` | `src/nested.ts:7-9 method Outer0.Inner.m1` |
| `Plain` | `src/nested.ts:5593-5597 class Plain` |

The old form `Inner.run` answers `No declaration named "Inner.run"`, as expected: it is no longer emitted.

## Not covered live
- The 1800-character cap dropped the names of `Deep.go` and of `OneLine.hit` from this run's list.
  Those names are covered by the real-parser spec (`ast-analyze-result.spec.ts`) with the real reader.
- Renderer UI (not needed for MCP tool calls). No other host was started.
