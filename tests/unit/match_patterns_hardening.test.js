import { describe, expect, it, vi } from 'vitest';

import {
  normalizeMatchPattern,
  isValidMatchPattern,
  urlMatchesPattern,
} from '../../src/shared/utils/urls.js';

describe('match pattern hardening', () => {
  it('normalizes every wildcard-scheme variant to "*://"', () => {
    const raws = [
      'http*://example.com/*',
      'https*://example.com/*',
      'HTTP*://example.com/*',
      '  http*://example.com/*  ',
      '*http://example.com/*',
      'ht*p://example.com/*',
      'h**p://example.com/*',
    ];
    for (const raw of raws) {
      const normalized = normalizeMatchPattern(raw);
      expect(isValidMatchPattern(normalized)).toBe(true);
      expect(normalized.startsWith('*://')).toBe(true);
    }
  });

  it('never produces a scheme Chrome rejects', () => {
    const raws = [
      'http*://www.skribbl.io/*',
      'http*://skribbl.io/*',
      'chrome://settings/*',
      'about:blank',
      'file:///etc/passwd',
      'data:text/plain,hi',
      'javascript:alert(1)',
      'http://',
      'https://',
      '*://',
      '://example.com/*',
      '',
      '   ',
      null,
      undefined,
      42,
      {},
      ['https://example.com/*'],
      '<all_urls>',
      'example.com',
      'example.com/path?q=1',
      '*://*/*',
      'HTTPS://EXAMPLE.COM',
      'http://example.com:8080/*',
      '*.example.com/*',
    ];
    for (const raw of raws) {
      const normalized = normalizeMatchPattern(raw);
      if (raw === '<all_urls>') {
        expect(normalized).toBe('<all_urls>');
        continue;
      }
      if (typeof raw !== 'string' || !raw.trim()) continue;
      if (isValidMatchPattern(normalized)) {
        const scheme = normalized.slice(0, normalized.indexOf('://'));
        expect(['*', 'http', 'https', 'file', 'ftp']).toContain(scheme);
      }
    }
    expect(isValidMatchPattern(normalizeMatchPattern('chrome://x/*'))).toBe(false);
    expect(isValidMatchPattern(normalizeMatchPattern('http://'))).toBe(false);
  });

  it('matches subdomains only where intended', () => {
    expect(urlMatchesPattern('https://sub.example.com/', 'https://example.com/*')).toBe(true);
    expect(urlMatchesPattern('https://evilexample.com/', 'https://example.com/*')).toBe(false);
    expect(urlMatchesPattern('https://example.com.evil.com/', 'https://example.com/*')).toBe(false);
    expect(urlMatchesPattern('https://a.b.example.com/', 'https://*.example.com/*')).toBe(true);
  });

  it('handles dotted path segments literally', () => {
    expect(urlMatchesPattern('https://example.com/file.html', 'https://example.com/*.html')).toBe(
      true
    );
    expect(urlMatchesPattern('https://example.com/filexhtml', 'https://example.com/*.html')).toBe(
      false
    );
    expect(urlMatchesPattern('https://example.com/a.b/c', 'https://example.com/a.b/*')).toBe(true);
    expect(urlMatchesPattern('https://example.com/axb/c', 'https://example.com/a.b/*')).toBe(false);
  });

  it('never throws on hostile input', () => {
    const hostile = [
      'https://example.com/((((((((((((((',
      'https://example.com/' + 'a'.repeat(5000),
      'https://example.com/\0\0\0',
      'https://example.com/\u202E',
      'not a url at all ((((',
      '*://*/' + '*'.repeat(100),
      'https://[::1]/x',
      'https://user:pass@example.com/x',
    ];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const h of hostile) {
      expect(() => urlMatchesPattern(h, 'https://example.com/*')).not.toThrow();
      expect(() => urlMatchesPattern('https://example.com/', h)).not.toThrow();
      expect(() => normalizeMatchPattern(h)).not.toThrow();
      expect(() => isValidMatchPattern(h)).not.toThrow();
    }
    warnSpy.mockRestore();
  });

  it('normalizes idempotently', () => {
    const patterns = [
      'http*://example.com/*',
      'example.com',
      'https://example.com',
      '*://*.example.com/*',
      'http://example.com:8080/path',
    ];
    for (const p of patterns) {
      const once = normalizeMatchPattern(p);
      expect(normalizeMatchPattern(once)).toBe(once);
    }
  });
});
