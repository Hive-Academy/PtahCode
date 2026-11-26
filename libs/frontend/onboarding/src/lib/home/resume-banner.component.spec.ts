import { TestBed } from '@angular/core/testing';
import { ResumeBannerComponent } from './resume-banner.component';

describe('ResumeBannerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows supplied run facts and emits Resume by default', () => {
    TestBed.configureTestingModule({ imports: [ResumeBannerComponent] });
    const fixture = TestBed.createComponent(ResumeBannerComponent);
    fixture.componentRef.setInput('title', 'Agent generation for project');
    fixture.componentRef.setInput('detail', '2 agents written');
    const resume = jest.fn();
    fixture.componentInstance.resumeRequested.subscribe(resume);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const section = el.querySelector('section') as HTMLElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(section.getAttribute('aria-label')).toBe(
      'Continue an interrupted run',
    );
    expect(section.classList.contains('border-state-need')).toBe(true);
    expect(el.textContent).toContain('2 agents written');
    expect(el.textContent).toContain('Interrupted');
    expect(button.textContent?.trim()).toBe('Resume');
    button.click();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('renders active styling, Running chip, and View action when running', () => {
    TestBed.configureTestingModule({ imports: [ResumeBannerComponent] });
    const fixture = TestBed.createComponent(ResumeBannerComponent);
    fixture.componentRef.setInput('state', 'running');
    fixture.componentRef.setInput('title', 'Workspace analysis in progress');
    const open = jest.fn();
    fixture.componentInstance.resumeRequested.subscribe(open);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const section = el.querySelector('section') as HTMLElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(section.getAttribute('aria-label')).toBe('Active run in progress');
    expect(section.classList.contains('border-state-run')).toBe(true);
    expect(el.textContent).toContain('Running');
    expect(button.textContent?.trim()).toBe('View');
    button.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('renders Stopping chip and View action when cancelling', () => {
    TestBed.configureTestingModule({ imports: [ResumeBannerComponent] });
    const fixture = TestBed.createComponent(ResumeBannerComponent);
    fixture.componentRef.setInput('state', 'cancelling');
    fixture.componentRef.setInput('title', 'Stopping workspace analysis');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const section = el.querySelector('section') as HTMLElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(section.getAttribute('aria-label')).toBe('Stopping run');
    expect(section.classList.contains('border-state-need')).toBe(true);
    expect(el.textContent).toContain('Stopping');
    expect(button.textContent?.trim()).toBe('View');
  });
});
