import { logRebuildTiming } from './rebuild-timing';

describe('logRebuildTiming', () => {
  it('reports separate slow phases without content or paths', () => {
    const info = jest.fn();
    const debug = jest.fn();
    const logger = { info, debug, warn: jest.fn() };
    logRebuildTiming(logger, {
      trigger: 'writer', enumerateMs: 20.4, readMs: 100.2, parseValidateMs: 80.2,
      sqliteReplaceMs: 100.3, listenerMs: 0, waitedMs: 0,
      totalMs: 300.9, carriers: 50, rows: 48, coalesced: 1, failed: false,
    });
    expect(info).toHaveBeenCalledWith('[task-specs] index rebuild timing', {
      trigger: 'writer', enumerateMs: 20, readMs: 100, parseValidateMs: 80,
      sqliteReplaceMs: 100, listenerMs: 0, waitedMs: 0,
      totalMs: 301, carriers: 50, rows: 48, coalesced: 1, failed: false,
    });
    expect(debug).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/task\.md|specs\/|body/);
  });

  it('uses WARN for a two second rebuild and includes queued time and failure', () => {
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    logRebuildTiming(logger, {
      trigger: 'watcher', enumerateMs: 10, readMs: 900, parseValidateMs: 20,
      sqliteReplaceMs: 500, listenerMs: 100, waitedMs: 470,
      totalMs: 2470, carriers: 3, rows: 2, coalesced: 4, failed: true,
    });
    expect(logger.warn).toHaveBeenCalledWith('[task-specs] index rebuild timing', {
      trigger: 'watcher', enumerateMs: 10, readMs: 900, parseValidateMs: 20,
      sqliteReplaceMs: 500, listenerMs: 100, waitedMs: 470,
      totalMs: 2470, carriers: 3, rows: 2, coalesced: 4, failed: true,
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('chooses the log level from run time without queued wait', () => {
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    logRebuildTiming(logger, {
      trigger: 'writer', enumerateMs: 10, readMs: 20, parseValidateMs: 5,
      sqliteReplaceMs: 10, listenerMs: 0, waitedMs: 3000,
      totalMs: 3100, carriers: 1, rows: 1, coalesced: 2, failed: false,
    });
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
