# Role census check

## Result

Created:

- `tools/role-census/check-role-census.ts`
- `tools/role-census/baseline.json`
- `tools/role-census/project.json`
- `tools/role-census/run-self-test.js`
- `tools/role-census/tsconfig.json`
- `tools/role-census/__fixtures__/sample.md`
- `tools/role-census/README.md`
- `.ptah/specs/TASK_2026_977_0876/census-check-report.md`

Changed: `.github/workflows/ci.yml`.

| Bucket | Lines | Files |
|---|---:|---:|
| templates | 68 | 14 |
| skills | 466 | 35 |
| generated-agents | 176 | 28 |
| docs | 116 | 28 |
| test | 938 | 141 |
| source | 201 | 44 |
| other | 120 | 8 |
| **total** | **2,085** | **298** |

The check scans `git ls-files`, skips unreadable or binary content, and always excludes `.ptah/specs/**`, `tools/role-census/**`, and lock files. Each file enters one bucket and each line with one or more role names counts once. On a decrease it passes and prints `run --update to lower the baseline`, matching degradation-audit's pass-and-update-hint behavior. `--update` refuses any increase; `--force-raise --reason` allows an explicitly approved raise. The initial baseline was created with reason `Initial user-requested baseline`.

## Comparison with the manual census

The manual total (~224 files, ~1,500 lines) is an estimate, and its summary explicitly left the 15 docs/agent files uncounted. This full tracked-file inventory has 298 files and 2,085 lines. It counts 176 lines in generated agents, 116 in docs, and 120 in other files (including tracked manifests), all assigned by the specified bucket rules. It also counts both tracked skill copies: the `skills` bucket has 466 lines in 35 files. The manual skill sections gave measured local orchestration lines but estimated the plugin copy and other groups. Those omitted and estimated groups account for most of the difference; the two totals are not like-for-like.

The manual non-test TypeScript figure was 43 files / 200 lines; the `source` bucket is 44 files / 201 lines. The latter is a bucket over all tracked `.ts`, `.tsx`, `.js`, `.mjs`, and `.cjs` paths, including files the manual list did not enumerate. The manual test figure was 137 spec/test files / 934 lines; the `test` bucket is 141 files / 938 lines because it also classifies matching `__fixtures__/`, `__mocks__/`, and `e2e/` paths as tests. Conversely, the manual placed three `*.fixtures.ts` files (15 lines) with non-test TypeScript; the specified bucket rules leave these in `source` unless their path is inside a fixture directory. These figures therefore use different membership rules. The manual excluded temporary/build paths; this check uses tracked files only and excludes `.ptah/specs/**`, its own tool folder, and lock files.

## Verification

Baseline generation (required setup): `npx ts-node --transpile-only tools/role-census/check-role-census.ts --update --force-raise --reason "Initial user-requested baseline" | Select-Object -Last 20` exited 0 and ended:

```text
TOTAL: 2085 lines in 298 files
Approved raise reason: Initial user-requested baseline
baseline.json updated (drops only unless --force-raise)
```

`npm run verify -- -t self-test -p role-census | tail -30` exited 0. Last output:

```text
[verify 2026-11-12T05:56:21.940Z] starting verify self-test (role-census)
 NX   1 task: 1 succeeded
  Run duration:      5.2s
  Cache:             0/1 hit (0%)
  Critical path:     5.1s (1 task)
[verify 2026-11-12T05:56:51.992Z] lock released after 30.1s, exit code 0
```

`npm run verify -- -t lint -p role-census | tail -30` exited 0. Last output:

```text
[verify 2026-11-12T05:56:57.258Z] starting verify lint (role-census)
 NX   1 task: 1 succeeded
  Run duration:      13.6s
  Cache:             0/1 hit (0%)
  Critical path:     13.5s (1 task)
[verify 2026-11-12T05:57:22.517Z] lock released after 25.3s, exit code 0
```

## How degradation-audit is invoked

- `.github/workflows/ci.yml:91-94`: one CI step runs `degradation-audit:self-test` and `degradation-audit:lint`. Added the same two invocations for `role-census` at lines 95-98.
- `.github/workflows/ci.yml:505`: comment mentions degradation-audit but does not invoke it; no edit.
- No invocation was found in `package.json`, `.husky/`, `scripts/`, or `nx.json`.

## Wiring not done

None.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Disable Nx lint caching | Model all tracked repository inputs; disable caching | The check scans all tracked paths, including manifests and docs; a narrow input list would produce stale results | Yes |
| Treat invalid UTF-8 and NUL-containing files as binary | Decode lossy; skip | Requirement says skip binary; strict UTF-8 avoids false role matches in opaque data | Yes |
| Use an empty exclusion list | Pre-exclude migration artifacts; start empty | Requirement explicitly calls for an empty list; future entries require a reason | Yes |
| Use a private fixture directory and baseline path CLI arguments | Depend on Git; isolate test data | Pure `countRoles` accepts `{path, content}` entries; fixture mode exercises it without Git | Yes |
| Initialize baseline with a reasoned force raise | Hand-edit counts; use the implemented approval path | User requested a real initial baseline, which necessarily rises from the temporary zero baseline | Yes |

## Extra files read

None beyond the requested read set, invocation search locations, generated files, and Git status. Other lanes' untracked files were observed but not read or changed.
