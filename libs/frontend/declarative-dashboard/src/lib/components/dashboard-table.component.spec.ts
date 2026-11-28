import { TestBed } from '@angular/core/testing';
import type { TableNode } from '../table/table-rows';
import { DashboardTableComponent } from './dashboard-table.component';

describe('DashboardTableComponent', () => {
  const markup = '<img src=x onerror=alert(1)>';
  const node: TableNode = {
    id: 'deploys', kind: 'table', selectable: false, title: { text: 'Recent deploys' },
    columns: [{ key: 'service', label: { text: 'Service' } }, { key: 'cost', label: { text: 'Cost' }, align: 'right' }],
    rows: [['checkout', 3], ['billing', 1], ['api', 2]],
  };
  const manyRows = (count: number) => Array.from({ length: count }, (_, index) => [`service-${index}`, index]);

  function setup(value: TableNode = node) {
    const fixture = TestBed.createComponent(DashboardTableComponent);
    fixture.componentRef.setInput('node', value);
    fixture.componentRef.setInput('surfaceId', 'surface');
    fixture.componentInstance.viewStateChange.subscribe(state => fixture.componentRef.setInput('viewState', state));
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = (control: string) =>
      element.querySelector<HTMLButtonElement>(`[data-apps-focus-key="surface:deploys:${control}"]`)!;
    const firstColumn = () => Array.from(element.querySelectorAll('tbody tr')).map(row => row.querySelector('td')?.textContent);
    return { fixture, element, button, firstColumn };
  }

  it('sorts through ascending, descending and original order with aria-sort on the header', () => {
    const { fixture, element, button } = setup();
    const headers = () => Array.from(element.querySelectorAll('thead th')).map(th => th.getAttribute('aria-sort'));
    const costs = () => Array.from(element.querySelectorAll('tbody tr')).map(row => row.querySelectorAll('td')[1].textContent);
    expect(headers()).toEqual(['none', 'none']);
    expect(element.querySelector('thead th button')?.textContent).toBe('Service');
    button('sort-1').click(); fixture.detectChanges();
    expect(headers()).toEqual(['none', 'ascending']);
    expect(costs()).toEqual(['1', '2', '3']);
    button('sort-1').click(); fixture.detectChanges();
    expect(headers()).toEqual(['none', 'descending']);
    expect(costs()).toEqual(['3', '2', '1']);
    button('sort-1').click(); fixture.detectChanges();
    expect(headers()).toEqual(['none', 'none']);
    expect(costs()).toEqual(['3', '1', '2']);
    expect(fixture.componentInstance.viewState().sort).toBeUndefined();
    expect(element.querySelectorAll('thead th')[1].classList.contains('text-right')).toBe(true);
  });

  it('filters over visible cell text, resets the page and shows the result count', () => {
    const { fixture, element, firstColumn } = setup({ ...node, rows: manyRows(60) });
    fixture.componentRef.setInput('viewState', { page: 2 }); fixture.detectChanges();
    const filter = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    filter.value = 'SERVICE-5'; filter.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance.viewState().page).toBe(0);
    expect(firstColumn()).toEqual(['service-5', 'service-50', 'service-51', 'service-52', 'service-53',
      'service-54', 'service-55', 'service-56', 'service-57', 'service-58', 'service-59']);
    expect(element.textContent).toContain('11 results');
    filter.value = '42'; filter.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(firstColumn()).toEqual(['service-42']);
    filter.value = 'absent'; filter.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(element.textContent).toContain('0 results');
  });

  it('keeps at most 25 rows in the DOM for 5,000 rows inside a scroll viewport, with the pager', () => {
    const { fixture, element, button } = setup({ ...node, rows: manyRows(5000) });
    expect(element.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(element.textContent).toContain('5000 results');
    expect(element.textContent).toContain('Page 1 of 200');
    const viewport = element.querySelector('[data-testid="table-viewport"]')!;
    expect(viewport.classList.contains('overflow-auto')).toBe(true);
    expect(viewport.classList.contains('max-h-96')).toBe(true);
    button('next').click(); fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(element.textContent).toContain('Page 2 of 200');
    expect(element.querySelector('tbody td')?.textContent).toBe('service-25');
  });

  it('selects by original row index on page 2, only when selectable, with the table-row target', () => {
    const { fixture, element, button } = setup({ ...node, rows: manyRows(40) });
    const emitted = jest.fn(); fixture.componentInstance.selectionChange.subscribe(emitted);
    expect(element.querySelector('tbody button')).toBeNull();
    fixture.componentInstance.selectRow(0);
    expect(emitted).not.toHaveBeenCalled();

    fixture.componentRef.setInput('node', { ...fixture.componentInstance.node(), selectable: true });
    fixture.componentRef.setInput('viewState', { sort: { columnKey: 'cost', direction: 'desc' } });
    fixture.detectChanges();
    button('next').click(); fixture.detectChanges();
    // Descending by cost: page 2 starts at original row 14.
    expect(element.querySelector('tbody td')?.textContent).toBe('service-14');
    button('row-14').click();
    const selection = { componentId: 'deploys', target: { kind: 'table-row', rowIndex: 14 } };
    expect(emitted).toHaveBeenLastCalledWith(selection);
    fixture.componentRef.setInput('selection', selection); fixture.detectChanges();
    expect(button('row-14').getAttribute('aria-pressed')).toBe('true');
    expect(button('row-13').getAttribute('aria-pressed')).toBe('false');
    fixture.componentInstance.selectRow(40);
    fixture.componentInstance.selectRow(-1);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('shows the not-available notice with rowCount for a data reference', () => {
    const { element } = setup({ ...node, rows: undefined, data: { resultId: 'opaque', rowCount: 1200 } });
    expect(element.textContent).toContain('not available');
    expect(element.textContent).toContain('1200 rows');
    expect(element.querySelector('table, input, ptah-dashboard-pager')).toBeNull();
  });

  it('expands through controlled state and Escape returns focus to the icon button', () => {
    const { fixture, element, button } = setup({ ...node, rows: manyRows(30) }); document.body.appendChild(element);
    try {
      const expand = button('expand');
      expect(element.querySelector(`#${expand.getAttribute('aria-controls')}`)).not.toBeNull();
      expect(expand.getAttribute('aria-label')).toBe('Expand Recent deploys');
      expect(expand.getAttribute('aria-expanded')).toBe('false');
      expand.click(); fixture.detectChanges();
      expect(expand.getAttribute('aria-label')).toBe('Collapse Recent deploys');
      expect(expand.getAttribute('aria-expanded')).toBe('true');
      expect(element.querySelector('[data-testid="table-viewport"]')!.classList.contains('max-h-96')).toBe(false);
      const filter = element.querySelector<HTMLInputElement>('input')!;
      filter.focus();
      filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
      expect(expand.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(expand);
    } finally { element.remove(); }
  });

  it('renders producer text literally, with no style and no element from markup', () => {
    const { element } = setup({ ...node, title: { text: markup }, description: { text: markup },
      columns: [{ key: 'a', label: { text: markup } }], rows: [[markup]] });
    expect(element.querySelector('h3')?.textContent).toBe(markup);
    expect(element.querySelector('thead button')?.textContent).toBe(markup);
    expect(element.querySelector('tbody td')?.textContent).toBe(markup);
    expect(element.querySelector('img, script, style, [style], a')).toBeNull();
  });

  it('uses unique content and filter ids across two instances', () => {
    const first = setup({ ...node, rows: manyRows(30) }); const second = setup({ ...node, rows: manyRows(30) });
    const ids = [first, second].map(({ element, button }) => {
      const input = element.querySelector('input')!;
      expect(input.getAttribute('aria-label')).toBe('Filter Recent deploys');
      expect(input.placeholder).toBe('Filter rows');
      expect(element.querySelector('label')).toBeNull();
      return [button('expand').getAttribute('aria-controls'), input.id];
    });
    expect(ids[0][0]).not.toBe(ids[1][0]);
    expect(ids[0][1]).not.toBe(ids[1][1]);
  });

  it('keeps an active filter available when the table shrinks', () => {
    const value = { ...node, rows: manyRows(12), title: { text: '   ' } };
    const { fixture, element } = setup(value);
    const filter = element.querySelector<HTMLInputElement>('input[type="search"]');
    if (!filter) throw new Error('Expected a filter input');
    expect(filter.getAttribute('aria-label')).toBe('Filter Table');
    expect(element.querySelector('h3')).toBeNull();
    filter.value = 'service-1';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.componentRef.setInput('node', { ...value, rows: manyRows(10) });
    fixture.detectChanges();
    expect(element.querySelector('input[type="search"]')).toBe(filter);
    expect(filter.value).toBe('service-1');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector('button[aria-expanded]')).toBeNull();

    filter.value = '';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelector('input[type="search"]')).toBeNull();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(10);
  });

  it('keeps a small untitled table free of heading, filter, expand, result count and pager', () => {
    const { element } = setup({ ...node, title: undefined, rows: manyRows(10) });
    expect(element.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(element.querySelector('h3')).toBeNull();
    expect(element.textContent).not.toContain('Table');
    expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Table');
    expect(element.querySelector('table')?.getAttribute('aria-label')).toBe('Table');
    expect(element.querySelector('input, ptah-dashboard-pager, p[role="status"]')).toBeNull();
    expect(element.querySelector('[data-apps-focus-key="surface:deploys:expand"]')).toBeNull();
  });

  it.each([
    ['1,234,567.89', true],
    ['-$1,234.50', true],
    ['$-5', true],
    ['0.5%', true],
    ['1,2,3', false],
    ['101,102', true],
    ['100,', false],
    ['01,234', false],
    ['+-5', false],
    ['--5', false],
    ['-$-5', false],
    ['0042', false],
  ])('classifies %s as numeric: %s', (value, expected) => {
    const { element } = setup({
      ...node, columns: [{ key: 'value', label: { text: 'Value' } }],
      rows: [[value], ['   '], ['']],
    });
    expect(element.querySelector('tbody td')?.classList.contains('tabular-nums')).toBe(expected);
  });

  it('right-aligns and bolds numeric-looking columns unless an explicit align is set', () => {
    const { element } = setup({ ...node, columns: [
      { key: 'name', label: { text: 'Name' } }, { key: 'tokens', label: { text: 'Tokens' } },
      { key: 'share', label: { text: 'Share' } }, { key: 'cost', label: { text: 'Cost' } },
      { key: 'mixed', label: { text: 'Mixed' } }, { key: 'pinned', label: { text: 'Pinned' }, align: 'left' }],
      rows: [['alpha', '5.2k', '45%', '$1.20', '12', 3], ['beta', '332', '', '$0.08', 'n/a', 4], ['gamma', 1200, '7.5%', null, '3', 5]] });
    const cells = Array.from(element.querySelector('tbody tr')!.querySelectorAll('td'));
    const headers = Array.from(element.querySelectorAll('thead th'));
    const numeric = (cell: Element) => cell.classList.contains('text-right') && cell.classList.contains('font-semibold');
    expect(cells.map(numeric)).toEqual([false, true, true, true, false, false]);
    expect(headers.map(header => header.classList.contains('text-right'))).toEqual([false, true, true, true, false, false]);
    expect(cells[1].classList.contains('tabular-nums')).toBe(true);
  });

  it('tolerates malformed rows, cells and columns without throwing or losing alignment', () => {
    const malformed = { ...node, columns: [null, { key: 'b', label: { text: 'B' } }],
      rows: [null, [{}, 'kept'], 'row'] } as unknown as TableNode;
    const { element } = setup(malformed);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(element.textContent).not.toContain('[object Object]');
    expect(element.querySelectorAll('tbody tr')[1].querySelectorAll('td')[1].textContent).toBe('kept');
  });
});
