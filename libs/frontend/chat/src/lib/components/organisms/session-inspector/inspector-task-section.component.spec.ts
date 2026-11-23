import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BATCHES_FILE,
  CARRIER_FILE,
  IMPLEMENTATION_PLAN_FILE,
  LEGACY_BATCHES_FILE,
  TASK_DESCRIPTION_FILE,
  type TaskDigest,
  type TaskDigestDocument,
} from '@ptah-extension/shared';
import { PTAH_CLOCK, type PtahClock } from '@ptah-extension/ui';
import type { SectionState } from '../../../services/session-inspector';
import {
  groupTaskDocuments,
  InspectorTaskSectionComponent,
} from './inspector-task-section.component';
import {
  documentExcerpt,
  SessionTaskReader,
  type TaskDocumentOpenError,
  type TaskDocumentPreview,
  type TaskSectionData,
} from './session-task-reader';

const NOW = Date.UTC(2026, 10, 23);
const TASK: TaskDigest['task'] = {
  id: 'TASK_2026_878_eae4',
  folderName: 'TASK_2026_878_eae4',
  status: 'in_progress',
  title: 'Revamp landing page sections below the hero',
  type: 'FEATURE',
  dependsOn: [],
  duplicates: [],
  relatesTo: [],
  labels: [],
  created: null,
  updated: null,
  frontmatterValid: true,
  validationIssues: [],
};

function taskDocument(
  name: string,
  kind: TaskDigestDocument['kind'],
  fields: Partial<TaskDigestDocument> = {},
): TaskDigestDocument {
  return {
    name,
    kind,
    group: name,
    revision: 0,
    latest: true,
    openable: true,
    readable: null,
    extraction: 'none',
    size: 50,
    mtime: 0,
    ...fields,
  };
}

const DOCUMENTS: TaskDigestDocument[] = [
  taskDocument(CARRIER_FILE, 'carrier'),
  taskDocument(TASK_DESCRIPTION_FILE, 'requirements'),
  taskDocument('design-spec.md', 'design'),
  taskDocument(IMPLEMENTATION_PLAN_FILE, 'plan'),
  taskDocument(BATCHES_FILE, 'batches'),
  taskDocument('test-report.md', 'reports'),
];

function taskData(
  digest: TaskDigest | null,
  documents = digest?.documents.map((doc) => doc.name) ?? [],
): TaskSectionData {
  return {
    lead: { taskId: TASK.id, missing: false },
    task: digest?.task ?? null,
    stage: null,
    digest,
    documents,
    related: [],
  };
}

function readyState(
  digest: Partial<TaskDigest> = {},
): SectionState<TaskSectionData> {
  return {
    status: 'ready',
    data: taskData({
      task: TASK,
      truncated: false,
      truncatedReasons: [],
      entryCount: 17,
      lastModified: NOW - 60_000,
      documents: DOCUMENTS,
      counts: {
        carrier: 1,
        handoff: 0,
        requirements: 1,
        design: 1,
        plan: 1,
        batches: 1,
        decisions: 0,
        reviews: 0,
        reports: 1,
        other: 0,
      },
      ...digest,
    }),
  };
}

function review(
  file: string,
  verdict: NonNullable<TaskDigest['reviews']>[number]['verdict'],
) {
  return {
    file,
    verdict,
    subject: file,
    revision: 1,
    round: 1,
    serious: 2,
    moderate: 1,
    minor: 0,
    extraction: 'ok' as const,
  };
}

describe('InspectorTaskSectionComponent', () => {
  const state = signal<SectionState<TaskSectionData> | null>(null);
  const openError = signal<TaskDocumentOpenError | null>(null);
  const preview = signal<TaskDocumentPreview | null>(null);
  const reader = {
    state,
    canOpen: true,
    openError,
    preview,
    previewDocument: jest.fn((file: string) => {
      preview.set({ file, status: 'ready', content: 'Preview text' });
    }),
    closePreview: jest.fn(() => preview.set(null)),
    bind: jest.fn(),
    retry: jest.fn(),
    openDocument: jest.fn(),
  };

  beforeEach(() => {
    state.set(null);
    openError.set(null);
    preview.set(null);
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [InspectorTaskSectionComponent],
      providers: [
        {
          provide: PTAH_CLOCK,
          useValue: {
            now: signal(NOW),
            acquire: () => () => undefined,
          } satisfies PtahClock,
        },
      ],
    });
    TestBed.overrideComponent(InspectorTaskSectionComponent, {
      set: { providers: [{ provide: SessionTaskReader, useValue: reader }] },
    });
  });

  function mount(
    nextState: SectionState<TaskSectionData> | null = readyState(),
  ) {
    state.set(nextState);
    const fixture = TestBed.createComponent(InspectorTaskSectionComponent);
    fixture.componentRef.setInput('tabId', 'tab-1');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const button = (selector: string) =>
      root.querySelector<HTMLButtonElement>(selector);
    const disclosure = (name: 'documents' | 'folders') =>
      button('.' + name + '-disclosure button[aria-expanded]');
    const click = (element: HTMLButtonElement | null) => {
      expect(element).not.toBeNull();
      element?.click();
      fixture.detectChanges();
    };
    return { fixture, root, button, disclosure, click };
  }

  it('renders nothing without a linked task', () => {
    const { root } = mount(null);
    expect(root.querySelector('ptah-surface-section')).toBeNull();
  });

  it('keeps the missing linked folder state', () => {
    const data = taskData(null);
    const { root } = mount({
      status: 'unknown',
      data: { ...data, lead: { ...data.lead, missing: true } },
    });
    expect(root.textContent).toContain('Task folder not found');
    expect(
      root.querySelector('[data-testid="task-id"]')?.textContent?.trim(),
    ).toBe(TASK.id);
  });

  it('labels the section and shows the status and task ID in the heading row', () => {
    const { root } = mount();
    const section = root.querySelector('ptah-surface-section');
    const id = root.querySelector('[data-testid="task-id"]');
    expect(section?.getAttribute('aria-labelledby')).toBe(
      root.querySelector('h3')?.id,
    );
    expect(root.querySelector('h3')?.textContent?.trim()).toBe('Task');
    expect(
      root.querySelector('[section-header] [data-testid="task-status"]')
        ?.textContent,
    ).toContain('In Progress');
    expect(id?.textContent?.trim()).toBe(TASK.id);
    expect(id?.hasAttribute('data-ptah-badge')).toBe(true);
    expect(id?.getAttribute('data-size')).toBe('sm');
    expect(id?.classList.contains('font-mono')).toBe(true);
  });

  it('uses the digest progress and its source', () => {
    const { root } = mount(
      readyState({
        progress: { done: 3, total: 7, source: LEGACY_BATCHES_FILE },
      }),
    );
    const meter = root.querySelector('[role="progressbar"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('3');
    expect(meter?.getAttribute('aria-valuemax')).toBe('7');
    expect(meter?.getAttribute('aria-label')).toBe(
      '3 of 7 tasks complete, from ' + LEGACY_BATCHES_FILE,
    );
    expect(root.textContent).toContain('3/7 tasks');
  });

  it('marks progress from a capped batches read as incomplete', () => {
    const { root } = mount(
      readyState({
        documents: DOCUMENTS.map((doc) =>
          doc.name === BATCHES_FILE
            ? { ...doc, readable: true, extraction: 'capped' }
            : doc,
        ),
        progress: { done: 1, total: 1, source: BATCHES_FILE },
      }),
    );
    expect(root.querySelector('[role="progressbar"]')).toBeNull();
    expect(root.querySelector('ptah-meter[role="img"]')?.getAttribute('aria-label')).toBe(
      'Task progress incomplete: at least 1 of at least 1 tasks complete, ' +
        BATCHES_FILE +
        ' was read in part',
    );
    expect(root.textContent).toContain('≥1/≥1 tasks');
    expect(root.textContent).not.toContain(' 1/1 ');
  });

  it('renders an empty named meter when progress is unavailable', () => {
    const { root } = mount();
    const meter = root.querySelector('ptah-meter[role="img"]');
    expect(meter?.getAttribute('aria-label')).toBe(
      'Task progress not available',
    );
    expect(meter?.querySelector('[aria-valuenow]')).toBeNull();
    expect(root.textContent).toContain('—');
    expect(root.textContent).toContain(' tasks');
  });

  it('shows compact, captioned and correctly toned digest stat values', () => {
    const { root } = mount(
      readyState({ decisions: { rows: 12, pendingUser: 2 }, openQuestions: 3 }),
    );
    expect(
      root.querySelector('[role="group"][aria-label="Task statistics"]'),
    ).not.toBeNull();
    const check = (key: string, name: string, value: string, tone?: string) => {
      const tile = root.querySelector('[data-testid="task-stat-' + key + '"]');
      const number = tile?.querySelector('.tabular-nums.text-sm');
      expect(tile?.parentElement?.getAttribute('aria-label')).toBe(
        name + ': ' + value,
      );
      expect(tile?.getAttribute('aria-hidden')).toBe('true');
      expect(number?.textContent?.trim()).toBe(value);
      if (tone) expect(number?.classList.contains(tone)).toBe(true);
      else
        expect(number?.className).not.toMatch(
          /text-state-|text-base-content-muted/,
        );
    };
    check('decisions', 'Decisions', '12');
    check('pending', 'Pending you', '2', 'text-state-need');
    check('questions', 'Open questions', '3', 'text-state-run');
    check('entries', 'Entries', '17');
    expect(
      root.querySelector('[data-testid="task-stat-pending"] [ptahStatIcon]'),
    ).not.toBeNull();
    expect(root.querySelector('ptah-relative-time time')?.textContent).toBe(
      '1m ago',
    );
  });

  it('keeps zero and unavailable values distinct', () => {
    const { root, fixture } = mount(
      readyState({ decisions: { rows: 0, pendingUser: 0 }, openQuestions: 0 }),
    );
    const value = (key: string) =>
      root.querySelector('[data-testid="task-stat-' + key + '"] .tabular-nums');
    expect(value('decisions')?.textContent?.trim()).toBe('0');
    expect(
      value('pending')?.classList.contains('text-base-content-muted'),
    ).toBe(true);
    expect(
      value('questions')?.classList.contains('text-base-content-muted'),
    ).toBe(true);
    expect(
      root.querySelector('[data-testid="task-stat-pending"] [ptahStatIcon]'),
    ).toBeNull();
    state.set(readyState({ lastModified: null }));
    fixture.detectChanges();
    for (const [key, label] of [
      ['decisions', 'Decisions'],
      ['pending', 'Pending you'],
      ['questions', 'Open questions'],
    ]) {
      expect(value(key)?.textContent?.trim()).toBe('—');
      expect(value(key)?.classList.contains('text-base-content-muted')).toBe(
        true,
      );
      expect(
        root.querySelector('[aria-label="' + label + ': not available"]'),
      ).not.toBeNull();
    }
    expect(root.querySelector('ptah-relative-time')).toBeNull();
  });

  it('keeps Documents and Folders collapsed by default and toggles them independently', () => {
    const { root, click, disclosure } = mount(
      readyState({
        directories: [
          {
            name: 'prototype',
            counted: true,
            files: 20,
            markdown: 2,
            images: 17,
            directories: 1,
            symlinks: 0,
            truncated: false,
          },
        ],
      }),
    );
    const docs = disclosure('documents');
    const folders = disclosure('folders');
    expect(docs?.getAttribute('aria-expanded')).toBe('false');
    expect(docs?.textContent).toContain(
      '6 documents, no reviews. Show documents',
    );
    expect(folders?.getAttribute('aria-expanded')).toBe('false');
    expect(folders?.textContent).toContain('1 folder, 20 files. Show folders');
    expect(root.querySelector('[aria-label="Task documents"]')).toBeNull();
    expect(
      root.querySelector('[aria-label="Task folders, file counts only"]'),
    ).toBeNull();

    click(docs);
    click(folders);
    const foldersPanel = root.querySelector(
      '[aria-label="Task folders, file counts only"]',
    );
    expect(foldersPanel?.parentElement?.id).toBe(
      folders?.getAttribute('aria-controls'),
    );
    expect(foldersPanel?.textContent).toContain('prototype/');
    expect(foldersPanel?.textContent).toContain('20 files');
    expect(foldersPanel?.querySelector('button')).toBeNull();
    expect(
      root.querySelector('[aria-label="Task documents"]')?.parentElement?.id,
    ).toBe(docs?.getAttribute('aria-controls'));
    click(docs);
    expect(root.querySelector('[aria-label="Task documents"]')).toBeNull();
    expect(folders?.getAttribute('aria-expanded')).toBe('true');
    expect(folders?.textContent).toContain('Hide folders');
  });

  it('shows partial data and preserves the exact top-level entry count above 200', () => {
    const { root, click, disclosure } = mount(
      readyState({
        entryCount: 232,
        truncated: true,
        truncatedReasons: ['entries', 'nested'],
        directories: [
          {
            name: 'prototype',
            counted: true,
            files: 20,
            markdown: 2,
            images: 17,
            directories: 1,
            symlinks: 0,
            truncated: true,
          },
        ],
      }),
    );
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('[aria-label="Entries: 232"]')).not.toBeNull();
    expect(
      root.querySelector('[title*="entries, nested"]')?.textContent,
    ).toContain('· partial');
    click(disclosure('folders'));
    expect(disclosure('folders')?.textContent).toContain(
      '1 folder, at least 20 files',
    );
    expect(
      root.querySelector('[aria-label="Task folders, file counts only"]')
        ?.textContent,
    ).toContain('≥20 files');
  });

  it('marks folder totals as lower bounds when the entry cap omits folders', () => {
    const { disclosure } = mount(
      readyState({
        entryCount: 600,
        truncated: true,
        truncatedReasons: ['entries'],
        directories: [
          {
            name: 'prototype',
            counted: true,
            files: 20,
            markdown: 2,
            images: 17,
            directories: 1,
            symlinks: 0,
            truncated: false,
          },
        ],
      }),
    );
    const folders = disclosure('folders');
    expect(folders?.textContent).toContain(
      'at least 1 folder, at least 20 files',
    );
    expect(folders?.textContent).toContain('≥1');
    expect(folders?.textContent).toContain('≥20 files');
  });

  it.each([
    [
      'a skipped listing',
      {
        name: 'unvisited',
        counted: false,
        files: 0,
        markdown: 0,
        images: 0,
        directories: 0,
        symlinks: 0,
        truncated: true,
      },
    ],
    [
      'an older payload with no count',
      {
        name: 'unvisited',
        truncated: true,
      } as NonNullable<TaskDigest['directories']>[number],
    ],
  ])('shows not counted for %s', (_label, unvisited) => {
    const { root, click, disclosure } = mount(
      readyState({
        truncated: true,
        truncatedReasons: ['nested'],
        directories: [unvisited],
      }),
    );
    click(disclosure('folders'));
    expect(disclosure('folders')?.textContent).toContain(
      'file count not available',
    );
    expect(
      root.querySelector('[aria-label="Task folders, file counts only"]')
        ?.textContent,
    ).toContain('not counted');
    expect(root.textContent).not.toContain('≥0');
  });

  it('preserves a real zero lower bound from a counted folder or older payload', () => {
    const oldFolder = {
      name: 'older-empty',
      files: 0,
      markdown: 0,
      images: 0,
      directories: 0,
      symlinks: 0,
      truncated: true,
    };
    const { root, click, disclosure } = mount(
      readyState({
        truncated: true,
        truncatedReasons: ['nested'],
        directories: [
          oldFolder as NonNullable<TaskDigest['directories']>[number],
          { ...oldFolder, name: 'empty', counted: true },
        ],
      }),
    );
    click(disclosure('folders'));
    const panel = root.querySelector(
      '[aria-label="Task folders, file counts only"]',
    );
    expect(panel?.textContent?.match(/≥0 files/g)).toHaveLength(2);
    expect(panel?.textContent).not.toContain('not counted');
  });

  it('shows shared skeletons while keeping documents usable during a digest refresh', () => {
    const { root, button, click, disclosure } = mount({
      status: 'loading',
      data: readyState().data,
    });
    expect(
      root.querySelector('ptah-surface-section')?.getAttribute('aria-busy'),
    ).toBe('true');
    expect(root.querySelectorAll('.task-stats ptah-skeleton')).toHaveLength(4);
    expect(root.querySelector('ptah-disclosure ptah-skeleton')).not.toBeNull();
    expect(button('button[aria-label="Folders loading"]')?.disabled).toBe(true);
    click(disclosure('documents'));
    expect(
      button('button[aria-label="Open ' + CARRIER_FILE + '"]'),
    ).not.toBeNull();
  });

  it('shows retry and opens fallback file chips when a digest fails without metadata', () => {
    const { root, button, click, disclosure } = mount({
      status: 'error',
      data: taskData(null, [CARRIER_FILE, BATCHES_FILE, 'review-1.md']),
      error: 'Untrusted provider text',
    });
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Task statistics unavailable',
    );
    expect(root.textContent).not.toContain('Untrusted provider text');
    expect(
      root.querySelector('[aria-label="Entries: not available"]'),
    ).not.toBeNull();
    expect(button('button[aria-label="Folders not available"]')?.disabled).toBe(
      true,
    );
    click(button('button[aria-label="Retry loading task statistics"]'));
    expect(reader.retry).toHaveBeenCalledTimes(1);
    expect(disclosure('documents')?.textContent).toContain(
      '3 documents, reviews not available',
    );
    click(disclosure('documents'));
    click(button('button[aria-label="Open ' + BATCHES_FILE + '"]'));
    expect(reader.previewDocument).toHaveBeenCalledWith(BATCHES_FILE);
    click(button('[aria-label="1 more task documents"]'));
    expect(button('[role="menuitem"]')?.getAttribute('aria-label')).toBe(
      'Open review-1.md',
    );
  });

  it('suppresses held verdicts after a refresh fails', () => {
    const data = readyState({
      documents: [taskDocument('review.md', 'reviews')],
      reviews: [review('review.md', 'APPROVED')],
    }).data;
    const { button, click, disclosure } = mount({
      status: 'error',
      data,
      error: 'Failed refresh',
    });
    click(disclosure('documents'));
    expect(
      button(
        'button[aria-label="Open review.md, review verdict not available"]',
      ),
    ).not.toBeNull();
    expect(button('button[aria-label*="Approved"]')).toBeNull();
  });

  it('renders review verdicts, findings, disabled unreadable chips, and no control for non-openable entries', () => {
    const { root, button, click, disclosure } = mount(
      readyState({
        documents: [
          ...DOCUMENTS,
          taskDocument('approved.md', 'reviews'),
          taskDocument('revise.md', 'reviews'),
          taskDocument('unknown.md', 'reviews'),
          taskDocument('unreadable.md', 'reviews', { readable: false }),
          taskDocument('directory.md', 'reviews', { openable: false }),
        ],
        reviews: [
          review('approved.md', 'APPROVED'),
          review('revise.md', 'REVISE'),
          { ...review('unknown.md', null), extraction: 'skipped' },
        ],
      }),
    );
    expect(disclosure('documents')?.textContent).toContain(
      '10 documents, 3 reviews, 1 revise. Show documents',
    );
    click(disclosure('documents'));
    const approved = button(
      'button[aria-label="Open approved.md, review verdict Approved, 2 serious, 1 moderate, 0 minor findings"]',
    );
    const revise = button(
      'button[aria-label="Open revise.md, review verdict Revise, 2 serious, 1 moderate, 0 minor findings"]',
    );
    expect(approved?.querySelector('.text-state-done')?.textContent).toContain(
      'Approved',
    );
    expect(revise?.querySelector('.text-state-need')?.textContent).toContain(
      'Revise',
    );
    expect(revise?.textContent).toContain('2·1·0');
    expect(
      button(
        'button[aria-label="Open unknown.md, review verdict not available"]',
      )?.textContent,
    ).toContain('—');
    expect(
      button('button[aria-label="unreadable.md, unreadable"]')?.disabled,
    ).toBe(true);
    expect(root.textContent).not.toContain('directory.md');
  });

  it('opens the more menu and restores focus on Escape, outside click and selection', () => {
    const { root, button, click, disclosure, fixture } = mount();
    click(disclosure('documents'));
    const trigger = button('button[aria-label="1 more task documents"]');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    click(trigger);
    const item = button('button[role="menuitem"]');
    expect(item?.getAttribute('aria-label')).toBe('Open test-report.md');
    expect(item?.closest('[role="menu"]')?.id).toBe(
      trigger?.getAttribute('aria-controls'),
    );
    item?.focus();
    item?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    button('button[role="menuitem"]')?.focus();
    root.querySelector('h3')?.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    click(button('button[role="menuitem"]'));
    expect(document.activeElement).toBe(trigger);
    expect(reader.previewDocument).toHaveBeenCalledWith('test-report.md');
  });

  it('keeps menu items out of the Tab sequence and closes when focus leaves', () => {
    const { root, button, click, disclosure, fixture } = mount();
    click(disclosure('documents'));
    const trigger = button('button[aria-label="1 more task documents"]');
    click(trigger);
    const item = button('button[role="menuitem"]');
    expect(item?.getAttribute('tabindex')).toBe('-1');
    item?.focus();
    const outside = button('button[aria-label="Open ' + CARRIER_FILE + '"]');
    item?.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
    );
    fixture.detectChanges();
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[role="menuitem"]')).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  it('preserves preview toggle, Escape, and forwarding the Open action and error', () => {
    const { root, button, click, disclosure, fixture } = mount();
    click(disclosure('documents'));
    const doc = button('button[aria-label="Open ' + CARRIER_FILE + '"]');
    click(doc);
    const card = root.querySelector(
      '[aria-label="Preview of ' + CARRIER_FILE + '"]',
    );
    const open = card?.querySelector<HTMLButtonElement>('button') ?? null;
    expect(card?.id).toBe(doc?.getAttribute('aria-controls'));
    expect(doc?.getAttribute('aria-pressed')).toBe('true');
    expect(card?.textContent).toContain('Preview text');
    click(open);
    expect(reader.openDocument).toHaveBeenCalledWith(CARRIER_FILE, open);

    openError.set({ file: CARRIER_FILE, reason: 'missing' });
    fixture.detectChanges();
    const alert = card?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not open ' + CARRIER_FILE);
    expect(open?.getAttribute('aria-describedby')).toBe(alert?.id);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(doc?.getAttribute('aria-pressed')).toBe('false');
    click(doc);
    click(doc);
    expect(doc?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows preview loading and error with retry and offers Open only on success', () => {
    const { root, click, disclosure, fixture } = mount();
    click(disclosure('documents'));
    preview.set({ file: CARRIER_FILE, status: 'loading', content: '' });
    fixture.detectChanges();
    expect(
      root.querySelector(
        '[aria-label="Loading document preview"] ptah-skeleton',
      ),
    ).not.toBeNull();
    preview.set({
      file: CARRIER_FILE,
      status: 'error',
      content: '',
      reason: 'binary',
    });
    fixture.detectChanges();
    const panel = root.querySelector(
      '[aria-label="Preview of ' + CARRIER_FILE + '"]',
    );
    const actions = Array.from(panel?.querySelectorAll('button') ?? []);
    expect(panel?.textContent).toContain('binary');
    expect(
      actions.some((button) => button.textContent?.trim() === 'Open'),
    ).toBe(false);
    click(
      actions.find((button) => button.textContent?.trim() === 'Retry') ?? null,
    );
    expect(reader.previewDocument).toHaveBeenCalledWith(CARRIER_FILE);
  });

  it('keeps the related task toggle and its accessible state', () => {
    const data = readyState().data;
    if (!data) throw new Error('Expected a ready fixture');
    const { root, button, click, disclosure } = mount({
      status: 'ready',
      data: {
        ...data,
        related: [
          { taskId: 'TASK_2026_99', title: 'Related task', status: null },
        ],
      },
    });
    click(disclosure('documents'));
    const toggle = button('button[aria-label="Show 1 related task"]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    click(toggle);
    const list = root.querySelector('[aria-label="Other linked tasks"]');
    expect(list?.id).toBe(toggle?.getAttribute('aria-controls'));
    expect(list?.textContent).toContain('Related task');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('task document helpers', () => {
  it('groups fallback names case-insensitively by basename and prefers batches', () => {
    const carrier = 'docs/' + CARRIER_FILE.toUpperCase();
    const current = BATCHES_FILE.toUpperCase();
    const description = 'x/' + TASK_DESCRIPTION_FILE.toUpperCase();
    const plan = IMPLEMENTATION_PLAN_FILE.toUpperCase();
    expect(
      groupTaskDocuments([
        carrier,
        LEGACY_BATCHES_FILE,
        current,
        description,
        plan,
        'note.md',
      ]),
    ).toEqual({
      primary: [carrier, description, plan, current],
      other: [LEGACY_BATCHES_FILE, 'note.md'],
    });
  });

  it('partitions latest openable documents, ranks and caps review chips, and excludes unreadable overflow', () => {
    const planOld = taskDocument('plan-old.md', 'plan', { latest: false });
    const plan = taskDocument(IMPLEMENTATION_PLAN_FILE, 'plan');
    const newest = taskDocument('c-review.md', 'reviews', { mtime: 3 });
    const earlier = ['a', 'b', 'c', 'd'].map((name) =>
      taskDocument(name + '.md', 'reviews', { mtime: 1 }),
    );
    const entries = [
      ...earlier.slice().reverse(),
      newest,
      planOld,
      plan,
      taskDocument('non-openable.md', 'reviews', {
        mtime: 20,
        openable: false,
      }),
      taskDocument('old-unreadable.md', 'reviews', {
        latest: false,
        readable: false,
      }),
    ];
    expect(groupTaskDocuments(entries)).toEqual({
      primary: [plan, newest, ...earlier.slice(0, 3)],
      other: [earlier[3], planOld],
    });
  });

  it('strips front matter and limits excerpts to 12 lines and 1500 characters', () => {
    expect(
      documentExcerpt('---\ntitle: Example\n---\nFirst line\nSecond line'),
    ).toBe('First line\nSecond line');
    expect(documentExcerpt('---\ntitle: Example\n---\n')).toBe('No content');
    const lines = Array.from({ length: 13 }, (_, i) => 'line ' + (i + 1));
    expect(documentExcerpt(lines.join('\n'))).toBe(
      lines.slice(0, 12).join('\n') + '…',
    );
    expect(documentExcerpt('x'.repeat(1501))).toBe('x'.repeat(1500) + '…');
    expect(documentExcerpt('one\ntwo')).toBe('one\ntwo');
  });
});
