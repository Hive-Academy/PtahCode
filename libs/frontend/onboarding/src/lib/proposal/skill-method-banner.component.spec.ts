import { TestBed } from '@angular/core/testing';
import type {
  SkillJudgeResult,
  SkillJudgeStageRecord,
} from '@ptah-extension/shared';
import { SkillMethodBannerComponent } from './skill-method-banner.component';

const noStages: SkillJudgeStageRecord[] = [];

function setup(
  method: SkillJudgeResult['method'],
  counts: SkillJudgeResult['counts'],
  stages: readonly SkillJudgeStageRecord[] = noStages,
) {
  const fixture = TestBed.createComponent(SkillMethodBannerComponent);
  fixture.componentRef.setInput('method', method);
  fixture.componentRef.setInput('counts', counts);
  fixture.componentRef.setInput('stages', stages);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('SkillMethodBannerComponent', () => {
  it('renders decision, normal, mixed+notJudged and AI-unavailable one-line summaries', () => {
    const { root: decisionRoot } = setup('decision', {
      decision: 8,
      normal: 0,
      notJudged: 0,
    });
    expect(decisionRoot.textContent).toContain(
      'Judged by AI (decision model)',
    );
    expect(decisionRoot.textContent).not.toContain('not judged');

    const { root: normalRoot } = setup('normal', {
      decision: 0,
      normal: 8,
      notJudged: 0,
    });
    expect(normalRoot.textContent).toContain('Judged by AI (normal model)');

    const { root: mixedRoot } = setup('mixed', {
      decision: 5,
      normal: 3,
      notJudged: 2,
    });
    expect(mixedRoot.textContent).toContain(
      'Judged by AI — 5 by decision, 3 by normal, 2 not judged',
    );

    const { root: partialRoot } = setup('decision', {
      decision: 7,
      normal: 0,
      notJudged: 1,
    });
    expect(partialRoot.textContent).toContain(
      'Judged by AI (decision model), 1 not judged',
    );

    const { root: noneRoot } = setup('none', {
      decision: 0,
      normal: 0,
      notJudged: 4,
    });
    expect(noneRoot.textContent).toContain(
      'AI review is unavailable — showing registry order (4 not judged)',
    );
  });

  it('hides the disclosure control when no stage records exist', () => {
    const { root } = setup('decision', {
      decision: 8,
      normal: 0,
      notJudged: 0,
    });
    expect(root.querySelector('button')).toBeNull();
  });

  it('collapses details by default and expands or collapses them behind the disclosure button', () => {
    const stage: SkillJudgeStageRecord = {
      stage: 'normal',
      status: 'failed',
      category: 'provider-error',
      pairAttempted: { provider: 'OpenAI', model: 'gpt-4.1' },
      itemsJudged: 0,
      invalidItemIds: [],
    };
    const { fixture, root } = setup('normal', {
      decision: 0,
      normal: 8,
      notJudged: 0,
    }, [stage]);
    const button = root.querySelector('button');
    const details = root.querySelector('ul');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(button?.getAttribute('aria-controls')).toBe(details?.id);
    expect(details?.hasAttribute('hidden')).toBe(true);
    expect(details?.classList.contains('flex')).toBe(false);
    expect(root.textContent).toContain('Details');

    button?.click();
    fixture.detectChanges();
    expect(root.querySelector('button')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(root.querySelector('ul')?.hasAttribute('hidden')).toBe(false);
    expect(details?.classList.contains('flex')).toBe(true);
    expect(root.textContent).toContain('Hide details');

    root.querySelector('button')?.click();
    fixture.detectChanges();
    expect(root.querySelector('button')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(root.querySelector('ul')?.hasAttribute('hidden')).toBe(true);
  });

  it('sources stage status, category and pair text only from stage records', () => {
    const stages: SkillJudgeStageRecord[] = [
      {
        stage: 'decision',
        status: 'used',
        pairUsed: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
        itemsJudged: 6,
        invalidItemIds: [],
      },
      {
        stage: 'normal',
        status: 'failed',
        category: 'provider-error',
        pairAttempted: { provider: 'OpenAI', model: 'gpt-4.1' },
        itemsJudged: 0,
        invalidItemIds: ['lib:nx'],
      },
      {
        stage: 'normal',
        status: 'skipped',
        pairConfigured: { provider: 'Anthropic', model: 'claude-haiku-4-5' },
        itemsJudged: 0,
        invalidItemIds: [],
      },
    ];
    const { root, fixture } = setup(
      'mixed',
      { decision: 6, normal: 0, notJudged: 1 },
      stages,
    );
    (root.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const rows = Array.from(root.querySelectorAll('ul > li'));
    expect(rows.length).toBe(3);

    expect(rows[0]?.textContent).toContain('used');
    expect(rows[0]?.textContent).toContain('Decision stage');
    expect(rows[0]?.textContent).toContain(
      'used Anthropic / claude-sonnet-4-5',
    );
    expect(rows[0]?.textContent).toContain('6 items judged');

    expect(rows[1]?.textContent).toContain('failed');
    expect(rows[1]?.textContent).toContain('Normal stage');
    expect(rows[1]?.textContent).toContain('provider error');
    expect(rows[1]?.textContent).toContain('attempted OpenAI / gpt-4.1');

    expect(rows[2]?.textContent).toContain('skipped');
    expect(rows[2]?.textContent).toContain(
      'configured Anthropic / claude-haiku-4-5',
    );
    expect(rows[2]?.textContent).not.toContain('attempted');
  });

  it('labels a failed stage with only pairConfigured as configured, not attempted', () => {
    const stage: SkillJudgeStageRecord = {
      stage: 'decision',
      status: 'failed',
      category: 'pre-dispatch-error',
      pairConfigured: { provider: 'OpenAI', model: 'gpt-4.1-mini' },
      itemsJudged: 0,
      invalidItemIds: [],
    };
    const { root, fixture } = setup(
      'none',
      { decision: 0, normal: 0, notJudged: 2 },
      [stage],
    );
    (root.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const row = root.querySelector('ul > li');
    expect(row?.textContent).toContain('pre-dispatch error');
    expect(row?.textContent).toContain('configured OpenAI / gpt-4.1-mini');
    expect(row?.textContent).not.toContain('attempted');
  });

  it('omits the pair when a failed stage record carries no pair', () => {
    const stage: SkillJudgeStageRecord = {
      stage: 'decision',
      status: 'failed',
      category: 'not-configured',
      itemsJudged: 0,
      invalidItemIds: [],
    };
    const { root, fixture } = setup(
      'none',
      { decision: 0, normal: 0, notJudged: 3 },
      [stage],
    );
    (root.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const row = root.querySelector('ul > li');
    expect(row?.textContent).toContain('not configured');
    expect(row?.textContent).not.toContain('attempted');
    expect(row?.textContent).not.toContain('used');
  });

  it('gives each rendering a unique details id referenced by aria-controls', () => {
    const stage: SkillJudgeStageRecord = {
      stage: 'normal',
      status: 'used',
      pairUsed: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      itemsJudged: 8,
      invalidItemIds: [],
    };
    const first = setup('normal', { decision: 0, normal: 8, notJudged: 0 }, [
      stage,
    ]);
    const second = setup('normal', { decision: 0, normal: 8, notJudged: 0 }, [
      stage,
    ]);
    const firstId = first.root.querySelector('ul')?.id;
    const secondId = second.root.querySelector('ul')?.id;
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(
      first.root.querySelector('button')?.getAttribute('aria-controls'),
    ).toBe(firstId);
    expect(
      second.root.querySelector('button')?.getAttribute('aria-controls'),
    ).toBe(secondId);
  });
});
