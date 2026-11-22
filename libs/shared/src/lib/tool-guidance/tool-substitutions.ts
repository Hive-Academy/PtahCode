/**
 * The single source of truth for "which ptah_* tool replaces which default
 * action".
 *
 * Every text that tells an agent to prefer a ptah tool is GENERATED from the
 * rows below: the core system prompt table, the lane policy table, the MCP
 * server instructions (parsed from the core block), the agent-file block and
 * the cue in a tool description. A hand-written copy drifts; the specs in this
 * folder and in `vscode-lm-tools` fail when one reappears.
 *
 * A row carries one wording per rendering because the renderings never used
 * the same words (the lane table is shorter and phrased as a need). A rendering
 * that skips a row must record the reason in `omit`, so a missing row is a
 * decision and not an accident.
 *
 * Pure data and pure functions only: this library is imported by the agent
 * SDK, the CLI runtime and the MCP host, so it must stay dependency-free.
 */

/**
 * The MCP namespace that must be enabled for the tool to be listed.
 * `core` tools are always listed. `ide` tools need IDE capabilities, `code` and
 * `browser` are namespaces a host may disable (see `buildToolDefinitions` in
 * `vscode-lm-tools`, which a spec compares with these values).
 */
export type ToolGuidanceNamespace = 'core' | 'ide' | 'code' | 'browser';

/** The three cells of the core prompt table. */
export interface CoreSubstitutionWording {
  /** "Instead of..." cell (Markdown allowed). */
  readonly insteadOf: string;
  /** "CALL THIS TOOL" cell: the tool name, optionally with key arguments. */
  readonly call: string;
  /** "Why" cell. */
  readonly why: string;
}

/** The two cells of the lane policy table. */
export interface LaneSubstitutionWording {
  /** The need, phrased for a lane. */
  readonly need: string;
  /** What to prefer. Starts with the tool name; may add a short hint. */
  readonly prefer: string;
  /** Position in the lane table (ascending, unique). */
  readonly order: number;
}

export interface ToolSubstitution {
  /** The ptah tool name. Unique across rows. */
  readonly tool: string;
  readonly namespace: ToolGuidanceNamespace;
  /**
   * 1 = must appear in the core prompt and the lane table (no `omit`). The
   *     512-char server instructions keep core table order instead.
   * 2 = normal. 3 = first to drop when a rendering is short of room.
   */
  readonly priority: 1 | 2 | 3;
  /** Shell commands this tool replaces. Used by the cue and the free-text line. */
  readonly shell?: readonly string[];
  readonly core?: CoreSubstitutionWording;
  readonly lane?: LaneSubstitutionWording;
  /** The recorded reason a rendering has no row for this tool. */
  readonly omit?: { readonly core?: string; readonly lane?: string };
  /** When true, the tool description names the shell commands in `shell`. */
  readonly cue?: boolean;
}

const BROWSER_OUT_OF_CORE =
  'Browser tools stay out of the core prompt to keep its token budget; the lane policy names them.';
const LANE_KEPT_SHORT =
  'Low-use tool, kept out of the lane policy to hold its byte budget (it goes through argv).';
const LANE_IDE_ONLY =
  'IDE-only tool, absent for most lanes, so kept out of the lane policy byte budget.';

/** Rows in core table order. */
export const TOOL_SUBSTITUTIONS: readonly ToolSubstitution[] = [
  {
    tool: 'ptah_workspace_analyze',
    namespace: 'core',
    priority: 1,
    core: {
      insteadOf: 'Manual exploration',
      call: 'ptah_workspace_analyze',
      why: 'Full project structure in one call',
    },
    lane: {
      need: 'Understand workspace',
      prefer: 'ptah_workspace_analyze',
      order: 1,
    },
  },
  {
    tool: 'ptah_search_files',
    namespace: 'core',
    priority: 1,
    shell: ['find'],
    core: {
      insteadOf: 'Bash `find` / Glob tool',
      call: 'ptah_search_files',
      why: 'Respects .gitignore, workspace-indexed',
    },
    lane: { need: 'Find files by path', prefer: 'ptah_search_files', order: 2 },
  },
  {
    tool: 'ptah_get_diagnostics',
    namespace: 'core',
    priority: 1,
    core: {
      insteadOf: 'Build to find errors',
      call: 'ptah_get_diagnostics',
      why: 'Workspace type-check; call once after edits, not on every step',
    },
    lane: {
      need: 'Check errors after editing',
      prefer: 'ptah_get_diagnostics scoped to changed files',
      order: 10,
    },
  },
  {
    tool: 'ptah_grep',
    namespace: 'core',
    priority: 1,
    shell: ['grep', 'rg'],
    cue: true,
    core: {
      insteadOf: '`grep` / `rg`',
      call: 'ptah_grep { pattern, path?, glob? }',
      why: 'Text and constants, grouped by file with the enclosing function; `includeIgnored` + scoped `path` reaches node_modules',
    },
    lane: {
      need: 'Find text/constant/usage (not grep/rg)',
      prefer: 'ptah_grep',
      order: 4,
    },
  },
  {
    tool: 'ptah_read_symbol',
    namespace: 'core',
    priority: 1,
    shell: ['sed -n', 'cat'],
    cue: true,
    core: {
      insteadOf: '`sed -n` / `cat`',
      call: 'ptah_read_symbol { file, name }',
      why: 'One declaration, or a line range (startLine/endLine); numbered, bounded',
    },
    lane: {
      need: 'Read function or line range (not sed/cat)',
      prefer: 'ptah_read_symbol',
      order: 5,
    },
  },
  {
    tool: 'ptah_lsp_references',
    namespace: 'ide',
    priority: 2,
    core: {
      insteadOf: 'Grep for symbol usages',
      call: 'ptah_lsp_references',
      why: 'LSP-accurate, rename-safe; take file/line/col from ptah_code_search_symbols first; use before any refactoring',
    },
    lane: {
      need: 'Find symbol usages',
      prefer: 'ptah_lsp_references after locating file/line/col',
      order: 8,
    },
  },
  {
    tool: 'ptah_lsp_definitions',
    namespace: 'ide',
    priority: 3,
    core: {
      insteadOf: 'Navigating to find definitions',
      call: 'ptah_lsp_definitions',
      why: 'Go-to-definition via LSP',
    },
    omit: { lane: LANE_IDE_ONLY },
  },
  {
    tool: 'ptah_get_dirty_files',
    namespace: 'ide',
    priority: 3,
    shell: ['git status'],
    core: {
      insteadOf: '`git status` via Bash',
      call: 'ptah_get_dirty_files',
      why: 'Shows unsaved VS Code buffers too',
    },
    omit: { lane: LANE_IDE_ONLY },
  },
  {
    tool: 'ptah_count_tokens',
    namespace: 'core',
    priority: 3,
    core: {
      insteadOf: 'Reading a file to check size',
      call: 'ptah_count_tokens',
      why: 'Token count, not byte count',
    },
    omit: { lane: LANE_KEPT_SHORT },
  },
  {
    tool: 'ptah_web_search',
    namespace: 'core',
    priority: 2,
    core: {
      insteadOf: 'Web search / browsing',
      call: 'ptah_web_search',
      why: 'Grounded web search via LLM providers',
    },
    lane: {
      need: 'Check current external facts',
      prefer: 'ptah_web_search',
      order: 12,
    },
  },
  {
    tool: 'ptah_code_search_symbols',
    namespace: 'code',
    priority: 1,
    core: {
      insteadOf: 'Grep/Glob to find a **function, class, or method**',
      call: 'ptah_code_search_symbols { query }',
      why: 'Symbol index — no false positives from string matches',
    },
    lane: {
      need: 'Find function/class/method',
      prefer: 'ptah_code_search_symbols',
      order: 3,
    },
  },
  {
    tool: 'ptah_ast_analyze',
    namespace: 'code',
    priority: 1,
    core: {
      insteadOf: 'Reading a full file to inspect structure',
      call: 'ptah_ast_analyze { file }',
      why: 'Functions/classes/imports/exports with line ranges; 40-60% fewer tokens than Read',
    },
    lane: {
      need: 'Inspect source structure before full read',
      prefer: 'ptah_ast_analyze',
      order: 6,
    },
  },
  {
    tool: 'ptah_context_enrich_file',
    namespace: 'code',
    priority: 2,
    core: {
      insteadOf: 'Reading a full file for its API surface only',
      call: 'ptah_context_enrich_file { file }',
      why: '.d.ts-style summary — signatures without bodies',
    },
    lane: {
      need: 'Inspect signatures/API',
      prefer: 'ptah_context_enrich_file',
      order: 7,
    },
  },
  {
    tool: 'ptah_get_dependents',
    namespace: 'code',
    priority: 2,
    core: {
      insteadOf: 'Checking what breaks before changing a file',
      call: 'ptah_get_dependents { file }',
      why: 'Reverse import edges = blast radius',
    },
    lane: {
      need: 'Check impact before editing',
      prefer: 'ptah_get_dependents',
      order: 9,
    },
  },
  {
    tool: 'ptah_memory_search',
    namespace: 'code',
    priority: 2,
    core: {
      insteadOf: 'Recalling past decisions / preferences',
      call: 'ptah_memory_search { query }',
      why: 'Persistent cross-session memory (BM25+vector)',
    },
    lane: {
      need: 'Recall earlier decisions',
      prefer: 'ptah_memory_search for "last time"/"previously"',
      order: 11,
    },
  },
  {
    tool: 'ptah_relevance_rank_files',
    namespace: 'code',
    priority: 3,
    core: {
      insteadOf: 'Guessing which files matter for a task',
      call: 'ptah_relevance_rank_files { query }',
      why: 'Ranked 0-100 with reasons — triage before opening files',
    },
    omit: { lane: LANE_KEPT_SHORT },
  },
  {
    tool: 'ptah_project_detect_monorepo',
    namespace: 'code',
    priority: 3,
    core: {
      insteadOf: 'Figuring out the monorepo layout',
      call: 'ptah_project_detect_monorepo',
      why: 'Detects nx/lerna/turbo/workspaces + package count',
    },
    omit: { lane: LANE_KEPT_SHORT },
  },
  {
    tool: 'ptah_get_symbol_index',
    namespace: 'code',
    priority: 3,
    core: {
      insteadOf: 'Finding where a symbol is exported',
      call: 'ptah_get_symbol_index',
      why: 'Map of file → exported symbol names',
    },
    omit: { lane: LANE_KEPT_SHORT },
  },
  {
    tool: 'ptah_browser_navigate',
    namespace: 'browser',
    priority: 2,
    lane: {
      need: 'Check rendered UI',
      prefer: 'ptah_browser_navigate and ptah_browser_screenshot',
      order: 13,
    },
    omit: { core: BROWSER_OUT_OF_CORE },
  },
  {
    tool: 'ptah_browser_screenshot',
    namespace: 'browser',
    priority: 2,
    omit: {
      core: BROWSER_OUT_OF_CORE,
      lane: 'Named in the same lane line as ptah_browser_navigate.',
    },
  },
];

/** The lane policy as a whole stays within this many UTF-8 bytes (argv on some lanes). */
export const LANE_POLICY_MAX_BYTES = 3500;

/** Codex reads only the first ~512 characters of the MCP server instructions. */
export const SERVER_INSTRUCTIONS_MAX_CHARS = 512;

/** The generated agent-file "Working rules" part stays within this many UTF-8 bytes. */
export const AGENT_TOOLING_RULES_MAX_BYTES = 3000;
