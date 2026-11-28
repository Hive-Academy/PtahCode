/**
 * GenerationRunEventAdapter (TASK_2026_2330, plan component 2).
 *
 * Routes the generator pushes of a bound generation or guidance run to its
 * Setup run record by the binding id (`tabBinding.tabId === record.id`). No
 * chat tab is involved: a push never creates, finds or streams into a tab.
 *
 * The stream text itself is not handled here: `SetupWizardStateService` is
 * its own message handler and already appends every `generation-stream` and
 * `enhance-stream` payload to its buffers.
 *
 * - A stream push marks its record running at `generating` with the pushed
 *   run id. A late push of a settled run, or of an older run on a live
 *   record, is ignored.
 * - A terminal push (`generation-complete`, `error`, or a stream push with a
 *   terminal `lifecycle`) is verified with one run-state lookup before the
 *   record settles.
 * - A push for an id without a record adopts the binding (R1).
 * - When `GenerationWorkflowStore` shows the record, it follows the run.
 */

import { Injectable, inject } from '@angular/core';
import type { MessageHandler } from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { GenerationWorkflowStore } from './generation-workflow.store';
import {
  isRunBinding,
  isRunLifecycle,
  isTerminalLifecycle,
} from './setup-run/setup-run-binding';
import { SetupRunStore } from './setup-run.store';

function isStreamPayload(payload: Record<string, unknown>): boolean {
  const { kind, content, timestamp, toolName, toolCallId, isError } = payload;
  if (
    typeof content !== 'string' ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp)
  )
    return false;

  switch (kind) {
    case 'text':
    case 'thinking':
    case 'error':
    case 'status':
      return true;
    case 'tool_start':
    case 'tool_input':
    case 'tool_result':
      return (
        typeof toolName === 'string' &&
        toolName.length > 0 &&
        typeof toolCallId === 'string' &&
        toolCallId.length > 0 &&
        (kind !== 'tool_result' ||
          isError === undefined ||
          typeof isError === 'boolean')
      );
    default:
      return false;
  }
}

function readPush(
  type: string,
  payload: unknown,
): {
  binding: SetupGenerationRunBinding;
  terminal: boolean;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const fields = payload as Record<string, unknown>;
  const { tabBinding, runId, lifecycle, terminalStatus } = fields;
  if (
    !isRunBinding(tabBinding) ||
    (runId !== undefined && runId !== tabBinding.runId)
  )
    return null;
  if (lifecycle !== undefined && !isRunLifecycle(lifecycle)) return null;
  if (
    terminalStatus !== undefined &&
    (!isRunLifecycle(terminalStatus) || !isTerminalLifecycle(terminalStatus))
  )
    return null;

  const agents = tabBinding.workflow === 'setup-agent-generation';
  const terminal = isRunLifecycle(lifecycle) && isTerminalLifecycle(lifecycle);
  switch (type) {
    case 'setup-wizard:generation-stream':
      return agents && isStreamPayload(fields)
        ? { binding: tabBinding, terminal }
        : null;
    case 'setup-wizard:enhance-stream':
      return !agents && isStreamPayload(fields)
        ? { binding: tabBinding, terminal }
        : null;
    case 'setup-wizard:generation-complete':
      return agents ? { binding: tabBinding, terminal: true } : null;
    case 'setup-wizard:error':
      return { binding: tabBinding, terminal: true };
    default:
      return null;
  }
}

@Injectable({ providedIn: 'root' })
export class GenerationRunEventAdapter implements MessageHandler {
  private readonly runs = inject(SetupRunStore);
  private readonly workflow = inject(GenerationWorkflowStore);

  public readonly handledMessageTypes = [
    'setup-wizard:generation-stream',
    'setup-wizard:enhance-stream',
    'setup-wizard:generation-complete',
    'setup-wizard:error',
  ] as const;

  public handleMessage(message: { type: string; payload?: unknown }): void {
    const push = readPush(message.type, message.payload);
    if (!push || !this.runs.adoptPushedRun(push.binding)) return;
    const { binding, terminal } = push;
    if (terminal) void this.onTerminal(binding);
    else if (this.runs.reportStream(binding))
      this.syncWorkflow(binding.tabId, binding.runId, false);
  }

  private async onTerminal(binding: SetupGenerationRunBinding): Promise<void> {
    if (await this.runs.verifyTerminal(binding)) {
      this.syncWorkflow(binding.tabId, binding.runId, true);
    }
  }

  /**
   * The workflow store shows `id`: a terminal push of its run refreshes it;
   * a push of the record's newer run binds it to that run when it is idle.
   */
  private syncWorkflow(id: string, runId: string, terminal: boolean): void {
    const shown: SetupGenerationTabBinding | null = this.workflow.binding();
    if (shown?.tabId !== id) return;
    if (this.workflow.run()?.binding.runId === runId) {
      if (terminal) void this.workflow.refresh();
    } else if (
      !this.workflow.isBound() &&
      this.runs.get(id)?.backendRunId === runId
    ) {
      this.workflow.bind(shown, runId);
    }
  }
}
