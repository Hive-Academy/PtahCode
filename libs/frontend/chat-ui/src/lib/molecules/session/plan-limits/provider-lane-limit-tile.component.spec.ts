import { TestBed } from '@angular/core/testing';
import { ProviderLaneLimitTileComponent } from './provider-lane-limit-tile.component';
import type { PlanLimitTileModel, ProviderLaneLimitModel } from './stats-limit-view-model.types';

function windowTile(label: string, used: number): PlanLimitTileModel {
  return { id: label, kind: 'window', label, captionLead: 'Kimi account', caption: 'Kimi account · 2b78',
    value: `${used}% used`, resetLine: 'resets in 2d', tone: used >= 90 ? 'error' : 'neutral',
    sourceChips: ['Provider API'], detailLines: [], window: {
      windowKey: 'monthly', label, state: used === 80 ? 'near-limit' : 'ok', usedText: `${used}% used`, percent: used,
      resetFacts: [], sourceChips: ['Provider API'],
    } };
}

describe('ProviderLaneLimitTileComponent', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('shows the most constrained window first and compact extra windows without controls', () => {
    TestBed.configureTestingModule({ imports: [ProviderLaneLimitTileComponent] });
    const fixture = TestBed.createComponent(ProviderLaneLimitTileComponent);
    fixture.componentRef.setInput('provider', {
      id: 'provider:kimi', label: 'Kimi Code', ownerState: 'single',
      windows: [windowTile('5-hour', 41), windowTile('Monthly total', 73), windowTile('Monthly code', 80)],
      message: '', ownerDetails: [],
    } satisfies ProviderLaneLimitModel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll('[data-testid="plan-window-row"]')];
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.getAttribute('data-tile-id'))).toEqual(['Monthly code', '5-hour', 'Monthly total']);
    expect(rows.map(row => row.getAttribute('tabindex'))).toEqual(['0', '0', '0']);
    expect(rows[0].getAttribute('aria-label')).toContain('Monthly code');
    expect(root.querySelectorAll('ptah-meter')).toHaveLength(3);
    expect(root.querySelector('select, button')).toBeNull();
    expect(root.textContent).not.toMatch(/Less detail|More detail/);
    expect(root.querySelectorAll('[data-ptah-badge][data-size="xs"]')).toHaveLength(1);
    const bar = rows[0].querySelector<HTMLElement>('[role="meter"]');
    expect(bar?.getAttribute('aria-label')).toBe('Kimi Code Monthly code usage');
    expect(bar?.getAttribute('aria-valuenow')).toBe('80');
    expect(bar?.getAttribute('aria-valuetext')).toContain('80% used');
    expect(bar?.className).toContain('h-[0.1875rem]');
    expect(bar?.firstElementChild?.className).toContain('bg-state-need');
    const extra = rows[1].querySelector<HTMLElement>('[role="meter"]');
    expect(extra?.getAttribute('aria-valuenow')).toBe('41');
    expect(extra?.className).toContain('h-[0.1875rem]');
  });
  it('shows untracked provider state', () => {
    TestBed.configureTestingModule({ imports: [ProviderLaneLimitTileComponent] });
    const fixture = TestBed.createComponent(ProviderLaneLimitTileComponent);
    fixture.componentRef.setInput('provider', {
      id: 'provider:codex', label: 'Codex', ownerState: 'untracked', windows: [],
      message: 'Limits not tracked', ownerDetails: [],
    } satisfies ProviderLaneLimitModel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Usage not tracked');
    expect(root.textContent).not.toContain('No usage source');
    expect(root.querySelector('ptah-meter')).toBeNull();
  });
  it('keeps local usage, evidence, cooldown and status beside a window', () => {
    TestBed.configureTestingModule({ imports: [ProviderLaneLimitTileComponent] });
    const fixture = TestBed.createComponent(ProviderLaneLimitTileComponent);
    const kinds = ['local-usage', 'evidence', 'cooldown', 'status'] as const;
    fixture.componentRef.setInput('provider', {
      id: 'provider:codex', label: 'Codex', ownerState: 'single', message: '', ownerDetails: [],
      windows: [windowTile('5-hour', 50), ...kinds.map(kind => ({
        id: kind, kind, label: kind, captionLead: kind, caption: kind,
        value: `${kind} value`, resetLine: '', tone: 'neutral' as const,
        chip: { text: `${kind} status`, tone: 'neutral' as const },
        sourceChips: [], detailLines: [`${kind} detail`],
      }))],
    } satisfies ProviderLaneLimitModel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="plan-extra-tile"]')).toHaveLength(4);
    for (const kind of kinds) {
      expect(root.textContent).toContain(`${kind} value`);
      expect(root.textContent).toContain(`${kind} status`);
      expect(root.textContent).toContain(`${kind} detail`);
    }
  });
});
