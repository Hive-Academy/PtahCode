# Batch 24 report: B5b Claude and ptah-cli manifests

## Changes

- MODIFIED `claude/claude-sdk-lane-runner.ts` (shared source of both manifests, and one handle
  member the contract needs):
  - `CLAUDE_SDK_LANE_TURN_INPUT`: model / effort `supported`, `appliesAt: 'next-turn'`; images
    `supported`, `onSteer: false`; files `supported`, `delivery: 'path-text'`; commands
    `supported`, `blocked: CLAUDE_HIDDEN_LANE_COMMANDS` (empty); skills `supported`.
  - `claudeSdkLanePrompts(permission?)`: questions always `supported`; approvals `supported`
    except for a `yolo` spawn ("This lane runs in yolo mode: every tool runs without an approval
    prompt.").
  - handle `turnInputSupport: () => ({ images: { state: 'supported' } })`. The resolver requires a
    live `images` gate and the Req 4.3 contract helper requires the operation.
- MODIFIED `cli-adapters/claude-cli.adapter.ts`: interrupt `supported`; `turnInput`,
  `usage: { timing: 'live' }`, `prompts: claudeSdkLanePrompts()`; steer stays unsupported.
- MODIFIED `ptah-cli/ptah-cli-registry.ts`: `capabilities(providerId, permission?)` with the same
  sections; `spawnAgent` passes `lanePolicy.requested.permission`, so a lane's
  `potentialCapabilities.prompts` follow its spawn mode. Steer stays unsupported (Batch 30).
- Specs:
  - `claude-cli.adapter.spec.ts`: the D39 test also checks interrupt/steer agreement,
    `laneTurnInputContractViolations(handle, manifest) == []`, the turn input, usage and prompts
    sections and the live image gate.
  - `ptah-cli-registry-capabilities.spec.ts`: +2 (sections; yolo approvals reason).
  - `ptah-cli-registry-permission-routing.spec.ts`: +5 (mailbox `push` receives
    `{ content: 'next\n\nAttached files:\n- src/a.ts' }`; contract helper on a spawned handle;
    approvals per spawn mode ask / auto-edit / yolo).

## Verification

- Focused jest: claude-cli adapter, registry capabilities, registry permission-routing and runner
  specs: 4 suites, 191 passed.
- `npx eslint` on the 6 changed files: 0 errors (warnings pre-existing or `max-lines`).

## Plan deviations / decisions

- Prompts: the plan says "supported when `ask` is the effective mode". `canUseTool` still asks in
  `auto-edit` and `plan` for tools those modes do not auto-allow, so only `yolo` refuses
  approvals; questions (`AskUserQuestion`, B11) are kept supported in every mode. Reversible.
- Claude lanes (`claude-cli.adapter.ts`) report `claudeSdkLanePrompts()` without a mode: the
  interface `capabilities()` takes no argument and the manager computes it at
  `agent-process-manager.service.ts:1426`. A yolo Claude lane therefore reports approvals as
  supported; `effectiveApproval` still names the yolo mode.
- `turnInputSupport` added to the runner (Batch 23/25 file) — needed by the resolver and contract.

## A10

- A10 (Claude/ptah-cli handle exposes each claimed operation): recorded by the contract-helper
  tests above for both lanes.

## Open items

- A11 effort on a Ptah CLI cold resume is still not carried (Batch 18): the manifest declares
  effort, so a restored Ptah CLI record offers effort but `PtahCliRegistry.spawnAgent` has no
  effort option. Needs a registry effort option or a resumer refusal.
- Manager `:1426` could pass the effective permission to `capabilities()` for Claude lanes.
