import {
  columnHideOrder,
  PTAH_TABLE_COLUMN_MIN_WIDTH,
  PtahTableColumn,
  resolveHiddenColumns,
} from './table-columns';

describe('table column resolution', () => {
  const columns: readonly PtahTableColumn[] = [
    { id: 'name', minWidth: 100 },
    { id: 'status', priority: 1, minWidth: 100 },
    { id: 'cost', priority: 3, minWidth: 100 },
    { id: 'time', priority: 3, minWidth: 100 },
  ];

  it('excludes required columns and sorts highest priority first, later ties first', () => {
    expect(columnHideOrder(columns).map((column) => column.id)).toEqual([
      'time', 'cost', 'status',
    ]);
    expect(columns.map((column) => column.id)).toEqual(['name', 'status', 'cost', 'time']);
  });

  it.each([
    [400, []],
    [399, ['time']],
    [300, ['time']],
    [299, ['time', 'cost']],
    [200, ['time', 'cost']],
    [199, ['time', 'cost', 'status']],
    [0, ['time', 'cost', 'status']],
  ])('hides only enough optional columns to fit width %s', (width, expected) => {
    expect([...resolveHiddenColumns(columns, width)]).toEqual(expected);
  });

  it('never hides required columns even when they alone exceed the width', () => {
    const required = [{ id: 'name', minWidth: 200 }, { id: 'actions' }];
    expect(columnHideOrder(required)).toEqual([]);
    expect([...resolveHiddenColumns(required, 1, { guardExtra: 100 })]).toEqual([]);
  });

  it('uses 96px as the default minimum width', () => {
    expect(PTAH_TABLE_COLUMN_MIN_WIDTH).toBe(96);
    const defaults = [{ id: 'name' }, { id: 'status', priority: 1 }];
    expect([...resolveHiddenColumns(defaults, 192)]).toEqual([]);
    expect([...resolveHiddenColumns(defaults, 191)]).toEqual(['status']);
  });

  it('sums individual minimum widths rather than counting columns', () => {
    const varied = [
      { id: 'name', minWidth: 180 },
      { id: 'status', minWidth: 70, priority: 1 },
      { id: 'cost', minWidth: 150, priority: 2 },
    ];
    expect([...resolveHiddenColumns(varied, 250)]).toEqual(['cost']);
    expect([...resolveHiddenColumns(varied, 249)]).toEqual(['cost', 'status']);
  });

  it('hides all optional columns strictly below collapseBelow', () => {
    expect([...resolveHiddenColumns(columns, 599, { collapseBelow: 600 })]).toEqual([
      'time', 'cost', 'status',
    ]);
    expect([...resolveHiddenColumns(columns, 600, { collapseBelow: 600 })]).toEqual([]);
  });

  it('adds guardExtra hides after width-based hides without hiding required columns', () => {
    expect([...resolveHiddenColumns(columns, 300, { guardExtra: 1 })]).toEqual(['time', 'cost']);
    expect([...resolveHiddenColumns(columns, 400, { guardExtra: 2 })]).toEqual(['time', 'cost']);
    expect([...resolveHiddenColumns(columns, 0, { guardExtra: 100 })]).toEqual([
      'time', 'cost', 'status',
    ]);
  });

  it('hides nothing at infinite width', () => {
    expect([...resolveHiddenColumns(columns, Infinity)]).toEqual([]);
  });

  it('handles an empty column list', () => {
    expect(columnHideOrder([])).toEqual([]);
    expect([...resolveHiddenColumns([], 0, { collapseBelow: 800, guardExtra: 5 })]).toEqual([]);
  });
});
