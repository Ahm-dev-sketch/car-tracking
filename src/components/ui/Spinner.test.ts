import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner HTML nesting', () => {
  it.each(['sm', 'md', 'lg'] as const)('renders phrasing content inside a paragraph for size %s', (size) => {
    const markup = renderToStaticMarkup(createElement(
      'p',
      { role: 'status', 'aria-live': 'polite' },
      createElement(Spinner, { size }),
      'Getting GPS…',
    ));

    expect(markup).toMatch(/^<p[^>]*><span\b/);
    expect(markup).not.toMatch(/<div\b/);
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain('Getting GPS…</p>');
  });

  it('also renders valid inline content inside a loading button', () => {
    const markup = renderToStaticMarkup(createElement(
      'button',
      { type: 'button', disabled: true },
      createElement(Spinner, { className: 'text-white' }),
      'Starting trip…',
    ));

    expect(markup).toMatch(/^<button[^>]*><span\b/);
    expect(markup).not.toMatch(/<div\b/);
    expect(markup).toContain('text-white');
  });
});
