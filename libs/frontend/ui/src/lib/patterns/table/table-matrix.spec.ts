import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PtahTableComponent } from './table.component';
import {
  PtahTableCellButtonDirective,
  PtahTableGroupHeaderDirective,
  PtahTableGroupRowDirective,
  PtahTableScoreComponent,
  PtahTableGroupTitleComponent,
  PtahTableStatusCellComponent,
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
    PtahTableStatusCellComponent,
    PtahTableStickyHeaderDirective,
    PtahTableBarCellDirective,
  ],
  template: `
    <table>
      <tbody>
        <tr ptahGroupRow>
          <th ptahGroupHeader [columns]="4">
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
          <td ptahStatusCell="error" [columns]="4">Failed</td>
        </tr>
        <tr>
          <td ptahStatusCell="loading" [columns]="4">Loading</td>
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
    expect(th?.getAttribute('colspan')).toBe('4');
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

  it('treats a score outside 0 to 100 as unrated', () => {
    const f = TestBed.createComponent(PtahTableScoreComponent);
    f.componentRef.setInput('label', 'Q');
    for (const [v, rated] of [
      [0, true],
      [100, true],
      [-5, false],
      [120, false],
    ] as const) {
      f.componentRef.setInput('score', v);
      f.detectChanges();
      expect(
        !!(f.nativeElement as HTMLElement).querySelector('[role="meter"]'),
      ).toBe(rated);
    }
  });

  it('puts the sticky class on the row header inside a table (CSS is checked in the visual review)', () => {
    @Component({
      standalone: true,
      imports: [PtahTableComponent, PtahTableStickyHeaderDirective],
      template: `<ptah-table label="T"
        ><table>
          <tbody>
            <tr>
              <th scope="row" ptahStickyHeader>A</th>
            </tr>
          </tbody>
        </table></ptah-table
      >`,
    })
    class StickyHost {}
    const f = TestBed.createComponent(StickyHost);
    f.detectChanges();
    const th = (f.nativeElement as HTMLElement).querySelector(
      'th',
    ) as HTMLElement;
    expect(th.classList.contains('ptah-table-sticky-header')).toBe(true);
  });

  it('keeps a fixed tone for high scores, never warn or error', () => {
    const f = TestBed.createComponent(PtahTableScoreComponent);
    f.componentRef.setInput('label', 'Q');
    for (const v of [95, 100]) {
      f.componentRef.setInput('score', v);
      f.detectChanges();
      const html = (f.nativeElement as HTMLElement).innerHTML;
      expect(html).not.toContain('bg-state-err');
      expect(html).not.toContain('bg-state-need');
      expect(html).toContain('bg-[var(--ptah-gold)]');
    }
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
    expect(cells[0].getAttribute('role')).toBeNull();
    expect(cells[0].tagName).toBe('TD');
    expect(cells[0].querySelector('[role="alert"]')?.textContent).toContain(
      'Failed',
    );
    expect(cells[0].getAttribute('colspan')).toBe('4');
    expect(cells[1].querySelector('[role="status"]')).not.toBeNull();
    expect(
      cells[1].querySelector('[role="status"]')?.getAttribute('aria-busy'),
    ).toBe('true');
  });
});
