import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type {
  CompactGitState,
  CompactLinkedTask,
  CompactTodoState,
} from './compact-session-metrics';
import {
  gitTitle,
  linkedTaskTitle,
  todoTitle,
} from './compact-session-metrics';
import type {
  CompactLaneSummary,
  CompactRailDensity,
} from './compact-lane.types';

/** 3829 → "3.8K", 999950 → "1M" (lower-cased in the template text). */
const COMPACT_COUNT = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

@Component({
  selector: 'ptah-compact-rail-meta',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'rc-line flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-base-content-muted',
    '[class.rc-meta-dense]': 'dense()',
  },
  styles: [
    `
      :host button,
      :host a[href] {
        pointer-events: auto;
      }
      .rc-ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* The task id gives up its width first; its full id is in the title. */
      .rc-task {
        max-width: 72px;
        min-width: 1.25rem;
        flex-shrink: 1000;
      }
      .rc-action {
        flex-shrink: 0;
        height: 18px;
        padding: 0 4px;
        border-radius: 4px;
        font-size: 10px;
      }
      .rc-action:hover {
        box-shadow: inset 0 0 0 1px currentColor;
      }
      .rc-action:focus-visible {
        outline: 2px solid var(--rail-state-ink);
        outline-offset: -2px;
      }
      /* Chips shrink with an ellipsis so the diff stats at the row end stay
       visible on a narrow rail. Each chip carries its full text in a title. */
      .rc-chip {
        flex-shrink: 1;
        min-width: 1.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
        border-radius: 4px;
      }
      :host(.rc-meta-dense) {
        gap: 3px;
      }
      :host(.rc-meta-dense) .badge.rc-chip {
        padding: 0 3px;
      }
    `,
  ],
  template: `
    @if (density() === 'dense' && lanes().total > 0) {
      <button
        type="button"
        class="rc-action bg-base-300 text-base-content"
        [attr.aria-label]="'Open the ' + lanes().total + ' lanes of ' + title()"
        [tabIndex]="innerTabbable() ? 0 : -1"
        (click)="moreLanes.emit()"
      >
        +{{ lanes().total }}
      </button>
    }
    @if (density() === 'comfortable' && lanes().moreCount > 0) {
      <button
        type="button"
        class="rc-action rc-lane-overflow bg-base-300 text-base-content"
        [attr.aria-label]="
          'Open ' + lanes().moreCount + ' more lanes of ' + title()
        "
        [tabIndex]="innerTabbable() ? 0 : -1"
        (click)="moreLanes.emit()"
      >
        +{{ lanes().moreCount }} more
      </button>
    }
    @if (todos().kind === 'known') {
      <span class="rc-chip" [title]="todoTitle(todos())">{{
        todoCount()
      }}</span>
    }
    @if (linkedTask(); as task) {
      <span
        class="rc-ellipsis rc-task font-mono"
        data-testid="rail-linked-task"
        [class.line-through]="task.missing"
        [title]="linkedTaskTitle(task)"
        [attr.aria-label]="linkedTaskTitle(task)"
        >{{ task.taskId }}</span
      >
    }
    @if (agentCount() > 0) {
      <span
        class="badge badge-xs badge-outline rc-chip"
        [title]="agentLabel()"
        [attr.aria-label]="agentLabel()"
        >{{ dense() ? agentCount() + ' ag' : agentLabel() }}</span
      >
    }
    @if (lanes().kinds.cli; as count) {
      <span
        class="badge badge-xs badge-outline rc-chip"
        [title]="count + ' CLI'"
        >{{ count }} CLI</span
      >
    }
    @if (roundedContextPercent() !== null) {
      <span
        class="badge badge-xs badge-outline rc-chip"
        [attr.aria-label]="roundedContextPercent() + '% context used'"
        [title]="roundedContextPercent() + '% context used'"
        >{{ roundedContextPercent() }}%{{ dense() ? '' : ' ctx' }}</span
      >
    }
    <span class="ml-auto shrink-0 tabular-nums" [title]="gitTooltip()">{{
      gitCount()
    }}</span>
  `,
})
export class CompactRailMetaComponent {
  readonly title = input('');
  readonly density = input<CompactRailDensity>('comfortable');
  readonly lanes = input.required<CompactLaneSummary>();
  readonly todos = input.required<CompactTodoState>();
  readonly linkedTask = input<CompactLinkedTask | null>(null);
  readonly agentCount = input(0);
  readonly contextPercent = input<number | null>(null);
  readonly gitStats = input.required<CompactGitState>();
  readonly innerTabbable = input(false);
  readonly moreLanes = output<void>();
  readonly todoTitle = todoTitle;
  readonly gitTitle = gitTitle;
  readonly linkedTaskTitle = linkedTaskTitle;
  readonly todoCount = computed(() => {
    const todo = this.todos();
    return todo.kind === 'known' ? `${todo.done}/${todo.total}` : '';
  });
  readonly agentLabel = computed(() => {
    const count = this.agentCount();
    return `${count} ${count === 1 ? 'agent' : 'agents'}`;
  });
  readonly roundedContextPercent = computed(() => {
    const percent = this.contextPercent();
    return percent === null ? null : Math.round(percent);
  });
  readonly dense = computed(() => this.density() === 'dense');
  /** Dense cards show 1000+ line counts as "3.8k"; the title keeps the exact numbers. */
  readonly gitCount = computed(() => {
    const git = this.gitStats();
    if (git.kind !== 'known') return '—';
    const n = (value: number) =>
      this.dense() && value >= 1000
        ? COMPACT_COUNT.format(value).toLowerCase()
        : `${value}`;
    return `+${n(git.additions)} −${n(git.deletions)}`;
  });
  readonly gitTooltip = computed(() => {
    const git = this.gitStats();
    const base = gitTitle(git);
    return git.kind === 'known'
      ? `${base} (+${git.additions} −${git.deletions})`
      : base;
  });
}
