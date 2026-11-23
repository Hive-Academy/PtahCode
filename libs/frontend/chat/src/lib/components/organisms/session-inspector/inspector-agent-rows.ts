import { computed, effect, inject, linkedSignal, type Signal } from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { AgentMonitorStore, type MonitoredAgent } from '@ptah-extension/chat-streaming';
import {
  agentRunDurationMs,
  cliContribution,
  isRunningAgentWord,
  orchestratorModel,
  orchestratorUsage as subtractSdkLanes,
  sdkContribution,
  sessionTotal,
  type CliCoverage,
  type InspectorLaneRunDetail,
  type UsageAmount,
  type UsageContribution,
  type UsageMetric,
  type UsageTotal,
} from '@ptah-extension/chat-ui';
import { ModelStateService, injectWallClock } from '@ptah-extension/core';
import { resolveModelDisplayName } from '@ptah-extension/shared';
import { SessionAgentRosterService } from '../../../services/session-agents/session-agent-roster.service';
import { SessionAgentTrayService } from '../../../services/session-agents/session-agent-tray.service';
import { SessionInspectorStore } from '../../../services/session-inspector';
import { cliLaneStats, resolveCliLaneUsage } from '../../../utils/lane-stats.adapters';
import { parseLaneKey } from '../../molecules/compact-session/compact-lane-rows';
import { trayEntryHasAction } from './inspector-agent-actions-menu.component';
import { agentKindLine, agentListRow, orderAgentList, type AgentListRow } from './inspector-agent-list';
import { laneUsage } from './inspector-agent-usage';

export interface InspectorAgentRows {
  readonly rows: Signal<readonly AgentListRow[] | null>;
  readonly contributions: Signal<readonly UsageContribution[]>;
  readonly totals: Signal<Readonly<Record<UsageMetric, UsageTotal>>>;
  readonly orchestratorUsage: Signal<Readonly<Record<UsageMetric, UsageAmount>>>;
  readonly captionCounts: Signal<{
    readonly running: number | null;
    readonly needsYou: number;
  }>;
  readonly cliCoverage: Signal<Readonly<Record<UsageMetric, CliCoverage>>>;
}

function addGap(amount: UsageAmount, cause: string): UsageAmount {
  return { ...amount, lowerBound: true, causes: [...amount.causes, cause] };
}

function projectCliLane(lane: MonitoredAgent) {
  const { usage, structured } = resolveCliLaneUsage(lane);
  const stats = cliLaneStats(lane);
  const contribution = cliContribution({
    kind: 'cli',
    id: lane.agentId,
    label: lane.displayName || lane.cli,
    provider: lane.providerId,
    usage,
    cost: stats.cost ?? null,
    costEstimated: stats.cost != null && usage?.costUsd == null,
  });
  if (contribution === null) throw new Error('Expected a CLI usage contribution');

  const { label, tokens, cost } = contribution;
  const lostOutput = structured === null && lane.outputLostAfter !== undefined;
  return {
    usage,
    model: stats.model,
    contribution: {
      ...contribution,
      tokens: lane.restored && tokens.value === null
        ? addGap(tokens, `${label}: restored lane is missing token usage`)
        : lostOutput ? addGap(tokens, `${label}: some CLI output was lost`) : tokens,
      cost: lane.restored && cost.value === null
        ? addGap(cost, `${label}: restored lane is missing cost`)
        : lostOutput ? addGap(cost, `${label}: some CLI output was lost`) : cost,
    },
  };
}

/** Read once per mounted inspector and share the results across its surfaces. */
export function injectInspectorAgentRows(
  tabId: Signal<string>,
  sessionId: Signal<string | null>,
  laneRuns: Signal<readonly InspectorLaneRunDetail[]>,
): InspectorAgentRows {
  const monitor = inject(AgentMonitorStore);
  const tabs = inject(TabManagerService);
  const inspector = inject(SessionInspectorStore);
  const roster = inject(SessionAgentRosterService);
  const trayService = inject(SessionAgentTrayService);
  const modelState = inject(ModelStateService);

  const model = computed(() => inspector.modelFor(tabId())());
  const tab = computed(() => {
    tabs.backgroundTabsRevision();
    return tabs.findTabByIdAcrossWorkspaces(tabId())?.tab ?? null;
  });
  const snapshot = computed(() => {
    const stats = tab()?.sessionStats ?? null;
    return stats?.sessionId === sessionId() ? stats : null;
  });
  const activeCli = computed(() => {
    const id = sessionId();
    const lanes = id ? monitor.agentsOwnedBySession(id) : [];
    return new Map(lanes.map((lane) => [lane.agentId, projectCliLane(lane)]));
  });
  const retained = linkedSignal({
    source: () => ({
      sessionId: sessionId(),
      active: activeCli(),
      all: sessionId() ? monitor.agents() : [],
    }),
    computation: ({ sessionId, active, all }, previous): ReadonlyMap<string, UsageContribution> => {
      const next = new Map<string, UsageContribution>();
      if (previous && previous.source.sessionId === sessionId) {
        const present = new Set(all.map((lane) => lane.agentId));
        for (const [id, usage] of previous.value) {
          if (!present.has(id)) next.set(id, usage);
        }
      }
      for (const [id, { contribution }] of active) next.set(id, contribution);
      return next;
    },
  });
  // Record observed lanes even when none of the mounted surfaces reads totals yet.
  effect(() => { retained(); });

  const contributions = computed(() => [sdkContribution(snapshot()), ...retained().values()]);
  const cliCoverage = computed(() => {
    const tokens: string[] = [];
    const cost: string[] = [];
    const active = activeCli();
    for (const [id, lane] of retained()) {
      const removed = !active.has(id);
      for (const [metric, causes] of [['tokens', tokens], ['cost', cost]] as const) {
        const usage = lane[metric];
        if (usage.lowerBound) causes.push(...usage.causes);
        if (removed && usage.value === null) {
          causes.push(`${lane.label}: removed lane has no retained ${metric}`);
        }
      }
    }
    return {
      tokens: { complete: tokens.length === 0, causes: tokens },
      cost: { complete: cost.length === 0, causes: cost },
    };
  });
  const totals = computed(() => {
    const usage = contributions();
    const coverage = cliCoverage();
    return {
      tokens: sessionTotal(usage, coverage.tokens, 'tokens'),
      cost: sessionTotal(usage, coverage.cost, 'cost'),
    };
  });

  const agentData = computed(() => model().agents.data);
  const orchestratorAgent = computed(() =>
    roster.roster(tabId()).find((agent) => agent.kind === 'orchestrator') ?? null,
  );
  const captionCounts = computed(() => {
    const data = agentData();
    const running = data === null
      ? null
      : data.rows.filter(({ agent }) => isRunningAgentWord(agent.status)).length +
        Number(isRunningAgentWord(orchestratorAgent()?.status ?? null));
    return { running, needsYou: model().needsYouCount };
  });
  const hasRunning = computed(() => (captionCounts().running ?? 0) > 0);
  const now = injectWallClock('second', hasRunning);
  const extras = computed(() =>
    trayService.extrasFor(sessionId(), agentData()?.rows.map(({ agent }) => agent) ?? []),
  );
  const roles = computed(() => new Map(laneRuns().map(({ runId, role }) => [runId, role])));
  const lanes = computed(() => {
    const data = agentData();
    if (data === null) return null;
    const time = hasRunning() ? now() : Date.now();
    const cli = activeCli();
    const subagents = monitor.subagents();
    const trayExtras = extras();
    const models = modelState.availableModels();
    return data.rows.map(({ agent, requests }) => {
      const key = parseLaneKey(agent.key);
      const extra = trayExtras.get(agent.key);
      const tray = extra?.tray ?? null;
      const cliLane = key?.kind === 'cli' ? cli.get(key.id) : undefined;
      const { usage, modelRaw } = cliLane
        ? {
            usage: {
              tokens: cliLane.contribution.tokens.value,
              tokensPartial: cliLane.contribution.tokens.lowerBound,
              cost: cliLane.contribution.cost.value,
              costPartial: cliLane.contribution.cost.lowerBound,
              costEstimated: cliLane.contribution.cost.estimated,
              input: cliLane.usage?.inputTokens ?? null,
              output: cliLane.usage?.outputTokens ?? null,
            },
            modelRaw: cliLane.model,
          }
        : laneUsage(agent, {
            subagent: key?.kind === 'subagent' || key?.kind === 'background'
              ? subagents.get(key.id) ?? null
              : null,
            cli: null,
            trayTokens: extra?.tokens ?? null,
            trayModel: extra?.model ?? null,
          }, time);
      const role = key?.kind === 'cli' ? roles().get(key.id) : null;
      return agentListRow({
        agent,
        name: role ? `${agent.name} · ${role}` : agent.name,
        secondary: modelRaw ? resolveModelDisplayName(modelRaw, models) : agentKindLine(agent),
        secondaryTitle: modelRaw ? `${agentKindLine(agent)} · ${modelRaw}` : null,
        usage,
        usageAmounts: cliLane?.contribution,
        durationMs: agentRunDurationMs({
          running: isRunningAgentWord(agent.status),
          startedAt: agent.startedAt,
          endedAt: agent.endedAt,
          reportedMs: tray?.entry.durationMs,
        }, time),
        requests,
        tray,
        hasActions: tray !== null && trayEntryHasAction(tray.entry),
      });
    });
  });
  const orchestratorUsage = computed(() => {
    const usage = subtractSdkLanes(snapshot(), lanes() ?? []);
    return {
      tokens: { ...usage.tokens, estimated: true, lowerBound: false },
      cost: { ...usage.cost, estimated: true, lowerBound: false },
    };
  });
  const rows = computed(() => {
    const laneRows = lanes();
    if (laneRows === null) return null;
    const agent = orchestratorAgent();
    if (agent === null) return orderAgentList(null, laneRows);
    const card = model().orchestrator;
    const stats = snapshot();
    const live = tab()?.liveModelStats ?? null;
    const modelRaw = live?.model || stats?.contextSnapshot?.model || card.model;
    const usage = orchestratorUsage();
    // The session split describes the Orchestrator only when no SDK lanes share it.
    const split = laneRows.some((row) => row.key.startsWith('sub:') || row.key.startsWith('bg:'))
      ? null
      : stats?.tokens;
    return orderAgentList(agentListRow({
      agent,
      secondary: modelRaw
        ? resolveModelDisplayName(modelRaw, modelState.availableModels())
        : orchestratorModel(live, stats),
      secondaryTitle: modelRaw,
      usage: {
        tokens: usage.tokens.value,
        tokensPartial: usage.tokens.lowerBound,
        cost: usage.cost.value,
        costEstimated: usage.cost.estimated,
        costPartial: usage.cost.lowerBound,
        input: split?.input ?? null,
        output: split?.output ?? null,
      },
      usageAmounts: usage,
      durationMs: card.durationMs ?? null,
      requests: [],
      tray: null,
      hasActions: false,
    }), laneRows);
  });
  return { rows, contributions, totals, orchestratorUsage, captionCounts, cliCoverage };
}
