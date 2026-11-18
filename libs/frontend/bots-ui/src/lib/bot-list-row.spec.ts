import { TestBed } from '@angular/core/testing';
import type { BotRuntime, BotSummary } from '@ptah-extension/shared';
import { BotListRowComponent } from './bot-list-row.component';
import type { AvatarState } from './bot-avatar-cache';

const bot: BotSummary = {
  id: 'dba82954-3caf-407e-9ded-22479460aa94',
  revision: 1,
  name: 'Reviewer',
  description: 'Reviews changes',
  scope: { kind: 'user' },
  enabled: true,
  runtime: { kind: 'main', providerId: 'anthropic', model: 'sonnet' },
  archivedAt: null,
  updatedAt: 1,
};
const imageId = 'f12ba018-a5ed-44df-84ef-20afc64a99a1';
function setup(value: BotSummary = bot) {
  const fixture = TestBed.createComponent(BotListRowComponent);
  fixture.componentRef.setInput('bot', value);
  fixture.componentRef.setInput('lastEdit', 'Edited 2 hours ago');
  return fixture;
}

describe('BotListRowComponent', () => {
  it.each([
    [true, null, 'enabled', 'Enabled'],
    [false, null, 'disabled', 'Disabled'],
    [true, 123, 'archived', 'Archived'],
  ])(
    'shows identity, User badge and exact accessible status (%s, %s)',
    (enabled, archivedAt, state, label) => {
      const fixture = setup({ ...bot, enabled, archivedAt });
      fixture.componentRef.setInput('selected', true);
      fixture.detectChanges();
      const button: HTMLButtonElement =
        fixture.nativeElement.querySelector('button');
      expect(button.getAttribute('aria-label')).toBe(
        `Reviewer, ${state}, user scope, anthropic sonnet, Edited 2 hours ago`,
      );
      expect(button.getAttribute('aria-current')).toBe('true');
      expect(button.textContent).toContain('Reviewer');
      expect(
        fixture.nativeElement.querySelector('[ptahBadge]').textContent,
      ).toContain('User');
      expect(button.textContent).toContain(label);
      const selected = jest.fn();
      fixture.componentInstance.selectedBot.subscribe(selected);
      button.click();
      expect(selected).toHaveBeenCalledWith(bot.id);
    },
  );

  it.each<[BotRuntime, string]>([
    [{ kind: 'default' }, 'Default'],
    [{ kind: 'main', providerId: 'openai', model: 'gpt' }, 'openai gpt'],
    [
      { kind: 'lane', target: { kind: 'system', cli: 'codex' } },
      'System lane: codex',
    ],
    [
      {
        kind: 'lane',
        target: { kind: 'ptah-cli', ptahCliId: 'review' },
        modelTier: 'sonnet',
      },
      'ptah-cli: review sonnet',
    ],
  ])('labels runtime %j', (runtime, expected) => {
    const fixture = setup({ ...bot, runtime });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(expected);
  });

  it('renders a default Bot icon when unset and the chosen icon without changing identity', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lucide-icon')).toBeTruthy();
    const label = fixture.componentInstance.accessibleName();
    fixture.componentRef.setInput('bot', {
      ...bot,
      avatar: { kind: 'icon', name: 'shield' },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lucide-icon svg')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.componentInstance.accessibleName()).toBe(label);
  });

  it('requests each rendered image id once, shows data URL, and retries load errors', () => {
    const fixture = setup({ ...bot, avatar: { kind: 'image', imageId } });
    const needed = jest.fn();
    const retry = jest.fn();
    fixture.componentInstance.avatarNeeded.subscribe(needed);
    fixture.componentInstance.avatarRetry.subscribe(retry);
    fixture.detectChanges();
    expect(needed).toHaveBeenCalledWith(imageId);
    fixture.componentRef.setInput('avatar', {
      status: 'ready',
      dataUrl: 'data:image/png;base64,AAAA',
    });
    fixture.detectChanges();
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(image.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('lucide-icon')).toBeTruthy();
    fixture.nativeElement
      .querySelector('[aria-label="Retry avatar for Reviewer"]')
      .click();
    expect(retry).toHaveBeenCalledWith(imageId);
    fixture.componentRef.setInput('bot', {
      ...bot,
      avatar: { kind: 'image', imageId },
    });
    fixture.detectChanges();
    expect(needed).toHaveBeenCalledTimes(1);
  });

  it('shows a cached failure with a mapped message and rejects arbitrary image URLs', () => {
    const fixture = setup({ ...bot, avatar: { kind: 'image', imageId } });
    fixture.componentRef.setInput('avatar', {
      status: 'error',
      error: { code: 'BOT_NOT_FOUND', message: 'raw' },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'The avatar image is missing. Choose a replacement image.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('BOT_NOT_FOUND');
    expect(
      fixture.nativeElement.querySelector(
        '[aria-label="Retry avatar for Reviewer"]',
      ),
    ).toBeTruthy();
    fixture.componentRef.setInput('avatar', {
      status: 'ready',
      dataUrl: 'file:///private/image.png',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('lucide-icon')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      'The avatar image could not be displayed.',
    );
    const retry = jest.fn();
    fixture.componentInstance.avatarRetry.subscribe(retry);
    fixture.nativeElement
      .querySelector('[aria-label="Retry avatar for Reviewer"]')
      .click();
    expect(retry).toHaveBeenCalledWith(imageId);
  });

  it('renders unreadable records with version and diagnostics but no actions or avatar request', () => {
    const fixture = setup({ ...bot, avatar: { kind: 'image', imageId } });
    fixture.componentRef.setInput('unreadable', {
      id: bot.id,
      schemaVersion: 99,
      diagnostics: [
        {
          code: 'BOT_SCHEMA_UNSUPPORTED',
          message: 'Version 99 cannot be read.',
          severity: 'error',
        },
      ],
    });
    const needed = jest.fn();
    fixture.componentInstance.avatarNeeded.subscribe(needed);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Format version 99');
    expect(fixture.nativeElement.textContent).toContain(
      'This bot uses an unsupported format. Update Ptah.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'Version 99 cannot be read.',
    );
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(needed).not.toHaveBeenCalled();
  });

  it('uses neutral text for unknown unreadable diagnostics without wire messages or retry prompts', () => {
    const fixture = setup();
    fixture.componentRef.setInput('unreadable', {
      id: bot.id,
      diagnostics: [
        {
          code: 'FUTURE_CODE',
          message: 'Internal wire detail',
          severity: 'error',
        },
        {
          code: 'FUTURE_CODE',
          message: 'Second wire detail',
          severity: 'error',
        },
      ],
    });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text.match(/This bot could not be read\./g)).toHaveLength(2);
    expect(text).not.toContain('wire detail');
    expect(text).not.toContain('FUTURE_CODE');
    expect(text).not.toContain('Retry');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it.each(['', '   '])(
    'omits an empty lastEdit (%j) without trailing separators',
    (lastEdit) => {
      const fixture = setup();
      fixture.componentRef.setInput('lastEdit', lastEdit);
      fixture.detectChanges();
      expect(
        fixture.nativeElement
          .querySelector('button')
          .getAttribute('aria-label'),
      ).toBe('Reviewer, enabled, user scope, anthropic sonnet');
    },
  );

  it.each<AvatarState>([
    { status: 'loading' },
    { status: 'ready', dataUrl: 'data:image/png;base64,AAAA' },
    { status: 'error', error: { code: 'BOT_NOT_FOUND', message: 'raw' } },
  ])('does not request an avatar already cached as $status', (avatar) => {
    const fixture = setup({ ...bot, avatar: { kind: 'image', imageId } });
    fixture.componentRef.setInput('avatar', avatar);
    const needed = jest.fn();
    fixture.componentInstance.avatarNeeded.subscribe(needed);
    fixture.detectChanges();
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(needed).not.toHaveBeenCalled();
    // A later cache miss still receives its one request.
    fixture.componentRef.setInput('avatar', null);
    fixture.detectChanges();
    expect(needed).toHaveBeenCalledTimes(1);
    expect(needed).toHaveBeenCalledWith(imageId);
  });

  it('requests image B once after A and resets the image failure flag', () => {
    const secondId = 'e7aa0983-a4ea-4020-83cf-bfc45249d63a';
    const fixture = setup({ ...bot, avatar: { kind: 'image', imageId } });
    const needed = jest.fn();
    fixture.componentInstance.avatarNeeded.subscribe(needed);
    fixture.detectChanges();
    fixture.componentRef.setInput('avatar', {
      status: 'ready',
      dataUrl: 'data:image/png;base64,AAAA',
    });
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('img')
      .dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    fixture.componentRef.setInput('bot', {
      ...bot,
      avatar: { kind: 'image', imageId: secondId },
    });
    fixture.componentRef.setInput('avatar', null);
    fixture.detectChanges();
    expect(needed.mock.calls).toEqual([[imageId], [secondId]]);
    fixture.componentRef.setInput('avatar', {
      status: 'ready',
      dataUrl: 'data:image/webp;base64,BBBB',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'data:image/webp;base64,BBBB',
    );
    expect(
      fixture.nativeElement.querySelector(
        '[aria-label="Retry avatar for Reviewer"]',
      ),
    ).toBeNull();
    fixture.componentRef.setInput('avatar', null);
    fixture.detectChanges();
    expect(needed).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('bot', {
      ...bot,
      avatar: { kind: 'image', imageId },
    });
    fixture.detectChanges();
    expect(needed).toHaveBeenCalledTimes(2);
  });
});
