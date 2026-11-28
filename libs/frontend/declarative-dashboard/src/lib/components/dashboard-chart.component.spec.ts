import { TestBed } from '@angular/core/testing';
import { DashboardChartComponent, type ChartNode } from './dashboard-chart.component';

describe('DashboardChartComponent', () => {
  const node: ChartNode = { id: 'chart', kind: 'line-chart', selectable: false,
    title: { text: '<img src=x onerror=alert(1)>' }, xLabel: { text: 'Day' }, yLabel: { text: 'Count' },
    series: [{ name: 'First', points: [{ x: 'Mon', y: 4 }] }, { name: 'Second', points: [{ x: 'Tue', y: -2 }] }] };
  function setup(value = node) {
    const fixture = TestBed.createComponent(DashboardChartComponent);
    fixture.componentRef.setInput('node', value);
    fixture.componentRef.setInput('surfaceId', 'surface');
    fixture.componentInstance.viewStateChange.subscribe(state => fixture.componentRef.setInput('viewState', state));
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    return { fixture, element };
  }
  it('renders literal text, labelled axes and patterned series without styles', () => {
    const { element } = setup();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain(node.title?.text);
    expect(element.textContent).toContain('Day');
    expect(element.textContent).toContain('Count');
    const lines = element.querySelectorAll('polyline');
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute('stroke-dasharray')).not.toBe(lines[1].getAttribute('stroke-dasharray'));
    expect(lines[0].classList.contains('stroke-primary')).toBe(true);
    expect(lines[1].classList.contains('stroke-secondary')).toBe(true);
    const swatches = element.querySelectorAll('ul svg line');
    expect(swatches[0].getAttribute('class')).toBe(lines[0].getAttribute('class'));
    expect(swatches[1].getAttribute('stroke-dasharray')).toBe(lines[1].getAttribute('stroke-dasharray'));
    expect(element.querySelector('svg text')?.classList.contains('text-base-content-muted')).toBe(true);
    expect(element.querySelector('style, [style]')).toBeNull();
  });
  it('toggles the same data to a table and back with aria-pressed', () => {
    const { fixture, element } = setup();
    const toggle = element.querySelector('button')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('data-apps-focus-key')).toBe('surface:chart:table');
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.querySelector('tbody')?.textContent).toContain('FirstMon4');
    expect(element.querySelectorAll('tbody button')).toHaveLength(0);
    toggle.click(); fixture.detectChanges();
    expect(element.querySelector('table')).toBeNull();
  });
  it('expands and collapses through view state only; Escape collapses and returns focus', () => {
    const { fixture, element } = setup();
    document.body.appendChild(element);
    try {
      const emitted = jest.fn();
      fixture.componentInstance.viewStateChange.subscribe(emitted);
      const expand = element.querySelector('button[aria-expanded]') as HTMLButtonElement;
      const content = element.querySelector(`#${expand.getAttribute('aria-controls')}`) as HTMLElement;
      expect(content.querySelector('svg')?.classList.contains('max-h-64')).toBe(true);
      expect(expand.getAttribute('aria-label')).toBe(`Expand ${node.title?.text}`);
      expect(expand.getAttribute('data-apps-focus-key')).toBe('surface:chart:expand');
      expand.click(); fixture.detectChanges();
      expect(emitted).toHaveBeenLastCalledWith({ expanded: true });
      expect(expand.getAttribute('aria-expanded')).toBe('true');
      expect(expand.getAttribute('aria-label')).toBe(`Collapse ${node.title?.text}`);
      expect(content.querySelector('svg')?.classList.contains('max-h-64')).toBe(false);
      content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(emitted).toHaveBeenLastCalledWith({ expanded: false });
      expect(expand.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(expand);
    } finally {
      element.remove();
    }
  });
  it('shows a reference notice and rowCount instead of an empty chart', () => {
    const { element } = setup({ ...node, series: undefined, data: { resultId: 'opaque', rowCount: 123 } });
    expect(element.textContent).toContain('not available');
    expect(element.textContent).toContain('123 rows');
    expect(element.querySelector('svg, table, button')).toBeNull();
  });
  it('keeps the 5000-point SVG small and pages selection with original indices', () => {
    const { fixture, element } = setup({ ...node, selectable: true,
      series: [{ name: 'A', points: Array.from({ length: 5000 }, (_, x) => ({ x, y: x })) }] });
    expect(element.querySelectorAll('polyline')).toHaveLength(1);
    expect(element.querySelectorAll('circle')).toHaveLength(0);
    expect(element.querySelectorAll('svg *').length).toBeLessThan(20);
    element.querySelector('button')!.click(); fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(25);
    Array.from(element.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Next')!.click();
    fixture.detectChanges();
    const selected = jest.fn();
    fixture.componentInstance.selectionChange.subscribe(selected);
    element.querySelector<HTMLButtonElement>('tbody button')!.click();
    expect(selected).toHaveBeenCalledWith({ componentId: 'chart', target: { kind: 'chart-point', seriesIndex: 0, pointIndex: 25 } });
    fixture.componentRef.setInput('node', { ...node, selectable: false }); fixture.detectChanges();
    fixture.componentInstance.selectPoint(fixture.componentInstance.geometry().rows[0]);
    expect(selected).toHaveBeenCalledTimes(1);
  });
  it('renders solid primary and hatched secondary bars with matching rect legends', () => {
    const { element } = setup({ ...node, kind: 'bar-chart' });
    const bars = element.querySelectorAll('svg[role="img"] > rect');
    expect(bars).toHaveLength(2);
    expect(bars[0].getAttribute('stroke-dasharray')).not.toBe(bars[1].getAttribute('stroke-dasharray'));
    expect(bars[0].classList.contains('fill-primary')).toBe(true);
    expect(bars[0].classList.contains('stroke-primary')).toBe(true);
    expect(bars[0].getAttribute('fill')).toBeNull();
    expect(bars[1].classList.contains('stroke-secondary')).toBe(true);
    expect(bars[1].getAttribute('class')).not.toContain('fill-');
    const pattern = element.querySelector('pattern')!;
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(45)');
    expect(pattern.getAttribute('patternUnits')).toBe('userSpaceOnUse');
    expect(pattern.querySelector('line')?.classList.contains('stroke-secondary')).toBe(true);
    expect(bars[1].getAttribute('fill')).toBe(`url(#${pattern.id})`);
    const swatches = element.querySelectorAll('ul svg rect');
    expect(swatches).toHaveLength(2);
    expect(element.querySelector('ul svg line')).toBeNull();
    for (let index = 0; index < bars.length; index++) {
      expect(swatches[index].getAttribute('class')).toBe(bars[index].getAttribute('class'));
      expect(swatches[index].getAttribute('fill')).toBe(bars[index].getAttribute('fill'));
    }
    expect(bars[1].textContent).toContain('Second');
    expect(element.querySelector('style, [style]')).toBeNull();
  });
  it('hides the legend for a single series and keeps it for several', () => {
    const single = setup({ ...node, kind: 'bar-chart', series: [{ name: 'Only', points: [{ x: 'Mon', y: 1 }] }] });
    expect(single.element.querySelector('ul[aria-label="Series"]')).toBeNull();
    const several = setup({ ...node, kind: 'bar-chart' });
    expect(several.element.querySelectorAll('ul[aria-label="Series"] li')).toHaveLength(2);
  });
  it('labels every bar category, truncating long names but keeping the full name as a title', () => {
    const long = 'x'.repeat(60);
    const { element } = setup({ ...node, kind: 'bar-chart',
      series: [{ name: 'A', points: [{ x: 'Mon', y: 3 }, { x: long, y: 5 }, { x: 'Wed', y: 1 }] }] });
    const labels = Array.from(element.querySelectorAll('[data-testid="chart-category"]'));
    expect(labels).toHaveLength(3);
    expect(labels[0].childNodes[0].textContent).toBe('Mon');
    expect(labels[1].childNodes[0].textContent?.endsWith('…')).toBe(true);
    expect(labels[1].querySelector('title')?.textContent).toBe(long);
  });
  it('keeps first and last labels only for numeric line charts', () => {
    const { element } = setup({ ...node, series: [{ name: 'A', points: [{ x: 1, y: 1 }, { x: 9, y: 2 }] }] });
    expect(element.querySelectorAll('[data-testid="chart-category"]')).toHaveLength(0);
    expect(element.querySelector('svg[role="img"]')?.textContent).toContain('9');
  });
  it('writes compact value labels above positive and below negative bars', () => {
    const { element } = setup({ ...node, kind: 'bar-chart',
      series: [{ name: 'A', points: [{ x: 'Mon', y: 1200 }, { x: 'Tue', y: -300 }] }] });
    const values = Array.from(element.querySelectorAll('[data-testid="chart-value"]'));
    expect(values.map(value => value.textContent)).toEqual(['1.2K', '-300']);
    const bars = element.querySelectorAll('svg[role="img"] > rect');
    expect(Number(values[0].getAttribute('y'))).toBeLessThan(Number(bars[0].getAttribute('y')));
    const negativeBottom = Number(bars[1].getAttribute('y')) + Number(bars[1].getAttribute('height'));
    expect(Number(values[1].getAttribute('y'))).toBeGreaterThan(negativeBottom);
  });
  it('omits value labels on line charts and on bars too narrow to hold them', () => {
    expect(setup().element.querySelector('[data-testid="chart-value"]')).toBeNull();
    const crowded = setup({ ...node, kind: 'bar-chart',
      series: [{ name: 'A', points: Array.from({ length: 30 }, (_, x) => ({ x: `c${x}`, y: x })) }] });
    expect(crowded.element.querySelector('[data-testid="chart-value"]')).toBeNull();
  });
  it('uses unique hatch ids across chart instances with the same node id', () => {
    const first = setup({ ...node, kind: 'bar-chart' });
    const second = setup({ ...node, kind: 'bar-chart' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.append(first.element, second.element);
    try {
      const patterns = container.querySelectorAll('pattern');
      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).not.toBe(patterns[1].id);
      for (const { element } of [first, second]) {
        const id = element.querySelector('pattern')!.id;
        const fills = Array.from(element.querySelectorAll('rect[fill]')).map(rect => rect.getAttribute('fill'));
        expect(fills).toEqual([`url(#${id})`, `url(#${id})`]);
        expect(document.getElementById(id)).toBe(element.querySelector('pattern'));
      }
    } finally {
      container.remove();
    }
  });
});
