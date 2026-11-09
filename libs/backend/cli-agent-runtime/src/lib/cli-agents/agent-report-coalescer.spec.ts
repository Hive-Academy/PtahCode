import { AgentReportCoalescer, attachFinalReport, type HeldReport } from './agent-report-coalescer';

function report(message: string): HeldReport {
  return { message, envelopeBody: `<agent-report>${message}</agent-report>`,
    heldAt: Date.now(), deliverStandalone: jest.fn().mockResolvedValue(undefined),
    markEnqueued: jest.fn() };
}

describe('AgentReportCoalescer', () => {
  afterEach(() => jest.useRealTimers());

  it('gives completion sole ownership and expiry cannot wake again', async () => {
    jest.useFakeTimers();
    const coalescer = new AgentReportCoalescer();
    const expire = jest.fn();
    const held = report('done');
    coalescer.hold('a', held, expire);
    expect(coalescer.take('a')).toBe(held);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(expire).not.toHaveBeenCalled();
  });

  it('expires a report and leaves no slot for completion', async () => {
    jest.useFakeTimers();
    const coalescer = new AgentReportCoalescer();
    const expire = jest.fn();
    coalescer.hold('a', report('done'), expire);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(coalescer.take('a')).toBeUndefined();
  });

  it('flushes held reports on dispose', () => {
    const coalescer = new AgentReportCoalescer();
    const expire = jest.fn();
    coalescer.hold('a', report('one'), expire);
    coalescer.hold('b', report('two'), expire);
    coalescer.dispose();
    expect(expire).toHaveBeenCalledTimes(2);
    expect(coalescer.take('a')).toBeUndefined();
  });

  it('embeds inside one completion body', () => {
    expect(attachFinalReport('</agent-lane-completed>', '<agent-report>Done</agent-report>'))
      .toContain('Closing report:\n<agent-report>Done</agent-report>');
  });
});
