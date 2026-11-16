import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PtahTableCellButtonDirective,
  PtahTableGroupHeaderDirective,
  PtahTableGroupRowDirective,
  PtahTableScoreComponent,
  PtahTableGroupTitleComponent,
  PtahTableStatusCellDirective,
  PtahTableStickyHeaderDirective,
  PtahTableBarCellDirective,
} from './table-matrix';

@Component({
  standalone: true,
  imports: [
    PtahTableCellButtonDirective,
    PtahTableGroupHeaderDirective,
    PtahTableGroupRowDirective,
    PtahTableScoreComponent,
    PtahTableGroupTitleComponent,
    PtahTableStatusCellDirective,
    PtahTableStickyHeaderDirective,
    PtahTableBarCellDirective,
  ],
  template: `
    <table>
      <tbody>
        <tr ptahGroupRow>
          <th ptahGroupHeader [columns]="3">
            <ptah-table-group-title name="Installed"
              ><span ptahGroupCount>3</span></ptah-table-group-title
            >
          </th>
        </tr>
        <tr>
          <th scope="row" ptahStickyHeader>A</th>
          <td ptahBarCell>
            <ptah-table-score label="Quality for A" [score]="72" stale />
          </td>
          <td ptahBarCell>
            <ptah-table-score label="Quality for B" [score]="null" />
          </td>
          <td>
            <button [ptahCellButton]="open" aria-label="Details for A">
              i
            </button>
          </td>
        </tr>
        <tr>
          <td ptahStatusCell="error" [columns]="3">Failed</td>
        </tr>
        <tr>
          <td ptahStatusCell="loading" [columns]="3">Loading</td>
        </tr>
      </tbody>
    </table>
  `,
})
class HostComponent {
  open = true;
}

describe('table matrix helpers', () => {
  function render(): HTMLElement {
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('renders the group title and count', () => {
    const el = render();
    expect(el.querySelector('.ptah-table-group-row')).not.toBeNull();
    expect(el.querySelector('.ptah-table-group-name')?.textContent).toBe(
      'Installed',
    );
    expect(el.querySelector('[ptahGroupCount]')?.textContent).toBe('3');
  });

  it('marks sticky header and bar cell', () => {
    const el = render();
    expect(el.querySelector('th.ptah-table-sticky-header')).not.toBeNull();
    expect(el.querySelector('td.ptah-table-bar-cell')).not.toBeNull();
  });

  it('sets scope rowgroup and colspan on the group header', () => {
    const th = render().querySelector('th[scope="rowgroup"]');
    expect(th?.getAttribute('colspan')).toBe('3');
  });

  it('shows the score number and a text stale mark', () => {
    const el = render();
    const meter = el.querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('72');
    expect(el.querySelector('ptah-meter')?.textContent).toContain('72');
    expect(el.querySelector('.ptah-table-score-stale')?.textContent).toContain(
      'Stale',
    );
  });

  it('shows unrated text and no bar when there is no score', () => {
    const scores = render().querySelectorAll('ptah-table-score');
    expect(scores[1].querySelector('[role="meter"]')).toBeNull();
    expect(scores[1].textContent).toContain('Unrated');
    expect(scores[1].querySelector('.ptah-table-score-stale')).toBeNull();
  });

  it('mirrors popover state on the cell button', () => {
    const b = render().querySelector('button') as HTMLButtonElement;
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.type).toBe('button');
  });

  it('gives status rows the right role and span', () => {
    const cells = Array.from(
      render().querySelectorAll<HTMLElement>('td[data-status]'),
    );
    expect(cells[0].getAttribute('role')).toBe('alert');
    expect(cells[0].getAttribute('colspan')).toBe('3');
    expect(cells[1].getAttribute('role')).toBe('status');
    expect(cells[1].getAttribute('aria-busy')).toBe('true');
  });
});
