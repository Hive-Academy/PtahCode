import { Component, computed, inject, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeRpcService,
  LoggingService,
  RpcResult,
} from '@ptah-extension/core';
import { HarnessHealthStore } from '@ptah-extension/marketplace/services';
import {
  MESSAGE_TYPES,
  type HarnessApplyResponse,
} from '@ptah-extension/shared';
import {
  HarnessChatProposalStore,
  IDLE_HARNESS_APPLY_STATE,
  fingerprintHarnessConfig,
  type HarnessProposalApplyState,
  type HarnessProposalRecord,
} from '../../../services/harness-chat-proposal.store';
import { HarnessProposalBannerComponent } from './harness-proposal-banner.component';

interface RenderInputs {
  proposal?: HarnessProposalRecord | null;
  applyState?: HarnessProposalApplyState;
  isStreaming?: boolean;
}

const SAMPLE_PROPOSAL: HarnessProposalRecord = {
  sessionId: 'session-1',
  workspaceRoot: '/workspaces/demo',
  isConfigComplete: true,
  updatedAt: '2026-11-11T04:00:00.000Z',
  configUpdates: {
    name: 'Demo Engineering Team',
    agents: {
      enabledAgents: {
        'claude-code': { enabled: true },
        codex: { enabled: true },
        cursor: { enabled: false },
      },
      harnessSubagents: [
        {
          id: 'qa-guard',
          name: 'QA Guard',
          description: 'Verifies specs',
          role: 'QA',
          tools: ['Read'],
          executionMode: 'on-demand',
          instructions: 'Run unit tests',
        },
      ],
    },
    skills: {
      selectedSkills: [
        'angular-frontend-patterns',
        'nx-workspace-architect',
      ],
      createdSkills: [
        {
          name: 'domain-glossary',
          description: 'Domain terms',
          content: '# Glossary',
        },
      ],
    },
    mcp: {
      servers: [
        { name: 'playwright', url: 'https://playwright.mcp', enabled: true },
      ],
      enabledTools: {},
    },
    claudeMd: {
      generateProjectClaudeMd: true,
      customSections: {},
      previewContent: '# CLAUDE.md',
    },
  },
};

@Component({
  selector: 'ptah-test-session-banner-host',
  standalone: true,
  imports: [HarnessProposalBannerComponent],
  template: `
    <ptah-harness-proposal-banner
      [proposal]="proposal()"
      [applyState]="applyState()"
      [isStreaming]="streaming()"
      (applyRequested)="onApply()"
    />
  `,
})
class SessionScopedBannerHostComponent {
  private readonly store = inject(HarnessChatProposalStore);
  readonly activeSessionId = signal<string | null>('session-a');
  readonly workspaceRoot = signal<string>('/workspaces/host');
  readonly streaming = signal(false);

  readonly proposal = computed(() =>
    this.store.proposalFor(this.activeSessionId()),
  );
  readonly applyState = computed(() =>
    this.store.applyStateFor(this.activeSessionId()),
  );

  onApply(): void {
    const sid = this.activeSessionId();
    if (!sid) return;
    void this.store.applyProposal(sid, this.workspaceRoot());
  }
}

describe('HarnessProposalBannerComponent', () => {
  let fixture: ComponentFixture<HarnessProposalBannerComponent>;

  function render(inputs: RenderInputs = {}): HTMLElement {
    TestBed.configureTestingModule({
      imports: [HarnessProposalBannerComponent],
    });
    fixture = TestBed.createComponent(HarnessProposalBannerComponent);
    fixture.componentRef.setInput('proposal', inputs.proposal ?? null);
    fixture.componentRef.setInput(
      'applyState',
      inputs.applyState ?? IDLE_HARNESS_APPLY_STATE,
    );
    fixture.componentRef.setInput('isStreaming', inputs.isStreaming ?? false);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing when there is no proposal or configUpdates is empty', () => {
    const emptyHost = render({ proposal: null });
    expect(
      emptyHost.querySelector('[data-testid="harness-proposal-banner"]'),
    ).toBeNull();

    fixture.componentRef.setInput('proposal', {
      sessionId: 'session-1',
      configUpdates: {},
      isConfigComplete: false,
      updatedAt: '2026-11-11T04:00:00.000Z',
    });
    fixture.detectChanges();
    expect(
      emptyHost.querySelector('[data-testid="harness-proposal-banner"]'),
    ).toBeNull();
  });

  it('renders proposal name and accurate item counts when a proposal is set', () => {
    const host = render({ proposal: SAMPLE_PROPOSAL });

    expect(
      host
        .querySelector('[data-testid="harness-proposal-name"]')
        ?.textContent?.trim(),
    ).toBe('Demo Engineering Team');

    const countsText =
      host.querySelector('[data-testid="harness-proposal-counts"]')
        ?.textContent ?? '';
    expect(countsText).toContain('2 agents');
    expect(countsText).toContain('1 subagent');
    expect(countsText).toContain('3 skills');
    expect(countsText).toContain('1 MCP server');
    expect(countsText).toContain('CLAUDE.md');

    const applyBtn = host.querySelector<HTMLButtonElement>(
      '[data-testid="harness-proposal-apply"]',
    );
    expect(applyBtn?.textContent?.trim()).toBe('Apply to Workspace');
    expect(applyBtn?.disabled).toBe(false);
  });

  it('disables Apply to Workspace while streaming or applying', () => {
    const host = render({
      proposal: SAMPLE_PROPOSAL,
      isStreaming: true,
    });
    const emitted: number[] = [];
    fixture.componentInstance.applyRequested.subscribe(() => emitted.push(1));

    const applyBtn = host.querySelector<HTMLButtonElement>(
      '[data-testid="harness-proposal-apply"]',
    );
    expect(applyBtn?.disabled).toBe(true);
    expect(host.textContent).toContain('Waiting for response…');
    applyBtn?.click();
    expect(emitted).toHaveLength(0);

    fixture.componentRef.setInput('isStreaming', false);
    fixture.componentRef.setInput('applyState', { status: 'applying' });
    fixture.detectChanges();

    expect(applyBtn?.disabled).toBe(true);
    expect(applyBtn?.getAttribute('aria-busy')).toBe('true');
    expect(applyBtn?.textContent).toContain('Applying…');
  });

  it('disables Apply after a successful apply of the same proposal and enables it for a changed one', () => {
    const host = render({
      proposal: SAMPLE_PROPOSAL,
      applyState: {
        status: 'applied',
        appliedCount: 2,
        appliedConfigFingerprint: fingerprintHarnessConfig(
          SAMPLE_PROPOSAL.configUpdates,
        ),
      },
    });
    const applyBtn = host.querySelector<HTMLButtonElement>(
      '[data-testid="harness-proposal-apply"]',
    );
    expect(applyBtn?.disabled).toBe(true);

    fixture.componentRef.setInput('applyState', {
      status: 'applied',
      appliedCount: 2,
      appliedConfigFingerprint: 'stale-fingerprint',
    });
    fixture.detectChanges();
    expect(applyBtn?.disabled).toBe(false);
  });

  it('disables Apply while the proposal is an incomplete draft and keeps the Draft hint', () => {
    const host = render({
      proposal: { ...SAMPLE_PROPOSAL, isConfigComplete: false },
    });
    const applyBtn = host.querySelector<HTMLButtonElement>(
      '[data-testid="harness-proposal-apply"]',
    );
    expect(applyBtn?.disabled).toBe(true);
    expect(host.textContent).toContain('Draft');
  });

  it('displays applied confirmation and warnings when applyState is applied', () => {
    const host = render({
      proposal: SAMPLE_PROPOSAL,
      applyState: {
        status: 'applied',
        appliedCount: 3,
        warnings: ['Preserved user-edited .cursor/mcp.json'],
      },
    });

    const statusBox = host.querySelector(
      '[data-testid="harness-proposal-applied"]',
    );
    expect(statusBox?.getAttribute('role')).toBe('status');
    expect(statusBox?.textContent).toContain('Applied · 3 files written');
    expect(
      host.querySelector('[data-testid="harness-proposal-warnings"]')
        ?.textContent,
    ).toContain('Preserved user-edited .cursor/mcp.json');
  });

  it('displays a readable role="alert" error message when applyState is error', () => {
    const host = render({
      proposal: SAMPLE_PROPOSAL,
      applyState: {
        status: 'error',
        errorMessage: 'Failed to write CLAUDE.md: EACCES permission denied.',
      },
    });

    const alertBox = host.querySelector(
      '[data-testid="harness-proposal-error"]',
    );
    expect(alertBox?.getAttribute('role')).toBe('alert');
    expect(alertBox?.textContent?.trim()).toBe(
      'Failed to write CLAUDE.md: EACCES permission denied.',
    );
  });

  it('follows active session changes and invokes harness:apply with expected params when clicked', async () => {
    const rpcCallMock = jest.fn().mockResolvedValue(
      new RpcResult<HarnessApplyResponse>(true, {
        appliedPaths: ['/workspaces/host/CLAUDE.md'],
        warnings: [],
      }),
    );
    const healthRefreshMock = jest.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [SessionScopedBannerHostComponent],
      providers: [
        { provide: ClaudeRpcService, useValue: { call: rpcCallMock } },
        {
          provide: HarnessHealthStore,
          useValue: { refresh: healthRefreshMock },
        },
        {
          provide: LoggingService,
          useValue: { warn: jest.fn(), error: jest.fn() },
        },
      ],
    });

    const store = TestBed.inject(HarnessChatProposalStore);
    await store.handleMessage({
      type: MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
      payload: {
        sessionId: 'session-a',
        configUpdates: {
          name: 'Session A Harness',
          skills: { selectedSkills: ['tdd'] },
        },
        isConfigComplete: true,
      },
    });

    const hostFixture = TestBed.createComponent(
      SessionScopedBannerHostComponent,
    );
    hostFixture.detectChanges();
    const el = hostFixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('[data-testid="harness-proposal-name"]')?.textContent,
    ).toContain('Session A Harness');

    // Switch to a session without any proposal — banner hides.
    hostFixture.componentInstance.activeSessionId.set('session-other');
    hostFixture.detectChanges();
    expect(
      el.querySelector('[data-testid="harness-proposal-banner"]'),
    ).toBeNull();

    // Switch back to session-a and click Apply to Workspace.
    hostFixture.componentInstance.activeSessionId.set('session-a');
    hostFixture.detectChanges();

    const applyBtn = el.querySelector<HTMLButtonElement>(
      '[data-testid="harness-proposal-apply"]',
    );
    applyBtn?.click();
    await hostFixture.whenStable();
    hostFixture.detectChanges();

    expect(rpcCallMock).toHaveBeenCalledWith(
      'harness:apply',
      expect.objectContaining({
        outputFormat: 'claude-md',
        workspaceRoot: '/workspaces/host',
        config: expect.objectContaining({
          name: 'Session A Harness',
        }),
      }),
      { timeout: 60_000 },
    );
    expect(
      el.querySelector('[data-testid="harness-proposal-applied"]')?.textContent,
    ).toContain('Applied · 1 file written');
  });
});
