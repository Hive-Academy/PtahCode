import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { PtahButtonDirective, SurfaceSectionComponent } from '@ptah-extension/ui';

/** Where an entry sits in the handoff chain relative to the open session. */
export type InspectorLinkedSessionRelation = 'current' | 'from' | 'in';

/**
 * One session of a handoff chain, in chain order (root first). The parent
 * derives `relation` from the open session's position in the chain.
 */
export interface InspectorLinkedSessionEntry {
  readonly sessionId: string;
  readonly label: string | null;
  readonly relation: InspectorLinkedSessionRelation;
}

interface LinkedSessionRow {
  readonly sessionId: string;
  readonly current: boolean;
  readonly title: string;
  readonly fallback: boolean;
  readonly relationText: string;
  readonly ariaLabel: string;
}

const RELATION_TEXT: Record<InspectorLinkedSessionRelation, string> = {
  current: 'This session',
  from: 'Continued from',
  in: 'Continued in',
};

/** Title for an entry whose session has no stored name (`Session 9f3c2a10`). */
function fallbackTitle(sessionId: string): string {
  return `Session ${sessionId.slice(0, 8)}`;
}

function toRow(entry: InspectorLinkedSessionEntry): LinkedSessionRow {
  const label = entry.label?.trim() ?? '';
  const fallback = label.length === 0;
  const title = fallback ? fallbackTitle(entry.sessionId) : label;
  const current = entry.relation === 'current';
  return {
    sessionId: entry.sessionId,
    current,
    title,
    fallback,
    relationText: RELATION_TEXT[entry.relation],
    ariaLabel: current
      ? `Current session, ${title}`
      : `Open ${title}, ${RELATION_TEXT[entry.relation].toLowerCase()}`,
  };
}

let nextSectionId = 0;

/**
 * `ptah-inspector-linked-sessions`: the handoff chain of the open session in
 * the expanded stats sidebar (TASK_2026_876). Root first, every session
 * listed; the list scrolls after five rows. Presentational only: the parent
 * loads the chain and omits this component when the chain is empty.
 *
 * Every row is a button. The current one marks itself (`aria-current`, the
 * selected-agent bar, semibold) and activating it emits nothing; another row
 * emits `openSession` with that session's id.
 */
@Component({
  selector: 'ptah-inspector-linked-sessions',
  standalone: true,
  imports: [PtahButtonDirective, SurfaceSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .linked-session-button {
      scroll-margin-block: 4px;
    }
  `,
  template: `
    <ptah-surface-section
      padding="md"
      role="region"
      class="block border-t border-surface-border [&>section]:gap-1 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:px-0 [&>section]:py-2"
      data-testid="inspector-linked-sessions"
      [attr.aria-labelledby]="headingId"
    >
      <div section-header class="flex min-h-6 items-center justify-between gap-2 px-3">
        <h3 [id]="headingId" class="sec-label text-[10.5px] font-semibold uppercase">
          LINKED SESSIONS
        </h3>
        <span class="text-[10.5px] tabular-nums text-base-content-muted" data-testid="inspector-linked-session-count">
          {{ rows().length }}
        </span>
      </div>
      <ul
        class="max-h-[8.75rem] overflow-y-auto"
        role="list"
        data-testid="inspector-linked-sessions-list"
      >
        @for (row of rows(); track row.sessionId) {
          <li>
            <button
              type="button"
              ptahButton variant="ghost" size="sm" density="compact" align="row" selectedAs="current"
              class="linked-session-button w-full text-left"
              [selected]="row.current ? true : undefined"
              data-testid="inspector-linked-session"
              [attr.data-session-id]="row.sessionId"
              [attr.aria-label]="row.ariaLabel"
              (click)="activate(row)"
            >
              @if (row.current) {
                <span
                  class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-secondary"
                  aria-hidden="true"
                ></span>
              }
              <span
                class="min-w-0 flex-1 truncate px-1 text-[11.5px] leading-[18px]"
                [class.font-semibold]="row.current"
                data-testid="inspector-linked-session-title"
                [class.text-base-content-muted]="row.fallback"
                [attr.title]="row.title"
                >{{ row.title }}</span
              >
              <span
                class="shrink-0 whitespace-nowrap pr-1 text-[10.5px] font-normal leading-4 text-base-content-muted"
                data-testid="inspector-linked-session-relation"
                >{{ row.relationText }}</span
              >
            </button>
          </li>
        }
      </ul>
    </ptah-surface-section>
  `,
})
export class InspectorLinkedSessionsComponent {
  /** The chain, root first. The parent omits this component when it is empty. */
  readonly entries = input.required<readonly InspectorLinkedSessionEntry[]>();
  /** The open session's id; the entry with this id is the current row. */
  readonly currentSessionId = input<string | null>(null);

  /** Another chain entry was activated: open that session. */
  readonly openSession = output<string>();

  protected readonly headingId = `ptah-linked-sessions-h-${++nextSectionId}`;

  protected readonly rows = computed(() => {
    const currentId = this.currentSessionId();
    return this.entries().map((entry) =>
      toRow(
        currentId !== null && entry.sessionId === currentId
          ? { ...entry, relation: 'current' }
          : entry,
      ),
    );
  });

  protected activate(row: LinkedSessionRow): void {
    // The current session is already open; the button keeps focus.
    if (row.current) return;
    this.openSession.emit(row.sessionId);
  }
}
