import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DurationBadgeComponent } from './duration-badge.component';

describe('DurationBadgeComponent', () => {
  let fixture: ComponentFixture<DurationBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DurationBadgeComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DurationBadgeComponent);
  });

  function setDuration(ms: number): void {
    fixture.componentRef.setInput('durationMs', ms);
    fixture.detectChanges();
  }

  it('creates the component', () => {
    setDuration(500);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('formats sub-second durations as whole seconds', () => {
    setDuration(500);
    expect(fixture.nativeElement.textContent).toContain('0s');
  });

  it('treats small values as milliseconds', () => {
    setDuration(2);
    expect(fixture.nativeElement.textContent).toContain('0s');
  });

  it('formats sub-minute durations as whole seconds', () => {
    setDuration(12_500);
    expect(fixture.nativeElement.textContent).toContain('12s');
  });

  it('formats >= 1 minute durations as minutes + seconds', () => {
    setDuration(135_000); // 2m 15s
    expect(fixture.nativeElement.textContent).toContain('2m 15s');
  });

  it('omits seconds when minutes are exact', () => {
    setDuration(120_000);
    expect(fixture.nativeElement.textContent.trim()).toMatch(/2m\s*$/);
  });
});
