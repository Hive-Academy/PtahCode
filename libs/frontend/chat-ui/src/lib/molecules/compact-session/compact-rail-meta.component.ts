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

@Component({
  selector: 'ptah-compact-rail-meta',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'rc-line flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-base-content-muted',
  },
  styles: [
    `
      .rc-ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rc-task {
        max-width: 72px;
        flex-shrink: 1;
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
        >{{ agentLabel() }}</span
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
        aria-label="Context used"
        [title]="roundedContextPercent() + '% context used'"
        >{{ roundedContextPercent() }}% ctx</span
      >
    }
    <span
      class="ml-auto shrink-0 tabular-nums"
      [title]="gitTitle(gitStats())"
      >{{ gitCount() }}</span
    >
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
  readonly gitCount = computed(() => {
    const git = this.gitStats();
    return git.kind === 'known' ? `+${git.additions} −${git.deletions}` : '—';
  });
}
