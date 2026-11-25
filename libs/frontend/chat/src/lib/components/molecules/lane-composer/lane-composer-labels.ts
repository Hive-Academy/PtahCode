import type { EffortLevel, LaneEffectiveApproval } from '@ptah-extension/shared';
import {
  COMPOSER_EFFORT_OPTIONS,
  type ComposerEffortOption,
} from '../composer-controls/composer-effort-picker.component';
import type { LaneRestart } from './lane-delivery.controller';

/** Main chat's effort descriptions name Claude's model tier; other CLIs have none. */
const CLAUDE_TIER_SUFFIX = ' (Opus tier)';

/**
 * Resume session: the Send-sized circle in the primary tint. A resume is no
 * error; the composer keeps the error tint (Stop's class) for a lane that failed.
 */
export const RESUME_BUTTON_CLASS =
  'inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]';

/**
 * A lane effort id as an effort option; main chat's levels keep their look.
 * The Claude model tier in a description shows on Claude lanes only.
 */
export function laneEffortOption(id: string, claude: boolean): ComposerEffortOption {
  const known = COMPOSER_EFFORT_OPTIONS.find((option) => option.value === id);
  if (known) {
    return claude || !known.description.endsWith(CLAUDE_TIER_SUFFIX)
      ? known
      : { ...known, description: known.description.slice(0, -CLAUDE_TIER_SUFFIX.length) };
  }
  return {
    value: id as EffortLevel,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    description: '',
    dotColor: 'bg-base-content/40',
    textColor: 'text-base-content-muted',
    bars: 3,
  };
}

/** A composer control the lane cannot use here, and why. */
export interface LaneLimitation {
  readonly control: string;
  readonly reason: string;
}

/** The reasons the composer already shows per control; null when the control works. */
export interface LaneLimitationSources {
  readonly model: string | null;
  readonly effort: string | null;
  readonly images: string | null;
  readonly approval: LaneEffectiveApproval | undefined;
  readonly sendNow: string | null;
}

/**
 * The controls of the "N limited" badge. The approval mode is no limit (its
 * chip explains it); only an approval mode the lane did not report counts.
 */
export function laneLimitations(sources: LaneLimitationSources): readonly LaneLimitation[] {
  const { approval } = sources;
  const entries: readonly { readonly control: string; readonly reason: string | null }[] = [
    { control: 'Model', reason: sources.model },
    { control: 'Effort', reason: sources.effort },
    { control: 'Images', reason: sources.images },
    {
      control: 'Approval',
      reason: !approval || approval.mode === 'unknown'
        ? (approval?.reason ?? 'The lane did not report its approval mode.')
        : null,
    },
    { control: 'Send now', reason: sources.sendNow },
  ];
  return entries.filter((entry): entry is LaneLimitation => !!entry.reason);
}

/** The badge's tooltip: each limited control with its reason (the panel keeps one paragraph). */
export function limitedTooltip(items: readonly LaneLimitation[]): string {
  return items.map(({ control, reason }) => `${control}: ${reason}`).join(' ');
}

/** The badge's accessible name: the count and which controls. */
export function limitedLabel(items: readonly LaneLimitation[]): string {
  const noun = items.length === 1 ? 'control is' : 'controls are';
  return `${items.length} ${noun} limited on this lane: ${items.map((item) => item.control).join(', ')}`;
}

/** The field placeholder: a message continues a warm lane, resumes a cold one, or starts a handoff. */
export function lanePlaceholder(label: string, stopped: boolean, restart: LaneRestart): string {
  if (!stopped) return `Message ${label}...`;
  if (restart === 'warm') return `Continue ${label} with a message…`;
  if (restart === 'fresh') return `Message ${label} to start a fresh handoff…`;
  return `Resume ${label} with a message…`;
}

/** The Send button's accessible name for the same states. */
export function laneSendLabel(stopped: boolean, restart: LaneRestart): string {
  if (!stopped || restart === 'fresh') return 'Send message';
  return restart === 'warm' ? 'Continue with message' : 'Resume with message';
}

/** The lane's state as the composer toolbar chip: a short label, the full detail in its tooltip. */
export interface LaneStateChip {
  readonly label: string;
  readonly detail: string;
  /** `idle` informs, `need` asks for attention, `err` is announced at once. */
  readonly tone: 'idle' | 'need' | 'err';
}
