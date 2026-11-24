import 'reflect-metadata';
import type { SDKUserMessage } from '@ptah-extension/agent-sdk';
import { createPromptMailbox } from './ptah-cli-prompt-mailbox';

function content(msg: SDKUserMessage): string {
  return msg.message.content as string;
}

describe('createPromptMailbox', () => {
  it('yields the initial task as a real SDKUserMessage', async () => {
    const mailbox = createPromptMailbox('do the thing');
    const first = await mailbox.prompt.next();

    expect(first.done).toBe(false);
    expect(first.value.type).toBe('user');
    expect(first.value.parent_tool_use_id).toBeNull();
    expect(first.value.message.role).toBe('user');
    expect(content(first.value)).toBe('do the thing');
    expect('session_id' in first.value).toBe(false);
  });

  it('yields pushed messages after the initial task', async () => {
    const mailbox = createPromptMailbox('task');
    await mailbox.prompt.next();

    mailbox.push({ content: 'follow-up' });
    const second = await mailbox.prompt.next();

    expect(second.done).toBe(false);
    expect(content(second.value)).toBe('follow-up');
  });

  it('carries content blocks, the given uuid and the session id', async () => {
    const mailbox = createPromptMailbox('task');
    await mailbox.prompt.next();
    const blocks = [
      { type: 'text' as const, text: 'look' },
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'AAAA' },
      },
    ];

    mailbox.push({ content: blocks, uuid: 'steer-uuid' }, 'session-1');
    const next = await mailbox.prompt.next();

    expect(next.value.message.content).toEqual(blocks);
    expect(next.value.uuid).toBe('steer-uuid');
    expect(next.value.session_id).toBe('session-1');
  });

  it('generates a uuid when none is given', async () => {
    const mailbox = createPromptMailbox('task');
    const first = await mailbox.prompt.next();
    expect(typeof first.value.uuid).toBe('string');
    expect(first.value.uuid.length).toBeGreaterThan(0);
  });

  it('blocks waiting for the next message until one is pushed', async () => {
    const mailbox = createPromptMailbox('task');
    await mailbox.prompt.next();

    let resolved = false;
    const pending = mailbox.prompt.next().then((r) => {
      resolved = true;
      return r;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    mailbox.push({ content: 'later' });
    const result = await pending;
    expect(content(result.value)).toBe('later');
  });

  it('completes the generator on close', async () => {
    const mailbox = createPromptMailbox('task');
    await mailbox.prompt.next();

    const pending = mailbox.prompt.next();
    mailbox.close();
    const result = await pending;

    expect(result.done).toBe(true);
  });

  it('ignores pushes after close', async () => {
    const mailbox = createPromptMailbox('task');
    await mailbox.prompt.next();
    mailbox.close();
    mailbox.push({ content: 'dropped' });

    const result = await mailbox.prompt.next();
    expect(result.done).toBe(true);
  });

  it('aborting a wired controller closes the mailbox and terminates the generator', async () => {
    const mailbox = createPromptMailbox('task');
    const abortController = new AbortController();
    abortController.signal.addEventListener('abort', () => mailbox.close());

    await mailbox.prompt.next();

    const pending = mailbox.prompt.next();
    abortController.abort();
    const result = await pending;

    expect(result.done).toBe(true);

    const after = await mailbox.prompt.next();
    expect(after.done).toBe(true);
  });

  it('drives an async consumer loop to clean termination on abort', async () => {
    const mailbox = createPromptMailbox('task');
    const abortController = new AbortController();
    abortController.signal.addEventListener('abort', () => mailbox.close());

    const seen: string[] = [];
    const run = (async () => {
      for await (const msg of mailbox.prompt) {
        seen.push(msg.message.content as string);
      }
      return 'done';
    })();

    await Promise.resolve();
    abortController.abort();

    await expect(run).resolves.toBe('done');
    expect(seen).toEqual(['task']);
  });
});
