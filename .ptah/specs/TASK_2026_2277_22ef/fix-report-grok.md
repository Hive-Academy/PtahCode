# Grok review fix report

| Defect | Status | Evidence |
| --- | --- | --- |
| 1 | Done | `grok-account-plan-usage.reader.ts:185`: schema success alone controls HTTP 200 mapping. `grok-account-plan-usage.reader.spec.ts:425` pins `{}` and an unknown-field body as available, empty windows, established window set. |
| 2 | Done | Reader `:93`, `:122`: custom environment and TOML config return no statusReason; safe `custom-auth-config` debug reason remains. Reader spec `:355`, `:480` covers these paths. |
| 3 | Done | Reader `:89`: non-cli-store owners return no statusReason; safe `owner-not-applicable` debug reason remains. Reader spec `:388` covers the skip. |
| 4 | Done | `lane-limit-classifier.ts:74`, `:175`: removed leading regex and use; `agent-process-manager.service.ts:176`: removed matching leading alternative, preserved real message-line alternative. Classifier spec `:190` removes leading-form positive case and retains bare/unrelated negatives; lifecycle spec `:319` covers prose and quoted successful output. |
| 5 | Done (authorized deletion) | `plan-limit-ledger.service.spec.ts:1577`: deleted the reader-plus-copied-condition test, retained actual ledger-method tests. Production clearance is in `plan-usage.service.ts:533-534`; coverage belongs in `plan-usage.service.spec.ts` and requires work outside this write set. |
| 6 | Done | `owner-lifecycle.integration.spec.ts:367`: real four segments in order (error, error, info, info), owner at-limit with no resetsAt. Added exit-zero ordinary-prose error, bare 402, unrelated payment error and quoted info/output negatives; checks stopReason as well as evidence. |
| 7 | Done | `plan-limit-ledger.service.spec.ts:1`: reflect-metadata is first; removed now-unused reader import with the tautological test. |
| 8 | Done | `agent-process-manager.service.ts:176`: anchored raw JSON error alternative added after node verification rejects ordinary prose. Lifecycle spec `:323`, `:324`, `:372` exercises both raw nested-message JSON and direct-message JSON through the real gate. |

Paths in the table are under `libs/backend/auth-providers/src/lib/quota/` (reader paths under `readers/`) or `libs/backend/cli-agent-runtime/src/lib/cli-agents/` (classifier and lifecycle paths under `limits/`).

## Regex tests

Both commands below executed as one-line `node -e` arguments. The gate accepts real stderr and raw JSON; bare 402, unrelated payment errors, and ordinary prose do not match. The classifier intentionally also recognizes evidence embedded in prose; the process manager gate and segment types protect successful runs.

```powershell
node -e 'const gate=/^(?:API rate limit \(HTTP 429\)|API Error: Request rejected \((?:402|429)\)|\s*(?:"message":\s*")?API error \(status 402 Payment Required\):\s*Grok Build usage balance exhausted\b|\{"type":"error","message":"(?:Internal error: \{\\n\s*\\"message\\": \\")?API error \(status 402 Payment Required\):\s*Grok Build usage balance exhausted\b|(?:HTTP(?:\s+status)?|status(?:\s+code)?)\s*[:=]?\s*(?:402|429)\b[^\n]*(?:usage|quota|rate limit|RESOURCE_EXHAUSTED|balance exhausted|Too Many Requests))/im; const real=''  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",''; const api=''API error (status 402 Payment Required): Grok Build usage balance exhausted''; const raw=JSON.stringify({type:''error'',message:''Internal error: {\n  "message": "''+api+''",\n  "http_status": 402\n}''}); const cases={real,raw,direct:JSON.stringify({type:''error'',message:api}),bare:''402'',unrelated:''API error (status 402 Payment Required): payment declined'',prose:''Documentation mentions a 402 payment problem: ''+api,quoted:''Example: ''+raw}; for(const [name,text] of Object.entries(cases)) console.log(name+''=''+gate.test(text));'
```

```text
real=true
raw=true
direct=true
bare=false
unrelated=false
prose=false
quoted=false
```

```powershell
node -e 'const GROK_BALANCE_STATUS = String.raw`(?:\bHTTP(?:/\d(?:\.\d)?)?|\bAPI error|\bstatus(?:Code)?)[\s:=("]{0,6}402\b`; const GROK_BALANCE_REGEX = new RegExp(   `${GROK_BALANCE_STATUS}[^\\n]{0,160}\\busage balance exhausted\\b|\\busage balance exhausted\\b[^\\n]{0,80}${GROK_BALANCE_STATUS}`,   ''i'', ); const real=''  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",''; const api=''API error (status 402 Payment Required): Grok Build usage balance exhausted''; const raw=JSON.stringify({type:''error'',message:''Internal error: {\n  "message": "''+api+''",\n  "http_status": 402\n}''}); const cases={real,raw,direct:JSON.stringify({type:''error'',message:api}),bare:''402'',unrelated:''API error (status 402 Payment Required): payment declined'',prose:''Documentation mentions a 402 payment problem: ''+api,quoted:''Example: ''+raw}; for(const [name,text] of Object.entries(cases)) console.log(name+''=''+GROK_BALANCE_REGEX.test(text));'
```

```text
real=true
raw=true
direct=true
bare=false
unrelated=false
prose=true
quoted=true
```

## Checks

- CLI Jest: PASS, 2 suites / 76 tests; 0 failed (84.323 s). Node printed an ESM configuration warning, without test failures.
- Auth Jest: PASS, 2 suites / 104 tests; 0 failed (21.447 s). Same non-fatal ESM configuration warning.
- CLI-runtime tsc: PASS, exit 0, 0 diagnostics.
- Auth-provider tsc: PASS, exit 0, 0 diagnostics.
- ESLint: PASS, exit 0; 0 errors, 5 existing warnings. Ledger spec `:802` non-null assertion; manager `:121` unused import, `:618` explicit any, `:894` max-lines, `:3341` empty arrow function. These locations were not edited.
- Prettier: FAIL, exit 1; 6 files pass, only `agent-process-manager.service.ts` fails. Initial run also encountered line endings introduced by the edit; those were corrected. Repeat check still fails on existing formatting outside the allowed constant, beginning at `:148`, then `:487`, `:492-494` and further locations through `:4246`. A formatter comparison of only lines 176-177 confirms the constant itself is already formatted. No formatting outside the permitted constant was applied. Git diff for this file is exactly 1 insertion / 1 deletion, solely the regex line.
- All 4 requested specs pass: 180 tests total, 0 failed. Both project typechecks pass with no diagnostics. No outside-write-set TypeScript errors occurred.

Commands (run from the specified worktree; output tailed):

```text
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts
npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json
```

ESLint and Prettier commands (including the classifier restored to HEAD behavior):

```text
npx eslint libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts
npx prettier --check libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.ts libs/backend/auth-providers/src/lib/quota/readers/grok-account-plan-usage.reader.spec.ts libs/backend/auth-providers/src/lib/quota/plan-limit-ledger.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/lane-limit-classifier.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/owner-lifecycle.integration.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts
```

## Open points

The full-file Prettier requirement cannot be satisfied within the manager-file write restriction: format `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:148` and the other existing formatting differences only in a lane authorized to edit beyond `STRUCTURED_EXIT_ZERO_LIMIT_ERROR`. This is the sole failed required check.

Production clearance integration coverage should be added to `libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts` by a lane authorized to edit it. The copied-condition test has been removed as requested.

CLI-native skill discovery/loading is unavailable in this session; no required skill was supplied. Used supplied project rules directly. Ptah dependents lookup was attempted; native targeted source reads and ripgrep provided the review context. No workspace-wide checks or host-specific changes were made.
