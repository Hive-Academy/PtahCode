# Batch 1 report

## Files changed

- session-child-settings.ts and .spec.ts: three validated settings and warning lead clamp.
- session-spawner.port.ts: succession status, snapshot links, request/result types.
- session-child.registry.ts and .spec.ts: atomic succession, rollback, chain lookup.
- session-child-succession.ts and .spec.ts: pure path, timing and text helpers.
- session-child-contract.ts and .spec.ts: runtime and budget handoff instruction.
- index.ts: exported new public symbols.

## Exported symbols added

- SESSION_CHILD_RUNTIME_WARN_LEAD_MINUTES: IntegerSetting
- SESSION_CHILD_HANDOFF_GRACE_MINUTES: IntegerSetting
- SESSION_CHILD_MAX_SUCCESSIONS: IntegerSetting
- SessionChildSuccessionCause: type
- SessionChildSuccessionRequest: interface
- SessionChildSuccessionRefusalCode: type
- SessionChildSuccessionResult: type
- SESSION_CHILD_HANDOFF_FILE: string
- sessionChildHandoffPath(child: Pick<SessionChildRecord, 'taskFolder' | 'worktreePath'>): string
- runtimeWarnDelayMs(settings: Pick<SessionChildSettings, 'maxRuntimeMinutes' | 'runtimeWarnLeadMinutes'>): number
- renderRuntimeCapWarning(input: { minutesLeft: number; graceMinutes: number; handoffPath: string }): string
- renderSuccessorTask(input: { predecessorId: string; cause: SessionChildSuccessionCause; originalTask: string; handoffPath: string; handoffExists: boolean; adoptedLanes: readonly string[]; prompt?: string }): string
- successionEndReason(successorId: string, cause: SessionChildSuccessionCause): string
- SessionChildRegistry.succeed(predecessorId: string, successor: SessionChildRecord, reason: string, endedAt?: string): { predecessor: SessionChildRecord; successor: SessionChildRecord }
- SessionChildRegistry.revertSuccession(predecessorId: string, successorId: string): SessionChildRecord | undefined
- SessionChildRegistry.resolveLatest(id: string | undefined): SessionChildRecord | undefined

## Extra files read

- session-spawner.service.ts, resolveChildPaths excerpt only: confirms taskFolder is resolved absolute.
- batch-1-brief.md.

## Decisions

- Resolve taskFolder as absolute when supplied, and relative to worktree if a record is constructed with a relative path. Evidence: resolveChildPaths stores an absolute folder; relative handling keeps the pure helper robust. Reversible: yes.
- Keep the existing child contract text unchanged except for one added paragraph. Evidence: inline snapshot and brief. Reversible: yes.

## Not done

- Test, lint, typecheck and build commands were prohibited by the brief. Ptah diagnostics were requested twice but TypeScript compiler remained unavailable after 45 seconds; all 10 changed TypeScript files were unchecked.
- Spawner state machine and service integration belong to the later batch.

## Status usages outside the write set

### SessionChildStatus
- libs\backend\cli-agent-runtime\src\lib\session-children\session-spawner.service.ts:105
- libs\backend\cli-agent-runtime\src\lib\session-children\session-spawner.service.ts:1162
### SessionChildTerminalStatus
### 'timed-out'
- libs\backend\cron-scheduler\src\lib\cron-scheduler.spec.ts:164
- libs\backend\cron-scheduler\src\lib\cron-scheduler.spec.ts:166
- libs\backend\cron-scheduler\src\lib\cron-scheduler.spec.ts:174
- libs\shared\src\lib\utils\plan-limits\lane-state.ts:162
- libs\shared\src\lib\utils\plan-limits\lane-state.spec.ts:531
- libs\shared\src\lib\utils\plan-limits\lane-state.spec.ts:534
- libs\backend\gateway-chat-bridge\src\lib\gateway-chat-bridge.ts:347
- libs\backend\gateway-chat-bridge\src\lib\gateway-chat-bridge.spec.ts:648
- libs\backend\gateway-chat-bridge\src\lib\gateway-chat-bridge.native.spec.ts:822
- libs\backend\cli-agent-runtime\src\lib\session-children\session-spawner.service.ts:960
- libs\backend\cli-agent-runtime\src\lib\session-children\session-spawner.service.spec.ts:1377
- libs\backend\cli-agent-runtime\src\lib\session-children\session-spawner.service.spec.ts:1436
- libs\frontend\command-center\src\lib\components\command-center-page.controller.ts:315
- libs\frontend\command-center\src\lib\components\command-center-page.controller.spec.ts:1114
- libs\shared\src\lib\types\rpc\rpc-setup.types.ts:50
- libs\shared\src\lib\types\rpc\rpc-setup.types.ts:54
- libs\shared\src\lib\types\rpc\rpc-setup.types.ts:365
- libs\shared\src\lib\types\rpc\rpc-setup-generation.contract.spec.ts:259
- libs\shared\src\lib\types\rpc\rpc-setup-generation.contract.spec.ts:268
- libs\frontend\command-center\src\lib\voice\command-voice-loop.ts:570
- libs\frontend\command-center\src\lib\voice\command-voice-loop.ts:574
- libs\frontend\command-center\src\lib\voice\command-voice-loop.ts:576
- libs\frontend\command-center\src\lib\voice\command-voice-loop.spec.ts:531
- libs\frontend\onboarding\src\lib\shared\run-status-chip.component.ts:20
- libs\frontend\onboarding\src\lib\shared\run-status-chip.component.spec.ts:11
- libs\frontend\setup-wizard\src\lib\services\guidance-generation.store.ts:18
- libs\frontend\setup-wizard\src\lib\services\guidance-generation.store.ts:106
- libs\frontend\setup-wizard\src\lib\services\guidance-generation.store.ts:154
- libs\frontend\setup-wizard\src\lib\services\guidance-generation.store.ts:171
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.ts:31
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.ts:462
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.ts:463
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.spec.ts:33
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.spec.ts:541
- libs\frontend\setup-wizard\src\lib\services\generation-workflow.store.spec.ts:554
- libs\frontend\setup-wizard\src\lib\services\generation-run-event-adapter.ts:362
- libs\frontend\setup-wizard\src\lib\services\generation-run-event-adapter.spec.ts:422
- libs\frontend\setup-wizard\src\lib\services\agent-generation.store.ts:40
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-run.supervisor.ts:131
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-run.supervisor.ts:333
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-rpc.handlers.ts:934
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-rpc.handlers.spec.ts:2249
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-rpc.handlers.spec.ts:2276
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-binding.ts:154
- libs\backend\rpc-handlers\src\lib\handlers\wizard-generation-binding.ts:155
- libs\backend\cli-agent-runtime\src\lib\cli-agents\limits\lane-limit-lookup.service.ts:142
- libs\backend\cli-agent-runtime\src\lib\cli-agents\limits\lane-limit-lookup.service.ts:288
- libs\backend\cli-agent-runtime\src\lib\cli-agents\limits\lane-limit-lookup.service.spec.ts:146
- libs\backend\rpc-handlers\src\lib\handlers\setup-rpc.handlers.spec.ts:520
- libs\backend\rpc-handlers\src\lib\handlers\setup-rpc.handlers.spec.ts:656
- libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\agent-spawn-limits.transport.spec.ts:110
- libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\agent-spawn-limit-gate.spec.ts:277
- libs\frontend\chat-ui\src\lib\molecules\session\plan-limits\lane-tiles.ts:594
- libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\agent-limit.formatter.ts:85
- libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\agent-limit.formatter.spec.ts:160
- libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-core\agent-limit.formatter.spec.ts:198
- libs\backend\rpc-handlers\src\lib\handlers\lane-plan-limits-rpc.deadline.spec.ts:95
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.ts:71
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.ts:77
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.ts:114
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.spec.ts:164
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.spec.ts:167
- libs\backend\rpc-handlers\src\lib\handlers\guidance-generation-run.supervisor.spec.ts:199
- libs\frontend\onboarding\src\lib\analyze\project-guidance.page.ts:363
- libs\frontend\onboarding\src\lib\analyze\project-guidance.page.ts:374
- libs\frontend\onboarding\src\lib\analyze\project-guidance.page.spec.ts:32
- libs\frontend\onboarding\src\lib\analyze\project-guidance.page.spec.ts:181
- libs\frontend\onboarding\src\lib\analyze\generation-step.store.ts:205
- libs\frontend\onboarding\src\lib\analyze\generate-agents.page.ts:381
- libs\frontend\onboarding\src\lib\analyze\generate-agents.page.ts:398
- libs\frontend\onboarding\src\lib\analyze\generate-agents.page.spec.ts:77
- libs\frontend\onboarding\src\lib\analyze\generate-agents.page.spec.ts:140
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.ts:143
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.ts:184
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.ts:501
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.ts:511
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.ts:657
- libs\frontend\onboarding\src\lib\analyze\analyze-done.page.spec.ts:565
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.ts:825
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.ts:888
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.ts:894
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.ts:902
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.spec.ts:528
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.spec.ts:611
- libs\backend\rpc-handlers\src\lib\handlers\enhanced-prompts-rpc.handlers.spec.ts:618
- libs\backend\rpc-handlers\src\lib\chat\codex-host\codex-chat-host-ports.spec.ts:1475
- libs\backend\rpc-handlers\src\lib\chat\codex-host\codex-chat-host-ports.spec.ts:1624
- libs\backend\rpc-handlers\src\lib\chat\codex-host\codex-chat-approval-presentation.ts:33
- libs\backend\rpc-handlers\src\lib\chat\codex-host\codex-chat-approval-presentation.ts:181
- libs\backend\rpc-handlers\src\lib\chat\codex-host\codex-chat-approval-presentation.spec.ts:97
- libs\backend\agent-sdk\src\lib\sdk-permission-handler.spec.ts:1620
- libs\backend\agent-generation\src\lib\types\generation-checkpoint.types.ts:45
- libs\backend\agent-generation\src\lib\types\generation-checkpoint.types.ts:275
- libs\backend\agent-generation\src\lib\types\core.types.ts:718
- libs\backend\agent-sdk\src\lib\sdk-permission-handler.ts:140
- libs\backend\agent-sdk\src\lib\sdk-permission-handler.ts:1162
- libs\backend\agent-generation\src\lib\services\analysis-storage.service.spec.ts:728
- libs\backend\agent-generation\src\lib\services\analysis-storage.service.spec.ts:734
- libs\frontend\chat\src\lib\settings\providers\connection-drawer\codex-sign-in-block.component.ts:93
- libs\frontend\chat\src\lib\settings\providers\connection-drawer\codex-sign-in-block.component.ts:137
- libs\frontend\chat\src\lib\settings\providers\connection-drawer\codex-sign-in-block.component.ts:142
- libs\backend\agent-generation\src\lib\services\orchestrator.service.ts:532
- libs\backend\agent-generation\src\lib\services\orchestrator.service.spec.ts:2194
- libs\backend\agent-sdk\src\lib\helpers\stream-transformer.spec.ts:2213
