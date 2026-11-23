/**
 * Shared types of the offline navigation benchmark (TASK_2026_2299_d6f5).
 * A task has three strategies. Each strategy is a list of steps run in order.
 */

export type NavTaskKind =
  | 'read-symbol'
  | 'read-range'
  | 'find-usages-text'
  | 'find-by-concept'
  | 'outline'
  | 'find-usages-symbol'
  | 'find-files';

export const NAV_TASK_KINDS: readonly NavTaskKind[] = [
  'read-symbol',
  'read-range',
  'find-usages-text',
  'find-by-concept',
  'outline',
  'find-usages-symbol',
  'find-files',
];

/** A shell command run at the repository root (rg, sed -n, cat, ...). */
export interface ShellStep {
  readonly shell: string;
}

/** A ptah MCP tool call, run through the real dispatcher (`tools/call`). */
export interface ToolStep {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export type NavStep = ShellStep | ToolStep;

export type NavStrategyName = 'shell' | 'before' | 'after';

export interface NavTask {
  readonly id: string;
  readonly kind: NavTaskKind;
  /** One sentence: what the agent wants to know. */
  readonly question: string;
  /** Redacted origin, e.g. "claude-bash: sed -n on session-spawner". No personal data. */
  readonly source: string;
  /** Literal substrings that a correct answer must contain (all of them). */
  readonly expect: readonly string[];
  /** Workspace-relative file the expect strings are checked against (for the integrity spec). */
  readonly expectFile?: string;
  readonly strategies: Readonly<Record<NavStrategyName, readonly NavStep[]>>;
}

export interface StepResult {
  readonly step: NavStep;
  readonly output: string;
  readonly tokens: number;
  /** `unavailable` = the tool name is not served; `error` = the call failed. */
  readonly status: 'ok' | 'unavailable' | 'unavailable-offline' | 'error';
  readonly error?: string;
  /** First 300 chars of `output`; the JSON report keeps this instead of `output`. */
  readonly outputHead?: string;
}

export interface StrategyResult {
  readonly calls: number;
  readonly tokens: number;
  readonly correct: boolean;
  readonly missing: readonly string[];
  readonly steps: readonly StepResult[];
}

export interface TaskResult {
  readonly id: string;
  readonly kind: NavTaskKind;
  readonly strategies: Partial<Record<NavStrategyName, StrategyResult>>;
}

export interface BenchmarkRun {
  readonly gitSha: string;
  readonly date: string;
  readonly rgVersion: string;
  readonly tokenizer: string;
  readonly taskCount: number;
  readonly results: readonly TaskResult[];
  readonly totals: Partial<
    Record<
      NavStrategyName,
      { calls: number; tokens: number; correct: number; tasks: number }
    >
  >;
}
