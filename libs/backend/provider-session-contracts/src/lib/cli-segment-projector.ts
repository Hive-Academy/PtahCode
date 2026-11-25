/**
 * projectToCliSegments — a provider-session event as the lane `onSegment`
 * stream sees it. The shapes are the ones the ACP lane emitted before the
 * runtime was extracted (`acp-session-update-mapper.ts`), so a lane renders
 * the same rows whichever runtime produced them.
 *
 * Events with no lane row (`userText`, approvals, mode and config changes,
 * `terminal`) project to `[]`. `diagnostic` (stderr) also projects to `[]`:
 * the lane classifies stderr itself (`classifyCliStderr`).
 */
import type { CliOutputSegment } from '@ptah-extension/shared';
import {
  completedTurnTelemetry,
  turnIdentity,
} from '@ptah-extension/shared';
import type { ProviderSessionEventBody } from './provider-session-events';

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** Never throws; an event type without a lane row maps to `[]`. */
export function projectToCliSegments(
  event: ProviderSessionEventBody,
): CliOutputSegment[] {
  switch (event.type) {
    case 'textDelta':
      return [{ type: 'text', content: event.delta }];
    case 'reasoning':
      return [{ type: 'thinking', content: event.text }];
    case 'toolStarted':
      return [
        {
          type: 'tool-call',
          content: '',
          toolCallId: event.toolId,
          toolName: event.toolName,
          toolArgs:
            event.input === undefined ? undefined : safeStringify(event.input),
          toolInput: event.input,
        },
      ];
    case 'toolCompleted': {
      const isCommand =
        event.status === 'completed' && event.kind === 'execute';
      return [
        {
          type: isCommand
            ? 'command'
            : event.status === 'completed'
              ? 'tool-result'
              : 'tool-result-error',
          content: event.output,
          toolCallId: event.toolId,
          toolName: isCommand ? (event.toolName ?? 'command') : event.toolName,
          exitCode: isCommand ? event.exitCode : undefined,
        },
      ];
    }
    case 'fileChange':
      return [
        { type: 'file-change', content: event.path, changeKind: event.changeKind },
      ];
    case 'plan':
      return [
        {
          type: 'info',
          content: event.entries
            .map((entry) => `[${entry.status}] ${entry.content}`)
            .join('\n'),
        },
      ];
    case 'usage': {
      const { provider, usage } = event;
      return [
        {
          type: 'info',
          content: usage
            ? `${provider} turn usage.`
            : `${provider} turn telemetry unavailable.`,
          ...(usage
            ? { usage: { ...usage, model: usage.model ?? `${provider}/unknown` } }
            : {}),
          turnTelemetry: completedTurnTelemetry({
            ...turnIdentity({
              provider,
              turnId: event.turnId,
              modelId: usage?.model,
              source: 'sdk',
            }),
            usage,
          }),
        },
      ];
    }
    case 'usageProgress':
      // One model call: a `message`-scope increment for the card. No turn
      // telemetry, because the turn has not completed; the turn's `usage`
      // follows as the `turn` correction (Codex precedent, E25).
      return [
        {
          type: 'info',
          content: `${event.provider} usage update.`,
          usageScope: 'message',
          usage: {
            ...event.usage,
            model: event.usage.model ?? `${event.provider}/unknown`,
          },
        },
      ];
    case 'info':
      return [{ type: 'info', content: event.message }];
    case 'error':
      return [{ type: 'error', content: event.error.message }];
    case 'userText':
    case 'toolUpdated':
    case 'approvalRequested':
    case 'approvalSettled':
    case 'modeChanged':
    case 'configChanged':
    case 'diagnostic':
    case 'terminal':
      return [];
    default: {
      const unknownEvent: never = event;
      void unknownEvent;
      return [];
    }
  }
}
