VERDICT: APPROVE

- The fixture now advertises supported plan while retaining an explicit `permissionModes` override (`libs/backend/cli-agent-runtime/src/lib/cli-agents/testing/manifest.fixture.ts:9-10,26-28`). This makes unrelated tests compatible with D24 without changing the production resolver.
- The no-row registry test asserts SDK `permissionMode: 'plan'` and `allowDangerouslySkipPermissions: false` (`libs/backend/cli-agent-runtime/src/lib/ptah-cli/ptah-cli-registry-permission-routing.spec.ts:191-204`). Explicit `ask` routing cases remain at lines 207-285; the removed implicit-yolo assertions describe behavior D24 intentionally replaces.
- Fail-closed coverage remains: a manifest supporting auto-edit and yolo but lacking plan yields `UNSUPPORTED_LANE_POLICY` for an unconfigured spawn (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.spec.ts:185-197`). The production guard is at `cli-lane-policy-resolver.ts:107-114`.
- The stderr and resume specs pass explicit yolo to preserve their existing execution path; the task assertions now include the plan instruction. No meaningful permission coverage was removed. A stale comment about a default yolo lane remains at `ptah-cli-registry-permission-routing.spec.ts:147-148`; editorial only.

Review was static against the supplied diff and cited source. The coordinator's scoped lint, typecheck, and test gates were reported passing; I did not rerun them.

Vendor/model: OpenAI GPT-6 (Codex).
