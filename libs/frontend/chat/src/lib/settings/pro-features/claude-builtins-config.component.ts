/**
 * ClaudeBuiltinsConfigComponent - "Claude Code tools & skills" card (TASK_2026_853 F-A, design-spec §1)
 *
 * Advanced tab, directly below the MCP & Browser card. Lets the user turn back on the Claude Code built-in tools,
 * terminal-only skills and claude.ai account-synced skills that Ptah sessions start without. The rows, costs and the
 * tool-to-skill dependency map come from `agent:getClaudeBuiltins` (the backend catalog and the synced-skills reader);
 * nothing here is a sample row.
 *
 * - Group 1: tools. Group 2: terminal-only skills. Group 3: account-synced skills, sent under their qualified
 *   `anthropic-skills:<name>` id and shown by plain name; a group 3 row and a group 2 row of the same name are separate
 *   opt-ins. Group 3 shows an empty state when the account has no synced skills.
 * - Every write goes through {@link SettingsSaveFeedbackService.saveGeneric} as one atomic per-item
 *   `agent:setClaudeBuiltin` call for the toggled id; the backend changes only that id in the stored list, so an
 *   opt-in another window or `ptah agent config-set` made at any time is kept. Undo sends the inverse call. On success
 *   the card shows the lists the call returns.
 * - Saves are serialized: the write and any recovery read run inside one `saveGeneric` call, whose
 *   `saving()` flag marks every toggle busy and makes {@link ClaudeBuiltinsConfigComponent.toggle} refuse a second
 *   toggle until it ends.
 * - A failed or unconfirmed write re-reads the stored lists instead of guessing a local revert, and keeps focus on the
 *   switch; if that read fails too, the card shows its load error. The toast carries a fixed sentence, never host
 *   text (D15).
 * - A failed read shows a fixed error with Retry and no rows. A capability policy that is `unverified` shows its own
 *   fixed error with Retry and the returned catalog read-only: no toggle bypasses the fail-closed policy.
 * - A write or an Undo that ends after the card was destroyed writes none of its signals; the mounted card reads the
 *   stored lists again ({@link ClaudeBuiltinsSyncService}) and keeps its controls busy until that read applied.
 * - Layout (TASK_2026_2285 F26-F33): a sticky summary bar (savings, "x of N on", filter) and three collapsible groups
 *   of {@link ClaudeBuiltinsRowComponent} rows. The filter matches the name and the description; it opens each group
 *   that has a match and hides the others. A group switch runs the same per-item call for each visible row that
 *   differs, in sequence, inside one `saveGeneric` call (one toast, one Undo).
 */

import {
  Component,
  inject,
  ChangeDetectionStrategy,
  DestroyRef,
  signal,
  effect,
  untracked,
  computed,
  OnInit,
  ElementRef,
  Injector,
  afterNextRender,
} from '@angular/core';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import {
  LucideAngularModule,
  AlertCircle,
  Inbox,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  Terminal,
  Wrench,
  X,
  Zap,
} from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  AgentGetClaudeBuiltinsResult,
  ClaudeBuiltinSkillDto,
  ClaudeBuiltinToolDto,
} from '@ptah-extension/shared';
import {
  SettingsSaveFeedbackService,
  settingNotConfirmedMessage,
  type SettingsGenericWriteResult,
} from '../feedback/settings-save-feedback.service';
import {
  PtahAlertComponent,
  PtahButtonDirective,
  PtahFormSectionComponent,
  PtahIconButtonDirective,
  PtahInputDirective,
  PtahSkeletonComponent,
} from '@ptah-extension/ui';
import {
  ClaudeBuiltinsGroupComponent,
  type BuiltinGroupId,
  type BuiltinGroupSwitchState,
} from './claude-builtins-group.component';
import { ClaudeBuiltinsRowComponent, type BuiltinKind } from './claude-builtins-row.component';
import { ClaudeBuiltinsSyncService } from './claude-builtins-sync.service';

export const COULD_NOT_LOAD_CLAUDE_BUILTINS =
  'Could not load the Claude Code tool and skill settings.';
export const CLAUDE_BUILTINS_POLICY_UNVERIFIED =
  "Could not verify this workspace's capability policy, so Claude Code tools and skills cannot be changed now.";
export const COULD_NOT_UPDATE_CLAUDE_BUILTINS =
  'Could not update Claude Code tools and skills.';

type LoadState = 'loading' | 'loaded' | 'failed' | 'unverified';
/**
 * The result of one per-item write, after the stored lists were read again where the answer left a doubt:
 * - `saved`: the host confirmed the write, or the verified re-read shows the item in the requested state;
 * - `rejected`: the host refused the write (`success: false`). Nothing else proves "not saved";
 * - `unconfirmed`: the answer was lost (timeout, transport error) and the re-read does not show the requested state.
 *   The re-read does not prove "not saved": the host can still have the write in its queue and commit it later.
 */
type ItemOutcome = 'saved' | 'rejected' | 'unconfirmed';
interface ItemWrite {
  readonly outcome: ItemOutcome;
  /** The recovery read gave no verified lists: no later write of a sequence can be confirmed. */
  readonly stop: boolean;
}
/** The ids of a sequence by outcome. An id that was not sent is `rejected` (not saved): no call was made for it. */
interface SequenceResult {
  readonly saved: readonly string[];
  readonly rejected: number;
  readonly unconfirmed: number;
}

/** What a group header shows, derived from the lists and the filter. */
interface BuiltinGroupView {
  /** A filter with no match in the group hides the group. */
  readonly shown: boolean;
  readonly expanded: boolean;
  readonly onCount: number;
  readonly total: number;
  readonly tokens: string;
  readonly switchState: BuiltinGroupSwitchState;
  readonly switchLabel: string;
}

const GROUP_HEADINGS: Readonly<Record<BuiltinGroupId, string>> = {
  tools: 'Built-in tools',
  terminal: 'Terminal-only skills',
  synced: 'Synced from claude.ai',
};
const GROUP_KINDS: Readonly<Record<BuiltinGroupId, BuiltinKind>> = { tools: 'tool', terminal: 'skill', synced: 'skill' };

/** The toast of an Undo that sent no write: its verification read was not the newest one, or was not verified. */
export const CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED =
  "Could not verify this workspace's capability policy, so nothing was undone. Try Undo again.";
/** "Restored Built-in tools (4 turned off)." - the toast of an Undo of a group switch: its own count and direction. */
export const claudeBuiltinsGroupRestored = (heading: string, count: number, on: boolean): string =>
  `Restored ${heading} (${count} turned ${on ? 'on' : 'off'}).`;

const RETRY_SELECTOR = '[data-testid="claude-tools-load-retry"]';

/** "2 of 6 changes were not saved." - the toast of a group switch that did not save every row. */
export const claudeBuiltinsGroupNotSaved = (failed: number, total: number): string =>
  `${failed} of ${total} changes were not saved.`;
/** "1 of 6 changes could not be confirmed." - writes whose answer was lost and that no re-read could settle. */
export const claudeBuiltinsGroupNotConfirmed = (unconfirmed: number, total: number): string =>
  `${unconfirmed} of ${total} changes could not be confirmed.`;

/** Rounds to at most two significant digits ("~2,000", "~850", "~25"), as the design asks for each cost. */
export function formatApproxTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '~0';
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(tokens)) - 1);
  return `~${(Math.round(tokens / magnitude) * magnitude).toLocaleString('en-US')}`;
}

/** Adds or removes `id`, leaving every other stored id (including ones this card does not show) in place. */
function withItem(list: readonly string[], id: string, on: boolean): string[] {
  const rest = list.filter((entry) => entry !== id);
  return on ? [...rest, id] : rest;
}

@Component({
  selector: 'ptah-claude-builtins-config',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahAlertComponent,
    PtahButtonDirective,
    PtahFormSectionComponent,
    PtahIconButtonDirective,
    PtahInputDirective,
    PtahSkeletonComponent,
    ClaudeBuiltinsGroupComponent,
    ClaudeBuiltinsRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- With glass on, the card inset comes from the shared Settings rule; the section adds no block padding to it. -->
    <ptah-form-section
      id="advanced-claude-tools"
      class="[[data-glass=on]_&>section]:py-0 [[data-glass=on]_&>section]:[border-bottom:0]"
      [level]="2"
      [wide]="true"
      [divider]="true"
      [icon]="WrenchIcon"
      heading="Claude Code tools & skills"
      description="Turn off tools you do not use. Each tool costs tokens on every turn."
      data-glass-surface="content"
      [attr.aria-busy]="loadState() === 'loading' ? 'true' : null"
    >
      <ptah-alert tone="info" [compact]="true" role="note" data-testid="claude-tools-applies-note">
        <lucide-angular [img]="InfoIcon" class="mr-[var(--ptah-gap-label)] inline-block size-[var(--ptah-icon-sm)] align-text-bottom" aria-hidden="true" />
        Changes apply to <strong>new sessions</strong>. Sessions that are already open keep what they started with.
        These settings apply to all your workspaces. A skill that needs a tool works only when the skill and the tool
        are on.
      </ptah-alert>

      @if (errorMessage(); as message) {
        <ptah-alert tone="error" role="alert" data-testid="claude-tools-load-error" [attr.data-state]="loadState()">
          <lucide-angular [img]="AlertCircleIcon" class="mr-[var(--ptah-gap-label)] inline-block size-[var(--ptah-icon-sm)] align-text-bottom text-error" aria-hidden="true" />
          <span>{{ message }}</span>
          <button alertAction type="button" ptahButton variant="ghost" size="xs" (click)="load()"
            data-testid="claude-tools-load-retry">
            <lucide-angular [img]="RotateCcwIcon" class="size-[var(--ptah-icon-xs)]" aria-hidden="true" />
            Retry
          </button>
        </ptah-alert>
      }
      @if (hasCatalog()) {
        @let groups = groupViews();
        <div
          class="sticky top-0 z-[var(--ptah-z-raised)] flex flex-wrap items-center gap-x-[var(--ptah-gap-heading)] gap-y-[var(--ptah-gap-controls)] rounded-[var(--ptah-radius-control)] bg-surface-2 px-[var(--ptah-gap-heading)] py-[var(--ptah-gap-controls)] [border:var(--ptah-border-width)_solid_var(--ptah-border-color)]"
          role="region"
          aria-label="Savings summary and filter"
          data-testid="claude-tools-summary"
        >
          <div class="flex items-center gap-[var(--ptah-gap-label)] text-sm font-semibold text-base-content" aria-live="polite" data-testid="claude-tools-savings">
            <lucide-angular [img]="ZapIcon" class="size-[var(--ptah-icon-md)] shrink-0 text-primary" aria-hidden="true" />
            <span>Saved per turn <span class="tabular-nums">~{{ savingsLabel() }}</span> tokens</span>
          </div>
          <span class="text-[length:var(--ptah-text-hint-size)] tabular-nums text-base-content-muted" data-testid="claude-tools-on-count">{{ onCount() }} of {{ totalCount() }} on</span>
          <!-- The live region is in the accessibility tree before its first message, so that message is announced.
               The visible copy is separate and hidden from assistive technology. -->
          <span role="status" class="sr-only" data-testid="claude-tools-group-progress">@if (groupProgress(); as progress) {Saving {{ progress.done }} of {{ progress.total }}}</span>
          @if (groupProgress(); as progress) {
            <span aria-hidden="true" class="text-[length:var(--ptah-text-hint-size)] tabular-nums text-base-content-muted" data-testid="claude-tools-group-progress-visual">Saving {{ progress.done }} of {{ progress.total }}</span>
          }
          <div class="relative ml-auto flex min-w-40 max-w-64 flex-1 items-center">
            <lucide-angular [img]="SearchIcon" class="pointer-events-none absolute left-2 size-[var(--ptah-icon-sm)] text-base-content-muted" aria-hidden="true" />
            <input
              ptahInput
              size="xs"
              type="text"
              role="searchbox"
              class="w-full pl-7 pr-7"
              placeholder="Filter tools and skills"
              aria-label="Filter tools and skills"
              autocomplete="off"
              [value]="filter()"
              (input)="onFilterInput($event)"
              (keydown.escape)="onFilterEscape($event)"
              data-testid="claude-tools-filter"
            />
            @if (filter()) {
              <button type="button" ptahIconButton label="Clear filter" size="xs" density="compact" class="absolute right-0.5"
                (click)="clearFilter()" data-testid="claude-tools-filter-clear">
                <lucide-angular [img]="XIcon" class="size-[var(--ptah-icon-xs)]" aria-hidden="true" />
              </button>
            }
          </div>
        </div>

        <div class="flex flex-col gap-[var(--ptah-gap-controls)]" data-testid="claude-tools-groups">
          @if (groups.tools.shown) {
            <ptah-claude-builtins-group
              groupId="tools"
              [heading]="groupHeadings.tools"
              [icon]="WrenchIcon"
              badge="Off by default"
              hint="Turn a tool on to let agents use it."
              [onCount]="groups.tools.onCount"
              [total]="groups.tools.total"
              [tokens]="groups.tools.tokens"
              [expanded]="groups.tools.expanded"
              [switchState]="groups.tools.switchState"
              [switchLabel]="groups.tools.switchLabel"
              [busy]="busy()"
              [expandLocked]="filtering()"
              (expandedChange)="setExpanded('tools', $event)"
              (groupToggled)="toggleGroup('tools', $event)"
            >
              @if (groups.tools.expanded) {
                @for (tool of visibleTools(); track tool.id) {
                  <ptah-claude-builtins-row
                    kind="tool"
                    [itemId]="tool.id"
                    [name]="tool.id"
                    [description]="tool.description"
                    [tokens]="cost(tool.approxTokens)"
                    [on]="isToolOn(tool.id)"
                    [disabled]="busy()"
                    (toggled)="toggle('tool', tool.id, $event)"
                  />
                }
              }
            </ptah-claude-builtins-group>
          }

          @if (groups.terminal.shown) {
            <ptah-claude-builtins-group
              groupId="terminal"
              [heading]="groupHeadings.terminal"
              [icon]="TerminalIcon"
              badge="Off by default"
              hint="Skills made for the terminal version of Claude Code."
              [onCount]="groups.terminal.onCount"
              [total]="groups.terminal.total"
              [tokens]="groups.terminal.tokens"
              [expanded]="groups.terminal.expanded"
              [switchState]="groups.terminal.switchState"
              [switchLabel]="groups.terminal.switchLabel"
              [busy]="busy()"
              [expandLocked]="filtering()"
              (expandedChange)="setExpanded('terminal', $event)"
              (groupToggled)="toggleGroup('terminal', $event)"
            >
              @if (groups.terminal.expanded) {
                @for (skill of visibleTerminal(); track skill.id) {
                  <ptah-claude-builtins-row
                    kind="skill"
                    [itemId]="skill.id"
                    [name]="skill.id"
                    [description]="skillDescription(skill)"
                    [tokens]="cost(skill.approxTokens)"
                    [on]="isSkillOn(skill.id)"
                    [disabled]="busy()"
                    [blockedReason]="blockedReason(skill)"
                    (toggled)="toggle('skill', skill.id, $event)"
                  />
                }
              }
            </ptah-claude-builtins-group>
          }

          @if (groups.synced.shown) {
            <ptah-claude-builtins-group
              groupId="synced"
              [heading]="groupHeadings.synced"
              [icon]="RefreshCwIcon"
              badge="Hidden by default"
              hint="Found in your Claude home folder. Turn one on to use it in new sessions."
              [onCount]="groups.synced.onCount"
              [total]="groups.synced.total"
              [tokens]="groups.synced.tokens"
              [expanded]="groups.synced.expanded"
              [switchState]="groups.synced.switchState"
              [switchLabel]="groups.synced.switchLabel"
              [busy]="busy()"
              [expandLocked]="filtering()"
              (expandedChange)="setExpanded('synced', $event)"
              (groupToggled)="toggleGroup('synced', $event)"
            >
              @if (groups.synced.expanded) {
                @for (skill of visibleSynced(); track skill.id) {
                  <ptah-claude-builtins-row
                    kind="skill"
                    [itemId]="skill.id"
                    [name]="skillName(skill)"
                    [description]="skillDescription(skill)"
                    [tokens]="cost(skill.approxTokens)"
                    [on]="isSkillOn(skill.id)"
                    [disabled]="busy()"
                    [blockedReason]="blockedReason(skill)"
                    (toggled)="toggle('skill', skill.id, $event, skillName(skill))"
                  />
                } @empty {
                  <div class="col-span-full flex flex-col items-center gap-[var(--ptah-gap-label)] py-[var(--ptah-gap-field)] text-center text-xs"
                    data-testid="claude-tools-synced-empty">
                    <lucide-angular [img]="InboxIcon" class="size-[var(--ptah-icon-md)] text-base-content-muted" aria-hidden="true" />
                    <strong class="text-base-content">No claude.ai skills found</strong>
                    <span class="text-base-content-muted">
                      If you sync skills from your claude.ai account, they will be listed here.
                    </span>
                  </div>
                }
              }
            </ptah-claude-builtins-group>
          }

          @if (noMatch()) {
            <div role="status" class="flex flex-col items-center gap-[var(--ptah-gap-controls)] py-[var(--ptah-gap-group)] text-center text-xs text-base-content-muted"
              data-testid="claude-tools-no-match">
              <lucide-angular [img]="InboxIcon" class="size-[var(--ptah-icon-md)]" aria-hidden="true" />
              <span>No tools or skills match "{{ query() }}"</span>
              <button type="button" ptahButton variant="ghost" size="xs" (click)="clearFilter()" data-testid="claude-tools-no-match-clear">
                Clear filter
              </button>
            </div>
          }
        </div>
      } @else if (loadState() === 'loading') {
        <div class="flex flex-col gap-[var(--ptah-gap-controls)]" data-testid="claude-tools-skeleton">
          @for (group of skeletonGroups; track group) {
            <div class="flex flex-col gap-[var(--ptah-gap-controls)] rounded-[var(--ptah-radius-control)] px-[var(--ptah-gap-heading)] py-[var(--ptah-gap-controls)] [border:var(--ptah-border-width)_solid_var(--ptah-border-color)]"
              data-testid="claude-tools-skeleton-group">
              <ptah-skeleton shape="lines" [lines]="1" />
              @if ($first) {
                @for (row of skeletonRows; track row) {
                  <div class="py-[var(--ptah-gap-label)]" data-testid="claude-tools-skeleton-row">
                    <ptah-skeleton shape="lines" [lines]="1" size="sm" />
                  </div>
                }
              }
            </div>
          }
        </div>
      }
    </ptah-form-section>
  `,
})
export class ClaudeBuiltinsConfigComponent implements OnInit {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sync = inject(ClaudeBuiltinsSyncService);
  /**
   * A write or an Undo can end after this card was destroyed: the Settings page toast owns them. A destroyed card
   * still sends its calls, but it writes none of its signals; the mounted card reads the result ({@link sync}).
   */
  private alive = true;
  /** Newest read or write answer. An older read that ends later is dropped. */
  private readSequence = 0;
  /** This card instance in {@link ClaudeBuiltinsSyncService}. A number, so the root service retains no card. */
  private readonly instanceId = this.sync.nextInstanceId();
  /**
   * The policy of the newest read answer, also of a read that ended after this card was destroyed. A read that a newer
   * read or write answer replaced does not change it. An Undo sends a write only while it is `verified`.
   */
  private lastPolicy: 'verified' | 'unverified' | 'unknown' = 'unknown';
  /**
   * The newest read of the stored lists is in flight ({@link refresh}). A read that a newer answer replaced does not
   * count: its answer is dropped, so the card does not wait for it.
   */
  private readonly readPending = signal(false);
  /** The newest settlement of another card instance whose refresh this card applied. */
  private readonly appliedRevision = signal(this.sync.settled()?.revision ?? 0);

  readonly AlertCircleIcon = AlertCircle;
  readonly InboxIcon = Inbox;
  readonly InfoIcon = Info;
  readonly RefreshCwIcon = RefreshCw;
  readonly RotateCcwIcon = RotateCcw;
  readonly SearchIcon = Search;
  readonly TerminalIcon = Terminal;
  readonly WrenchIcon = Wrench;
  readonly XIcon = X;
  readonly ZapIcon = Zap;
  readonly groupHeadings = GROUP_HEADINGS;
  readonly skeletonGroups = [0, 1, 2] as const;
  readonly skeletonRows = [0, 1, 2, 3] as const;

  /** Toggles are busy while any settings save runs (D3). */
  readonly saving = this.feedback.saving;
  /**
   * This card shows lists that can be older than the stored ones: a write or an Undo of another card instance settled
   * and the refresh for it did not apply yet, or a read is in flight. It is true from the moment of the settlement,
   * before the refresh starts, so no write and no Undo starts from the old lists.
   */
  readonly syncing = computed(() => {
    const settled = this.sync.settled();
    const stale =
      settled !== null && settled.sourceId !== this.instanceId && settled.revision > this.appliedRevision();
    return stale || this.readPending();
  });

  readonly loadState = signal<LoadState>('loading');
  readonly loaded = computed(() => this.loadState() === 'loaded');
  /** An unverified policy: the returned catalog is shown, but each control is read-only and each write is refused. */
  readonly readOnly = computed(() => this.loadState() === 'unverified');
  /** The rows can be shown: a verified read, or the read-only catalog of an unverified one. */
  readonly hasCatalog = computed(() => this.loaded() || this.readOnly());
  /** The rows and the group controls refuse activation: a save runs, the card is read-only, or its lists can be old. */
  readonly busy = computed(() => this.saving() || this.readOnly() || this.syncing());
  readonly errorMessage = computed(() => {
    const state = this.loadState();
    if (state === 'failed') return COULD_NOT_LOAD_CLAUDE_BUILTINS;
    if (state === 'unverified') return CLAUDE_BUILTINS_POLICY_UNVERIFIED;
    return null;
  });

  readonly tools = signal<readonly ClaudeBuiltinToolDto[]>([]);
  readonly terminalSkills = signal<readonly ClaudeBuiltinSkillDto[]>([]);
  readonly syncedSkills = signal<readonly ClaudeBuiltinSkillDto[]>([]);
  readonly enabledTools = signal<readonly string[]>([]);
  readonly enabledSkills = signal<readonly string[]>([]);

  /** The text of the filter field. */
  readonly filter = signal('');
  /** The filter as it is matched: trimmed, lower case. Empty means no filter. */
  readonly query = computed(() => this.filter().trim().toLowerCase());
  readonly filtering = computed(() => this.query() !== '');
  /** The groups the user opened. A filter overrides it: it opens each group that has a match. */
  readonly expanded = signal<Record<BuiltinGroupId, boolean>>({ tools: true, terminal: false, synced: false });
  /** "Saving i of n" while a group switch runs. */
  readonly groupProgress = signal<{ done: number; total: number } | null>(null);

  readonly visibleTools = computed(() =>
    this.tools().filter((tool) => this.matches(tool.id, tool.description)),
  );
  readonly visibleTerminal = computed(() =>
    this.terminalSkills().filter((skill) => this.matches(skill.id, this.skillDescription(skill))),
  );
  readonly visibleSynced = computed(() =>
    this.syncedSkills().filter((skill) => this.matches(this.skillName(skill), this.skillDescription(skill))),
  );

  readonly groupViews = computed<Record<BuiltinGroupId, BuiltinGroupView>>(() => ({
    tools: this.groupView('tools', this.tools(), this.visibleTools()),
    terminal: this.groupView('terminal', this.terminalSkills(), this.visibleTerminal()),
    synced: this.groupView('synced', this.syncedSkills(), this.visibleSynced()),
  }));
  /** A filter that matches no row of any group. */
  readonly noMatch = computed(() => {
    const groups = this.groupViews();
    return this.query() !== '' && !groups.tools.shown && !groups.terminal.shown && !groups.synced.shown;
  });

  readonly totalCount = computed(
    () => this.tools().length + this.terminalSkills().length + this.syncedSkills().length,
  );
  readonly onCount = computed(() => {
    const groups = this.groupViews();
    return groups.tools.onCount + groups.terminal.onCount + groups.synced.onCount;
  });

  /**
   * Sum of the cost of every shown item the session will not get (groups 1-3), rounded to 100; recomputes on every
   * toggle. A skill is hidden when its own switch is off or the tool it needs is off: the backend denies a
   * dependency-blocked skill. A synced skill needs no tool.
   */
  readonly hiddenTokens = computed(() => {
    const tools = this.enabledTools();
    const skills = this.enabledSkills();
    const skillHidden = (skill: ClaudeBuiltinSkillDto) =>
      !skills.includes(skill.id) || (!!skill.needsTool && !tools.includes(skill.needsTool));
    const off =
      this.tools().filter((tool) => !tools.includes(tool.id)).reduce((sum, tool) => sum + tool.approxTokens, 0) +
      [...this.terminalSkills(), ...this.syncedSkills()]
        .filter(skillHidden)
        .reduce((sum, skill) => sum + skill.approxTokens, 0);
    return Math.round(off / 100) * 100;
  });
  private readonly overview = inject(AdvancedOverviewStore, { optional: true });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
    });
    // A write or an Undo of another card instance settled (that card can be destroyed): show the stored lists.
    const mountedAt = this.appliedRevision();
    effect(() => {
      const settled = this.sync.settled();
      if (!settled || settled.revision <= mountedAt || settled.sourceId === this.instanceId) return;
      const revision = settled.revision;
      untracked(() => {
        void this.refresh().then(() => {
          // The read for this settlement ended. A newer read that replaced it keeps `readPending` true.
          if (this.alive) this.appliedRevision.update((applied) => Math.max(applied, revision));
        });
      });
    });
    effect(() => {
      const entry = this.loaded() ? {
        value: this.tools().filter((tool) => this.isToolOn(tool.id)).length + ' of ' + this.tools().length + ' on',
        meta: 'Saves ' + this.hiddenTokens().toLocaleString('en-US') + ' tokens',
        tone: 'ok' as const,
      } : null;
      untracked(() => entry ? this.overview?.report('claude-tools', entry) : this.overview?.clear('claude-tools'));
    });
  }

  readonly savingsLabel = computed(() => this.hiddenTokens().toLocaleString('en-US'));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  /** Reads the catalog and the stored opt-ins. A failure, or an unverified policy, leaves no control to write with. */
  async load(): Promise<void> {
    this.loadState.set('loading');
    await this.refresh();
  }

  /**
   * An Undo fails closed: it sends a write only while the newest read gave a verified policy. If not, it reads again
   * first. Only a `verified` answer of the newest read lets the Undo continue. A timeout, an error, an answer with no
   * data, an `unverified` answer, or an answer that a newer read (for example Retry) replaced refuses the Undo with a
   * fixed sentence and keeps the Undo in the toast. `lastPolicy` has the policy of the newest read only.
   */
  private async undoRefused(): Promise<SettingsGenericWriteResult | null> {
    // A function, so that the compiler reads the field again after the read changed it.
    const verified = () => this.lastPolicy === 'verified';
    if (verified()) return null;
    await this.refresh();
    if (verified()) return null;
    return { ok: false, message: CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED, keepUndo: true };
  }

  /** Reads the stored lists again without the skeleton. An older read that ends after a newer answer is dropped. */
  private async refresh(): Promise<AgentGetClaudeBuiltinsResult | null> {
    const sequence = ++this.readSequence;
    if (this.alive) this.readPending.set(true);
    try {
      const data = await this.read();
      if (sequence === this.readSequence) {
        this.lastPolicy = !data ? 'unknown' : data.policyStatus === 'verified' ? 'verified' : 'unverified';
        this.apply(data);
      }
      return data;
    } finally {
      if (this.alive && sequence === this.readSequence) this.readPending.set(false);
    }
  }

  cost(tokens: number): string {
    return formatApproxTokens(tokens);
  }

  isToolOn(id: string): boolean {
    return this.enabledTools().includes(id);
  }

  isSkillOn(id: string): boolean {
    return this.enabledSkills().includes(id);
  }

  /** The name a row shows and its switch label uses: a synced skill's plain name, else its id. */
  skillName(skill: ClaudeBuiltinSkillDto): string {
    return skill.name ?? skill.id;
  }

  /** A skill whose own switch is on while the tool it needs is off (design-spec "Dependency blocked"). */
  isDependencyBlocked(skill: ClaudeBuiltinSkillDto): boolean {
    return !!skill.needsTool && this.isSkillOn(skill.id) && !this.isToolOn(skill.needsTool);
  }

  /** The one line a skill row shows: the description, and the tool the skill needs. */
  skillDescription(skill: ClaudeBuiltinSkillDto): string {
    return skill.needsTool ? `${skill.description} Needs the ${skill.needsTool} tool.` : skill.description;
  }

  /** The text of the dependency chip of a blocked skill ("ReportFindings is off"). */
  blockedReason(skill: ClaudeBuiltinSkillDto): string | null {
    return this.isDependencyBlocked(skill) ? `${skill.needsTool} is off` : null;
  }

  /** The switch state of a group, from its visible rows: all on, none on, or mixed. */
  groupSwitchState(group: BuiltinGroupId): BuiltinGroupSwitchState {
    return this.groupViews()[group].switchState;
  }

  onFilterInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.filter.set(event.target.value);
  }

  /** Esc clears a set filter and stops there; with no filter, Esc goes on to the page. */
  onFilterEscape(event: Event): void {
    if (this.filter() === '') return;
    event.stopPropagation();
    this.clearFilter();
  }

  /** Clears the filter and puts focus in the filter field: the Clear button that had focus is gone. */
  clearFilter(): void {
    this.filter.set('');
    this.focusAfterRender('[data-testid="claude-tools-filter"]');
  }

  /** The user opens or closes a group. A filter controls the groups itself, so the request is ignored then. */
  setExpanded(group: BuiltinGroupId, open: boolean): void {
    if (this.query() !== '') return;
    this.expanded.update((state) => ({ ...state, [group]: open }));
  }

  /**
   * Group switch (decision 9): sets every visible row of `group` whose state differs to `on`, with the same per-item
   * `agent:setClaudeBuiltin` call as a single toggle, in sequence, inside one `saveGeneric` call. So there is one
   * toast, and `saving()` refuses any other toggle until the sequence ends. A row whose call fails keeps its stored
   * state ({@link saveItem} re-reads the lists); the toast then gives the number of changes that were not saved or not
   * confirmed, and still offers Undo when a part of the rows saved. Undo sends the inverse call for each row that
   * saved, and for no other row.
   */
  async toggleGroup(group: BuiltinGroupId, on: boolean): Promise<void> {
    if (this.saving() || this.syncing() || !this.loaded()) return;
    const kind = GROUP_KINDS[group];
    const list = kind === 'tool' ? this.enabledTools : this.enabledSkills;
    const ids = this.visibleIds(group).filter((id) => list().includes(id) !== on);
    if (ids.length === 0) return;
    const switchSelector = `[data-testid="claude-tools-group-switch-${group}"]`;
    const active = this.host.nativeElement.ownerDocument.activeElement;
    const hadFocus = active !== null && active === this.host.nativeElement.querySelector(switchSelector);

    /** The rows that saved and that no Undo restored yet: the only rows an Undo writes. */
    let saved: readonly string[] = [];
    const outcome = await this.feedback.saveGeneric({
      label: `${GROUP_HEADINGS[group]} (${ids.length} turned ${on ? 'on' : 'off'})`,
      write: this.settling(async () => {
        const result = await this.saveItems(kind, ids, on);
        saved = result.saved;
        return this.sequenceResult(result, ids.length);
      }),
      // Undo writes back only the rows that saved, also after a part of the sequence failed. Its toast gives its own
      // count and direction. An Undo that did not restore each row stays in the toast. Each restored row leaves the
      // set when its restore is confirmed, so the next run of the Undo writes the remaining rows only: it does not
      // replace a later edit of a row that was restored already.
      undo: this.settling(async () => {
        const refused = await this.undoRefused();
        if (refused) return refused;
        const remaining = saved;
        const restored = await this.saveItems(kind, remaining, !on, (id) => {
          saved = saved.filter((item) => item !== id);
        });
        if (restored.saved.length === remaining.length) {
          return { ok: true, message: claudeBuiltinsGroupRestored(GROUP_HEADINGS[group], remaining.length, !on) };
        }
        return { ...this.sequenceResult(restored, remaining.length), keepUndo: true };
      }),
    });
    // After a failed sequence the group control can be gone (the recovery read failed): focus then moves to Retry.
    if (outcome !== 'saved' && hadFocus && this.alive) {
      this.focusAfterRender(switchSelector, RETRY_SELECTOR);
    }
  }

  /** `name` labels the toast (`Saved docx skill.`); it defaults to `id`. */
  async toggle(kind: BuiltinKind, id: string, event?: Event, name: string = id): Promise<void> {
    const input = event?.target instanceof HTMLInputElement ? event.target : null;
    const list = kind === 'tool' ? this.enabledTools : this.enabledSkills;
    // Serialization: a save (write, any recovery read) holds `saving()` until it ends, so a second toggle is refused
    // here instead of racing the first one.
    if (this.saving() || this.syncing() || !this.loaded()) {
      if (input) input.checked = list().includes(id);
      return;
    }
    const hadFocus = input !== null && input.ownerDocument.activeElement === input;
    const wasOn = list().includes(id);
    list.set(withItem(list(), id, !wasOn));

    const label = `${name} ${kind}`;
    const outcome = await this.feedback.saveGeneric({
      label,
      write: this.settling(async () => this.itemResult(await this.saveItem(kind, id, !wasOn), label)),
      undo: this.settling(
        async () => (await this.undoRefused()) ?? this.itemResult(await this.saveItem(kind, id, wasOn), label),
      ),
    });

    if (outcome === 'saved' || !this.alive) return;
    // 'refused': nothing was written, so the optimistic change is undone locally. 'failed': the stored lists were
    // already re-read inside the save (or the card fell back to its load error).
    if (outcome === 'refused') list.set(withItem(list(), id, wasOn));
    if (input && this.hasCatalog()) input.checked = list().includes(id);
    if (hadFocus) this.keepFocus(kind, id);
  }

  /**
   * One atomic `agent:setClaudeBuiltin` call for `id` alone: the backend adds or removes that one id in the stored
   * list, so another writer's opt-ins are never replaced. On success the card shows the lists the call returns.
   *
   * Any other answer leaves a doubt, so the stored lists are read again instead of a guess (D15: fixed text, no host
   * text). Only `success: false` from the host is an explicit rejection. A timeout, a transport error or an answer
   * without lists is uncertain delivery: the renderer stops its wait, but the host write is not cancelled. A verified
   * re-read that shows the requested state proves `saved`. A re-read that shows the old state proves nothing (the
   * write can still be in the host queue and commit later), so the outcome stays `unconfirmed`, never "not saved".
   */
  private async saveItem(kind: BuiltinKind, id: string, enabled: boolean): Promise<ItemWrite> {
    let rejected = false;
    try {
      const result = await this.rpcService.call('agent:setClaudeBuiltin', { kind, id, enabled });
      const data = result.isSuccess() ? result.data : undefined;
      if (data?.success === true && Array.isArray(data.enabledTools) && Array.isArray(data.enabledSkills)) {
        this.readSequence += 1;
        if (this.alive) {
          // The write answer is newer than each read in flight: those reads are dropped.
          this.readPending.set(false);
          this.enabledTools.set(data.enabledTools);
          this.enabledSkills.set(data.enabledSkills);
        }
        return { outcome: 'saved', stop: false };
      }
      rejected = data?.success === false;
    } catch {
      // degradation-audit: reported - the stored lists are re-read below and the toast shows a fixed sentence.
    }
    const stored = await this.refresh();
    if (!stored || stored.policyStatus !== 'verified') {
      return { outcome: rejected ? 'rejected' : 'unconfirmed', stop: true };
    }
    if (rejected) return { outcome: 'rejected', stop: false };
    const list = (kind === 'tool' ? stored.enabledTools : stored.enabledSkills) ?? [];
    return { outcome: list.includes(id) === enabled ? 'saved' : 'unconfirmed', stop: false };
  }

  /**
   * Runs {@link saveItem} for each id in sequence. It stops when a recovery read gave no verified lists: no later
   * write can be confirmed then, and the ids that were not sent count as not saved. `confirmed` runs for each id as
   * soon as its write is confirmed, also when a later write throws.
   */
  private async saveItems(
    kind: BuiltinKind,
    ids: readonly string[],
    enabled: boolean,
    confirmed?: (id: string) => void,
  ): Promise<SequenceResult> {
    const saved: string[] = [];
    let unconfirmed = 0;
    try {
      for (const [index, id] of ids.entries()) {
        if (this.alive) this.groupProgress.set({ done: index + 1, total: ids.length });
        const write = await this.saveItem(kind, id, enabled);
        if (write.outcome === 'saved') {
          saved.push(id);
          confirmed?.(id);
        }
        if (write.outcome === 'unconfirmed') unconfirmed += 1;
        if (write.stop) break;
      }
    } finally {
      if (this.alive) this.groupProgress.set(null);
    }
    return { saved, unconfirmed, rejected: ids.length - saved.length - unconfirmed };
  }

  /** The toast result of one item. */
  private itemResult(write: ItemWrite, label: string): SettingsGenericWriteResult {
    if (write.outcome === 'saved') return { ok: true };
    return {
      ok: false,
      message: write.outcome === 'unconfirmed' ? settingNotConfirmedMessage(label) : COULD_NOT_UPDATE_CLAUDE_BUILTINS,
    };
  }

  /** The toast result of a sequence: one message, and Undo stays available while a part of the rows saved. */
  private sequenceResult(result: SequenceResult, total: number): SettingsGenericWriteResult {
    if (result.saved.length === total) return { ok: true };
    const parts = [
      result.rejected > 0 ? claudeBuiltinsGroupNotSaved(result.rejected, total) : null,
      result.unconfirmed > 0 ? claudeBuiltinsGroupNotConfirmed(result.unconfirmed, total) : null,
    ].filter((part): part is string => part !== null);
    return { ok: false, message: parts.join(' '), keepUndo: result.saved.length > 0 };
  }

  /**
   * Wraps a write or an Undo of the page toast. When it ends:
   * - a Retry that overlapped it can have lost its read to the newer write answer, which leaves the card in `loading`.
   *   The card then reads the stored lists again, inside the save, so the save and the Retry end in one known state;
   * - each other mounted card reads the stored lists again. This card shows the result itself while it is mounted.
   */
  private settling(run: () => Promise<SettingsGenericWriteResult>): () => Promise<SettingsGenericWriteResult> {
    return async () => {
      try {
        return await run();
      } finally {
        if (this.alive && this.loadState() === 'loading') await this.refresh();
        this.sync.notifySettled(this.instanceId);
      }
    };
  }

  /** Case-insensitive match of the filter on the name and the description of a row. No filter matches each row. */
  private matches(name: string, description: string): boolean {
    const query = this.query();
    return query === '' || name.toLowerCase().includes(query) || description.toLowerCase().includes(query);
  }

  private visibleIds(group: BuiltinGroupId): string[] {
    if (group === 'tools') return this.visibleTools().map((tool) => tool.id);
    return (group === 'terminal' ? this.visibleTerminal() : this.visibleSynced()).map((skill) => skill.id);
  }

  private groupView(
    group: BuiltinGroupId,
    all: readonly (ClaudeBuiltinToolDto | ClaudeBuiltinSkillDto)[],
    visible: readonly (ClaudeBuiltinToolDto | ClaudeBuiltinSkillDto)[],
  ): BuiltinGroupView {
    const enabled = GROUP_KINDS[group] === 'tool' ? this.enabledTools() : this.enabledSkills();
    const countOn = (items: readonly { id: string }[]) => items.filter((item) => enabled.includes(item.id)).length;
    const filtering = this.query() !== '';
    const visibleOn = countOn(visible);
    const switchState: BuiltinGroupSwitchState =
      visible.length > 0 && visibleOn === visible.length ? 'on' : visibleOn === 0 ? 'off' : 'mixed';
    const verb = switchState === 'on' ? 'Turn off' : 'Turn on';
    return {
      shown: !filtering || visible.length > 0,
      expanded: filtering ? visible.length > 0 : this.expanded()[group],
      onCount: countOn(all),
      total: all.length,
      tokens: formatApproxTokens(all.reduce((sum, item) => sum + item.approxTokens, 0)),
      switchState,
      switchLabel: filtering
        ? `${verb} ${visible.length} shown in ${GROUP_HEADINGS[group]}`
        : `${verb} all ${GROUP_HEADINGS[group]}`,
    };
  }

  /** One `agent:getClaudeBuiltins` read; `null` on any failure. Host text is never kept (D15). */
  private async read(): Promise<AgentGetClaudeBuiltinsResult | null> {
    try {
      const result = await this.rpcService.call('agent:getClaudeBuiltins', {});
      if (result.isSuccess() && result.data) return result.data;
    } catch {
      // degradation-audit: reported - the caller shows the fixed load error with Retry.
    }
    return null;
  }

  /**
   * Puts a read into the card. A failed read leaves the fixed error and no rows. An unverified policy shows the
   * returned catalog read-only, with its own fixed error: no write starts until a read is verified.
   */
  private apply(data: AgentGetClaudeBuiltinsResult | null): void {
    if (!this.alive) return;
    if (!data) {
      this.loadState.set('failed');
      return;
    }
    this.tools.set(data.tools ?? []);
    this.terminalSkills.set(data.terminalSkills ?? []);
    this.syncedSkills.set(data.syncedSkills ?? []);
    this.enabledTools.set(data.enabledTools ?? []);
    this.enabledSkills.set(data.enabledSkills ?? []);
    this.loadState.set(data.policyStatus === 'verified' ? 'loaded' : 'unverified');
  }

  /** Focus stays on (or returns to) the switch the user toggled, once the re-read state has rendered. */
  private keepFocus(kind: BuiltinKind, id: string): void {
    // When the recovery read failed the switch is gone; focus moves to the error's Retry instead.
    this.focusAfterRender(`[data-testid="settings-toggle-claude-${kind}-${id}"]`, RETRY_SELECTOR);
  }

  /**
   * Puts focus on the first of `selectors` that is in the card. The order is a preference, not the document order:
   * with an unverified policy the Retry button and the read-only control are both there, and focus stays on the control.
   */
  private focusAfterRender(...selectors: string[]): void {
    afterNextRender(
      () => {
        const target = selectors
          .map((selector) => this.host.nativeElement.querySelector<HTMLElement>(selector))
          .find((found) => found !== null);
        if (target && target.ownerDocument.activeElement !== target) target.focus();
      },
      { injector: this.injector },
    );
  }
}
