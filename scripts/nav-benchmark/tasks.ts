/**
 * Task set of the offline navigation benchmark (TASK_2026_2299_d6f5).
 *
 * Every task comes from a navigation pattern seen in real agent transcripts
 * (Bash rg / grep / sed -n / cat, Read with offset+limit, Codex exec). Paths are
 * workspace-relative. No target file is edited by the PR that changes the
 * navigation tools, so the expect strings stay valid across before/after runs.
 *
 * Strategies:
 * - `shell`: what an agent runs with the shell today.
 * - `before`: the best chain of ptah tools that exist now; a chain ends with a
 *   shell step when ptah cannot answer alone.
 * - `after`: the chain after the planned change (`ptah_read_symbol`,
 *   `ptah_grep`, and `ptah_code_search_symbols` returning a code extract).
 */

import type { NavStep, NavTask } from './types';

const SPAWNER =
  'libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts';
const REGISTRY =
  'libs/backend/cli-agent-runtime/src/lib/session-children/session-child.registry.ts';
const SESSION_CHILDREN =
  'libs/backend/cli-agent-runtime/src/lib/session-children';
const TAB_MANAGER = 'libs/frontend/chat-state/src/lib/tab-manager.service.ts';
const PERMISSION_HANDLER =
  'libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts';
const PLUGIN_LOADER =
  'libs/backend/agent-sdk/src/lib/helpers/plugin-loader.service.ts';
const INDEXING_CONTROL =
  'libs/backend/memory-curator/src/lib/control/indexing-control.service.ts';

function sh(shell: string): NavStep {
  return { shell };
}

function tool(name: string, args: Readonly<Record<string, unknown>>): NavStep {
  return { tool: name, args };
}

/** `sed -n 'A,Bp' file`, the most common ranged read in the transcripts. */
function sedRange(file: string, start: number, end: number): NavStep {
  return sh(`sed -n '${start},${end}p' ${file}`);
}

export const NAV_TASKS: readonly NavTask[] = [
  // ---------------------------------------------------------------- read-symbol
  {
    id: 'read-symbol-spawner-status-of',
    kind: 'read-symbol',
    question:
      'How does the session spawner map a child record to its public status?',
    source:
      'claude-bash: grep -n "private statusOf" then sed -n range on session-spawner',
    expect: [
      'private statusOf(child: SessionChildRecord): SessionChildStatus {',
      "if (child.pendingPermission) return 'awaiting-permission';",
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sh(`rg -n -A18 'private statusOf\\(' ${SPAWNER}`)],
      before: [
        tool('ptah_ast_analyze', { file: SPAWNER }),
        sedRange(SPAWNER, 2213, 2230),
      ],
      after: [tool('ptah_read_symbol', { file: SPAWNER, name: 'statusOf' })],
    },
  },
  {
    id: 'read-symbol-spawner-sdk-id-of',
    kind: 'read-symbol',
    question:
      'How does the session spawner resolve the SDK session id of a session?',
    source: 'claude-bash: grep -n "sdkIdOf" -A12 on session-spawner',
    expect: [
      'private sdkIdOf(sessionId: string): string | undefined {',
      'const record = this.lifecycle.find(sessionId);',
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sh(`rg -n -A16 'private sdkIdOf\\(' ${SPAWNER}`)],
      before: [
        tool('ptah_ast_analyze', { file: SPAWNER }),
        sedRange(SPAWNER, 2277, 2292),
      ],
      after: [tool('ptah_read_symbol', { file: SPAWNER, name: 'sdkIdOf' })],
    },
  },
  {
    id: 'read-symbol-spawner-active-id-of',
    kind: 'read-symbol',
    question: 'Which id does the adapter know a live child session by?',
    source: 'claude-bash: grep -rn "sdkIdOf\\|activeIdOf" on cli-agent-runtime',
    expect: [
      'private activeIdOf(child: SessionChildRecord): SessionId | null {',
      'if (id && this.adapter.isSessionActive(id)) return id;',
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sh(`rg -n -A8 'private activeIdOf\\(' ${SPAWNER}`)],
      before: [
        tool('ptah_ast_analyze', { file: SPAWNER }),
        sedRange(SPAWNER, 2268, 2275),
      ],
      after: [tool('ptah_read_symbol', { file: SPAWNER, name: 'activeIdOf' })],
    },
  },
  {
    id: 'read-symbol-registry-find-unbound-by-cwd',
    kind: 'read-symbol',
    question:
      'How does the child registry find the one unbound child for a working directory?',
    source:
      'claude-bash: grep -n "findUniqueUnboundByCwd" on session-child registry',
    expect: [
      'findUniqueUnboundByCwd(path: string | undefined): SessionChildRecord | undefined {',
      'const key = pathKey(path);',
    ],
    expectFile: REGISTRY,
    strategies: {
      shell: [sh(`rg -n -A11 'findUniqueUnboundByCwd\\(' ${REGISTRY}`)],
      before: [
        tool('ptah_ast_analyze', { file: REGISTRY }),
        sedRange(REGISTRY, 375, 385),
      ],
      after: [
        tool('ptah_read_symbol', {
          file: REGISTRY,
          name: 'findUniqueUnboundByCwd',
        }),
      ],
    },
  },
  {
    id: 'read-symbol-tab-manager-find-by-session',
    kind: 'read-symbol',
    question: 'How does the tab manager find the tab of a session id?',
    source:
      'claude-bash: grep -n "findTabBySessionId" then sed -n range on tab-manager',
    expect: [
      'findTabBySessionId(sessionId: string): TabState | null {',
      'const activeTab = this._tabs().find((t) => t.claudeSessionId === sessionId);',
    ],
    expectFile: TAB_MANAGER,
    strategies: {
      shell: [sh(`rg -n -A12 '^  findTabBySessionId\\(' ${TAB_MANAGER}`)],
      before: [
        tool('ptah_ast_analyze', { file: TAB_MANAGER }),
        sedRange(TAB_MANAGER, 609, 620),
      ],
      after: [
        tool('ptah_read_symbol', {
          file: TAB_MANAGER,
          name: 'findTabBySessionId',
        }),
      ],
    },
  },

  // ----------------------------------------------------------------- read-range
  {
    id: 'read-range-spawner-pending-record',
    kind: 'read-range',
    question:
      'Show lines 623-642 of the session spawner (the pending start record).',
    source: 'claude-bash: sed -n 623,642p on session-spawner',
    expect: [
      'private pendingRecordOf(',
      'const parentSdkSessionId = this.sdkIdOf(guard.caller);',
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sedRange(SPAWNER, 623, 642)],
      before: [sedRange(SPAWNER, 623, 642)],
      after: [
        tool('ptah_read_symbol', {
          file: SPAWNER,
          startLine: 623,
          endLine: 642,
        }),
      ],
    },
  },
  {
    id: 'read-range-spawner-can-start',
    kind: 'read-range',
    question:
      'Show lines 366-381 of the session spawner (attach claim release and start eligibility).',
    source: 'claude-bash: sed -n 340,372p style range on session-spawner',
    expect: [
      'canStart(callerSessionId: string | undefined): SessionChildEligibility {',
      "return { ok: false, code: 'cap-reached'",
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sedRange(SPAWNER, 366, 381)],
      before: [sedRange(SPAWNER, 366, 381)],
      after: [
        tool('ptah_read_symbol', {
          file: SPAWNER,
          startLine: 366,
          endLine: 381,
        }),
      ],
    },
  },
  {
    id: 'read-range-permission-handler-levels',
    kind: 'read-range',
    question:
      'Show lines 276-300 of the SDK permission handler (level and pending counters).',
    source: 'claude-read: offset+limit read on sdk-permission-handler',
    expect: [
      'setPermissionLevel(level: PermissionLevel): void {',
      'getPendingCliAgentPermissions(): AgentPermissionRequest[] {',
    ],
    expectFile: PERMISSION_HANDLER,
    strategies: {
      shell: [sedRange(PERMISSION_HANDLER, 276, 300)],
      before: [sedRange(PERMISSION_HANDLER, 276, 300)],
      after: [
        tool('ptah_read_symbol', {
          file: PERMISSION_HANDLER,
          startLine: 276,
          endLine: 300,
        }),
      ],
    },
  },
  {
    id: 'read-range-plugin-loader-workspace-state',
    kind: 'read-range',
    question:
      'Show lines 1041-1050 of the plugin loader (workspace state check).',
    source: 'claude-bash: sed -n range on plugin-loader',
    expect: [
      'hasWorkspaceState(workspaceRoot: string): boolean {',
      'return this.storageFor(workspaceRoot) !== null;',
    ],
    expectFile: PLUGIN_LOADER,
    strategies: {
      shell: [sedRange(PLUGIN_LOADER, 1041, 1050)],
      before: [sedRange(PLUGIN_LOADER, 1041, 1050)],
      after: [
        tool('ptah_read_symbol', {
          file: PLUGIN_LOADER,
          startLine: 1041,
          endLine: 1050,
        }),
      ],
    },
  },

  // ----------------------------------------------------------- find-usages-text
  {
    id: 'usages-text-abort-reason-superseded',
    kind: 'find-usages-text',
    question: 'Where is the ABORT_REASON_SUPERSEDED constant used?',
    source: 'claude-bash: rg -n constant name over libs',
    expect: [
      'libs/frontend/chat/src/lib/services/message-sender.service.ts',
      'libs/frontend/chat-state/src/lib/tab-manager.service.ts',
    ],
    strategies: {
      shell: [sh(`rg -n 'ABORT_REASON_SUPERSEDED' libs`)],
      before: [sh(`rg -n 'ABORT_REASON_SUPERSEDED' libs`)],
      after: [
        tool('ptah_grep', { pattern: 'ABORT_REASON_SUPERSEDED', path: 'libs' }),
      ],
    },
  },
  {
    id: 'usages-text-carry-over-start-failed',
    kind: 'find-usages-text',
    question: 'Where is the carry-over start failure message referenced?',
    source: 'claude-bash: rg -n constant name over libs',
    expect: [
      'libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts',
      'libs/frontend/chat/src/lib/services/provider-carry-over.service.ts',
    ],
    strategies: {
      shell: [sh(`rg -n 'CARRY_OVER_START_FAILED' libs`)],
      before: [sh(`rg -n 'CARRY_OVER_START_FAILED' libs`)],
      after: [
        tool('ptah_grep', { pattern: 'CARRY_OVER_START_FAILED', path: 'libs' }),
      ],
    },
  },
  {
    id: 'usages-text-read-session-child-settings',
    kind: 'find-usages-text',
    question: 'Which files of cli-agent-runtime call readSessionChildSettings?',
    source: 'claude-bash: grep -rn --include=*.ts over cli-agent-runtime',
    expect: [SPAWNER, `${SESSION_CHILDREN}/session-child-settings.ts`],
    strategies: {
      shell: [
        sh(
          `rg -n --glob '*.ts' 'readSessionChildSettings' libs/backend/cli-agent-runtime`,
        ),
      ],
      before: [
        sh(
          `rg -n --glob '*.ts' 'readSessionChildSettings' libs/backend/cli-agent-runtime`,
        ),
      ],
      after: [
        tool('ptah_grep', {
          pattern: 'readSessionChildSettings',
          path: 'libs/backend/cli-agent-runtime',
          glob: '*.ts',
        }),
      ],
    },
  },
  {
    id: 'usages-text-find-unbound-by-cwd',
    kind: 'find-usages-text',
    question: 'Where is findUniqueUnboundByCwd mentioned, with context?',
    source: 'claude-bash: rg -n -C3 method name on session-children',
    expect: [SPAWNER, REGISTRY],
    strategies: {
      shell: [sh(`rg -n -C3 'findUniqueUnboundByCwd' ${SESSION_CHILDREN}`)],
      before: [sh(`rg -n -C3 'findUniqueUnboundByCwd' ${SESSION_CHILDREN}`)],
      after: [
        tool('ptah_grep', {
          pattern: 'findUniqueUnboundByCwd',
          path: SESSION_CHILDREN,
          context: 3,
        }),
      ],
    },
  },

  // ------------------------------------------------------------ find-by-concept
  {
    id: 'concept-release-attach-claim',
    kind: 'find-by-concept',
    question: 'Where is the worktree attach claim of a child start released?',
    source: 'claude-bash: grep -n "attach\\|attachClaims" on session-spawner',
    expect: [
      'private releaseAttachClaim(reservation: SessionChildReservation): void {',
      'this.attachClaims.delete(claimed);',
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [sh(`rg -n -C5 'attachClaims\\.delete' ${SESSION_CHILDREN}`)],
      before: [
        tool('ptah_code_search_symbols', {
          query: 'release worktree attach claim',
          maxResults: 5,
        }),
        sh(`rg -n -A6 'private releaseAttachClaim\\(' ${SPAWNER}`),
      ],
      after: [
        tool('ptah_code_search_symbols', {
          query: 'release worktree attach claim',
          maxResults: 5,
        }),
      ],
    },
  },
  {
    id: 'concept-clamp-read-tail',
    kind: 'find-by-concept',
    question: 'Which function clamps the tail size of a child session read?',
    source: 'claude-bash: grep -n tail KiB constant on session-spawner',
    expect: [
      'function clampTail(tailKiB: number | undefined): number {',
      'return SESSION_READ_DEFAULT_TAIL_KIB;',
    ],
    expectFile: SPAWNER,
    strategies: {
      shell: [
        sh(`rg -n -C4 'SESSION_READ_DEFAULT_TAIL_KIB' ${SESSION_CHILDREN}`),
      ],
      before: [
        tool('ptah_code_search_symbols', {
          query: 'clamp session read tail size',
          maxResults: 5,
        }),
        sh(`rg -n -A6 '^function clampTail\\(' ${SPAWNER}`),
      ],
      after: [
        tool('ptah_code_search_symbols', {
          query: 'clamp session read tail size',
          maxResults: 5,
        }),
      ],
    },
  },
  {
    id: 'concept-count-pending-permissions',
    kind: 'find-by-concept',
    question:
      'How is the number of pending permission prompts of a session counted?',
    source: 'claude-bash: grep -rn "pendingRequests" on agent-sdk',
    expect: [
      'getPendingPermissionCount(sessionId?: string): number {',
      'request.sessionId === sessionId || request.tabId === sessionId,',
    ],
    expectFile: PERMISSION_HANDLER,
    strategies: {
      shell: [
        sh(
          `rg -n -C4 'pendingRequests\\.values\\(\\)' libs/backend/agent-sdk/src/lib`,
        ),
      ],
      before: [
        tool('ptah_code_search_symbols', {
          query: 'count pending permission requests for session',
          maxResults: 5,
        }),
        sh(
          `rg -n -A6 'getPendingPermissionCount\\(sessionId' ${PERMISSION_HANDLER}`,
        ),
      ],
      after: [
        tool('ptah_code_search_symbols', {
          query: 'count pending permission requests for session',
          maxResults: 5,
        }),
      ],
    },
  },
  {
    id: 'concept-bind-sdk-session-id',
    kind: 'find-by-concept',
    question:
      'Which registry method binds a real SDK session id to a child record?',
    source: 'claude-bash: rg for bindSdkSessionId on session-children',
    expect: ['bindSdkSessionId(', 'const sdkId = sdkSessionId.trim();'],
    expectFile: REGISTRY,
    strategies: {
      shell: [sh(`rg -n -A12 '^  bindSdkSessionId\\(' ${REGISTRY}`)],
      before: [
        tool('ptah_code_search_symbols', {
          query: 'bind sdk session id to child record',
          maxResults: 5,
        }),
        sh(`rg -n -A12 '^  bindSdkSessionId\\(' ${REGISTRY}`),
      ],
      after: [
        tool('ptah_code_search_symbols', {
          query: 'bind sdk session id to child record',
          maxResults: 5,
        }),
      ],
    },
  },

  // -------------------------------------------------------------------- outline
  {
    id: 'outline-session-spawner',
    kind: 'outline',
    question: 'Which methods does the session spawner service have?',
    source: 'claude-bash: grep -nE method-signature regex on session-spawner',
    expect: ['statusOf', 'sdkIdOf', 'releaseAttachClaim', 'succeedChild'],
    expectFile: SPAWNER,
    strategies: {
      shell: [
        sh(`rg -n '^  (private |async |readonly )*[a-zA-Z]+\\(' ${SPAWNER}`),
      ],
      before: [tool('ptah_ast_analyze', { file: SPAWNER })],
      after: [tool('ptah_ast_analyze', { file: SPAWNER })],
    },
  },
  {
    id: 'outline-indexing-control',
    kind: 'outline',
    question: 'What is the public surface of the indexing control service?',
    source: 'claude-bash: grep -n method list on indexing-control',
    expect: ['getStatus', 'isRunning', 'dismissStale', 'acknowledgeDisclosure'],
    expectFile: INDEXING_CONTROL,
    strategies: {
      shell: [
        sh(`rg -n '^  (private |async )*[a-zA-Z]+\\(' ${INDEXING_CONTROL}`),
      ],
      before: [tool('ptah_context_enrich_file', { file: INDEXING_CONTROL })],
      after: [tool('ptah_ast_analyze', { file: INDEXING_CONTROL })],
    },
  },
  {
    id: 'outline-permission-handler',
    kind: 'outline',
    question: 'Which methods does the SDK permission handler expose?',
    source: 'claude-bash: grep -n method list on sdk-permission-handler',
    expect: [
      'handleResponse',
      'cleanupPendingPermissions',
      'getPermissionRules',
    ],
    expectFile: PERMISSION_HANDLER,
    strategies: {
      shell: [
        sh(`rg -n '^  (private |async )*[a-zA-Z]+\\(' ${PERMISSION_HANDLER}`),
      ],
      before: [tool('ptah_ast_analyze', { file: PERMISSION_HANDLER })],
      after: [tool('ptah_ast_analyze', { file: PERMISSION_HANDLER })],
    },
  },

  // --------------------------------------------------------- find-usages-symbol
  {
    id: 'usages-symbol-session-spawner-service',
    kind: 'find-usages-symbol',
    question: 'Which files reference the SessionSpawnerService class?',
    source: 'claude-bash: grep -rn class name over cli-agent-runtime',
    expect: [
      'libs/backend/cli-agent-runtime/src/lib/di/register.ts',
      `${SESSION_CHILDREN}/session-handoff.service.ts`,
    ],
    strategies: {
      shell: [sh(`rg -n -w 'SessionSpawnerService' libs apps --type ts`)],
      before: [
        tool('ptah_lsp_references', { file: SPAWNER, line: 227, col: 13 }),
      ],
      after: [
        tool('ptah_grep', {
          pattern: 'SessionSpawnerService',
          path: 'libs',
          glob: '*.ts',
          regex: false,
        }),
      ],
    },
  },
  {
    id: 'usages-symbol-bind-sdk-session-id',
    kind: 'find-usages-symbol',
    question: 'Who calls SessionChildRegistry.bindSdkSessionId?',
    source: 'claude-bash: grep -n "bindSdkSessionId" on session-children',
    expect: [SPAWNER, REGISTRY],
    strategies: {
      shell: [sh(`rg -n -w 'bindSdkSessionId' libs --type ts`)],
      before: [
        tool('ptah_lsp_references', { file: REGISTRY, line: 433, col: 2 }),
      ],
      after: [
        tool('ptah_lsp_references', { file: REGISTRY, line: 433, col: 2 }),
      ],
    },
  },
  {
    id: 'usages-symbol-pending-permission-count',
    kind: 'find-usages-symbol',
    question: 'Who calls getPendingPermissionCount?',
    source: 'claude-bash: grep -rn method name over agent-sdk and shared',
    expect: [
      'libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts',
      'libs/shared/src/lib/types/permission.types.ts',
    ],
    strategies: {
      shell: [sh(`rg -n -w 'getPendingPermissionCount' libs --type ts`)],
      before: [
        tool('ptah_lsp_references', {
          file: PERMISSION_HANDLER,
          line: 293,
          col: 2,
        }),
      ],
      after: [
        tool('ptah_lsp_references', {
          file: PERMISSION_HANDLER,
          line: 293,
          col: 2,
        }),
      ],
    },
  },
  {
    id: 'usages-symbol-find-tab-by-session-id',
    kind: 'find-usages-symbol',
    question: 'Which frontend code calls TabManagerService.findTabBySessionId?',
    source: 'claude-bash: grep -rn method name over libs/frontend',
    expect: [
      'libs/frontend/chat/src/lib/services/chat.store.ts',
      'libs/frontend/command-center/src/lib/model/session-coordinator.ts',
    ],
    strategies: {
      shell: [sh(`rg -n -w 'findTabBySessionId' libs/frontend --type ts`)],
      before: [
        tool('ptah_lsp_references', { file: TAB_MANAGER, line: 608, col: 2 }),
      ],
      after: [
        tool('ptah_lsp_references', { file: TAB_MANAGER, line: 608, col: 2 }),
      ],
    },
  },

  // ----------------------------------------------------------------- find-files
  {
    id: 'files-session-handoff',
    kind: 'find-files',
    question: 'Which session-children files implement the session handoff?',
    source: 'claude-bash: ls session-children | grep handoff',
    expect: [
      `${SESSION_CHILDREN}/session-handoff.service.ts`,
      `${SESSION_CHILDREN}/session-handoff-chain.store.ts`,
    ],
    strategies: {
      shell: [sh(`rg --files ${SESSION_CHILDREN} | rg 'handoff'`)],
      before: [
        tool('ptah_search_files', {
          pattern: `${SESSION_CHILDREN}/*handoff*.ts`,
        }),
      ],
      after: [
        tool('ptah_search_files', {
          pattern: `${SESSION_CHILDREN}/*handoff*.ts`,
        }),
      ],
    },
  },
  {
    id: 'files-session-spawner',
    kind: 'find-files',
    question: 'Which files make up the session spawner and its specs?',
    source: 'claude-bash: ls session-children/session-spawner*',
    expect: [SPAWNER, `${SESSION_CHILDREN}/session-spawner.port.ts`],
    strategies: {
      shell: [sh(`rg --files ${SESSION_CHILDREN} | rg 'session-spawner'`)],
      before: [
        tool('ptah_search_files', { pattern: '**/session-spawner*.ts' }),
      ],
      after: [tool('ptah_search_files', { pattern: '**/session-spawner*.ts' })],
    },
  },
  {
    id: 'files-agent-usage-readers',
    kind: 'find-files',
    question: 'Which transcript readers exist in the agent-usage scripts?',
    source: 'claude-bash: ls scripts/agent-usage',
    expect: [
      'scripts/agent-usage/claude-transcript.reader.ts',
      'scripts/agent-usage/codex-rollout.reader.ts',
    ],
    strategies: {
      shell: [sh(`rg --files scripts/agent-usage | rg '\\.reader\\.ts$'`)],
      before: [
        tool('ptah_search_files', {
          pattern: 'scripts/agent-usage/*.reader.ts',
        }),
      ],
      after: [
        tool('ptah_search_files', {
          pattern: 'scripts/agent-usage/*.reader.ts',
        }),
      ],
    },
  },
];
