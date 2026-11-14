# B6 install flow wiring

## Wiring

- `wizard:install-skills-with-consent` stages each `owner/repo/skill` in a temporary directory, checks script presence and content hash through the B5 consent service, and refuses script packages without a matching consent record or stored approval.
- Approved skills call the existing `skillsSh:install` RPC. Its existing implementation installs and propagates each successful skill. The injected `SkillsShApiClient` cache is invalidated after each install. After installation, the wizard updates `SkillSyncGate` selection and invokes `HarnessPropagationService` for the final selected set. Provider markdown rewriting remains in the existing harness copy engine.
- Existing agent install RPC paths and `skillsSh:install` implementation were not edited.

## Verification

- Role census: exit 0; no role names added.
- `npm run validate-skill`: exit 0, zero errors and warnings.
- Focused RPC install and B1 compatibility tests: 5 passed.
- Rival provider markdown copy test: 5 passed (Codex, Copilot, Cursor, Antigravity, OpenCode).
- Requested `npm run verify -- -p @ptah-extension/rpc-handlers,@ptah-extension/harness-sync`: lint and typecheck passed (4/4 tasks). Both full project test targets failed: the RPC suite has 129 suite failures dominated by a missing `marked` Jest mapping in this worktree; harness-sync has 6 existing reconciler/source suite failures (27 assertions). The focused B6 suites pass.

## Remaining risks

- B5's concurrently authored `skill-consent.service.ts` had an unescaped backslash at line 70; this lane corrected that syntax error to allow verification.
- The wizard preflight and `skillsSh:install` each stage from the remote source. A source that changes between those fetches may differ from the consented hash; this needs an atomic staged install handoff to close the race while preserving the existing install API.
- The current B1 request names identify skills as `owner/repo/skill`; callers must use this form.
