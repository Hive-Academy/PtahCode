/**
 * Renderers for the tool substitution rows. Each is a pure function of
 * `TOOL_SUBSTITUTIONS`; the text a renderer cannot derive from a row (the
 * fallback line, the MANDATORY callout) is fixed here, next to the rows. That
 * fixed text names a few tools itself; `tool-guidance-drift.spec.ts` in
 * `vscode-lm-tools` fails when it names one that the tool list does not have.
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

const FALLBACK_LINE =
  'Fall back to Bash, Grep or Glob only for **writes**, build/test/git, a ptah error, or one Grep after zero hits.';

/** "Free text and line ranges: ptah_grep and ptah_read_symbol, not shell grep, rg, sed -n or cat." */
function freeTextLine(): string {
  const textTools = ['ptah_grep', 'ptah_read_symbol'] as const;
  const shell = joinOr(shellCommandsOf(...textTools));
  return `Free text and line ranges: ${textTools[0]} and ${textTools[1]}, not shell ${shell}.`;
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
  return [
    '### Required Substitutions — Use These Tools Directly',
    '',
    '| Instead of... | CALL THIS TOOL | Why |',
    '|------|------|------|',
    ...rows,
    '',
    FALLBACK_LINE,
    freeTextLine(),
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

/** `description`, led by the tool's cue when its row has one. */
export function withToolCue(tool: string, description: string): string {
  const cue = toolDescriptionCue(tool);
  return cue ? `${cue} ${description}` : description;
}

/** Heading of the generated part of the agent-file tooling block. */
export const AGENT_TOOLING_HEADING = '## Working rules';

/**
 * The "Working rules" part of the agent-file tooling block: the ptah-first
 * rule, the fallback rule and one table of native step -> ptah tool.
 * Starts with {@link AGENT_TOOLING_HEADING}; no trailing newline.
 */
export function renderAgentToolingRules(
  options?: ToolGuidanceRenderOptions,
): string {
  const rows = enabledRows(options).flatMap((row) =>
    row.core
      ? [`| ${row.core.insteadOf.replace(/\*\*/g, '')} | ${row.core.call} |`]
      : [],
  );
  return [
    AGENT_TOOLING_HEADING,
    '',
    '- `ptah_*` tools first; `ptah_get_diagnostics` after edits. A deferred ptah tool counts as listed: if your client defers tool schemas, load it with its tool-search tool (Claude Code: `ToolSearch` `select:<name>`), otherwise call it directly. A tool that is not listed at all: use the native one, do not probe.',
    '- Use native Bash, Grep or Glob only for writes, build and test commands, a ptah error, or one Grep after zero hits; then name the tool that returned nothing.',
    `- ${freeTextLine()}`,
    '',
    '| Native step | Ptah tool |',
    '| --- | --- |',
    ...rows,
    '',
    'Writes, build and test commands stay native.',
  ].join('\n');
}

/**
 * Replace the "Working rules" part of a downloaded `tooling-precedence` block
 * with the generated rules and keep every other section. A text with no
 * "Working rules" heading is returned unchanged, so a template set that
 * dropped the heading still loads.
 */
export function applyAgentToolingRules(
  blockText: string,
  options?: ToolGuidanceRenderOptions,
): string {
  // Line-anchored and outside code fences: `### Working rules`, a mention in
  // prose or a `## ` line inside a fenced example is not a section heading.
  const headings = sectionHeadings(blockText);
  const heading = headings.find((candidate) =>
    /^## Working rules[ \t]*\r?$/.test(candidate.text),
  );
  if (!heading) return blockText;
  const next = headings.find((candidate) => candidate.start > heading.start);
  const rest = next ? `\n\n${blockText.slice(next.start)}` : '';
  return `${blockText.slice(0, heading.start)}${renderAgentToolingRules(options)}${rest}`;
}

/** The `## ` heading lines of a Markdown text, skipping fenced code blocks. */
function sectionHeadings(text: string): Array<{ start: number; text: string }> {
  const headings: Array<{ start: number; text: string }> = [];
  let fence: string | undefined;
  let offset = 0;
  for (const line of text.split('\n')) {
    const marker = /^\s*(```|~~~)/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
    } else if (!fence && line.startsWith('## ')) {
      headings.push({ start: offset, text: line });
    }
    offset += line.length + 1;
  }
  return headings;
}
