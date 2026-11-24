/**
 * Pure view model of the inspector AGENTS list: one row per agent (the
 * Orchestrator included) with model, tokens (In / out in the tooltip), cost
 * and status. A figure nobody reported renders `—`, never 0; a cost whose
 * model has no published rate renders "Not priced".
 */
import {
  AGENT_KIND_LABEL,
  agentAccessibleLabel,
  formatCost,
  formatTokenCount,
  formatUsageCost,
  formatUsageTokens,
  NOT_PRICED,
  type AgentStatusWord,
  type UsageAmount,
} from '@ptah-extension/chat-ui';
import { formatDuration } from '@ptah-extension/ui';
import type { SessionAgent } from '../../../services/session-agents/session-agent-roster';
import type { TrayAgentContext } from '../../../services/session-agents/session-agent-tray';
import type { InspectorRequest } from '../../../services/session-inspector';

export const NOT_REPORTED_VALUE = '—';
export const NOT_REPORTED_TITLE = 'not reported';
export const UNKNOWN_AGENT_DURATION = '--:--';

const STATUS_INK: Readonly<Record<AgentStatusWord, string>> = {
  starting: 'text-info',
  running: 'text-state-run',
  waiting: 'text-state-need',
  queued: 'text-base-content-muted',
  done: 'text-state-done',
  failed: 'text-state-err',
  stopped: 'text-base-content-muted',
};

export interface AgentListRow {
  readonly key: string;
  readonly agent: SessionAgent;
  readonly name: string;
  /** Second line: the model, or the kind (`CLI lane`) when no model is known. */
  readonly secondary: string;
  readonly secondaryTitle: string | null;
  readonly startedAtTitle: string | null;
  readonly statusText: string;
  readonly statusInk: string;
  readonly tokens: string;
  /** Tokens tooltip: `In 1.1M · Out 48.0k`; `not reported` when unknown. */
  readonly tokensTitle: string;
  readonly cost: string;
  readonly usage: AgentUsageFigures;
  readonly time: string;
  readonly usageLabel: string;
  readonly ariaLabel: string;
  readonly requests: readonly InspectorRequest[];
  readonly tray: TrayAgentContext | null;
  readonly hasActions: boolean;
}

/** Token figures of one agent; `partial` marks a lower bound. */
export interface AgentUsageFigures {
  readonly tokens: number | null;
  readonly tokensPartial: boolean;
  readonly cost: number | null;
  /** A null `cost` is a model without a published rate: "Not priced". */
  readonly costNotPriced?: boolean;
  readonly costPartial: boolean;
  /** Estimated lane cost (`~$`) rather than a reported session cost. */
  readonly costEstimated: boolean;
  readonly input: number | null;
  readonly output: number | null;
}

export interface AgentRowInput {
  readonly agent: SessionAgent;
  readonly name?: string;
  readonly secondary: string;
  readonly secondaryTitle: string | null;
  readonly usage: AgentUsageFigures;
  readonly durationMs: number | null;
  readonly usageAmounts?: {
    readonly tokens: UsageAmount;
    readonly cost: UsageAmount;
  };
  readonly requests: readonly InspectorRequest[];
  readonly tray: TrayAgentContext | null;
  readonly hasActions: boolean;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function tokensText(value: number | null, partial: boolean): string | null {
  return finite(value)
    ? `${partial ? '≥ ' : ''}${formatTokenCount(value)}`
    : null;
}

function costText(usage: AgentUsageFigures): string | null {
  if (!finite(usage.cost)) return usage.costNotPriced ? NOT_PRICED : null;
  return `${usage.costPartial ? '≥ ' : ''}${usage.costEstimated ? '~' : ''}${formatCost(usage.cost)}`;
}

/** `In 1.1M · Out 48.0k`; one unknown side shows `—`, both unknown is `null`. */
export function inOutText(
  input: number | null,
  output: number | null,
): string | null {
  if (!finite(input) && !finite(output)) return null;
  const side = (value: number | null) =>
    finite(value) ? formatTokenCount(value) : NOT_REPORTED_VALUE;
  return `In ${side(input)} · Out ${side(output)}`;
}

/** One list row. */
export function agentListRow(input: AgentRowInput): AgentListRow {
  const { agent, usage } = input;
  const name = input.name ?? agent.name;
  const tokens = input.usageAmounts && usage.tokens !== null
    ? formatUsageTokens(input.usageAmounts.tokens)
    : tokensText(usage.tokens, usage.tokensPartial);
  const cost = input.usageAmounts && usage.cost !== null
    ? formatUsageCost(input.usageAmounts.cost)
    : costText(usage);
  const inOut = inOutText(usage.input, usage.output);
  const usageFacts = `${
    tokens === null
      ? 'Tokens not reported'
      : `${tokens} tokens${inOut === null ? '' : ` (${inOut})`}`
  }; ${
    cost === null
      ? 'Cost not reported'
      : cost === NOT_PRICED
        ? 'Cost not priced'
        : `cost ${cost}`
  }`;
  const usageLabel = input.name ? `${name}. ${usageFacts}` : usageFacts;
  // The second line shows a model only when one is known (it has a title).
  const model =
    input.secondaryTitle === null ? '' : `Model ${input.secondary}. `;
  const label = agentAccessibleLabel({
    name,
    kind: agent.kind,
    status: agent.status,
    durationMs: input.durationMs,
  });
  const startedAtTitle = formatStartedAt(agent.startedAt);
  return {
    key: agent.key,
    agent,
    name,
    secondary: input.secondary,
    secondaryTitle: input.secondaryTitle,
    startedAtTitle,
    statusText: agent.status ?? NOT_REPORTED_VALUE,
    statusInk: agent.status
      ? STATUS_INK[agent.status]
      : 'text-base-content-muted',
    tokens: tokens ?? NOT_REPORTED_VALUE,
    tokensTitle: inOut ?? NOT_REPORTED_TITLE,
    cost: cost ?? NOT_REPORTED_VALUE,
    usage,
    time:
      input.durationMs === null
        ? UNKNOWN_AGENT_DURATION
        : formatDuration(input.durationMs),
    usageLabel,
    ariaLabel: `${label}. ${model}${usageLabel}${startedAtTitle ? `. ${startedAtTitle}` : ''}`,
    requests: input.requests,
    tray: input.tray,
    hasActions: input.hasActions,
  };
}

function formatStartedAt(timestamp: number | null): string | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? null
    : `Started: ${date.toLocaleString()}`;
}

/** The kind label shown on the second line of a non-Orchestrator row. */
export function agentKindLine(agent: SessionAgent): string {
  return AGENT_KIND_LABEL[agent.kind];
}

/** Orchestrator, needs you, live, then remaining lanes in store order. */
export function orderAgentList(
  orchestrator: AgentListRow | null,
  lanes: readonly AgentListRow[],
): AgentListRow[] {
  const needsYou: AgentListRow[] = [];
  const live: AgentListRow[] = [];
  const rest: AgentListRow[] = [];
  for (const row of lanes) {
    const status = row.agent.status;
    if (row.requests.length || row.agent.openRequestIds.length || status === 'waiting') {
      needsYou.push(row);
    } else if (status === 'running' || status === 'starting' || status === 'queued') {
      live.push(row);
    } else {
      rest.push(row);
    }
  }
  return [...(orchestrator ? [orchestrator] : []), ...needsYou, ...live, ...rest];
}

/**
 * The roster key of a host selection: a sub-agent that moved to the
 * background (or back) keeps its selection; an unknown key is `orchestrator`.
 */
export function normalizeAgentKey(
  key: string,
  keys: readonly string[],
): string {
  if (keys.includes(key)) return key;
  const alternate = key.startsWith('sub:')
    ? `bg:${key.slice(4)}`
    : key.startsWith('bg:')
      ? `sub:${key.slice(3)}`
      : null;
  return alternate && keys.includes(alternate) ? alternate : 'orchestrator';
}
