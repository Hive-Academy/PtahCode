import { TestBed } from '@angular/core/testing';
import type { ReviewFinding } from '@ptah-extension/review-contracts';
import { ReviewFindingCardComponent } from './review-finding-card.component';
import { openTriage, toFindingViews } from './review-finding-view';

const view = toFindingViews([{
  schemaVersion: 1, lens: 'correctness-lifecycle', title: '<script>unsafe</script>', failureMode: 'Failure', affectedBehavior: 'Behavior',
  scenario: 'Scenario', path: 'src/a.ts', line: 3, evidence: [{ path: 'src/a.ts', line: 3, excerpt: '<b>evidence</b>' }],
  affectedCaller: null, severity: 'Critical', category: 'functional', confidence: 0.9, verification: 'cross-family',
  suggestedDiff: '<em>diff</em>', fixPrompt: '<i>prompt</i>',
} satisfies ReviewFinding])[0];

describe('ReviewFindingCardComponent', () => {
  it('renders finding content as text and emits evidence locations', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingCardComponent] });
    const fixture = TestBed.createComponent(ReviewFindingCardComponent);
    fixture.componentRef.setInput('view', view); fixture.componentRef.setInput('triage', openTriage);
    const opened = jest.fn(); fixture.componentInstance.openEvidence.subscribe(opened);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>unsafe</script>');
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
    (fixture.nativeElement.querySelector('[aria-label="Open evidence src/a.ts at line 3"]') as HTMLButtonElement).click();
    expect(opened).toHaveBeenCalledWith({ path: 'src/a.ts', line: 3 });
  });
  it('disables posting controls while pending', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingCardComponent] });
    const fixture = TestBed.createComponent(ReviewFindingCardComponent);
    fixture.componentRef.setInput('view', view); fixture.componentRef.setInput('triage', { ...openTriage, pending: true });
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    expect(buttons.find(button => button.textContent?.trim() === 'Accept')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent?.trim() === 'Dismiss')?.disabled).toBe(true);
  });
  it('disables accept and dismiss after a triage reply and keeps reply active', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingCardComponent] });
    const fixture = TestBed.createComponent(ReviewFindingCardComponent);
    fixture.componentRef.setInput('view', view); fixture.componentRef.setInput('triage', { ...openTriage, state: 'accepted' });
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    expect(buttons.find(button => button.textContent?.trim() === 'Accept')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent?.trim() === 'Dismiss')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent?.trim() === 'Reply')?.disabled).toBe(false);
  });
  it('keeps the reply draft until the reply succeeds', () => {
    TestBed.configureTestingModule({ imports: [ReviewFindingCardComponent] });
    const fixture = TestBed.createComponent(ReviewFindingCardComponent);
    fixture.componentRef.setInput('view', view); fixture.componentRef.setInput('triage', openTriage);
    const card = fixture.componentInstance;
    card.replyOpen.set(true); card.reply.set('draft');
    card.submitReply(new Event('submit'));
    fixture.componentRef.setInput('triage', { ...openTriage, error: 'GitHub rejected the reply.' });
    fixture.detectChanges();
    expect(card.reply()).toBe('draft');
    expect(card.replyOpen()).toBe(true);
    fixture.componentRef.setInput('triage', { ...openTriage, replied: true });
    fixture.detectChanges();
    expect(card.reply()).toBe('');
    expect(card.replyOpen()).toBe(false);
  });
});
