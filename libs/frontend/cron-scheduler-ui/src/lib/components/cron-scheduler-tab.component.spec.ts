import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import {
  AppStateManager,
  ClaudeRpcService,
  ModelStateService,
  VSCodeService,
} from '@ptah-extension/core';
import { CronStateService } from '../services/cron-state.service';
import { CronSchedulerTabComponent } from './cron-scheduler-tab.component';

@Component({ standalone: true, template: '' })
class ReviewDestinationStub {}

describe('CronSchedulerTabComponent', () => {
  function configure(
    isElectron: boolean,
  ): ComponentFixture<CronSchedulerTabComponent> {
    const vscodeMock: Partial<VSCodeService> = {
      isElectron,
      config: signal({ isElectron }) as unknown as VSCodeService['config'],
    };
    const rpcMock: Partial<ClaudeRpcService> = {
      call: jest.fn().mockResolvedValue({
        isSuccess: () => true,
        success: true,
        data: { jobs: [] },
      }) as unknown as ClaudeRpcService['call'],
    };
    const appStateMock: Partial<AppStateManager> = {
      // CronStateService reads workspaceInfo() at construction (baseline
      // capture) and inside its switch effect — provide the signal the real
      // AppStateManager exposes so the store instantiates.
      workspaceInfo: signal(null) as AppStateManager['workspaceInfo'],
    };
    const modelStateMock: Partial<ModelStateService> = {};

    TestBed.configureTestingModule({
      imports: [CronSchedulerTabComponent],
      providers: [
        provideRouter([
          { path: 'review-runs', component: ReviewDestinationStub },
        ]),
        { provide: VSCodeService, useValue: vscodeMock },
        { provide: ClaudeRpcService, useValue: rpcMock },
        { provide: AppStateManager, useValue: appStateMock },
        { provide: ModelStateService, useValue: modelStateMock },
      ],
    });
    const fixture = TestBed.createComponent(CronSchedulerTabComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders without crashing in Electron mode', () => {
    const cmp = configure(true).componentInstance;
    expect(cmp).toBeTruthy();
    expect(cmp.isElectron()).toBe(true);
  });

  it('renders the VS Code placeholder when not on Electron', () => {
    const cmp = configure(false).componentInstance;
    expect(cmp.isElectron()).toBe(false);
  });

  it('shows the review link only on the review-capable host', () => {
    const electron = configure(true);
    expect(
      electron.nativeElement.querySelector(
        '[data-testid="cron-review-runs-link"]',
      ),
    ).not.toBeNull();
    TestBed.resetTestingModule();
    const vscode = configure(false);
    expect(
      vscode.nativeElement.querySelector(
        '[data-testid="cron-review-runs-link"]',
      ),
    ).toBeNull();
  });

  it('navigates to review runs from the link', async () => {
    const fixture = configure(true);
    const link = fixture.nativeElement.querySelector(
      '[data-testid="cron-review-runs-link"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('aria-label')).toBe('Open review runs');
    link.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/review-runs');
  });

  it('shows a four-segment instrument band in place of the statistics grid', () => {
    const el = configure(true).nativeElement as HTMLElement;

    const band = el.querySelector(
      '[data-testid="cron-instrument-band"]',
    ) as HTMLElement;
    expect(band).not.toBeNull();
    const labels = Array.from(band.querySelectorAll('li')).map((li) =>
      li.textContent?.trim(),
    );
    expect(labels).toHaveLength(4);
    for (const label of ['Jobs', 'Enabled', 'Paused', 'Next run']) {
      expect(labels.some((text) => text?.includes(label))).toBe(true);
    }
    expect(el.querySelector('[data-testid^="cron-stat-"]')).toBeNull();
    expect(el.querySelector('.stats, .stat')).toBeNull();
  });

  it('opens the create form from the New job action', () => {
    const fixture = configure(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="cron-form"]')).toBeNull();

    (
      el.querySelector('[data-testid="cron-new-job-btn"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="cron-form"]')).not.toBeNull();
    expect(fixture.componentInstance.editingJob()).toBeNull();
  });

  it('deletes a job without a browser confirm dialog', () => {
    const fixture = configure(true);
    const state = TestBed.inject(CronStateService);
    const remove = jest.spyOn(state, 'delete').mockResolvedValue(true);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    fixture.componentInstance.deleteJob('job-1');

    expect(remove).toHaveBeenCalledWith('job-1');
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
