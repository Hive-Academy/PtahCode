import type {
  AgentProcessInfo,
  CliAdapterManifest,
  EffectiveLaneCapabilities,
  LaneCapabilitySupport,
  LaneEffectiveApproval,
  LanePromptCapabilities,
  LaneTurnInputCapabilities,
  LaneUsageCapability,
} from '@ptah-extension/shared';
import type { SdkHandle } from '../cli-adapters/cli-adapter.interface';

const supported = { state: 'supported' } as const;
const unsupported = { state: 'unsupported', reason: 'The live handle does not expose this operation.' } as const;

/** Reason used when a live handle's `turnInputSupport()` throws. */
export const LANE_OPTIONS_UNREADABLE = 'Lane options could not be read.';

type TurnInputKey = keyof LaneTurnInputCapabilities;

const TURN_INPUT_LABELS: Readonly<Record<TurnInputKey, string>> = {
  model: 'model',
  effort: 'reasoning effort',
  images: 'images',
  files: 'files',
  commands: 'commands',
  skills: 'skills',
};

function cliName(info: AgentProcessInfo): string {
  return info.ptahCliName ?? info.displayName ?? info.cli;
}

function refuse(reason: string): LaneCapabilitySupport & { readonly state: 'unsupported' } {
  return { state: 'unsupported', reason };
}

/** Every turn-input item unsupported with one reason; `blocked` is carried through. */
function allTurnInput(
  reasonFor: (key: TurnInputKey) => string,
  blocked: readonly string[],
): LaneTurnInputCapabilities {
  return {
    model: refuse(reasonFor('model')),
    effort: refuse(reasonFor('effort')),
    images: refuse(reasonFor('images')),
    files: refuse(reasonFor('files')),
    commands: { ...refuse(reasonFor('commands')), blocked },
    skills: refuse(reasonFor('skills')),
  };
}

function undeclared(info: AgentProcessInfo): (key: TurnInputKey) => string {
  return (key) => `${cliName(info)} does not declare per-turn ${TURN_INPUT_LABELS[key]}.`;
}

/** A live gate narrows a manifest item; it never turns an unsupported item on. */
function gate<T extends LaneCapabilitySupport>(declared: T, live: LaneCapabilitySupport | undefined): T {
  if (declared.state !== 'supported' || !live || live.state === 'supported') return declared;
  return { ...declared, state: 'unsupported', reason: live.reason ?? unsupported.reason };
}

function mergeBlocked(...lists: (readonly string[] | undefined)[]): readonly string[] {
  return [...new Set(lists.flatMap((list) => list ?? []))];
}

function liveTurnInput(
  info: AgentProcessInfo,
  potential: CliAdapterManifest,
  handle: SdkHandle,
): LaneTurnInputCapabilities {
  const declared = potential.turnInput;
  const staticBlocked = declared?.commands.blocked ?? [];
  let live: Partial<LaneTurnInputCapabilities>;
  try {
    live = handle.turnInputSupport?.() ?? {};
  } catch {
    // degradation-audit: reported - fails closed: every item is unsupported with a
    // reason the composer shows ("Lane options could not be read."), never supported.
    return allTurnInput(() => LANE_OPTIONS_UNREADABLE, staticBlocked);
  }
  if (!declared) return allTurnInput(undeclared(info), mergeBlocked(staticBlocked, live.commands?.blocked));
  const settings = typeof handle.applyTurnSettings === 'function';
  const needs = <T extends LaneCapabilitySupport>(item: T, present: boolean): T =>
    item.state === 'supported' && !present ? { ...item, state: 'unsupported', reason: unsupported.reason } : item;
  // Images ride as a content parameter, which is invisible at runtime: the
  // handle must advertise them through its live gate.
  const images = declared.images.state === 'supported' && live.images?.state !== 'supported'
    ? { ...declared.images, state: 'unsupported' as const, reason: live.images?.reason ?? unsupported.reason }
    : declared.images;
  return {
    model: gate(needs(declared.model, settings), live.model),
    effort: gate(needs(declared.effort, settings), live.effort),
    images,
    files: gate(declared.files, live.files),
    commands: {
      ...gate(declared.commands, live.commands),
      blocked: mergeBlocked(staticBlocked, live.commands?.blocked),
    },
    skills: gate(declared.skills, live.skills),
  };
}

/** Reason a stopped lane refuses images when its cold resume cannot carry them. */
export const LANE_IMAGES_NEED_RUNNING_TEXT = 'Images need a running lane.';

/**
 * Images on a cold resume: only when the manifest says the resumed first turn
 * carries them (`images.onResume`). A lane bound to a named account resumes
 * through an admission gate whose first turn is text only, so it refuses.
 */
function restoredImages(info: AgentProcessInfo, declared: LaneTurnInputCapabilities): LaneTurnInputCapabilities['images'] {
  // The record carries the run's account fields (`laneAccountFields`), also a corrupt one.
  const account = info as { readonly accountBinding?: unknown; readonly accountBindingId?: unknown };
  const named = account.accountBinding !== undefined || account.accountBindingId !== undefined;
  return declared.images.state === 'supported' && declared.images.onResume === true && !named
    ? declared.images
    : refuse(LANE_IMAGES_NEED_RUNNING_TEXT);
}

/** What a cold resume can carry: model, effort, files, the raw command prompt and, when declared, images. */
function restoredTurnInput(info: AgentProcessInfo, potential: CliAdapterManifest): LaneTurnInputCapabilities {
  const declared = potential.turnInput;
  const blocked = declared?.commands.blocked ?? [];
  if (!declared) return allTurnInput(undeclared(info), blocked);
  return {
    model: declared.model,
    effort: declared.effort,
    images: restoredImages(info, declared),
    files: declared.files,
    commands: { ...declared.commands, blocked },
    skills: declared.skills,
  };
}

function usageOf(info: AgentProcessInfo, potential: CliAdapterManifest): LaneUsageCapability {
  return potential.usage ?? { timing: 'turn-end', reason: `${cliName(info)} does not declare when it reports usage.` };
}

function promptsOf(info: AgentProcessInfo, potential: CliAdapterManifest): LanePromptCapabilities {
  if (potential.prompts) return potential.prompts;
  const reason = `${cliName(info)} does not declare which prompts reach the host.`;
  return { approvals: refuse(reason), questions: refuse(reason) };
}

const APPROVAL_SOURCE: Readonly<Record<NonNullable<NonNullable<AgentProcessInfo['effectivePolicy']>['permissionSource']>, string>> = {
  spawn: 'Set when the lane was spawned.',
  saved: 'Set at spawn from the saved lane default.',
  'built-in': 'Set at spawn from the built-in default.',
  'parent-plan': 'Set at spawn from the parent plan mode.',
};

function approvalOf(
  info: AgentProcessInfo,
  potential: CliAdapterManifest,
  prompts: LanePromptCapabilities,
): LaneEffectiveApproval {
  const policy = info.effectivePolicy;
  const mode = policy?.permission;
  const promptText = prompts.approvals.state === 'supported'
    ? 'Approval prompts can appear here.'
    : 'Approval prompts do not reach Ptah from this lane.';
  if (!mode) {
    return { mode: 'unknown', reason: `${cliName(info)} did not report its approval mode. ${promptText}` };
  }
  const declared = potential.permissionModes[mode];
  const source = (policy?.permissionSource && APPROVAL_SOURCE[policy.permissionSource]) ?? 'Set at spawn.';
  const native = declared?.nativeMode ? ` Native mode: ${declared.nativeMode}.` : '';
  return { mode, reason: `${source}${native} ${promptText}` };
}

/** A live operation is effective only when its handle actually exposes it. */
export function resolveEffectiveLaneCapabilities(
  info: AgentProcessInfo,
  potential: CliAdapterManifest,
  handle?: SdkHandle,
  released = false,
  now = Date.now(),
): EffectiveLaneCapabilities {
  const usage = usageOf(info, potential);
  const prompts = promptsOf(info, potential);
  const effectiveApproval = approvalOf(info, potential, prompts);
  if (!handle || released) {
    return {
      agentId: info.agentId,
      resolvedAt: now,
      source: 'restored-record',
      messaging: {
        steer: unsupported,
        interrupt: unsupported,
        continuation: unsupported,
        resume: info.cliSessionId ? potential.messaging.resume : unsupported,
      },
      mcp: potential.mcp,
      turnInput: restoredTurnInput(info, potential),
      usage,
      prompts,
      effectiveApproval,
    };
  }
  const steer = typeof handle.steer === 'function' && handle.supportsSteer?.() !== false;
  return {
    agentId: info.agentId,
    resolvedAt: now,
    source: 'live-handle',
    messaging: {
      steer: steer ? supported : unsupported,
      interrupt: handle.supportsInterrupt?.() === true && typeof handle.interrupt === 'function' ? supported : unsupported,
      continuation: handle.supportsContinuation?.() === true && typeof handle.continue === 'function' ? supported : unsupported,
      resume: potential.messaging.resume,
    },
    mcp: potential.mcp,
    turnInput: liveTurnInput(info, potential, handle),
    usage,
    prompts,
    effectiveApproval,
  };
}
