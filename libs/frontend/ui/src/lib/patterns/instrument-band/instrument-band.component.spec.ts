import { TestBed } from '@angular/core/testing';
import {
  PtahInstrumentBandComponent,
  PtahInstrumentBandSegment,
} from './instrument-band.component';

const segments: readonly PtahInstrumentBandSegment[] = [
  {
    id: 'a',
    label: 'Connections',
    value: '2 ready',
    meta: 'One needs sign-in',
    tone: 'warn',
    targetId: 'connections-section',
  },
  { id: 'b', label: 'Lanes', value: '6 ready', tone: 'ok' },
  { id: 'c', label: 'Routing', value: 'Needs model', tone: 'error' },
  { id: 'd', label: 'Budget', value: 'Default', tone: 'idle' },
];

function render(
  items: readonly PtahInstrumentBandSegment[] = segments,
  loading = false,
) {
  const fixture = TestBed.createComponent(PtahInstrumentBandComponent);
  fixture.componentRef.setInput('segments', items);
  fixture.componentRef.setInput('loading', loading);
  fixture.detectChanges();
  return fixture;
}

describe('PtahInstrumentBandComponent', () => {
  it('renders one named button per segment and equal narrow rows', () => {
    const fixture = render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Section overview',
    );
    expect(host.querySelectorAll('li > button')).toHaveLength(4);
    expect(host.querySelector('ol')?.classList.contains('grid-cols-2')).toBe(
      true,
    );
    expect(host.querySelector('ol')?.getAttribute('style')).toContain(
      '--ptah-band-columns: 4',
    );
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Connections 2 ready One needs sign-in',
    );
    expect(
      host.querySelector('button span[title]')?.getAttribute('title'),
    ).toBe('One needs sign-in');
    const six = render([
      ...segments,
      { id: 'e', label: 'Extra', value: 'Yes', tone: 'info' },
      { id: 'f', label: 'Last', value: 'Yes', tone: 'idle' },
    ]);
    expect(
      (six.nativeElement as HTMLElement)
        .querySelector('ol')
        ?.classList.contains('grid-cols-3'),
    ).toBe(true);
  });

  it('maps every tone to a state bar', () => {
    const fixture = render([
      ...segments,
      { id: 'e', label: 'Information', value: 'Active', tone: 'info' },
    ]);
    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button > span:first-child',
    );
    expect(Array.from(bars, (bar) => bar.className)).toEqual([
      expect.stringContaining('bg-state-need'),
      expect.stringContaining('bg-state-done'),
      expect.stringContaining('bg-state-err'),
      expect.stringContaining('bg-state-idle'),
      expect.stringContaining('bg-state-run'),
    ]);
  });

  it('uses idle bars and skeletons without exposing values while loading', () => {
    const fixture = render(segments, true);
    const host = fixture.nativeElement as HTMLElement;
    expect(
      host.querySelectorAll('button > span:first-child.bg-state-idle'),
    ).toHaveLength(4);
    expect(host.querySelectorAll('.skeleton')).toHaveLength(8);
    expect(host.textContent).not.toContain('2 ready');
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Connections Loading',
    );
  });

  it('uses native buttons, emits on click, and focuses an optional target', () => {
    const target = document.createElement('section');
    target.id = 'connections-section';
    document.body.appendChild(target);
    try {
      const fixture = render();
      const selected: string[] = [];
      fixture.componentInstance.segmentSelect.subscribe((id) =>
        selected.push(id),
      );
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        'button',
      ) as HTMLButtonElement;
      button.click();
      expect(selected).toEqual(['a']);
      expect(document.activeElement).toBe(target);
      expect(target.getAttribute('tabindex')).toBe('-1');
      expect(button.getAttribute('type')).toBe('button');
      button.focus();
      expect(target.hasAttribute('tabindex')).toBe(false);
    } finally {
      target.remove();
    }
  });

  it('removes the temporary tabindex when the target cannot take focus', () => {
    const target = document.createElement('button');
    target.id = 'connections-section';
    target.disabled = true;
    document.body.appendChild(target);
    // jsdom focuses a disabled button that has a tabindex. A browser does not, so copy that here.
    const focus = jest
      .spyOn(target, 'focus')
      .mockImplementation(() => undefined);
    try {
      const fixture = render();
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        'button',
      ) as HTMLButtonElement;
      button.click();
      expect(focus).toHaveBeenCalled();
      expect(document.activeElement).not.toBe(target);
      expect(target.hasAttribute('tabindex')).toBe(false);
      target.disabled = false;
      expect(target.tabIndex).toBe(0);
    } finally {
      focus.mockRestore();
      target.remove();
    }
  });

  it('renders optional test ids and title only when a segment sets them', () => {
    const fixture = render([
      {
        id: 'a',
        label: 'Entries',
        value: '12',
        tone: 'ok',
        testId: 'stat-entries',
        valueTestId: 'stat-entries-value',
        title: 'All entries',
      },
      { id: 'b', label: 'Pinned', value: '3', tone: 'idle' },
    ]);
    const host = fixture.nativeElement as HTMLElement;
    const items = host.querySelectorAll('li');
    expect(items[0].getAttribute('data-testid')).toBe('stat-entries');
    expect(items[0].getAttribute('title')).toBe('All entries');
    expect(
      host
        .querySelector('[data-testid="stat-entries-value"]')
        ?.textContent?.trim(),
    ).toBe('12');
    expect(items[1].hasAttribute('data-testid')).toBe(false);
    expect(items[1].hasAttribute('title')).toBe(false);
    const loading = render(
      [
        {
          id: 'a',
          label: 'Entries',
          value: '12',
          tone: 'ok',
          valueTestId: 'stat-entries-value',
        },
      ],
      true,
    );
    expect(
      (loading.nativeElement as HTMLElement).querySelector(
        '[data-testid="stat-entries-value"]',
      ),
    ).toBeNull();
  });
});
