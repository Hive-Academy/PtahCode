import { SpawnStepTiming } from './spawn-step-timing';

describe('SpawnStepTiming', () => {
  it('rounds reached steps and leaves unreached steps null', () => {
    const clock = jest.spyOn(performance, 'now');
    clock.mockReturnValueOnce(10).mockReturnValueOnce(11.6).mockReturnValueOnce(14.2);
    try {
      const timing = new SpawnStepTiming();
      timing.mark('detectionMs');
      expect(timing.result()).toMatchObject({
        detectionMs: 2,
        validationMs: null,
        runSdkMs: null,
        totalMs: 4,
      });
    } finally {
      clock.mockRestore();
    }
  });
});
