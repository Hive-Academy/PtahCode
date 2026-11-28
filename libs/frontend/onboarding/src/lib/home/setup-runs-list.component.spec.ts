import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  SetupRunStore,
  isTerminalSetupRunStatus,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';
import { SetupRunsListComponent } from './setup-runs-list.component';

const STARTED_AT = new Date(2026, 10, 28, 9, 5, 2).getTime();
const STARTED_LABEL = 'started 2026-11-28 09:05:02';
const EARLIER_AT = new Date(2026, 10, 28, 9, 5, 1).getTime();
const EARLIER_LABEL = 'started 2026-11-28 09:05:01';

function record(overrides: Partial<SetupRunRecord> = {}): SetupRunRecord {
  return {
    id: 'setup-1',
    workspacePath: '/workspace',
    workflow: 'analysis',
    status: 'running',
    step: 'analyzing',
    backendRunId: 'run-1',
    analysisRunId: null,
    parentId: null,
    unseen: true,
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
    ...overrides,
  };
}

describe('SetupRunsListComponent', () => {
  let fixture: ComponentFixture<SetupRunsListComponent>;
  let byWorkspace: WritableSignal<Record<string, readonly SetupRunRecord[]>>;
  let cancelling: WritableSignal<ReadonlySet<string>>;
  let runs: ReturnType<typeof createRunsStore>;
  const workspacePath = signal<string | null>('/workspace');
  const workspaceReady = signal(true);

  /** Mirrors the store: workspace-keyed records, terminal records removable. */
  function createRunsStore() {
    return {
      runsFor: (path: string | null | undefined) =>
        path ? (byWorkspace()[path] ?? []) : [],
      isCancelling: (id: string) => cancelling().has(id),
      markSeen: jest.fn(),
      dismiss: jest.fn((id: string): boolean => {
        for (const [path, list] of Object.entries(byWorkspace())) {
          const target = list.find((candidate) => candidate.id === id);
          if (!target) continue;
          if (!isTerminalSetupRunStatus(target.status)) return false;
          setRecords(
            list.filter((candidate) => candidate.id !== id),
            path,
          );
          return true;
        }
        return false;
      }),
      refresh: jest.fn(),
    };
  }

  function setRecords(
    list: readonly SetupRunRecord[],
    path = '/workspace',
  ): void {
    byWorkspace.update((map) => ({ ...map, [path]: list }));
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function byTestId<T extends Element = HTMLElement>(id: string): T | null {
    return el().querySelector<T>(`[data-testid="${id}"]`);
  }
  function rowById(id: string): HTMLElement | null {
    return el().querySelector<HTMLElement>(`li[data-run-id="${id}"]`);
  }
  function render(): void {
    fixture = TestBed.createComponent(SetupRunsListComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    byWorkspace = signal({});
    cancelling = signal(new Set<string>());
    runs = createRunsStore();
    workspacePath.set('/workspace');
    workspaceReady.set(true);
    TestBed.configureTestingModule({
      imports: [SetupRunsListComponent],
      providers: [
        provideRouter([]),
        {
          provide: OnboardingWorkspaceStore,
          useValue: {
            activePath: workspacePath,
            readyForActivePath: workspaceReady,
          },
        },
        { provide: SetupRunStore, useValue: runs },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing without runs and never refreshes the store', () => {
    render();
    expect(byTestId('setup-runs-list')).toBeNull();
    expect(runs.refresh).not.toHaveBeenCalled();
  });

  it('renders the rows of the active workspace in one labelled list', () => {
    setRecords([record()]);
    render();
    const list = byTestId('setup-runs-list');
    expect(list?.tagName).toBe('UL');
    expect(list?.getAttribute('aria-label')).toBe('Setup runs');
    expect(list?.textContent).toContain('Workspace analysis');
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      1,
    );
  });

  it('renders only the active workspace bucket of the keyed store', () => {
    setRecords([record()], '/workspace');
    setRecords(
      [record({ id: 'setup-other', workspacePath: '/other' })],
      '/other',
    );
    render();
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      1,
    );
    expect(rowById('setup-other')).toBeNull();

    workspacePath.set('/other');
    fixture.detectChanges();
    expect(rowById('setup-1')).toBeNull();
    expect(rowById('setup-other')).not.toBeNull();
  });

  it('hides the list while no workspace is resolved', () => {
    setRecords([record()]);
    workspacePath.set(null);
    render();
    expect(byTestId('setup-runs-list')).toBeNull();

    workspacePath.set('/workspace');
    workspaceReady.set(false);
    fixture.detectChanges();
    expect(byTestId('setup-runs-list')).toBeNull();
  });

  it('updates one row in place when its record changes', () => {
    const live = record({ id: 'setup-live' });
    setRecords([live]);
    render();
    const row = rowById(live.id);
    expect(el().querySelector('ptah-run-status-chip')?.textContent).toContain(
      'Running',
    );
    expect(byTestId('setup-run-dismiss')).toBeNull();

    setRecords([
      {
        ...live,
        status: 'failed',
        error: 'The run stopped.',
        updatedAt: STARTED_AT + 1,
      },
    ]);
    fixture.detectChanges();
    expect(rowById(live.id)).toBe(row);
    expect(el().querySelector('ptah-run-status-chip')?.textContent).toContain(
      'Failed',
    );
    expect(byTestId('setup-run-row')?.textContent).toContain(
      'The run stopped.',
    );
    expect(byTestId('setup-run-dismiss')).not.toBeNull();
  });

  it('shows at most five rows and expands them with Show all', () => {
    setRecords(
      Array.from({ length: 7 }, (_unused, index) =>
        record({ id: `setup-${index}` }),
      ),
    );
    render();
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      5,
    );
    expect(byTestId('setup-runs-show-all')?.textContent).toContain(
      '2 more runs - Show all',
    );

    byTestId<HTMLButtonElement>('setup-runs-show-all')?.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      7,
    );
    expect(byTestId('setup-runs-show-all')).toBeNull();
  });

  it('focuses the first newly revealed row after Show all', () => {
    setRecords(
      Array.from({ length: 7 }, (_unused, index) =>
        record({ id: `setup-${index}` }),
      ),
    );
    render();
    const showAll = byTestId<HTMLButtonElement>('setup-runs-show-all');
    showAll?.focus();
    expect(document.activeElement).toBe(showAll);
    showAll?.click();
    expect(document.activeElement).toBe(
      rowById('setup-5')?.querySelector('[data-testid="setup-run-open"]'),
    );
  });

  it('resets the Show all expansion when the workspace changes', () => {
    setRecords(
      Array.from({ length: 7 }, (_unused, index) =>
        record({ id: `a-${index}` }),
      ),
      '/workspace',
    );
    setRecords(
      Array.from({ length: 7 }, (_unused, index) =>
        record({ id: `b-${index}`, workspacePath: '/other' }),
      ),
      '/other',
    );
    render();
    byTestId<HTMLButtonElement>('setup-runs-show-all')?.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      7,
    );

    workspacePath.set('/other');
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="setup-run-row"]')).toHaveLength(
      5,
    );
    expect(byTestId('setup-runs-show-all')?.textContent).toContain(
      '2 more runs - Show all',
    );
    expect(rowById('a-0')).toBeNull();
    expect(rowById('b-4')).not.toBeNull();
    expect(rowById('b-5')).toBeNull();
  });

  it.each<[SetupRunRecord['status'], string]>([
    ['running', 'Running'],
    ['needs-input', 'Needs input'],
    ['completed', 'Done'],
    ['failed', 'Failed'],
    ['cancelled', 'Interrupted'],
    ['interrupted', 'Interrupted'],
  ])('reads the %s status as chip text, not color', (status, chipText) => {
    setRecords([record({ status })]);
    render();
    expect(el().querySelector('ptah-run-status-chip')?.textContent).toContain(
      chipText,
    );
  });

  it('shows the stopping chip while a cancel waits for the backend', () => {
    setRecords([record()]);
    render();
    cancelling.set(new Set(['setup-1']));
    fixture.detectChanges();
    expect(el().querySelector('ptah-run-status-chip')?.textContent).toContain(
      'Stopping',
    );
  });

  it('opens a run at its step target and marks it seen', () => {
    setRecords([record()]);
    render();
    const open = byTestId<HTMLButtonElement>('setup-run-open');
    expect(open?.getAttribute('aria-label')).toBe(
      `Open: Workspace analysis (${STARTED_LABEL})`,
    );
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    open?.click();
    expect(runs.markSeen).toHaveBeenCalledWith('setup-1');
    expect(navigate).toHaveBeenCalledWith(['/onboarding', 'analyze'], {
      queryParams: { tab: 'setup-1', analysis: 'run-1' },
    });
  });

  it('labels a completed analysis without a child run Review skills', () => {
    setRecords([record({ status: 'completed', analysisRunId: 'run-1' })]);
    render();
    const open = byTestId<HTMLButtonElement>('setup-run-open');
    expect(open?.textContent?.trim()).toBe('Review skills');
    expect(open?.getAttribute('aria-label')).toBe(
      `Review skills: Workspace analysis (${STARTED_LABEL})`,
    );
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    open?.click();
    expect(navigate).toHaveBeenCalledWith(
      ['/onboarding', 'analyze', 'skills'],
      {
        queryParams: { tab: 'setup-1', analysis: 'run-1' },
      },
    );
  });

  it('distinguishes two completed analyses by identity and destination', () => {
    setRecords([
      record({
        id: 'setup-a',
        status: 'completed',
        backendRunId: 'run-a',
        analysisRunId: 'run-a',
        createdAt: STARTED_AT,
      }),
      record({
        id: 'setup-b',
        status: 'completed',
        backendRunId: 'run-b',
        analysisRunId: 'run-b',
        createdAt: EARLIER_AT,
      }),
    ]);
    render();
    const first = rowById('setup-a');
    const second = rowById('setup-b');
    expect(first?.textContent).toContain(STARTED_LABEL);
    expect(second?.textContent).toContain(EARLIER_LABEL);
    const firstOpen = first?.querySelector<HTMLButtonElement>(
      '[data-testid="setup-run-open"]',
    );
    const secondOpen = second?.querySelector<HTMLButtonElement>(
      '[data-testid="setup-run-open"]',
    );
    expect(firstOpen?.getAttribute('aria-label')).toBe(
      `Review skills: Workspace analysis (${STARTED_LABEL})`,
    );
    expect(secondOpen?.getAttribute('aria-label')).toBe(
      `Review skills: Workspace analysis (${EARLIER_LABEL})`,
    );
    expect(
      first
        ?.querySelector('[data-testid="setup-run-dismiss"]')
        ?.getAttribute('aria-label'),
    ).toBe(`Dismiss: Workspace analysis (${STARTED_LABEL})`);
    expect(
      second
        ?.querySelector('[data-testid="setup-run-dismiss"]')
        ?.getAttribute('aria-label'),
    ).toBe(`Dismiss: Workspace analysis (${EARLIER_LABEL})`);

    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    firstOpen?.click();
    expect(navigate).toHaveBeenLastCalledWith(
      ['/onboarding', 'analyze', 'skills'],
      { queryParams: { tab: 'setup-a', analysis: 'run-a' } },
    );
    secondOpen?.click();
    expect(navigate).toHaveBeenLastCalledWith(
      ['/onboarding', 'analyze', 'skills'],
      { queryParams: { tab: 'setup-b', analysis: 'run-b' } },
    );
  });

  it('re-runs a completed analysis through the Analyze rerun query', () => {
    setRecords([record({ status: 'completed', analysisRunId: 'run-1' })]);
    render();
    const rerun = byTestId<HTMLButtonElement>('setup-run-rerun');
    expect(rerun?.textContent?.trim()).toBe('Re-run');
    expect(rerun?.getAttribute('aria-label')).toBe(
      `Re-run: Workspace analysis (${STARTED_LABEL})`,
    );
    const navigate = jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    rerun?.click();
    expect(runs.markSeen).toHaveBeenCalledWith('setup-1');
    expect(navigate).toHaveBeenCalledWith(['/onboarding', 'analyze'], {
      queryParams: { rerun: '1' },
    });
  });

  it('offers Re-run on completed analyses only', () => {
    setRecords([record({ id: 'setup-live', status: 'running' })]);
    render();
    expect(byTestId('setup-run-rerun')).toBeNull();
  });

  it('labels a completed analysis Open once it has a child run', () => {
    const analysis = record({
      id: 'setup-a',
      status: 'completed',
      analysisRunId: 'run-1',
    });
    setRecords([analysis]);
    render();
    const analysisRow = rowById(analysis.id);
    const open = analysisRow?.querySelector('[data-testid="setup-run-open"]');
    expect(open?.textContent?.trim()).toBe('Review skills');

    setRecords([
      analysis,
      record({
        id: 'setup-b',
        workflow: 'skill-review',
        status: 'running',
        step: 'reviewing',
        analysisRunId: 'run-1',
        parentId: 'setup-a',
      }),
    ]);
    fixture.detectChanges();
    expect(rowById(analysis.id)).toBe(analysisRow);
    expect(open?.textContent?.trim()).toBe('Open');
    expect(
      analysisRow?.querySelector('[data-testid="setup-run-rerun"]'),
    ).not.toBeNull();
  });

  it('shows record context: a saved skill selection', () => {
    setRecords([
      record({
        workflow: 'skill-review',
        status: 'needs-input',
        step: 'selecting',
        selection: { skillIds: ['a', 'b'] },
      }),
    ]);
    render();
    expect(byTestId('setup-run-row')?.textContent).toContain(
      '2 skills selected',
    );
  });

  it('shows installed team-builder agents alongside a recorded error', () => {
    setRecords([
      record({
        workflow: 'team-builder',
        status: 'failed',
        step: 'review',
        teamBuilder: { intent: 'support', installed: ['one'] },
        error: 'The remaining agents could not be installed.',
      }),
    ]);
    render();
    expect(byTestId('setup-run-row')?.textContent).toContain(
      '1 skill installed',
    );
    expect(byTestId('setup-run-row')?.textContent).toContain(
      'The remaining agents could not be installed.',
    );
  });

  it('shows no install count before the team builder installs an agent', () => {
    setRecords([
      record({
        workflow: 'team-builder',
        status: 'running',
        step: 'review',
        teamBuilder: { intent: 'support', installed: [] },
      }),
    ]);
    render();
    expect(byTestId('setup-run-row')?.textContent).not.toContain('installed');
  });

  it('offers Dismiss on terminal rows only and dismisses through the store', () => {
    setRecords([record({ id: 'setup-live', status: 'running' })]);
    render();
    expect(
      rowById('setup-live')?.querySelector('[data-testid="setup-run-dismiss"]'),
    ).toBeNull();

    setRecords([record({ id: 'setup-live', status: 'completed' })]);
    fixture.detectChanges();
    byTestId<HTMLButtonElement>('setup-run-dismiss')?.click();
    expect(runs.dismiss).toHaveBeenCalledWith('setup-live');
    expect(byTestId('setup-runs-list')).toBeNull();
  });

  it('moves focus to the next row primary after a middle Dismiss', () => {
    setRecords([
      record({ id: 'setup-1', status: 'completed' }),
      record({ id: 'setup-2', status: 'completed', createdAt: EARLIER_AT }),
      record({
        id: 'setup-3',
        status: 'completed',
        createdAt: new Date(2026, 10, 26, 8, 0).getTime(),
      }),
    ]);
    render();
    const dismiss = rowById('setup-2')?.querySelector<HTMLButtonElement>(
      '[data-testid="setup-run-dismiss"]',
    );
    dismiss?.focus();
    expect(document.activeElement).toBe(dismiss);
    dismiss?.click();
    expect(rowById('setup-2')).toBeNull();
    expect(document.activeElement).toBe(
      rowById('setup-3')?.querySelector('[data-testid="setup-run-open"]'),
    );
  });

  it('moves focus to the previous row primary after the last Dismiss', () => {
    setRecords([
      record({ id: 'setup-1', status: 'completed' }),
      record({ id: 'setup-2', status: 'completed', createdAt: EARLIER_AT }),
    ]);
    render();
    const dismiss = rowById('setup-2')?.querySelector<HTMLButtonElement>(
      '[data-testid="setup-run-dismiss"]',
    );
    dismiss?.focus();
    expect(document.activeElement).toBe(dismiss);
    dismiss?.click();
    expect(rowById('setup-2')).toBeNull();
    expect(document.activeElement).toBe(
      rowById('setup-1')?.querySelector('[data-testid="setup-run-open"]'),
    );
  });
});
