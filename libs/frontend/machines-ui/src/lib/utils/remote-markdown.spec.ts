import { Marked } from 'marked';
import { remoteMarkdown } from './remote-markdown';

/** Renders like the shared renderer: a fresh `marked` with its defaults. */
function render(markdown: string): string {
  return new Marked().parse(markdown, { async: false });
}

const IMAGE = '![i](https://evil.example/p.png)';

describe('remoteMarkdown', () => {
  it('turns raw HTML into text', () => {
    expect(
      remoteMarkdown('ok <img src=x onerror="a()"> <script>b()</script>'),
    ).toBe('ok &lt;img src=x onerror="a()"> &lt;script>b()&lt;/script>');
  });

  it('turns a markdown image into a link', () => {
    expect(remoteMarkdown('see ![pixel](https://evil.example/p.png)')).toBe(
      'see !\\[pixel](https://evil.example/p.png)',
    );
  });

  it('keeps code spans as written', () => {
    expect(remoteMarkdown('use `<div>` and ``a ` <b>`` then <i>')).toBe(
      'use `<div>` and ``a ` <b>`` then &lt;i>',
    );
  });

  it('keeps an unclosed backtick as text and escapes after it', () => {
    expect(remoteMarkdown('a ` <b>')).toBe('a ` &lt;b>');
  });

  it('keeps fenced code blocks as written', () => {
    const input = ['<p>', '```html', '<img src=x>', '```', '<p>'].join('\n');
    expect(remoteMarkdown(input)).toBe(
      ['&lt;p>', '```html', '<img src=x>', '```', '&lt;p>'].join('\n'),
    );
  });

  it('does not close a fence with a shorter or different fence', () => {
    const input = ['````', '```', '<b>', '~~~', '````', '<b>'].join('\n');
    expect(remoteMarkdown(input)).toBe(
      ['````', '```', '<b>', '~~~', '````', '&lt;b>'].join('\n'),
    );
  });

  describe('fences the renderer reads differently (PR #982 review)', () => {
    /** The renderer builds no image and no raw HTML from the result. */
    function expectInert(input: string): string {
      const html = render(remoteMarkdown(input));
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<b>');
      return html;
    }

    it('does not close a backtick fence on a line with a text suffix', () => {
      // `marked` keeps the block open past "```x"; the "```" closes it.
      const input = ['```', 'a', '```x', '~~~', '```', IMAGE].join('\n');
      expect(remoteMarkdown(input)).toBe(
        [
          '```',
          'a',
          '```x',
          '~~~',
          '```',
          '!\\[i](https://evil.example/p.png)',
        ].join('\n'),
      );
      expectInert(input);
    });

    it('closes a fence on a line with a mixed fence suffix, as marked does', () => {
      const input = ['```', 'a', '```~', IMAGE, '<b>'].join('\n');
      expect(remoteMarkdown(input)).toBe(
        [
          '```',
          'a',
          '```~',
          '!\\[i](https://evil.example/p.png)',
          '&lt;b>',
        ].join('\n'),
      );
      expectInert(input);
    });

    it('closes a fence on a longer fence followed by spaces', () => {
      const input = ['```', '<b>', '`````  ', IMAGE].join('\n');
      expect(remoteMarkdown(input).split('\n')).toEqual([
        '```',
        '<b>',
        '`````  ',
        '!\\[i](https://evil.example/p.png)',
      ]);
      expectInert(input);
    });

    it('does not close a fence on a tab after it, as marked does', () => {
      const input = ['```', 'a', '```\t', IMAGE, '```', '<b>'].join('\n');
      expect(remoteMarkdown(input).split('\n').at(-1)).toBe('&lt;b>');
      expectInert(input);
    });

    it('does not open a backtick fence whose info string has a backtick', () => {
      const input = ['```x`', IMAGE, '<b>'].join('\n');
      expect(remoteMarkdown(input)).toBe(
        ['```x`', '!\\[i](https://evil.example/p.png)', '&lt;b>'].join('\n'),
      );
      expectInert(input);
    });

    it('opens a tilde fence whose info string has a backtick', () => {
      const input = ['~~~x`', '<b>', '~~~', '<b>'].join('\n');
      expect(remoteMarkdown(input)).toBe(
        ['~~~x`', '<b>', '~~~', '&lt;b>'].join('\n'),
      );
      expectInert(input);
    });

    it('reads up to 3 spaces of indent as a fence and 4 as text', () => {
      expect(
        remoteMarkdown(['   ```', '<b>', '   ```', '<b>'].join('\n')),
      ).toBe(['   ```', '<b>', '   ```', '&lt;b>'].join('\n'));
      expectInert(['    ```', IMAGE, '<b>'].join('\n'));
      expect(
        remoteMarkdown(['para', '', '    ```', '<b>'].join('\n')),
      ).toContain('&lt;b>');
    });

    it('keeps an unclosed fence open to the end, as marked does', () => {
      const input = ['```', '<b>', IMAGE].join('\n');
      expect(remoteMarkdown(input)).toBe(input);
      expectInert(input);
    });

    it('reads a carriage return as a line end', () => {
      const input = ['```', 'a', '```\r', IMAGE].join('\n');
      expect(remoteMarkdown(input)).toContain('!\\[i]');
      expectInert(input);
    });

    it('escapes everything when a fence sits in a list item', () => {
      // The 3-space "```" closes the item's fence in marked, not opens one.
      expectInert(['1. ```', '   x', '   ```', IMAGE].join('\n'));
    });

    it('escapes everything when a code span spans two lines', () => {
      expectInert(['a `b', `c\` ${IMAGE} \`d\``].join('\n'));
    });

    it('escapes everything when a blockquote fence is closed outside it', () => {
      expectInert(['> ```', '> a', '```', IMAGE, '```', '<b>'].join('\n'));
    });
  });
});
