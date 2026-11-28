import { TestBed } from '@angular/core/testing';
import { PtahDonutComponent } from './donut.component';
import { PtahStackedBarComponent } from './stacked-bar.component';

const segments = [
  { label: 'Approved', value: 3, color: 'var(--state-ink-done)' },
  { label: 'Failed', value: 1, color: 'var(--state-ink-err)' },
  { label: 'Pending', value: 0, color: 'var(--ptah-gold)' },
];

describe('segmented charts', () => {
  it('sizes and orders the stacked bar marks and updates them when the input changes', () => {
    const fixture = TestBed.createComponent(PtahStackedBarComponent);
    fixture.componentRef.setInput('label', 'Outcomes');
    fixture.componentRef.setInput('segments', segments);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const marks = () => Array.from(el.querySelectorAll('rect[x]'));
    expect(marks().map((mark) => [mark.getAttribute('x'), mark.getAttribute('width'), mark.getAttribute('fill')])).toEqual([
      ['0', '75', 'var(--state-ink-done)'],
      ['75', '25', 'var(--state-ink-err)'],
    ]);

    fixture.componentRef.setInput('segments', segments.slice(1));
    fixture.detectChanges();
    expect(marks().map((mark) => mark.getAttribute('width'))).toEqual(['100']);
  });

  it('renders proportional donut arcs and the total with the default caption', () => {
    const fixture = TestBed.createComponent(PtahDonutComponent);
    fixture.componentRef.setInput('label', 'Outcomes');
    fixture.componentRef.setInput('segments', segments);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('circle[pathLength]'), (mark) => [
      mark.getAttribute('stroke-dasharray'), mark.getAttribute('stroke-dashoffset'), mark.getAttribute('stroke'),
    ])).toEqual([
      ['74.5 100', '0', 'var(--state-ink-done)'],
      ['24.5 100', '-75', 'var(--state-ink-err)'],
    ]);
    expect(Array.from(el.querySelectorAll('text'), (node) => node.textContent)).toEqual(['4', 'runs']);
  });

  it('leaves an empty donut track and displays zero with a custom caption', () => {
    const fixture = TestBed.createComponent(PtahDonutComponent);
    fixture.componentRef.setInput('label', 'Outcomes');
    fixture.componentRef.setInput('segments', [0, -1, NaN, Infinity].map((value) => ({ ...segments[0], value })));
    fixture.componentRef.setInput('centerCaption', 'reviews');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('circle')).toHaveLength(1);
    expect(Array.from(el.querySelectorAll('text'), (node) => node.textContent)).toEqual(['0', 'reviews']);
  });
});
