/**
 * Copilot CLI Adapter (formerly Copilot SDK Adapter)
 *
 * The CLI-agent spawn path uses the official `@github/copilot` CLI binary
 * instead of `@github/copilot-sdk`. The SDK ships as ESM (`"type":"module"`)
 * yet its dist imports `from "vscode-jsonrpc/node"` (extensionless), and
 * vscode-jsonrpc is a CommonJS package with no `exports` map — so Node's ESM
 * loader cannot resolve the extensionless subpath. `await import('@github/copilot-sdk')`
 * therefore throws ERR_MODULE_NOT_FOUND in ANY Node/Electron context (verified
 * in plain headless node, not just the VS Code extension host). The official
 * CLI v1.0.26+ supports headless mode via `-p / --output-format json` and is
 * the same binary the SDK would have spawned, so nothing is lost by skipping it.
 *
 * IMPORTANT: This adapter is used ONLY for the CLI-agent spawn path
 * (`ptah_agent_spawn { cli: 'copilot' }`). The "main agent" Copilot integration
 * runs through the Anthropic-compatible provider registry / translation proxy
 * (see `providers/copilot/copilot-provider-entry.ts`) and is unaffected.
 *
 * Architecture:
 * - Detect: resolve `copilot` binary on PATH, capture version
 * - runSdk(): spawn `copilot -p "<prompt>" --output-format json --allow-all-tools`
 *             and parse JSONL events line-by-line
 * - Permissions: `--allow-all-tools` (orchestrated context); the in-process
 *                CopilotPermissionBridge is kept for backwards compatibility
 *                with the constructor signature but is not invoked by this
 *                CLI-driven path
 *
 * CLI Event -> CliOutputSegment Mapping (matches the Copilot CLI's JSONL
 * stream-json output, which mirrors the SDK's event shapes):
 * - assistant.message_delta   -> text (deltaContent)
 * - assistant.message         -> text (full content, skip if streaming deltas received)
 * - assistant.reasoning_delta -> thinking (deltaContent)
 * - assistant.reasoning       -> thinking (full content, skip if deltas received)
 * - tool.execution_start      -> tool-call (toolName, arguments)
 * - tool.execution_complete   -> tool-result / tool-result-error / command / file-change
 * - assistant.usage           -> info (token usage summary)
 * - session.error             -> error
 * - result                    -> info (final stats); resolves done promise
 */
import { completedTurnTelemetry, COPILOT_PROVIDER_ENTRY, turnIdentity } from '@ptah-extension/shared';
import type {
  CliAdapterManifest,
  CliDetectionResult,
  CliOutputSegment,
} from '@ptah-extension/shared';
import type {
  CliAdapter,
  CliCommandOptions,
  CliModelInfo,
  ContinuationOutcome,
  SdkHandle,
} from './cli-adapter.interface';
import { bestMessagingCapability } from './cli-adapter.interface';
import {
  applyLaneArgvPolicy,
  translateLaneSpawnPolicy,
} from '../lane-spawn-policy';
import {
  stripAnsiCodes,
  buildArgvTaskPrompt,
  assertCommandLineWithinLimit,
  probeCliVersionDetailed,
  resolveCliPath,
  resolveDirectSpawn,
  spawnCli,
  createBufferedEmitter,
} from './cli-adapter.utils';
import {
  killProcessTree,
  type IProcessSpawner,
} from '@ptah-extension/platform-core';
import { ptahMcpServerUrl } from './ptah-mcp-url';
import { laneMcpAuthUrl } from './lane-mcp-credentials';
import { classifyCliStderr } from './cli-stderr-severity';
import type { CopilotPermissionBridge } from './copilot-permission-bridge';

/** Shell/command execution tool names across providers */
function isShellTool(toolName: string): boolean {
  return /^(run_shell_command|bash|shell|execute_command|terminal)$/i.test(
    toolName,
  );
}

/** File write/edit tool names across providers */
function isFileWriteTool(toolName: string): boolean {
  return /^(write_file|edit|replace|create_file|patch_file|write|insert)$/i.test(
    toolName,
  );
}

/**
 * Copilot CLI JSONL event shape.
 * Each line in `--output-format json` is a single JSON object with at least
 * a `type` discriminator. `data` carries the type-specific payload.
 */
interface CopilotCliEvent {
  type?: string;
  id?: string;
  timestamp?: string;
  parentId?: string;
  ephemeral?: boolean;
  /** Present on most event types */
  data?: Record<string, unknown>;
  /** `result` event puts these at the top level (no `data` wrapper) */
  sessionId?: string;
  exitCode?: number;
  usage?: {
    premiumRequests?: number;
    totalApiDurationMs?: number;
    sessionDurationMs?: number;
    codeChanges?: {
      linesAdded?: number;
      linesRemoved?: number;
      filesModified?: string[];
    };
  };
}

/** CLI picker fields projected from the drift-checked provider fallback. */
export const COPILOT_MODELS: CliModelInfo[] =
  (COPILOT_PROVIDER_ENTRY.staticModels ?? []).map(({ id, name }) => ({ id, name }));

/**
 * Actionable error message used when the `copilot` binary cannot be found.
 * Surfaced into the agent monitor so the user knows exactly what to do.
 */
const COPILOT_NOT_INSTALLED_MESSAGE =
  '[Copilot CLI Error] The `copilot` binary is not installed or not on PATH. ' +
  'Install it via `npm install -g @github/copilot` (>=1.0.26) and re-run ' +
  'agent detection (Ptah: Detect CLI Agents).';

export class CopilotSdkAdapter implements CliAdapter {
  readonly name = 'copilot' as const;
  readonly displayName = 'Copilot CLI';
  readonly roleChannel = 'task-prompt' as const;
  /**
   * The Copilot CLI supports MCP via `--additional-mcp-config` JSON. This
   * adapter wires the Ptah MCP server when `mcpPort` is provided in options.
   */
  readonly supportsMcp = true;

  /**
   * Permission bridge retained for constructor compatibility with
   * CliDetectionService. The CLI-driven path uses --allow-all-tools and
   * does not route permission requests through this bridge — but keeping
   * it here means the bridge stays available for any future in-process
   * permission integration without churning the registration site.
   */
  readonly permissionBridge: CopilotPermissionBridge;

  /**
   * @param spawner - Off-thread process spawner. Supplied by
   *   `CliDetectionService` from `SDK_TOKENS.SDK_PROCESS_SPAWNER`. Without it
   *   every spawn below runs `cross-spawn` inline, which on Windows is a
   *   synchronous `CreateProcessW` that cost 300-900 ms of event-loop lag per
   *   rival-CLI launch (TASK_2026_367).
   */
  constructor(
    permissionBridge: CopilotPermissionBridge,
    private readonly spawner?: IProcessSpawner,
  ) {
    this.permissionBridge = permissionBridge;
  }

  /**
   * Detect if the Copilot CLI binary is installed.
   */
  async detect(): Promise<CliDetectionResult> {
    try {
      const binaryPath = await resolveCliPath('copilot');
      if (!binaryPath) {
        return {
          cli: 'copilot',
          installed: false,
          messagingMode: bestMessagingCapability(this.capabilities()),
        };
      }
      const { version, exitCode } = await probeCliVersionDetailed(
        binaryPath,
        undefined,
        undefined,
        this.spawner,
      );

      if (exitCode === 127) {
        return { cli: 'copilot', installed: false,
          messagingMode: bestMessagingCapability(this.capabilities()) };
      }

      return {
        cli: 'copilot',
        installed: true,
        path: binaryPath,
        version,
        messagingMode: bestMessagingCapability(this.capabilities()),
      };
    } catch {
      return {
        cli: 'copilot',
        installed: false,
        messagingMode: bestMessagingCapability(this.capabilities()),
      };
    }
  }

  /**
   * A fresh process per turn: there is no live run to steer and no run-scoped
   * abort that keeps the agent addressable. `continue` resumes the captured
   * session, so a message is delivered as the next full turn.
   */
  capabilities(): CliAdapterManifest {
    return {
      messaging: {
        steer: { state: 'unsupported', reason: 'Copilot uses a fresh process for each turn.' },
        interrupt: { state: 'unsupported', reason: 'Stopping a turn ends its process and keeps no live run.' },
        continuation: { state: 'supported' },
        resume: { state: 'supported' },
      },
      roleChannel: this.roleChannel,
      permissionModes: {
        plan: { state: 'supported', nativeMode: '--mode plan', networkModes: ['allow'] },
        ask: { state: 'unsupported', reason: 'Noninteractive Copilot approvals have no Ptah session route.', networkModes: [] },
        'auto-edit': { state: 'supported', nativeMode: 'write-tool allowlist', networkModes: ['allow'] },
        yolo: { state: 'supported', nativeMode: '--allow-all', networkModes: ['allow'] },
      },
      networkModes: {
        allow: { state: 'supported' },
        deny: { state: 'unsupported', reason: 'URL filters do not enforce general network denial.' },
      },
      limitReader: { state: 'no-reliable-source', reason: 'No reliable noninteractive plan-limit source exists.' },
      mcp: { state: 'supported' },
    };
  }

  parseOutput(raw: string): string {
    return stripAnsiCodes(raw);
  }

  /**
   * Return available models for Copilot CLI.
   * Uses the static COPILOT_MODELS list (the CLI itself has no machine-
   * readable model listing endpoint; the list is curated in sync with
   * `copilot --help`).
   */
  async listModels(): Promise<CliModelInfo[]> {
    return COPILOT_MODELS;
  }

  /**
   * Run task by spawning the official `@github/copilot` CLI in headless mode
   * and streaming its JSONL events.
   *
   * Spawns: copilot -p <prompt> --output-format json --allow-all-tools --no-color
   * Resume: copilot --resume=<id> -p <prompt> ...
   *
   * Follows the CLI adapter pattern (binary detection via resolveCliPath,
   * spawn via spawnCli, line-buffered JSONL parsing).
   */
  async runSdk(options: CliCommandOptions): Promise<SdkHandle> {
    const lanePolicy = translateLaneSpawnPolicy(this.name, this.capabilities(), options);
    const argvPolicy = lanePolicy.cli === 'copilot'
      ? lanePolicy.argv
      : { addArgs: [], removeArgs: [] };
    const abortController = new AbortController();
    const output = createBufferedEmitter<string>();
    const segment = createBufferedEmitter<CliOutputSegment>();
    let binaryPath = options.binaryPath;
    if (!binaryPath) {
      const resolved = await resolveCliPath('copilot');
      if (resolved) {
        binaryPath = resolved;
      }
    }

    if (!binaryPath) {
      output.emit(`${COPILOT_NOT_INSTALLED_MESSAGE}\n`);
      segment.emit({ type: 'error', content: COPILOT_NOT_INSTALLED_MESSAGE });
      return {
        abort: abortController,
        done: Promise.resolve(1),
        onOutput: output.subscribe,
        onSegment: segment.subscribe,
        getSessionId: () => undefined,
        supportsContinuation: () => false,
      };
    }

    const resolvedBinaryPath = binaryPath;
    const spawnDescriptor = await resolveDirectSpawn(resolvedBinaryPath);
    let capturedSessionId: string | undefined;
    let turnSequence = 0;
    let activeChild: ReturnType<typeof spawnCli> | undefined;

    const isStackFrame = (line: string): boolean =>
      /^\s*at\s+/.test(line) ||
      /^\s*file:\/\//.test(line) ||
      /node_modules[\\/]/.test(line);

    const isStatsFooter = (line: string): boolean =>
      /^Changes\s+[+-]\d+/.test(line) ||
      /^Requests\s+\d+\s+(Premium|Free)/i.test(line) ||
      /^Tokens\s+[↑↓]/.test(line) ||
      (/\b(cached|reasoning)\b/i.test(line) && /^\s*[↑↓]?\s*\d/.test(line));

    const isPtyNoise = (line: string): boolean =>
      line.includes('conpty_console_list_agent') ||
      line.includes('AttachConsole failed') ||
      line.includes('node-pty');

    const onAbort = (): void => {
      const child = activeChild;
      if (!child) return;
      // `pid` is known synchronously for an inline spawn and NOT for an
      // off-thread one, where the child is created on a worker. `whenSpawned`
      // is the one read that works for both; it settles to null if the child
      // never started, so this can never hang (TASK_2026_367).
      void child.whenSpawned.then((pid) => {
        if (pid && !child.killed) {
          // Tree-kill the real process group — child.kill() alone would orphan
          // descendants (and, for a .cmd shim, kill only cmd.exe).
          void killProcessTree(pid);
        }
      });
    };
    abortController.signal.addEventListener('abort', onAbort);

    const runTurn = (
      prompt: string,
      resumeSessionId?: string,
    ): Promise<number> => {
      const turnNumber = ++turnSequence;
      const args: string[] = [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--allow-all-tools',
        '--no-color',
        '-s',
      ];
      if (resumeSessionId) {
        args.push(`--resume=${resumeSessionId}`);
      }

      if (options.model) {
        args.push('--model', options.model);
      }

      if (options.reasoningEffort) {
        args.push('--effort', options.reasoningEffort);
      }
      if (options.mcpPort && options.mcpToken) {
        const mcpConfig = JSON.stringify({
          mcpServers: {
            ptah: {
              type: 'http',
              // Scoped to the spawn's working directory so the server
              // attributes this agent's calls to the right workspace
              // (TASK_2026_364).
              url: laneMcpAuthUrl(
                ptahMcpServerUrl(
                  options.mcpPort,
                  options.workingDirectory,
                  options.agentId,
                ),
                options.mcpToken,
              ),
            },
          },
        });
        args.push('--additional-mcp-config', mcpConfig);
      }

      const translatedArgs = applyLaneArgvPolicy(args, argvPolicy);
      assertCommandLineWithinLimit(spawnDescriptor.command, [...spawnDescriptor.prefixArgs, ...translatedArgs]);
      const child = spawnCli(
        spawnDescriptor.command,
        [...spawnDescriptor.prefixArgs, ...translatedArgs],
        {
          cwd: options.workingDirectory,
          needsConsole: true,
          detached: true,
          spawner: this.spawner,
        },
      );
      activeChild = child;

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');

      let receivedDeltas = false;
      let receivedReasoningDeltas = false;
      const toolCallIdToName = new Map<string, string>();
      const turnUsages: NonNullable<CliOutputSegment['usage']>[] = [];
      let incompleteUsage = false;
      let nativeTurnId: string | undefined;
      const emitTurnSegment = (item: CliOutputSegment): void => {
        if (item.usage) turnUsages.push(item.usage);
        // Intermediate message usage feeds the aggregate but is not a turn total.
        segment.emit(item.usage ? { ...item, usage: undefined } : item);
      };
      let lineBuf = '';
      let stderrBuf = '';

      child.stdout?.on('data', (data: string) => {
        lineBuf += data;
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const sessionId = this.handleJsonLine(
            trimmed,
            output.emit,
            emitTurnSegment,
            {
              getReceivedDeltas: () => receivedDeltas,
              setReceivedDeltas: () => {
                receivedDeltas = true;
              },
              getReceivedReasoningDeltas: () => receivedReasoningDeltas,
              setReceivedReasoningDeltas: () => {
                receivedReasoningDeltas = true;
              },
              toolCallIdToName,
              onResultId: (id) => { nativeTurnId = id; },
              onUsageUnavailable: () => { incompleteUsage = true; },
            },
          );
          if (sessionId) {
            capturedSessionId = sessionId;
          }
        }
      });

      child.stderr?.on('data', (data: string) => {
        stderrBuf += stripAnsiCodes(data);
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (isStackFrame(line) || isStatsFooter(line) || isPtyNoise(line)) {
            continue;
          }
          segment.emit({ type: classifyCliStderr(line), content: line });
        }
      });

      return new Promise<number>((resolve) => {
        child.on('close', (code, signal) => {
          if (lineBuf.trim()) {
            const sessionId = this.handleJsonLine(
              lineBuf.trim(),
              output.emit,
              emitTurnSegment,
              {
                getReceivedDeltas: () => receivedDeltas,
                setReceivedDeltas: () => {
                  receivedDeltas = true;
                },
                getReceivedReasoningDeltas: () => receivedReasoningDeltas,
                setReceivedReasoningDeltas: () => {
                  receivedReasoningDeltas = true;
                },
                toolCallIdToName,
                onResultId: (id) => { nativeTurnId = id; },
                onUsageUnavailable: () => { incompleteUsage = true; },
              },
            );
            if (sessionId) {
              capturedSessionId = sessionId;
            }
            lineBuf = '';
          }
          // Turn ended — invalidate the abort/getPid target so a stale, dead PID
          // can't be returned. continue()'s runTurn re-points activeChild.
          activeChild = undefined;
          const exitCode = code ?? (signal ? 1 : 0);
          if (exitCode === 0 && !abortController.signal.aborted) {
            const valid = (value: number | undefined): value is number =>
              value !== undefined && Number.isSafeInteger(value) && value >= 0;
            const complete = !incompleteUsage && turnUsages.length > 0 &&
              turnUsages.every((usage) => valid(usage.inputTokens) && valid(usage.outputTokens));
            const inputTokens = turnUsages.reduce((sum, usage) => sum + (usage.inputTokens ?? 0), 0);
            const outputTokens = turnUsages.reduce((sum, usage) => sum + (usage.outputTokens ?? 0), 0);
            const models = new Map<string, { modelId: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }>();
            for (const usage of turnUsages) {
              const modelId = usage.model || 'copilot/unknown';
              const total = models.get(modelId) ?? { modelId, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
              total.inputTokens += usage.inputTokens ?? 0;
              total.outputTokens += usage.outputTokens ?? 0;
              models.set(modelId, total);
            }
            const costsComplete = turnUsages.every((usage) =>
              usage.costUsd !== undefined && Number.isFinite(usage.costUsd) && usage.costUsd >= 0);
            const usage = complete && valid(inputTokens) && valid(outputTokens) ? {
              inputTokens, outputTokens,
              ...(costsComplete ? { costUsd: turnUsages.reduce((sum, item) => sum + (item.costUsd ?? 0), 0) } : {}),
              ...(models.size > 1 ? { models: [...models.values()] } : {}),
            } : undefined;
            segment.emit({
              type: 'info', content: 'Copilot turn telemetry',
              ...(usage ? { usage } : {}),
              turnTelemetry: completedTurnTelemetry({
                ...turnIdentity({ provider: 'copilot', turnId: nativeTurnId,
                  sessionId: capturedSessionId ?? resumeSessionId ?? `copilot:${child.pid ?? options.agentId ?? 'unknown'}`,
                   runId: options.agentId, sequence: turnNumber,
                   modelId: models.size === 1 ? [...models.keys()][0] : 'copilot/multi-model', source: 'stream' }),
                usage,
              }),
            });
          }
          resolve(exitCode);
        });

        child.on('error', (err) => {
          output.emit(`\n[Copilot CLI Error] ${err.message}\n`);
          segment.emit({
            type: 'error',
            content: `Copilot CLI Error: ${err.message}`,
          });
          activeChild = undefined;
          resolve(1);
        });
      });
    };

    const done = runTurn(
      buildArgvTaskPrompt(options, this.name),
      options.resumeSessionId,
    );

    return {
      outcomeUsageIsTurnTotal: true,
      usageScope: 'turn',
      abort: abortController,
      done,
      onOutput: output.subscribe,
      onSegment: segment.subscribe,
      getSessionId: () => capturedSessionId,
      getPid: () => activeChild?.pid,
      supportsContinuation: () => capturedSessionId != null,
      continue: (message: string): Promise<ContinuationOutcome> =>
        Promise.resolve({ done: runTurn(message, capturedSessionId) }),
    };
  }

  /**
   * Parse a single JSONL event line from the Copilot CLI's stream-json output
   * and emit human-readable text + structured segments.
   *
   * Returns the session ID if the line is a `result` event (which carries the
   * final session UUID). Returns undefined otherwise.
   */
  private handleJsonLine(
    line: string,
    emitOutput: (data: string) => void,
    emitSegment: (segment: CliOutputSegment) => void,
    state: {
      getReceivedDeltas: () => boolean;
      setReceivedDeltas: () => void;
      getReceivedReasoningDeltas: () => boolean;
      setReceivedReasoningDeltas: () => void;
      toolCallIdToName: Map<string, string>;
      onResultId?: (id: string) => void;
      onUsageUnavailable?: () => void;
    },
  ): string | undefined {
    let event: CopilotCliEvent;
    try {
      event = JSON.parse(line) as CopilotCliEvent;
    } catch {
      // degradation-audit: optional-capability - the Copilot CLI's stream-json
      // output is interleaved with plain-text banners, stack traces and usage
      // lines; a non-JSON line is filtered or emitted as raw text below rather
      // than treated as a parse failure.
      if (
        !line ||
        line.startsWith('{') ||
        /^\s*at\s+/.test(line) ||
        /^\s*file:\/\//.test(line) ||
        /node_modules[\\/]/.test(line) ||
        /^Changes\s+[+-]\d+/.test(line) ||
        /^Requests\s+\d+\s+(Premium|Free)/i.test(line) ||
        /^Tokens\s+[↑↓]/.test(line)
      ) {
        return undefined;
      }
      emitOutput(line + '\n');
      emitSegment({ type: 'text', content: line });
      return undefined;
    }

    const data = event.data ?? {};

    switch (event.type) {
      case 'session.start':
      case 'session.tools_updated': {
        const model = data['model'] as string | undefined;
        if (model) {
          emitOutput(`[Copilot CLI] Model: ${model}\n`);
          emitSegment({ type: 'info', content: `Model: ${model}` });
        }
        return undefined;
      }

      case 'assistant.message_delta': {
        state.setReceivedDeltas();
        const delta = data['deltaContent'] as string | undefined;
        if (delta) {
          emitOutput(delta);
          emitSegment({ type: 'text', content: delta });
        }
        return undefined;
      }

      case 'assistant.message': {
        const content = data['content'] as string | undefined;
        if (!state.getReceivedDeltas() && content) {
          emitOutput(content);
          emitSegment({ type: 'text', content });
        }
        return undefined;
      }

      case 'assistant.reasoning_delta': {
        state.setReceivedReasoningDeltas();
        const delta = data['deltaContent'] as string | undefined;
        if (delta) {
          emitSegment({ type: 'thinking', content: delta });
        }
        return undefined;
      }

      case 'assistant.reasoning': {
        const content = data['content'] as string | undefined;
        if (!state.getReceivedReasoningDeltas() && content) {
          emitSegment({ type: 'thinking', content });
        }
        return undefined;
      }

      case 'tool.execution_start': {
        const toolName = data['toolName'] as string | undefined;
        const toolArgs = data['arguments'];
        const toolCallId = data['toolCallId'] as string | undefined;
        if (!toolName) return undefined;

        const argsStr =
          toolArgs !== undefined && toolArgs !== null
            ? this.summarizeToolArgs(toolName, toolArgs)
            : undefined;

        if (toolCallId) {
          state.toolCallIdToName.set(toolCallId, toolName);
        }

        emitOutput(
          `\n**Tool:** \`${toolName}\`${argsStr ? ` ${argsStr}` : ''}\n`,
        );
        emitSegment({
          type: 'tool-call',
          content: '',
          toolName,
          toolArgs: argsStr,
          toolInput:
            toolArgs && typeof toolArgs === 'object'
              ? (toolArgs as Record<string, unknown>)
              : undefined,
          toolCallId,
        });
        return undefined;
      }

      case 'tool.execution_complete': {
        const success = data['success'] as boolean | undefined;
        const result = data['result'] as
          { content?: string; detailedContent?: string } | undefined;
        const error = data['error'] as
          { message?: string; code?: string } | undefined;
        const toolCallId = data['toolCallId'] as string | undefined;
        const exitCode = data['exitCode'] as number | undefined;
        const toolName = toolCallId
          ? state.toolCallIdToName.get(toolCallId)
          : undefined;

        if (success && result) {
          const content = result.content ?? '';
          const truncated =
            content.length > 2000
              ? content.substring(0, 2000) + '\n... [truncated]'
              : content;

          if (toolName && isShellTool(toolName)) {
            emitOutput(`\n$ ${toolName}\n${truncated}\n`);
            emitSegment({
              type: 'command',
              content: truncated,
              toolName,
              exitCode: exitCode ?? 0,
              toolCallId,
            });
          } else if (toolName && isFileWriteTool(toolName)) {
            const changeKind = /\b(created|new file)\b/i.test(content)
              ? 'added'
              : /\b(deleted|removed)\b/i.test(content)
                ? 'deleted'
                : 'modified';
            emitOutput(`\n[${changeKind}] ${truncated}\n`);
            emitSegment({
              type: 'file-change',
              content: truncated,
              changeKind,
              toolCallId,
            });
          } else {
            emitOutput(
              `\n<details><summary>Tool result</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>\n\n`,
            );
            emitSegment({
              type: 'tool-result',
              content: truncated,
              toolCallId,
            });
          }
        } else if (error) {
          const errorMsg = error.message ?? 'Unknown error';
          emitOutput(`\n**Tool Error:** ${errorMsg}\n`);
          emitSegment({
            type: 'tool-result-error',
            content: errorMsg,
            toolCallId,
          });
        } else if (success === false) {
          emitOutput('\n**Tool Error:** Execution failed\n');
          emitSegment({
            type: 'tool-result-error',
            content: 'Execution failed',
            toolCallId,
          });
        }
        return undefined;
      }

      case 'session.error': {
        const errorMsg = (data['message'] as string) ?? 'Unknown session error';
        emitOutput(`\n[Copilot CLI Error] ${errorMsg}\n`);
        emitSegment({ type: 'error', content: errorMsg });
        return undefined;
      }

      case 'assistant.usage': {
        const model = data['model'] as string | undefined;
        const inputTokens = data['inputTokens'] as number | undefined;
        const outputTokens = data['outputTokens'] as number | undefined;
        const cost = data['cost'] as number | undefined;
        const duration = data['duration'] as number | undefined;

        const parts: string[] = [];
        if (model) parts.push(`model: ${model}`);
        if (inputTokens) parts.push(`${inputTokens} input`);
        if (outputTokens) parts.push(`${outputTokens} output`);
        if (cost !== undefined) parts.push(`$${cost.toFixed(4)}`);
        if (duration !== undefined)
          parts.push(`${(duration / 1000).toFixed(1)}s`);
        if (
          inputTokens === undefined || outputTokens === undefined ||
          !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
          !Number.isSafeInteger(outputTokens) || outputTokens < 0
        ) {
          state.onUsageUnavailable?.();
          emitSegment({ type: 'info', content: 'Copilot turn telemetry unavailable: complete input/output totals missing.' });
          return undefined;
        }
        if (parts.length > 0 || inputTokens === 0 || outputTokens === 0) {
          const usageStr = `Usage: ${parts.join(', ')}`;
          emitOutput(`\n[${usageStr}]\n`);
          emitSegment({
            type: 'info',
            content: usageStr,
            usage: {
              model,
              inputTokens,
              outputTokens,
              costUsd: cost,
              durationMs: duration,
            },
          });
        }
        return undefined;
      }

      case 'session.compaction_start': {
        emitOutput('\n[Copilot CLI] Context compaction started...\n');
        emitSegment({
          type: 'info',
          content: 'Context compaction started...',
        });
        return undefined;
      }

      case 'session.compaction_complete': {
        const tokensBefore = data['tokensBefore'] as number | undefined;
        const tokensAfter = data['tokensAfter'] as number | undefined;
        const parts: string[] = ['Context compaction complete'];
        if (tokensBefore !== undefined && tokensAfter !== undefined) {
          parts.push(`${tokensBefore} -> ${tokensAfter} tokens`);
        }
        const msg = parts.join(': ');
        emitOutput(`\n[Copilot CLI] ${msg}\n`);
        emitSegment({ type: 'info', content: msg });
        return undefined;
      }

      case 'result': {
        if (typeof event.id === 'string' && event.id.trim()) state.onResultId?.(event.id.trim());
        const sessionId =
          typeof event.sessionId === 'string' && event.sessionId.trim()
            ? event.sessionId.trim()
            : undefined;
        const usage = event.usage;
        if (usage) {
          const parts: string[] = [];
          if (usage.totalApiDurationMs)
            parts.push(`${(usage.totalApiDurationMs / 1000).toFixed(1)}s api`);
          if (usage.sessionDurationMs)
            parts.push(`${(usage.sessionDurationMs / 1000).toFixed(1)}s total`);
          if (usage.premiumRequests !== undefined)
            parts.push(`${usage.premiumRequests} premium`);
          if (usage.codeChanges) {
            const { linesAdded, linesRemoved } = usage.codeChanges;
            if (linesAdded || linesRemoved) {
              parts.push(`+${linesAdded ?? 0}/-${linesRemoved ?? 0} lines`);
            }
          }
          if (parts.length > 0) {
            const usageStr = `Final: ${parts.join(', ')}`;
            emitOutput(`\n[${usageStr}]\n`);
            emitSegment({ type: 'info', content: usageStr });
          }
        }
        return sessionId;
      }

      default:
        return undefined;
    }
  }

  /**
   * Summarize tool arguments for concise display in the agent monitor.
   * Extracts key values based on known tool names.
   */
  private summarizeToolArgs(toolName: string, args: unknown): string {
    if (typeof args === 'string') return args;
    if (!args || typeof args !== 'object') return '';

    const obj = args as Record<string, unknown>;
    switch (toolName) {
      case 'read_file':
      case 'write_file':
        return obj['path'] ? `\`${obj['path'] as string}\`` : '';
      case 'run_shell_command':
      case 'bash':
      case 'shell':
        return obj['command'] ? `\`${obj['command'] as string}\`` : '';
      case 'search_file_content':
      case 'grep':
        return obj['pattern'] ? `pattern: "${obj['pattern'] as string}"` : '';
      case 'glob':
      case 'list_directory':
        return obj['pattern'] || obj['path']
          ? `"${(obj['pattern'] ?? obj['path']) as string}"`
          : '';
      case 'edit':
      case 'replace':
        return obj['file_path'] || obj['path']
          ? `\`${(obj['file_path'] ?? obj['path']) as string}\``
          : '';
      default: {
        const firstStr = Object.entries(obj).find(
          ([, v]) => typeof v === 'string',
        );
        if (firstStr) {
          const val = String(firstStr[1]).substring(0, 60);
          return `${firstStr[0]}: "${val}"`;
        }
        return '';
      }
    }
  }

  /**
   * No-op disposal. The CLI-driven path has no singleton client to tear
   * down; child processes are owned by AgentProcessManager and killed on
   * abort. Permission bridge is cleaned up to drop any pending requests.
   */
  async dispose(): Promise<void> {
    this.permissionBridge.cleanup();
  }
}
