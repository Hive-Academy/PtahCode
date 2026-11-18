import { TestBed } from '@angular/core/testing';
import { TimeBrushComponent } from './time-brush.component';

describe('TimeBrushComponent', () => {
  it('emits range changes from native range thumbs and clears them', async () => {
    const fixture = TestBed.createComponent(TimeBrushComponent);
    fixture.componentRef.setInput('timestamps', [100, 200, 300]);
    fixture.componentRef.setInput('from', 100);
    fixture.detectChanges();
    const emitted: unknown[] = [];
    fixture.componentInstance.rangeChange.subscribe(value => emitted.push(value));
    const thumb = fixture.nativeElement.querySelector('input[aria-label="From date"]') as HTMLInputElement;
    thumb.value = '200';
    thumb.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('button').click();
    expect(emitted).toEqual([{ from: 200, to: null }, { from: null, to: null }]);
  });
});
