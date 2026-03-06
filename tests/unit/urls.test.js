import { describe, expect, it, vi } from 'vitest';
import {
  formatRunAt,
  formatUrlPattern,
  generateUrlMatchPattern,
  getScriptDescription,
  isValidWebpage,
  normalizeMatchPattern,
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
    expect(urlMatchesPattern('https://example.com/a', 'invalid-pattern')).toBe(false);
    expect(urlMatchesPattern('https://example.com/path', 'https://example.com/*')).toBe(true);
    expect(urlMatchesPattern('https://example.com/path/to/sub', 'https://example.com/**')).toBe(
      true
    );
    expect(urlMatchesPattern('https://example.com/a/b/c', 'https://example.com/*/b/*')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a/b/c', 'https://example.com/a/*/c')).toBe(true);
    expect(urlMatchesPattern('https://example.com/a/b/c', 'https://example.com/a/b')).toBe(false);
    expect(urlMatchesPattern('http://test.com', 'https://test.com')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('normalizeMatchPattern handles various cases', () => {
    expect(normalizeMatchPattern('google.com')).toBe('*://google.com/*');
    expect(normalizeMatchPattern('http://google.com')).toBe('http://google.com/*');
    expect(normalizeMatchPattern('https://google.com/path')).toBe('https://google.com/path');
    expect(normalizeMatchPattern('<all_urls>')).toBe('<all_urls>');
    expect(normalizeMatchPattern(null)).toBeNull();
  });

  it('handles edge cases in generateUrlMatchPattern', () => {
    expect(generateUrlMatchPattern('https://example.com', 'unknown')).toBe('https://example.com/*');
    expect(generateUrlMatchPattern('')).toBeNull();
  });

  it('formats runAt/url pattern and validates webpages', () => {
    expect(formatRunAt('document_start')).toBe('Start');
    expect(formatRunAt('document_end')).toBe('DOM');
    expect(formatRunAt('document_idle')).toBe('Load');
    expect(formatRunAt('custom')).toBe('custom');
    expect(formatRunAt('')).toBe('Load');

    expect(formatUrlPattern('https://*.very-long-domain-name-example.com/*')).toContain('...');
    expect(formatUrlPattern('https://small.com/*')).toBe('small.com');
    expect(formatUrlPattern('')).toBe('All sites');

    expect(isValidWebpage('https://example.com')).toBe(true);
    expect(isValidWebpage('http://example.com')).toBe(true);
    expect(isValidWebpage('chrome://settings')).toBe(false);
    expect(isValidWebpage('chrome-extension://abc/page.html')).toBe(false);
    expect(isValidWebpage('about:blank')).toBe(false);
    expect(isValidWebpage(null)).toBe(false);
  });

  it('builds script description from features', () => {
    expect(getScriptDescription({})).toBe('Basic');
    expect(getScriptDescription({ gmSetValue: true })).toBe('1 GM API');
    expect(getScriptDescription({ resources: [{}] })).toBe('1 Resource');
    expect(getScriptDescription({ requiredScripts: [{}] })).toBe('1 Lib');
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
