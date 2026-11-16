import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PtahTableActionsCellDirective,
  PtahTableControlCellDirective,
  PtahTableMessageCellDirective,
  PtahTableRowDirective,
  PtahTableRowTitleComponent,
  ptahCellLabel,
} from './table-cells';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahTableActionsCellDirective,
    PtahTableControlCellDirective,
    PtahTableMessageCellDirective,
    PtahTableRowDirective,
    PtahTableRowTitleComponent,
  ],
  template: `<table>
    <tbody>
      <tr [ptahRowState]="state()">
        <th scope="row">
          <ptah-table-row-title
            name="Quill"
            kind="CLI agent"
            secondary="1.2"
            [mono]="true"
            ><span ptahRowMark>Q</span
            ><span ptahRowInfo>Info</span></ptah-table-row-title
          >
        </th>
        <td ptahControlCell>
          <select aria-label="Permission for Quill">
            <option>Ask</option>
          </select>
        </td>
        <td ptahActionsCell>Action</td>
        <td [ptahMessageCell]="2">Unavailable <button>Retry</button></td>
      </tr>
    </tbody>
  </table>`,
})
class HostComponent {
  readonly state = signal<'default' | 'muted' | 'disabled' | 'selected'>(
    'default',
  );
}

describe('table cells', () => {
  it('renders native row header content, helpers and cell markers', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('th')?.getAttribute('scope')).toBe('row');
    expect(root.querySelector('.ptah-table-row-title-name')?.textContent).toBe(
      'Quill',
    );
    expect(root.querySelector('.ptah-table-row-title-kind')?.textContent).toBe(
      'CLI agent',
    );
    expect(
      root
        .querySelector('.ptah-table-row-title-secondary')
        ?.classList.contains('ptah-table-row-title-mono'),
    ).toBe(true);
    expect(root.querySelector('[ptahRowMark]')?.textContent).toBe('Q');
    expect(root.querySelector('[ptahRowInfo]')?.textContent).toBe('Info');
    expect(
      root
        .querySelector('td[ptahControlCell]')
        ?.classList.contains('ptah-table-control-cell'),
    ).toBe(true);
    expect(
      root
        .querySelector('td[ptahActionsCell]')
        ?.classList.contains('ptah-table-actions-cell'),
    ).toBe(true);
    expect(
      root.querySelector('td.ptah-table-message-cell')?.getAttribute('colspan'),
    ).toBe('2');
    expect(ptahCellLabel('Permission', 'Quill')).toBe('Permission for Quill');
    const row = root.querySelector('tr') as HTMLElement;
    expect(row.getAttribute('data-state')).toBe('default');
    fixture.componentInstance.state.set('disabled');
    fixture.detectChanges();
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.hasAttribute('inert')).toBe(true);
    fixture.componentInstance.state.set('selected');
    fixture.detectChanges();
    expect(row.getAttribute('data-state')).toBe('selected');
    expect(row.hasAttribute('aria-disabled')).toBe(false);
  });
});
