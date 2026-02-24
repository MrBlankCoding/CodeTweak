import { describe, expect, it, vi } from 'vitest';
import {
  formatRunAt,
  formatUrlPattern,
  generateUrlMatchPattern,
  getScriptDescription,
  isValidWebpage,
  urlMatchesPattern,
} from '../../src/utils/urls.js';

describe('urls utilities', () => {
  it('matches urls with exact/wildcard/path patterns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(urlMatchesPattern('https://example.com/a', 'https://example.com/a')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a', '*://*/*')).toBe(true);
    expect(urlMatchesPattern('https://sub.example.com/a', 'https://*.example.com/*')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a/b/c', 'https://example.com/**')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a/b', 'https://example.com/*/b')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a', 'https://other.com/*')).toBe(false);
    expect(urlMatchesPattern('not-a-url', 'https://example.com/*')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('generates match patterns for scopes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(generateUrlMatchPattern('example.com', 'domain')).toBe('https://example.com/*');
    expect(generateUrlMatchPattern('https://app.example.com', 'subdomain')).toBe('https://*.example.com/*');
    expect(generateUrlMatchPattern('https://example.com', 'exact')).toBe('https://example.com');
    expect(generateUrlMatchPattern('::::')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('formats runAt/url pattern and validates webpages', () => {
    expect(formatRunAt('document_start')).toBe('Start');
    expect(formatRunAt('custom')).toBe('custom');
    expect(formatRunAt('')).toBe('Load');

    expect(formatUrlPattern('https://*.very-long-domain-name-example.com/*')).toContain('...');
    expect(formatUrlPattern('')).toBe('All sites');

    expect(isValidWebpage('https://example.com')).toBe(true);
    expect(isValidWebpage('chrome://settings')).toBe(false);
    expect(isValidWebpage('chrome-extension://abc/page.html')).toBe(false);
    expect(isValidWebpage('about:blank')).toBe(false);
  });

  it('builds script description from features', () => {
    expect(getScriptDescription({})).toBe('Basic');
    expect(
      getScriptDescription({
        css: 'body {}',
        js: 'console.log(1)',
        gmSetValue: true,
        gmGetValue: true,
        resources: [{}, {}],
        requiredScripts: [{}],
      })
    ).toBe('CSS • JS • 2 GM APIs • 2 Resources • 1 Lib');
  });
});
