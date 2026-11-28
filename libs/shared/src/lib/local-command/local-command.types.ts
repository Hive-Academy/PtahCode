/**
 * Typed reports parsed from the stdout of Claude Code local commands
 * (`/usage`, `/context`). Host-neutral: plain data, no runtime imports.
 */

/** A weekly (or session) plan limit line, e.g. `Current week (Fable): 4% used · resets …`. */
export interface UsageLimit {
  /** The scope in parentheses (`all models`, `Fable`), or the window text when absent. */
  readonly label: string;
  /** The window text before the scope, e.g. `Current week`. */
  readonly window: string;
  readonly pct: number;
  /** The reset text after the separator, e.g. `resets Dec 5, 5am (Africa/Cairo)`. */
  readonly reset: string | null;
}

/** One `NN%  label · hint` contributor line of a usage window. */
export interface UsageContributor {
  readonly pct: number;
  readonly label: string;
  readonly hint: string | null;
}

/** A named share inside a `Top …:` line. */
export interface UsageShare {
  readonly name: string;
  readonly pct: number;
}

/** A `Top skills: …` / `Top subagents: …` / `Top MCP servers: …` line. */
export interface UsageTopList {
  /** The kind after `Top`, e.g. `skills`, `subagents`, `MCP servers`. */
  readonly kind: string;
  readonly items: readonly UsageShare[];
  /** The `+N more` count, 0 when absent. */
  readonly more: number;
}

/** A `Last 24h · 427 requests · 15 sessions` block. */
export interface UsageWindow {
  /** e.g. `Last 24h`. */
  readonly title: string;
  readonly requests: number | null;
  readonly sessions: number | null;
  readonly contributors: readonly UsageContributor[];
  readonly tops: readonly UsageTopList[];
}

export interface UsageReport {
  readonly kind: 'usage';
  /** Lines before the first limit that are not headings (e.g. the subscription note). */
  readonly notes: readonly string[];
  readonly limits: readonly UsageLimit[];
  readonly windows: readonly UsageWindow[];
}

/** A token count as printed (`11.8k`, `1m`, `~140`) and its numeric value. */
export interface TokenCount {
  readonly value: number;
  readonly text: string;
}

export interface ContextCategory {
  readonly name: string;
  readonly tokens: TokenCount;
  readonly pct: number | null;
}

/** A row of the MCP tools / custom agents / skills tables. */
export interface ContextItem {
  readonly name: string;
  /** The server (MCP tools) or the source (agents, skills). */
  readonly source: string | null;
  readonly tokens: TokenCount;
}

/** A memory file row. The path is deliberately not kept: it holds home directories. */
export interface ContextMemoryFile {
  readonly type: string;
  readonly tokens: TokenCount;
}

export interface ContextReport {
  readonly kind: 'context';
  readonly model: string | null;
  readonly used: TokenCount | null;
  readonly total: TokenCount | null;
  readonly usedPct: number | null;
  readonly categories: readonly ContextCategory[];
  readonly mcpTools: readonly ContextItem[];
  readonly customAgents: readonly ContextItem[];
  readonly memoryFiles: readonly ContextMemoryFile[];
  readonly skills: readonly ContextItem[];
}
