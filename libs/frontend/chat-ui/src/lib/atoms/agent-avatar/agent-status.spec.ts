import { cliLaneStatusWord } from './agent-status';

describe('cliLaneStatusWord', () => {
  it('presents a starting lane distinctly', () => {
    expect(cliLaneStatusWord('starting', 0)).toBe('starting');
  });
});
