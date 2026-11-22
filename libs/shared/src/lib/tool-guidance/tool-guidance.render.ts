/**
 * Renderers for the tool substitution rows. Each is a pure function of
 * `TOOL_SUBSTITUTIONS`; the text a renderer cannot derive from a row (the
 * fallback line, the MANDATORY callout) is fixed here, next to the rows, so
 * that it cannot name a tool the rows do not have.
 */
import {
  TOOL_SUBSTITUTIONS,
  type ToolGuidanceNamespace,
  type ToolSubstitution,
} from './tool-substitutions';

export interface ToolGuidanceRenderOptions {
  /**
   * Namespaces a host has disabled. Rows that need one of them are left out.
   * The shipped prompts are constants and pass nothing, so they name every row.
   */
  readonly disabledNamespaces?: readonly ToolGuidanceNamespace[];
}

function findRow(tool: string): ToolSubstitution {
  const row = TOOL_SUBSTITUTIONS.find((candidate) => candidate.tool === tool);
  if (!row) throw new Error(`No tool substitution row for ${tool}`);
  return row;
}

function enabledRows(
  options: ToolGuidanceRenderOptions | undefined,
): ToolSubstitution[] {
  const disabled = new Set(options?.disabledNamespaces ?? []);
  return TOOL_SUBSTITUTIONS.filter((row) => !disabled.has(row.namespace));
}

/** "a, b or c" */
function joinOr(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** The shell commands that the text-search and read tools replace. */
function shellCommandsOf(...tools: string[]): string[] {
  return tools.flatMap((tool) => [...(findRow(tool).shell ?? [])]);
}

/**
 * The core prompt block: substitution table, fallback line, free-text line and
 * the MANDATORY callout. It starts with the "Required Substitutions" heading and
 * ends with the callout; the caller supplies the section title and the text
 * around it.
 */
export function renderCoreSubstitutionBlock(
  options?: ToolGuidanceRenderOptions,
): string {
  const rows = enabledRows(options).flatMap((row) =>
    row.core ? [`| ${row.core.insteadOf} | ${row.core.call} | ${row.core.why} |`] : [],
  );
  const textTools = ['ptah_grep', 'ptah_read_symbol'] as const;
  const shell = joinOr(shellCommandsOf(...textTools));
  return [
    '### Required Substitutions — Use These Tools Directly',
    '',
    '| Instead of... | CALL THIS TOOL | Why |',
    '|------|------|------|',
    ...rows,
    '',
    'Fall back to Bash, Grep or Glob only for **writes**, build/test/git, a ptah error, or one Grep after zero hits.',
    `Free text and line ranges: ${textTools[0]} and ${textTools[1]}, not shell ${shell}.`,
    '',
    '> [!IMPORTANT]',
    '> **Symbol and AST lookups are MANDATORY via ptah before Grep/Glob.** To find a function, class, method or type, call `ptah_code_search_symbols` or `ptah_ast_analyze` FIRST, then read the body with `ptah_read_symbol`. Fall back to Grep only after those return no results or an error.',
  ].join('\n');
}

/** The lane policy table (header and rows, no trailing newline). */
export function renderLaneToolTable(
  options?: ToolGuidanceRenderOptions,
): string {
  const rows = enabledRows(options)
    .flatMap((row) => (row.lane ? [row.lane] : []))
    .sort((a, b) => a.order - b.order);
  const width = Math.max(...rows.map((row) => row.need.length)) + 1;
  return [
    `${'Need'.padEnd(width)}| Prefer`,
    ...rows.map((row) => `${row.need.padEnd(width)}| ${row.prefer}`),
  ].join('\n');
}

/**
 * The phrase a tool description adds to name the shell commands the tool
 * replaces, or `undefined` when the row has no cue.
 */
export function toolDescriptionCue(tool: string): string | undefined {
  const row = findRow(tool);
  if (!row.cue || !row.shell?.length) return undefined;
  return `Use instead of shell ${joinOr(row.shell)}.`;
}
