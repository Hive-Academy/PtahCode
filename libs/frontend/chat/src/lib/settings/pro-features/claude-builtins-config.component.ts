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
 *   checkbox; if that read fails too, the card shows its load error. The toast carries a fixed sentence, never host
 *   text (D15).
 * - A failed read, or a capability policy that is `unverified`, shows a fixed error with Retry and no controls: a
 *   write built on defaults would overwrite the stored list, and no toggle bypasses the fail-closed policy.
 */

import {
  Component,
  inject,
  ChangeDetectionStrategy,
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
import { LucideAngularModule, AlertCircle } from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  AgentGetClaudeBuiltinsResult,
  ClaudeBuiltinSkillDto,
  ClaudeBuiltinToolDto,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { PtahBadgeDirective, PtahButtonDirective, PtahCheckboxDirective, PtahFormSectionComponent, PtahSkeletonComponent, PtahSettingRowComponent, PtahAlertComponent } from '@ptah-extension/ui';

export const COULD_NOT_LOAD_CLAUDE_BUILTINS =
  'Could not load the Claude Code tool and skill settings.';
export const CLAUDE_BUILTINS_POLICY_UNVERIFIED =
  "Could not verify this workspace's capability policy, so Claude Code tools and skills cannot be changed now.";
export const COULD_NOT_UPDATE_CLAUDE_BUILTINS =
  'Could not update Claude Code tools and skills.';

type BuiltinKind = 'tool' | 'skill';
type LoadState = 'loading' | 'loaded' | 'failed' | 'unverified';
type WriteResult = { ok: true } | { ok: false; message: string };

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
  imports: [SettingsBusyDisabledDirective, LucideAngularModule, PtahButtonDirective, PtahCheckboxDirective, PtahFormSectionComponent, PtahBadgeDirective, PtahSkeletonComponent, PtahSettingRowComponent, PtahAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-form-section
      id="advanced-claude-tools"
      [wide]="true"
      [divider]="true"
      heading="Claude Code tools & skills"
      description="Turn off tools you do not use. Each tool costs tokens on every turn."
      data-glass-surface="content"
      aria-labelledby="claude-tools-heading"
      [attr.aria-busy]="loadState() === 'loading' ? 'true' : null"
    >
      @if (loaded()) {
        <div aside class="mt-ptah-field" aria-live="polite" data-testid="claude-tools-savings">
          <span class="block text-xs text-base-content-muted">Saved per turn </span>
          <strong class="block text-lg tabular-nums">{{ savingsLabel() }} tokens</strong>
        </div>
      }
      <h2 id="claude-tools-heading" class="sr-only">Claude Code tools &amp; skills</h2>

      <div role="note" class="flex gap-[var(--ptah-gap-controls)] rounded border border-info/50 p-[var(--ptah-gap-controls)] text-xs text-base-content mb-[var(--ptah-gap-field)]"
        data-testid="claude-tools-applies-note">
        <span class="mt-[var(--ptah-gap-label)] inline-block w-2 h-2 rounded-full bg-info shrink-0" aria-hidden="true"></span>
        <span>
          Changes apply to <strong>new sessions</strong>. Sessions that are already open keep what they started
          with. These settings apply to all your workspaces.
        </span>
      </div>

      @if (errorMessage(); as message) {
        <ptah-alert tone="error"
          role="alert"
          class="mb-ptah-field"
          data-testid="claude-tools-load-error"
        >
          <lucide-angular [img]="AlertCircleIcon" class="w-3.5 h-3.5 text-error shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ message }}</span>
          <button alertAction type="button" ptahButton variant="ghost" size="xs" (click)="load()"
            data-testid="claude-tools-load-retry">
            Retry
          </button>
        </ptah-alert>
      } @else {
        <!-- Group 1: built-in tools -->
        <h3 id="claude-tools-group-tools" class="text-xs font-semibold text-base-content">
          Built-in tools (off by default)
        </h3>
        <p class="text-xs text-base-content-muted mb-[var(--ptah-gap-label)]">
          Turn a tool on to let agents use it. A skill that needs a tool also has its own checkbox below; both must
          be on.
        </p>
        <div class="overflow-x-auto mb-[var(--ptah-gap-field)]">
          <div class="flex flex-col" role="group" aria-labelledby="claude-tools-group-tools">
            
              @if (loaded()) {
                @for (tool of tools(); track tool.id) {
                  <ptah-setting-row [label]="tool.id" [controlId]="'claude-tool-' + tool.id" density="compact" class="[border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] [&_[data-testid=setting-row]]:grid-cols-[minmax(0,1fr)_auto] [&_[data-testid=setting-row]]:min-h-12" [attr.title]="tool.description">
                    <input
                        status class="-order-1" [id]="'claude-tool-' + tool.id" type="checkbox"
                        ptahCheckbox size="xs"
                        [checked]="isToolOn(tool.id)"
                        (change)="toggle('tool', tool.id, $event)"
                        [ptahBusyDisabled]="saving() || !loaded()"
                        [attr.aria-label]="tool.id + ' tool'"
                        [attr.data-testid]="'settings-toggle-claude-tool-' + tool.id"
                      />
                    <span meta ptahBadge appearance="outline" size="xs">{{ cost(tool.approxTokens) }} tokens</span>
                  </ptah-setting-row>
                }
              } @else {
                @for (row of skeletonRows; track row) {
                  <div class="flex min-h-12 items-center gap-ptah-controls [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] py-ptah-controls" data-testid="claude-tools-skeleton-row">
                    <div class="align-top">
                      <input type="checkbox" ptahCheckbox size="xs" disabled
                        aria-label="Loading tool" />
                    </div>
                    <div class="flex-1"><ptah-skeleton shape="lines" [lines]="1" /></div>
                  </div>
                }
              }
            
          </div>
        </div>

        <!-- Group 2: terminal-only built-in skills -->
        <h3 id="claude-tools-group-terminal-skills" class="text-xs font-semibold text-base-content">
          Terminal-only built-in skills (off by default)
        </h3>
        <p class="text-xs text-base-content-muted mb-[var(--ptah-gap-label)]">Skills made for the terminal version of Claude Code.</p>
        <div class="overflow-x-auto">
          <div class="flex flex-col" role="group" aria-labelledby="claude-tools-group-terminal-skills">
            
              @if (loaded()) {
                @for (skill of terminalSkills(); track skill.id) {
                  <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-ptah-controls gap-y-[var(--ptah-gap-label)] [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] py-ptah-controls">
                    <div class="align-top">
                      <input
                        type="checkbox"
                        ptahCheckbox size="xs"
                        [checked]="isSkillOn(skill.id)"
                        (change)="toggle('skill', skill.id, $event)"
                        [ptahBusyDisabled]="saving() || !loaded()"
                        [attr.aria-label]="skill.id + ' skill'"
                        [attr.aria-describedby]="isDependencyBlocked(skill) ? 'claude-skill-dep-' + skill.id : null"
                        [attr.data-testid]="'settings-toggle-claude-skill-' + skill.id"
                      />
                    </div>
                    <div class="min-w-0 font-semibold text-xs text-base-content break-words">{{ skill.id }}</div>
                    <div class="align-top">
                      <span ptahBadge appearance="outline" size="xs" class="text-base-content">{{ cost(skill.approxTokens) }}</span>
                    </div>
                    <div class="col-start-2 col-span-2 text-xs text-base-content-muted">{{ skill.description }}</div>
                    @if (skill.needsTool) {
                      <div class="col-start-2 col-span-2 text-xs text-base-content-muted">
                        {{ skill.needsTool }}
                        @if (isDependencyBlocked(skill)) {
                          <span ptahBadge appearance="outline" size="xs" tone="warn" class="block mt-[var(--ptah-gap-label)] whitespace-nowrap"
                            [attr.data-testid]="'claude-skill-dependency-' + skill.id">
                            {{ skill.needsTool }} tool is off
                          </span>
                          <span [id]="'claude-skill-dep-' + skill.id" class="block mt-[var(--ptah-gap-label)]">
                            This skill is on but unavailable until the {{ skill.needsTool }} tool is on.
                          </span>
                        }
                      </div>
                    }
                  </div>
                }
              } @else {
                @for (row of skeletonRows; track row) {
                  <div class="flex min-h-12 items-center gap-ptah-controls [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] py-ptah-controls" data-testid="claude-tools-skeleton-row">
                    <div class="align-top">
                      <input type="checkbox" ptahCheckbox size="xs" disabled
                        aria-label="Loading skill" />
                    </div>
                    <div class="flex-1"><ptah-skeleton shape="lines" [lines]="1" /></div>
                  </div>
                }
              }
            
          </div>
        </div>

        <!-- Group 3: skills synced from the claude.ai account -->
        <h3 id="claude-tools-group-synced-skills" class="text-xs font-semibold text-base-content mt-[var(--ptah-gap-field)]">
          Skills synced from your claude.ai account (hidden by default)
        </h3>
        <p class="text-xs text-base-content-muted mb-[var(--ptah-gap-label)]">
          Found in your Claude home folder. Turn one on to use it in new sessions.
        </p>
        @if (loaded() && syncedSkills().length === 0) {
          <div class="rounded-lg border border-dashed border-base-300 p-[var(--ptah-gap-field)] text-center text-xs"
            data-testid="claude-tools-synced-empty">
            <strong class="text-base-content">No claude.ai skills found</strong>
            <span class="block text-base-content-muted">
              If you sync skills from your claude.ai account, they will be listed here.
            </span>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <div class="flex flex-col" role="group" aria-labelledby="claude-tools-group-synced-skills">
              
                @if (loaded()) {
                  @for (skill of syncedSkills(); track skill.id) {
                    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-ptah-controls gap-y-[var(--ptah-gap-label)] [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] py-ptah-controls">
                      <div class="align-top">
                        <input
                          type="checkbox"
                          ptahCheckbox size="xs"
                          [checked]="isSkillOn(skill.id)"
                          (change)="toggle('skill', skill.id, $event, skillName(skill))"
                          [ptahBusyDisabled]="saving() || !loaded()"
                          [attr.aria-label]="skillName(skill) + ' skill'"
                          [attr.data-testid]="'settings-toggle-claude-skill-' + skill.id"
                        />
                      </div>
                      <div class="min-w-0 font-semibold text-xs text-base-content break-words">
                        {{ skillName(skill) }}
                      </div>
                      <div class="align-top">
                        <span ptahBadge appearance="outline" size="xs" class="text-base-content">{{ cost(skill.approxTokens) }}</span>
                      </div>
                      <div class="col-start-2 col-span-2 text-xs text-base-content-muted">{{ skill.description }}</div>
                    </div>
                  }
                } @else {
                  @for (row of skeletonRows; track row) {
                    <div class="flex min-h-12 items-center gap-ptah-controls [border-bottom:var(--ptah-border-width)_solid_var(--ptah-border-color)] last:[border-bottom:0] py-ptah-controls" data-testid="claude-tools-skeleton-row">
                      <div class="align-top">
                        <input type="checkbox" ptahCheckbox size="xs" disabled
                          aria-label="Loading skill" />
                      </div>
                      <div class="flex-1"><ptah-skeleton shape="lines" [lines]="1" /></div>
                    </div>
                  }
                }
              
            </div>
          </div>
        }
      }
    </ptah-form-section>
  `,
})
export class ClaudeBuiltinsConfigComponent implements OnInit {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly AlertCircleIcon = AlertCircle;
  readonly skeletonRows = [0, 1, 2] as const;

  /** Toggles are busy while any settings save runs (D3). */
  readonly saving = this.feedback.saving;

  readonly loadState = signal<LoadState>('loading');
  readonly loaded = computed(() => this.loadState() === 'loaded');
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

  /**
   * Sum of the cost of every shown item the session will not get (groups 1-3), rounded to 100; recomputes on every
   * toggle. A skill is hidden when its own checkbox is off or the tool it needs is off: the backend denies a
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
    this.apply(await this.read());
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

  /** The name a row shows and its checkbox label uses: a synced skill's plain name, else its id. */
  skillName(skill: ClaudeBuiltinSkillDto): string {
    return skill.name ?? skill.id;
  }

  /** A skill whose own checkbox is on while the tool it needs is off (design-spec "Dependency blocked"). */
  isDependencyBlocked(skill: ClaudeBuiltinSkillDto): boolean {
    return !!skill.needsTool && this.isSkillOn(skill.id) && !this.isToolOn(skill.needsTool);
  }

  /** `name` labels the toast (`Saved docx skill.`); it defaults to `id`. */
  async toggle(kind: BuiltinKind, id: string, event?: Event, name: string = id): Promise<void> {
    const input = event?.target instanceof HTMLInputElement ? event.target : null;
    const list = kind === 'tool' ? this.enabledTools : this.enabledSkills;
    // Serialization: a save (write, any recovery read) holds `saving()` until it ends, so a second toggle is refused
    // here instead of racing the first one.
    if (this.saving() || !this.loaded()) {
      if (input) input.checked = list().includes(id);
      return;
    }
    const hadFocus = input !== null && input.ownerDocument.activeElement === input;
    const wasOn = list().includes(id);
    list.set(withItem(list(), id, !wasOn));

    const outcome = await this.feedback.saveGeneric({
      label: `${name} ${kind}`,
      write: () => this.saveItem(kind, id, !wasOn),
      undo: () => this.saveItem(kind, id, wasOn),
    });

    if (outcome === 'saved') return;
    // 'refused': nothing was written, so the optimistic change is undone locally. 'failed': the stored lists were
    // already re-read inside the save (or the card fell back to its load error).
    if (outcome === 'refused') list.set(withItem(list(), id, wasOn));
    if (input && this.loaded()) input.checked = list().includes(id);
    if (hadFocus) this.keepFocus(kind, id);
  }

  /**
   * One atomic `agent:setClaudeBuiltin` call for `id` alone: the backend adds or removes that one id in the stored
   * list, so another writer's opt-ins are never replaced. On success the card shows the lists the call returns; on a
   * failed or uncertain result it re-reads the stored lists instead of guessing (D15: fixed text, no host text).
   */
  private async saveItem(kind: BuiltinKind, id: string, enabled: boolean): Promise<WriteResult> {
    try {
      const result = await this.rpcService.call('agent:setClaudeBuiltin', { kind, id, enabled });
      const data = result.isSuccess() ? result.data : undefined;
      if (data?.success === true && Array.isArray(data.enabledTools) && Array.isArray(data.enabledSkills)) {
        this.enabledTools.set(data.enabledTools);
        this.enabledSkills.set(data.enabledSkills);
        return { ok: true };
      }
    } catch {
      // degradation-audit: reported - the stored lists are re-read below and the toast shows the fixed sentence.
    }
    this.apply(await this.read());
    return { ok: false, message: COULD_NOT_UPDATE_CLAUDE_BUILTINS };
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

  /** Puts a read into the card: a failed read or an unverified policy leaves the fixed error and no controls. */
  private apply(data: AgentGetClaudeBuiltinsResult | null): void {
    if (!data) {
      this.loadState.set('failed');
      return;
    }
    if (data.policyStatus !== 'verified') {
      this.loadState.set('unverified');
      return;
    }
    this.tools.set(data.tools ?? []);
    this.terminalSkills.set(data.terminalSkills ?? []);
    this.syncedSkills.set(data.syncedSkills ?? []);
    this.enabledTools.set(data.enabledTools ?? []);
    this.enabledSkills.set(data.enabledSkills ?? []);
    this.loadState.set('loaded');
  }

  /** Focus stays on (or returns to) the checkbox the user toggled, once the re-read state has rendered. */
  private keepFocus(kind: BuiltinKind, id: string): void {
    afterNextRender(
      () => {
        // When the recovery read failed the checkbox is gone; focus moves to the error's Retry instead.
        const target = this.host.nativeElement.querySelector<HTMLElement>(
          `[data-testid="settings-toggle-claude-${kind}-${id}"], [data-testid="claude-tools-load-retry"]`,
        );
        if (target && target.ownerDocument.activeElement !== target) target.focus();
      },
      { injector: this.injector },
    );
  }
}
