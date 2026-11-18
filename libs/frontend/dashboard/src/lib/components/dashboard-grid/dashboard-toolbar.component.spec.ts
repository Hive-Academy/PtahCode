import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AuthStateService, PlanLimitsStore } from '@ptah-extension/core';
import type { PlanLimitsSnapshot, UsageRangeDays } from '@ptah-extension/shared';
import { AnalyticsUsageStore, USAGE_RANGE_OPTIONS } from '../../services/analytics-usage.store';
import { DashboardToolbarComponent } from './dashboard-toolbar.component';

const NOW = Date.UTC(2026, 10, 18, 12);

describe('DashboardToolbarComponent', () => {
  let fixture: ComponentFixture<DashboardToolbarComponent>;
  let usage: {
    range: ReturnType<typeof signal<UsageRangeDays>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    setRange: jest.Mock;
    refresh: jest.Mock;
  };
  let limits: {
    snapshot: ReturnType<typeof signal<PlanLimitsSnapshot | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    now: ReturnType<typeof signal<number>>;
    load: jest.Mock;
  };

  beforeEach(() => {
    usage = {
      range: signal<UsageRangeDays>(30),
      isLoading: signal(false),
      setRange: jest.fn(),
      refresh: jest.fn(),
    };
    limits = {
      snapshot: signal<PlanLimitsSnapshot | null>({
        generatedAt: NOW - 4 * 60_000,
        owners: [],
        sessionOwners: {},
      }),
      loading: signal(false),
      now: signal(NOW),
      load: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [DashboardToolbarComponent],
      providers: [
        { provide: AnalyticsUsageStore, useValue: usage },
        { provide: PlanLimitsStore, useValue: limits },
        { provide: AuthStateService, useValue: { activeProviderId: signal('anthropic') } },
      ],
    });
    fixture = TestBed.createComponent(DashboardToolbarComponent);
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('button'));

  it('renders one range control and switches the usage range', () => {
    const labels = USAGE_RANGE_OPTIONS.map((option) => option.label);
    const range = buttons().filter((button) => labels.includes(button.textContent?.trim() ?? ''));
    expect(range).toHaveLength(USAGE_RANGE_OPTIONS.length);
    range[0]?.click();
    expect(usage.setRange).toHaveBeenCalledWith(USAGE_RANGE_OPTIONS[0]?.value);
  });

  it('refreshes usage and plan limits together', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="dashboard-refresh"]')?.click();
    expect(usage.refresh).toHaveBeenCalledTimes(1);
    expect(limits.load).toHaveBeenCalledWith({ providerId: 'anthropic', refresh: true });
  });

  it('shows a relative updated age, never a raw date', () => {
    const updated = el().querySelector('[data-testid="dashboard-updated"]')?.textContent ?? '';
    expect(updated).toContain('Updated 4m ago');
    expect(updated).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
