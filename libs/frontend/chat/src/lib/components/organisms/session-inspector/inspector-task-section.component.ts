import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import {
  BATCHES_FILE,
  CARRIER_FILE,
  IMPLEMENTATION_PLAN_FILE,
  LEGACY_BATCHES_FILE,
  TASK_DESCRIPTION_FILE,
  type TaskDigest,
  type TaskDigestDocument,
  type TaskStatus,
} from '@ptah-extension/shared';
import { TASK_STATUS_LABELS } from '@ptah-extension/tasks-ui/presentation';
import {
  Ban,
  Check,
  CircleAlert,
  Circle,
  CircleCheck,
  CircleDot,
  CircleX,
  Eye,
  FileText,
  Folder,
  LucideAngularModule,
  TriangleAlert,
  type LucideIconData,
} from 'lucide-angular';
import {
  SessionTaskReader,
  type TaskDocumentFailure,
} from './session-task-reader';

import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDisclosureComponent,
  PtahIconButtonDirective,
  PtahMeterComponent,
  PtahRelativeTimeComponent,
  PtahSkeletonComponent,
  PtahStatComponent,
  SurfaceSectionComponent,
  type PtahStatValueTone,
} from '@ptah-extension/ui';
/** Shape cue per status, so status is never carried by colour alone (17.2). */
const STATUS_ICON: Readonly<Record<TaskStatus, LucideIconData>> = {
  backlog: Circle,
  in_progress: CircleDot,
  in_review: Eye,
  blocked: Ban,
  done: CircleCheck,
  cancelled: CircleX,
};

const PRIMARY_DOCUMENTS = [
  CARRIER_FILE,
  TASK_DESCRIPTION_FILE,
  IMPLEMENTATION_PLAN_FILE,
] as const;

function basename(file: string): string {
  return file.split(/[\\/]/).pop()?.toLowerCase() ?? '';
}

function groupFallbackDocuments(documents: readonly string[]): {
  primary: string[];
  other: string[];
} {
  const primary = PRIMARY_DOCUMENTS.flatMap((name) =>
    documents.filter((file) => basename(file) === name),
  );
  const list =
    documents.find((file) => basename(file) === BATCHES_FILE) ??
    documents.find((file) => basename(file) === LEGACY_BATCHES_FILE);
  if (list) primary.push(list);
  return {
    primary,
    other: documents.filter((file) => !primary.includes(file)),
  };
}

type DocumentGroup<T> = { primary: T[]; other: T[] };

const PRIMARY_KINDS: readonly TaskDigestDocument['kind'][] = [
  'carrier',
  'requirements',
  'design',
  'plan',
  'batches',
];

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function groupTaskDocuments(
  documents: readonly string[],
): DocumentGroup<string>;
export function groupTaskDocuments(
  documents: readonly TaskDigestDocument[],
): DocumentGroup<TaskDigestDocument>;
export function groupTaskDocuments(
  documents: readonly string[] | readonly TaskDigestDocument[],
): DocumentGroup<string> | DocumentGroup<TaskDigestDocument> {
  const eligible: TaskDigestDocument[] = [];
  const fallback: string[] = [];
  for (const doc of documents) {
    if (typeof doc === 'string') fallback.push(doc);
    else if (doc.openable) eligible.push(doc);
  }
  if (fallback.length) return groupFallbackDocuments(fallback);

  const latest = eligible.filter((doc) => doc.latest);
  const reviews = latest
    .filter((doc) => doc.kind === 'reviews')
    .sort((a, b) => b.mtime - a.mtime || compareNames(a.name, b.name))
    .slice(0, 4);
  const primary = [
    ...PRIMARY_KINDS.flatMap((kind) =>
      latest
        .filter((doc) => doc.kind === kind)
        .sort((a, b) => compareNames(a.group, b.group)),
    ),
    ...reviews,
  ];
  const chips = new Set(primary);
  return {
    primary,
    other: eligible.filter((doc) => !chips.has(doc) && doc.readable !== false),
  };
}

interface TaskStat {
  id: string;
  label: string;
  name: string;
  title: string;
  value: number | null;
  tone?: PtahStatValueTone;
}

const DOCUMENT_FAILURE: Record<TaskDocumentFailure, string> = {
  unavailable: 'The document is unavailable.',
  'not-openable': 'This document can no longer be opened.',
  stale: 'The linked task changed.',
  missing: 'The document was not found.',
  rejected: 'The document is unreadable.',
  unreadable: 'The document is unreadable.',
  binary: 'This file is binary and cannot be previewed.',
  directory: 'This entry is a folder.',
  too_large: 'The document is too large to preview.',
};

let nextTaskSectionId = 0;

@Component({
  selector: 'ptah-inspector-task-section',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahDisclosureComponent,
    PtahIconButtonDirective,
    PtahMeterComponent,
    PtahRelativeTimeComponent,
    PtahSkeletonComponent,
    PtahStatComponent,
    SurfaceSectionComponent,
  ],
  providers: [SessionTaskReader],
  host: { '[class.task-menu-open]': 'menuOpen()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (reader.state(); as state) {
      @let data = state.data;
      @let busy = state.status === 'loading';
      @let failed = state.status === 'error';
      @let digest = readyDigest();
      @let lastModified = digest?.lastModified;
      <ptah-surface-section
        tone="flush"
        class="task-section block border-t border-surface-border"
        padding="md"
        role="region"
        [attr.aria-labelledby]="headingId"
        [attr.aria-busy]="busy ? 'true' : null"
        (document:keydown.escape)="closeOnEscape()"
        (document:click)="closeOnOutsideClick($event)"
        data-inspector-section="task"
      >
        <div
          section-header
          class="flex min-w-0 items-center justify-between gap-2"
        >
          <h3
            [id]="headingId"
            class="text-xs font-semibold uppercase tracking-wide"
          >
            Task
          </h3>
          <div class="flex min-w-0 items-center gap-1">
            @if (data?.task; as task) {
              <span
                ptahBadge
                data-testid="task-status"
                class="shrink-0 gap-1"
                [tone]="statusTone(task.status)"
              >
                <lucide-angular
                  [img]="statusIcon(task.status)"
                  class="size-3 shrink-0"
                  aria-hidden="true"
                />
                {{ statusLabels[task.status] }}
              </span>
            }
            @if (data?.lead?.taskId; as id) {
              <span
                ptahBadge
                appearance="outline"
                data-testid="task-id"
                class="min-w-0 font-mono"
                [title]="id"
              >
                <span class="ptah-badge-text">{{ id }}</span>
              </span>
            }
          </div>
        </div>

        @if (state.status === 'unknown' && data?.lead?.missing) {
          <p class="flex items-center gap-1.5 text-xs text-base-content-muted">
            <lucide-angular
              [img]="alertIcon"
              class="size-3.5 shrink-0"
              aria-hidden="true"
            />
            Task folder not found
          </p>
        } @else {
          @if (data?.task; as task) {
            <p class="truncate text-[13px] font-semibold" [title]="task.title">
              {{ task.title }}
            </p>
          }

          <div
            class="flex items-center gap-2 text-[11px] text-base-content-muted"
          >
            @if (data?.stage; as stage) {
              <span class="shrink-0">{{ stage }}</span>
            }
            @if (digest?.progress; as progress) {
              @if (progressCapped()) {
                <ptah-meter
                  class="min-w-0 flex-1"
                  role="img"
                  [attr.aria-label]="
                    'Task progress incomplete: at least ' +
                    progress.done +
                    ' of at least ' +
                    progress.total +
                    ' tasks complete, ' +
                    progress.source +
                    ' was read in part'
                  "
                  label=""
                  [value]="0"
                  [max]="0"
                  size="xs"
                  [hideLabel]="true"
                  [showValue]="false"
                />
                <span
                  class="shrink-0"
                  aria-hidden="true"
                  [title]="progress.source + ' was read in part'"
                >
                  <b class="tabular-nums"
                    >≥{{ progress.done }}/≥{{ progress.total }}</b
                  >
                  tasks
                </span>
              } @else {
              <ptah-meter
                class="min-w-0 flex-1"
                [value]="progress.done"
                [max]="progress.total"
                [label]="
                  progress.done +
                  ' of ' +
                  progress.total +
                  ' tasks complete, from ' +
                  progress.source
                "
                size="xs"
                tone="neutral"
                [hideLabel]="true"
                [showValue]="false"
                [animate]="false"
                barRole="progressbar"
              />
              <span
                class="shrink-0"
                [title]="'Task progress from ' + progress.source"
              >
                <b class="tabular-nums"
                  >{{ progress.done }}/{{ progress.total }}</b
                >
                tasks
              </span>
              }
            } @else {
              <ptah-meter
                class="min-w-0 flex-1"
                role="img"
                aria-label="Task progress not available"
                label=""
                [value]="0"
                [max]="0"
                size="xs"
                [hideLabel]="true"
                [showValue]="false"
              />
              <span class="shrink-0"
                ><span aria-hidden="true">—</span
                ><span class="sr-only">Not available</span> tasks</span
              >
            }
          </div>

          <div class="task-stats" role="group" aria-label="Task statistics">
            @for (stat of stats(); track stat.id) {
              <div
                class="task-stat"
                role="group"
                [attr.aria-label]="
                  stat.name +
                  ': ' +
                  (busy ? 'loading' : (stat.value ?? 'not available'))
                "
              >
                <ptah-stat
                  aria-hidden="true"
                  appearance="plain"
                  size="xs"
                  [attr.data-testid]="'task-stat-' + stat.id"
                  [class.pending-stat]="
                    stat.id === 'pending' &&
                    stat.value !== null &&
                    stat.value > 0
                  "
                  [label]="stat.label"
                  [value]="busy ? '' : (stat.value ?? '—')"
                  placeholder=""
                  [valueTone]="stat.tone"
                  [title]="stat.title"
                >
                  @if (
                    stat.id === 'pending' &&
                    stat.value !== null &&
                    stat.value > 0
                  ) {
                    <lucide-angular
                      ptahStatIcon
                      [img]="pendingIcon"
                      class="size-3 text-state-need"
                    />
                  }
                  @if (busy) {
                    <ptah-skeleton
                      ptahStatMedia
                      [lines]="1"
                      size="sm"
                      class="block h-5 w-7 pt-1.5"
                    />
                  }
                </ptah-stat>
              </div>
            }
          </div>

          <div class="mt-0.5 text-[11px] text-base-content-muted">
            @if (busy) {
              <ptah-skeleton
                [lines]="1"
                size="sm"
                class="block h-4 w-24 pt-1"
              />
            } @else {
              changed
              @if (lastModified !== null && lastModified !== undefined) {
                <ptah-relative-time
                  class="font-semibold text-base-content"
                  [value]="lastModified"
                />
              } @else {
                <span aria-hidden="true">—</span
                ><span class="sr-only">not available</span>
              }
              @if (digest?.truncated) {
                <span
                  [title]="
                    'Task digest limits reached: ' +
                    digest.truncatedReasons.join(', ')
                  "
                >
                  · partial</span
                >
              }
            }
          </div>

          @if (failed) {
            <div
              role="status"
              class="flex items-center gap-2 py-0.5 text-xs text-base-content-muted"
            >
              <lucide-angular
                [img]="alertIcon"
                class="size-3.5 shrink-0 text-state-need"
                aria-hidden="true"
              />
              <span class="flex-1">Task statistics unavailable</span>
              <button
                type="button"
                ptahButton
                variant="ghost"
                size="xs"
                aria-label="Retry loading task statistics"
                (click)="reader.retry()"
              >
                Retry
              </button>
            </div>
          }

          <div class="task-disclosures">
            @let docs = documentGroups();
            <ptah-disclosure
              class="documents-disclosure"
              label=""
              size="sm"
              [open]="documentsOpen()"
              (openChange)="setDocumentsOpen($event)"
            >
              <span ptahDisclosureLead aria-hidden="true">Documents</span>
              <span ptahDisclosureSummary class="tile-summary">
                <span class="sr-only">{{ documentDisclosureLabel() }}</span>
                <span
                  aria-hidden="true"
                  class="text-lg font-semibold tabular-nums"
                  >{{ docs.primary.length + docs.other.length }}</span
                >
                @if (!busy) {
                  <span aria-hidden="true" class="tile-sub">
                    {{ reviewSummary() }}
                    @if (reviseCount() > 0) {
                      ·
                      <span class="font-semibold text-state-need"
                        >! {{ reviseCount() }} revise</span
                      >
                    } @else if (allReviewsApproved()) {
                      ·
                      <span class="font-semibold text-state-done"
                        >✓ approved</span
                      >
                    }
                  </span>
                }
              </span>
              @if (busy) {
                <ptah-skeleton
                  ptahDisclosureMeta
                  [lines]="1"
                  size="sm"
                  class="disclosure-skeleton pointer-events-none block w-16"
                />
              }

              @if (documentsOpen()) {
                <div
                  class="task-panel"
                  role="region"
                  aria-label="Task documents"
                >
                  <div class="flex flex-wrap items-center gap-1">
                    @for (doc of docs.primary; track doc.name) {
                      <button
                        type="button"
                        class="task-chip max-w-full"
                        [disabled]="doc.unreadable"
                        [attr.aria-label]="doc.label"
                        [attr.aria-pressed]="
                          reader.preview()?.file === doc.name
                        "
                        [attr.aria-controls]="
                          reader.preview()?.file === doc.name ? previewId : null
                        "
                        [title]="doc.label"
                        (click)="toggleDocument(doc.name)"
                      >
                        <span
                          ptahBadge
                          appearance="outline"
                          class="min-w-0 gap-1 font-mono"
                        >
                          <lucide-angular
                            [img]="fileIcon"
                            class="size-3 shrink-0"
                            aria-hidden="true"
                          />
                          <span class="ptah-badge-text">{{ doc.name }}</span>
                          @if (doc.unreadable) {
                            <span class="shrink-0 text-base-content-muted"
                              >unreadable</span
                            >
                          } @else if (doc.review) {
                            @switch (doc.review.verdict) {
                              @case ('Approved') {
                                <span class="verdict text-state-done">
                                  <lucide-angular
                                    [img]="checkIcon"
                                    class="size-3"
                                  />
                                  Approved
                                </span>
                              }
                              @case ('Revise') {
                                <span class="verdict text-state-need">
                                  <lucide-angular
                                    [img]="pendingIcon"
                                    class="size-3"
                                  />
                                  Revise
                                </span>
                              }
                              @default {
                                <span class="verdict text-base-content-muted"
                                  >—</span
                                >
                              }
                            }
                            @if (doc.review.findings) {
                              <span
                                class="shrink-0 tabular-nums text-base-content-muted"
                                >{{ doc.review.findings }}</span
                              >
                            }
                          }
                        </span>
                      </button>
                    }
                    @if (docs.other.length) {
                      <div #dropdownRoot class="min-w-0 max-w-full">
                        <button
                          #documentsToggle
                          type="button"
                          class="task-chip"
                          aria-haspopup="menu"
                          [attr.aria-expanded]="menuOpen()"
                          [attr.aria-controls]="documentsMenuId"
                          [attr.aria-label]="
                            docs.other.length + ' more task documents'
                          "
                          (click)="toggleMenu($event)"
                          (keydown.arrowdown)="openMenuFromKeyboard($event)"
                        >
                          <span ptahBadge appearance="outline"
                            >+{{ docs.other.length }} more</span
                          >
                        </button>
                        <ul
                          [id]="documentsMenuId"
                          role="menu"
                          aria-label="More task documents"
                          [hidden]="!menuOpen()"
                          (keydown)="navigateMenu($event)"
                          (focusout)="closeOnFocusLeave($event)"
                          class="document-menu"
                        >
                          @if (menuOpen()) {
                            @for (doc of docs.other; track doc.name) {
                              <li role="none">
                                <button
                                  type="button"
                                  ptahButton
                                  variant="ghost"
                                  size="xs"
                                  role="menuitem"
                                  tabindex="-1"
                                  class="w-full min-w-0 justify-start font-mono"
                                  [title]="doc.label"
                                  [attr.aria-label]="doc.label"
                                  (click)="selectOtherDocument(doc.name)"
                                >
                                  <span class="truncate">{{ doc.name }}</span>
                                </button>
                              </li>
                            }
                          }
                        </ul>
                      </div>
                    }
                    @if (relatedCount() > 0) {
                      <button
                        type="button"
                        class="task-chip"
                        [attr.aria-expanded]="relatedOpen()"
                        [attr.aria-controls]="relatedId"
                        [attr.aria-label]="relatedLabel()"
                        (click)="relatedOpen.set(!relatedOpen())"
                      >
                        <span ptahBadge appearance="outline"
                          >+{{ relatedCount() }} related</span
                        >
                      </button>
                    }
                    @if (!docs.primary.length && !docs.other.length && !busy) {
                      <p class="text-xs text-base-content-muted">
                        No documents yet
                      </p>
                    }
                  </div>

                  @if (reader.preview(); as preview) {
                    <div
                      [id]="previewId"
                      role="region"
                      [attr.aria-label]="'Preview of ' + preview.file"
                      class="mt-2 min-w-0 rounded-lg border border-surface-border bg-surface-1 p-3"
                    >
                      <div
                        class="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span
                          class="min-w-0 flex-1 truncate font-mono"
                          [title]="preview.file"
                          >{{ preview.file }}</span
                        >
                        @if (reader.canOpen && preview.status === 'ready') {
                          <button
                            #openButton
                            type="button"
                            ptahButton
                            variant="ghost"
                            size="xs"
                            [attr.aria-describedby]="
                              reader.openError()?.file === preview.file
                                ? openErrorId
                                : null
                            "
                            (click)="
                              reader.openDocument(preview.file, openButton)
                            "
                          >
                            Open
                          </button>
                        }
                        <button
                          type="button"
                          ptahIconButton
                          size="xs"
                          label="Close document preview"
                          (click)="reader.closePreview()"
                        >
                          ×
                        </button>
                      </div>
                      @switch (preview.status) {
                        @case ('loading') {
                          <div
                            role="status"
                            aria-label="Loading document preview"
                          >
                            <ptah-skeleton shape="block" size="sm" />
                          </div>
                        }
                        @case ('error') {
                          <p class="text-xs text-base-content-muted">
                            {{ documentFailure[preview.reason] }}
                            <button
                              type="button"
                              ptahButton
                              variant="ghost"
                              size="xs"
                              (click)="reader.previewDocument(preview.file)"
                            >
                              Retry
                            </button>
                          </p>
                        }
                        @case ('ready') {
                          <pre
                            class="mt-1 max-h-[12lh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-4 text-base-content-muted"
                            >{{ preview.content }}</pre>
                        }
                      }
                      @if (reader.openError()?.file === preview.file) {
                        <p
                          [id]="openErrorId"
                          role="alert"
                          class="text-[11px] text-state-err"
                        >
                          Could not open {{ preview.file }}.
                          @if (reader.openError(); as openError) {
                            {{ documentFailure[openError.reason] }}
                          }
                        </p>
                      }
                    </div>
                  }

                  @if (data && relatedCount() > 0) {
                    <ul
                      [id]="relatedId"
                      [hidden]="!relatedOpen()"
                      aria-label="Other linked tasks"
                      class="mt-2 border-t border-surface-border pt-2"
                    >
                      @for (related of data.related; track related.taskId) {
                        <li
                          class="truncate font-mono text-[11px] text-base-content-muted"
                          [title]="related.title ?? related.taskId"
                        >
                          {{ related.taskId }}
                          @if (related.title) {
                            · {{ related.title }}
                          }
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            </ptah-disclosure>

            @let folders = digest?.directories ?? [];
            @if (folders.length) {
              <ptah-disclosure
                class="folders-disclosure"
                label=""
                size="sm"
                [open]="foldersOpen()"
                (openChange)="foldersOpen.set($event)"
              >
                <span ptahDisclosureLead aria-hidden="true">Folders</span>
                <span ptahDisclosureSummary class="tile-summary">
                  <span class="sr-only">{{ folderDisclosureLabel() }}</span>
                  <span
                    aria-hidden="true"
                    class="text-lg font-semibold tabular-nums"
                    >{{ folderCount() }}</span
                  >
                  <span aria-hidden="true" class="tile-sub">
                    <b class="tabular-nums">{{ folderFileTotal() }}</b> files
                  </span>
                </span>
                @if (foldersOpen()) {
                  <div
                    class="task-panel"
                    role="region"
                    aria-label="Task folders, file counts only"
                  >
                    <ul class="grid">
                      @for (folder of folders; track folder.name) {
                        <li
                          class="flex min-w-0 items-baseline gap-x-2 text-[11px] leading-[18px] text-base-content-muted"
                        >
                          <lucide-angular
                            [img]="folderIcon"
                            class="size-3 shrink-0 self-center"
                            aria-hidden="true"
                          />
                          <span
                            class="flex-1 truncate font-mono text-base-content"
                            [title]="folder.name + '/'"
                            >{{ folder.name }}/</span
                          >
                          @if (!hasFolderCount(folder)) {
                            <span class="shrink-0">not counted</span>
                          } @else {
                            @if (folder.markdown > 0 || folder.images > 0) {
                              <span class="shrink-0 tabular-nums">
                                @if (folder.markdown > 0) {
                                  {{ folder.markdown }} md
                                }
                                @if (folder.markdown > 0 && folder.images > 0) {
                                  ·
                                }
                                @if (folder.images > 0) {
                                  {{ folder.images }} img
                                }
                              </span>
                            }
                            <span class="shrink-0 tabular-nums"
                              ><b
                                >{{ folder.truncated ? '≥' : ''
                                }}{{ folder.files }}</b
                              >
                              files</span
                            >
                          }
                        </li>
                      }
                    </ul>
                  </div>
                }
              </ptah-disclosure>
            } @else if (busy || failed) {
              <button
                type="button"
                disabled
                class="folders-unavailable"
                [attr.aria-label]="
                  busy ? 'Folders loading' : 'Folders not available'
                "
              >
                <span class="text-xs text-base-content-muted">Folders</span>
                <span
                  class="block text-lg font-semibold text-base-content-muted"
                >
                  @if (failed) {
                    —
                  }
                </span>
                <span class="tile-sub">
                  @if (failed) {
                    files —
                  }
                </span>
              </button>
              @if (busy) {
                <div class="folder-skeleton pointer-events-none grid gap-2">
                  <ptah-skeleton [lines]="1" size="sm" class="block w-7" />
                  <ptah-skeleton [lines]="1" size="sm" class="block w-11" />
                </div>
              }
            }
          </div>
        }
      </ptah-surface-section>
    }
  `,
  styles: `
    :host {
      container-type: inline-size;
    }
    :host(.task-menu-open) {
      position: relative;
      z-index: 20;
    }
    .task-section ::ng-deep > section {
      padding: 0.75rem;
      gap: 0.375rem;
    }
    .task-stats,
    .task-disclosures {
      display: grid;
      min-width: 0;
    }
    .task-stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .task-stat {
      --ptah-chart-warn: var(--state-ink-need);
      min-width: 0;
      padding: 0.125rem 0.25rem 0.25rem 0.5rem;
    }
    .task-stat + .task-stat {
      border-inline-start: 1px solid var(--surface-border);
    }
    .task-stat:first-child {
      padding-inline-start: 0;
    }
    .pending-stat ::ng-deep [ptahStatIcon] {
      inset: 0.125rem auto auto 0;
    }
    .pending-stat ::ng-deep > div > span:nth-child(2) {
      padding-inline: 0.875rem 0;
    }
    @container (max-width: 380px) {
      .task-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .task-stat:nth-child(n + 3) {
        border-block-start: 1px solid var(--surface-border);
      }
      .task-stat:nth-child(odd) {
        border-inline-start: 0;
        padding-inline-start: 0;
      }
    }
    .task-disclosures {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: auto auto auto;
      border-top: 1px solid var(--surface-border);
      padding-block-start: 0.375rem;
    }
    .task-disclosures > ptah-disclosure {
      display: contents;
    }
    .task-disclosures ::ng-deep ptah-disclosure > div:first-child {
      grid-row: 1;
      position: relative;
      display: grid;
      min-width: 0;
      align-items: start;
    }
    .documents-disclosure ::ng-deep > div:first-child {
      grid-column: 1;
    }
    .documents-disclosure:only-child ::ng-deep > div:first-child {
      grid-column: 1 / -1;
    }
    .folders-disclosure ::ng-deep > div:first-child,
    .folders-unavailable {
      grid-column: 2;
      border-inline-start: 1px solid var(--surface-border);
      padding-inline-start: 0.5rem;
    }
    .task-disclosures ::ng-deep ptah-disclosure > div:first-child > button {
      display: grid;
      grid-template-columns: auto 1fr;
      justify-content: start;
      column-gap: 0.25rem;
      row-gap: 0.125rem;
      min-height: 3.5rem;
      text-align: start;
      font-weight: normal;
      color: oklch(var(--bcm, var(--bc)));
    }
    .task-disclosures
      ::ng-deep
      ptah-disclosure
      > div:first-child
      > button
      > svg {
      grid-area: 1 / 2;
      width: 0.75rem;
      height: 0.75rem;
    }
    .task-disclosures
      ::ng-deep
      ptah-disclosure
      > div:first-child
      > button
      > [ptahDisclosureLead] {
      grid-area: 1 / 1;
    }
    .task-disclosures
      ::ng-deep
      ptah-disclosure
      > div:first-child
      > button
      > span:empty {
      display: none;
    }
    .task-disclosures ::ng-deep ptah-disclosure > div:last-child {
      grid-column: 1 / -1;
      min-width: 0;
    }
    .documents-disclosure ::ng-deep > div:last-child {
      grid-row: 2;
    }
    .folders-disclosure ::ng-deep > div:last-child {
      grid-row: 3;
    }
    .tile-summary {
      display: grid;
      grid-column: 1 / -1;
      color: oklch(var(--bc));
    }
    .tile-sub {
      display: block;
      font-size: 0.6875rem;
      color: oklch(var(--bcm, var(--bc)));
    }
    .disclosure-skeleton {
      position: absolute;
      inset: auto auto 0.125rem 0;
    }
    .folders-unavailable {
      grid-row: 1;
      min-height: 3.5rem;
      display: grid;
      gap: 0.125rem;
      text-align: start;
    }
    .folder-skeleton {
      grid-area: 1 / 2;
      align-self: end;
      margin: 0 0 0.125rem 0.5625rem;
    }
    .task-panel {
      position: relative;
      margin-top: 0.375rem;
      border: 1px solid var(--surface-border-strong);
      border-radius: var(--ptah-card-radius);
      background: var(--surface-3);
      box-shadow: var(--elev-shadow-raised);
      padding: 0.625rem 0.75rem;
    }
    .task-chip {
      display: inline-flex;
      min-width: 0;
      border-radius: var(--ptah-radius-chip);
    }
    .task-chip:disabled {
      opacity: 0.75;
    }
    .task-chip[aria-pressed='true'] > span,
    .task-chip:not(:disabled):hover > span {
      border-color: var(--surface-border-strong);
    }
    .task-chip:focus-visible {
      outline: var(--ptah-focus-ring-width) solid var(--ptah-focus-ring-color);
      outline-offset: var(--ptah-focus-ring-offset);
    }
    .verdict {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
      flex-shrink: 0;
      font-weight: 600;
    }
    .document-menu {
      position: absolute;
      z-index: 20;
      inset-inline-start: 0.75rem;
      margin-top: 0.25rem;
      width: max-content;
      max-width: min(15rem, calc(100% - 1.5rem));
      max-height: 14rem;
      overflow: auto;
      border: 1px solid var(--surface-border);
      border-radius: var(--ptah-card-radius);
      background: var(--surface-1);
      padding: 0.25rem;
      box-shadow: var(--elev-shadow-raised);
    }
  `,
})
export class InspectorTaskSectionComponent {
  protected readonly reader = inject(SessionTaskReader);
  private readonly injector = inject(Injector);
  readonly tabId = input.required<string>();

  protected readonly fileIcon = FileText;
  protected readonly folderIcon = Folder;
  protected readonly alertIcon = TriangleAlert;
  protected readonly pendingIcon = CircleAlert;
  protected readonly checkIcon = Check;
  protected readonly statusLabels = TASK_STATUS_LABELS;
  protected readonly documentFailure = DOCUMENT_FAILURE;
  private readonly sectionId = ++nextTaskSectionId;
  protected readonly headingId = `ptah-task-h-${this.sectionId}`;
  protected readonly relatedId = `ptah-task-related-${this.sectionId}`;
  protected readonly documentsMenuId = `ptah-task-documents-menu-${this.sectionId}`;
  protected readonly previewId = `ptah-task-preview-${this.sectionId}`;
  protected readonly openErrorId = `ptah-task-open-err-${this.sectionId}`;
  private readonly dropdownRoot =
    viewChild<ElementRef<HTMLElement>>('dropdownRoot');
  private readonly documentsToggle =
    viewChild<ElementRef<HTMLButtonElement>>('documentsToggle');

  protected readonly relatedOpen = signal(false);
  protected readonly documentsOpen = signal(false);
  protected readonly foldersOpen = signal(false);
  protected readonly menuOpen = signal(false);

  protected readonly readyDigest = computed(() => {
    const state = this.reader.state();
    return state?.status === 'ready' ? (state.data?.digest ?? null) : null;
  });

  /** Progress counted from a capped `batches.md` read covers only a prefix. */
  protected readonly progressCapped = computed(() => {
    const digest = this.readyDigest();
    const source = digest?.progress?.source;
    return (
      source !== undefined &&
      digest?.documents.some(
        (doc) => doc.name === source && doc.extraction === 'capped',
      ) === true
    );
  });

  protected readonly stats = computed<TaskStat[]>(() => {
    const digest = this.readyDigest();
    const pending = digest?.decisions?.pendingUser ?? null;
    const questions = digest?.openQuestions ?? null;
    const stats: TaskStat[] = [
      {
        id: 'decisions',
        label: 'Decisions',
        name: 'Decisions',
        title: 'Rows in decisions.md',
        value: digest?.decisions?.rows ?? null,
      },
      {
        id: 'pending',
        label: 'Pending you',
        name: 'Pending you',
        title: 'Decisions waiting for you',
        value: pending,
        tone: pending !== null && pending > 0 ? 'warn' : 'muted',
      },
      {
        id: 'questions',
        label: 'Questions',
        name: 'Open questions',
        title: 'Open questions',
        value: questions,
        tone: questions !== null && questions > 0 ? 'info' : 'muted',
      },
      {
        id: 'entries',
        label: 'Entries',
        name: 'Entries',
        title: 'Top-level files and folders in the task folder',
        value: digest?.entryCount ?? null,
      },
    ];
    return stats.map((stat) => ({
      ...stat,
      tone: stat.value === null ? 'muted' : stat.tone,
    }));
  });

  private readonly reviews = computed(() => this.readyDigest()?.reviews);
  protected readonly reviseCount = computed(
    () =>
      this.reviews()?.filter((review) => review.verdict === 'REVISE').length ??
      0,
  );
  protected readonly allReviewsApproved = computed(() => {
    const reviews = this.reviews();
    return (
      !!reviews?.length &&
      reviews.every((review) => review.verdict === 'APPROVED')
    );
  });
  protected readonly reviewSummary = computed(() => {
    if (!this.readyDigest()) return 'reviews —';
    const count = this.reviews()?.length ?? 0;
    return count === 0
      ? 'no reviews'
      : count === 1
        ? '1 review'
        : `${count} reviews`;
  });

  protected readonly documentGroups = computed(() => {
    const data = this.reader.state()?.data;
    if (!data?.digest) {
      const { primary, other } = groupTaskDocuments(data?.documents ?? []);
      const plain = (name: string) => ({
        name,
        label: `Open ${name}`,
        unreadable: false,
        review: null,
      });
      return { primary: primary.map(plain), other: other.map(plain) };
    }
    const { primary, other } = groupTaskDocuments(data.digest.documents);
    const reviews = new Map(
      this.reviews()?.map((review) => [review.file, review]),
    );
    const present = (doc: TaskDigestDocument) => {
      const { name, kind, readable } = doc;
      const unreadable = readable === false;
      const result = reviews.get(name);
      const showFindings =
        result?.serious != null &&
        (result.extraction === 'ok' || result.extraction === 'capped');
      const review =
        kind === 'reviews'
          ? {
              verdict:
                result?.verdict === 'APPROVED'
                  ? 'Approved'
                  : result?.verdict === 'REVISE'
                    ? 'Revise'
                    : null,
              findings: showFindings
                ? `${result.serious}·${result.moderate ?? '—'}·${result.minor ?? '—'}`
                : null,
            }
          : null;
      let label = unreadable ? `${name}, unreadable` : `Open ${name}`;
      if (review && !unreadable) {
        label += `, review verdict ${review.verdict ?? 'not available'}`;
        if (showFindings) {
          label += `, ${result.serious} serious, ${result.moderate ?? 'not available'} moderate, ${result.minor ?? 'not available'} minor findings`;
        }
      }
      return { name, unreadable, review, label };
    };
    return { primary: primary.map(present), other: other.map(present) };
  });

  protected readonly documentDisclosureLabel = computed(() => {
    const { primary, other } = this.documentGroups();
    const count = primary.length + other.length;
    const summary = this.reviewSummary();
    const revise = this.reviseCount();
    const reviewLabel =
      this.reader.state()?.status === 'loading'
        ? 'reviews loading'
        : summary === 'reviews —'
          ? 'reviews not available'
          : summary;
    const verdict = revise
      ? `, ${revise} revise`
      : this.allReviewsApproved()
        ? ', approved'
        : '';
    return `${count} ${count === 1 ? 'document' : 'documents'}, ${reviewLabel}${verdict}. ${this.documentsOpen() ? 'Hide' : 'Show'} documents`;
  });

  /** The top-level entry cap can leave folders out of `directories`. */
  private readonly foldersOmitted = computed(
    () => this.readyDigest()?.truncatedReasons.includes('entries') ?? false,
  );

  private readonly folderFiles = computed(() => {
    const folders = this.readyDigest()?.directories ?? [];
    const counted = folders.filter((folder) => this.hasFolderCount(folder));
    const lowerBound =
      this.foldersOmitted() || folders.some((folder) => folder.truncated);
    if (!counted.length || (counted.length < folders.length && !lowerBound))
      return null;
    return {
      total: counted.reduce((sum, folder) => sum + folder.files, 0),
      lowerBound,
    };
  });

  protected hasFolderCount(
    folder: NonNullable<TaskDigest['directories']>[number],
  ): boolean {
    return folder.counted !== false && folder.files != null;
  }

  protected readonly folderFileTotal = computed(() => {
    const files = this.folderFiles();
    return files ? `${files.lowerBound ? '≥' : ''}${files.total}` : '—';
  });

  protected readonly folderCount = computed(() => {
    const count = this.readyDigest()?.directories?.length ?? 0;
    return `${this.foldersOmitted() ? '≥' : ''}${count}`;
  });

  protected readonly folderDisclosureLabel = computed(() => {
    const count = this.readyDigest()?.directories?.length ?? 0;
    const files = this.folderFiles();
    const total = files
      ? `${files.lowerBound ? 'at least ' : ''}${files.total} ${files.total === 1 ? 'file' : 'files'}`
      : 'file count not available';
    const folders = `${this.foldersOmitted() ? 'at least ' : ''}${count} ${count === 1 ? 'folder' : 'folders'}`;
    return `${folders}, ${total}. ${this.foldersOpen() ? 'Hide' : 'Show'} folders`;
  });

  protected readonly relatedCount = computed(
    () => this.reader.state()?.data?.related.length ?? 0,
  );
  protected readonly relatedLabel = computed(() => {
    const count = this.relatedCount();
    return `${this.relatedOpen() ? 'Hide' : 'Show'} ${count} related ${count === 1 ? 'task' : 'tasks'}`;
  });

  constructor() {
    this.reader.bind(this.tabId);
  }

  protected setDocumentsOpen(open: boolean): void {
    this.documentsOpen.set(open);
    if (!open) this.menuOpen.set(false);
  }

  protected toggleDocument(file: string): void {
    if (this.reader.preview()?.file === file) this.reader.closePreview();
    else void this.reader.previewDocument(file);
  }

  protected toggleMenu(event: MouseEvent): void {
    this.menuOpen.update((open) => !open);
    if (this.menuOpen() && event.detail === 0) this.focusFirstMenuItem();
  }

  protected openMenuFromKeyboard(event: Event): void {
    event.preventDefault();
    this.menuOpen.set(true);
    this.focusFirstMenuItem();
  }

  private focusFirstMenuItem(): void {
    afterNextRender(() => this.menuItems()[0]?.focus(), {
      injector: this.injector,
    });
  }

  protected navigateMenu(event: KeyboardEvent): void {
    const buttons = this.menuItems();
    const current = buttons.findIndex((button) => button === event.target);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(current + offset + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    }
  }

  private menuItems(): HTMLButtonElement[] {
    const root = this.dropdownRoot()?.nativeElement;
    return root
      ? Array.from(
          root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
        )
      : [];
  }

  protected selectOtherDocument(file: string): void {
    this.dismissMenu();
    this.toggleDocument(file);
  }

  protected closeOnEscape(): void {
    if (this.menuOpen()) this.dismissMenu();
    else this.reader.closePreview();
  }

  /** Tab out of the menu closes it and leaves focus where Tab moved it. */
  protected closeOnFocusLeave(event: FocusEvent): void {
    const next = event.relatedTarget;
    const root = this.dropdownRoot()?.nativeElement;
    if (this.menuOpen() && !(next instanceof Node && root?.contains(next))) {
      this.dismissMenu(false);
    }
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    const root = this.dropdownRoot()?.nativeElement;
    if (
      this.menuOpen() &&
      target instanceof Node &&
      root &&
      !root.contains(target)
    ) {
      this.dismissMenu(root.contains(root.ownerDocument.activeElement));
    }
  }

  private dismissMenu(returnFocus = true): void {
    this.menuOpen.set(false);
    if (returnFocus) this.documentsToggle()?.nativeElement.focus();
  }

  protected statusIcon(status: TaskStatus): LucideIconData {
    return STATUS_ICON[status];
  }

  protected statusTone(
    status: TaskStatus,
  ): 'neutral' | 'info' | 'ok' | 'warn' | 'err' {
    switch (status) {
      case 'in_progress':
        return 'info';
      case 'in_review':
        return 'warn';
      case 'blocked':
        return 'err';
      case 'done':
        return 'ok';
      default:
        return 'neutral';
    }
  }
}
