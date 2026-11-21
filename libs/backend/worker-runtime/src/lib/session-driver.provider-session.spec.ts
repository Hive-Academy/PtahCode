import { InProcessRpc } from './in-process-rpc';
import { SessionDriver } from './session-driver';
import { SessionLogWriter } from './session-log-writer';
import { Transcript } from './transcript';

/**
 * Remote workers drive provider sessions like Codex ones (P6, B-1): attach
 * reads them as native, and `continue` refuses them before chat:continue with
 * PROVIDER_SESSION_UNAVAILABLE. The Codex cases stay in session-driver.spec.ts.
 */
function setup(metadata: object | null) {
  const handleMessage = jest
    .fn()
    .mockResolvedValue({ success: true, data: { success: true } });
  const attach = jest
    .fn()
    .mockResolvedValue({ mode: 'snapshot', events: [], live: false });
  const transcript = {
    attach,
    baseline: jest.fn().mockResolvedValue(undefined),
  } as unknown as Transcript;
  const reader = { get: jest.fn().mockResolvedValue(metadata) };
  const driver = new SessionDriver(
    new InProcessRpc({ handleMessage }, jest.fn()),
    transcript,
    reader,
    () => ({ enqueue: jest.fn() }) as unknown as SessionLogWriter,
    () => true,
    1,
  );
  return { driver, handleMessage, attach };
}

const providerSession = {
  providerSessionExecution: { runtime: 'provider-session' },
};

it('attaches a provider session as native', async () => {
  const { driver, attach } = setup(providerSession);
  await driver.attach('s1', null, null);
  expect(attach).toHaveBeenCalledWith('s1', null, null, undefined, false, true);
});

it('refuses a provider-session continue before chat:continue', async () => {
  const { driver, handleMessage } = setup(providerSession);
  await expect(driver.continue('s1', 'tab', 'hello')).rejects.toMatchObject({
    code: 'PROVIDER_SESSION_UNAVAILABLE',
  });
  expect(handleMessage).not.toHaveBeenCalled();
});

it('keeps the Codex refusal code when a row carries a Codex binding', async () => {
  const { driver } = setup({ codexExecution: { runtime: 'codex-app-server' } });
  await expect(driver.continue('s1', 'tab', 'hello')).rejects.toMatchObject({
    code: 'CODEX_UNAVAILABLE',
  });
});

it('treats an unknown runtime value as a Claude session', async () => {
  const { driver, handleMessage, attach } = setup({
    providerSessionExecution: { runtime: 'claude-sdk' },
  });
  await driver.attach('s1', null, null);
  expect(attach).toHaveBeenCalledWith('s1', null, null, undefined, false, false);
  await driver.continue('s1', 'tab', 'hello');
  expect(handleMessage).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'chat:continue' }),
  );
});
