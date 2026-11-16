import { cliLaneStatusWord } from './agent-status';

describe('cliLaneStatusWord', () => {
  it('presents a starting lane as running', () => {
    expect(cliLaneStatusWord('starting', 0)).toBe('running');
  });
});
