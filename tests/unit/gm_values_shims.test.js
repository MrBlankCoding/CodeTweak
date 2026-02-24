import { describe, expect, it, vi } from 'vitest';

describe('legacy GM value shims', () => {
  it('supports set/get/list/delete via localStorage-backed shims', async () => {
    vi.resetModules();

    const store = {};
    const localStorageMock = {};
    Object.defineProperties(localStorageMock, {
      setItem: {
        enumerable: false,
        value: (k, v) => {
          const value = String(v);
          store[k] = value;
          localStorageMock[k] = value;
        },
      },
      getItem: {
        enumerable: false,
        value: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      },
      removeItem: {
        enumerable: false,
        value: (k) => {
          delete store[k];
          delete localStorageMock[k];
        },
      },
      clear: {
        enumerable: false,
        value: () => {
          Object.keys(store).forEach((k) => {
            delete store[k];
            delete localStorageMock[k];
          });
        },
      },
    });
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });

    delete window.GM_setValue;
    delete window.GM_getValue;
    delete window.GM_listValues;
    delete window.GM_deleteValue;

    await import('../../src/GM/Values/GM_setValue.js');
    await import('../../src/GM/Values/GM_getValue.js');
    await import('../../src/GM/Values/GM_listValues.js');
    await import('../../src/GM/Values/GM_deleteValue.js');

    window.GM_setValue('k1', { a: 1 });
    window.GM_setValue('k2', 'v2');

    expect(window.GM_getValue('k1', null)).toEqual({ a: 1 });
    expect(window.GM_getValue('missing', 'fallback')).toBe('fallback');
    expect(window.GM_listValues().sort()).toEqual(['k1', 'k2']);

    window.GM_deleteValue('k1');
    expect(window.GM_getValue('k1', null)).toBeNull();
  });

  it('handles localStorage exceptions in all shims', async () => {
    vi.resetModules();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const localStorageMock = {
      setItem: vi.fn(() => {
        throw new Error('set fail');
      }),
      getItem: vi.fn(() => {
        throw new Error('get fail');
      }),
      removeItem: vi.fn(() => {
        throw new Error('remove fail');
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });

    delete window.GM_setValue;
    delete window.GM_getValue;
    delete window.GM_listValues;
    delete window.GM_deleteValue;

    await import('../../src/GM/Values/GM_setValue.js');
    await import('../../src/GM/Values/GM_getValue.js');
    await import('../../src/GM/Values/GM_listValues.js');
    await import('../../src/GM/Values/GM_deleteValue.js');

    expect(() => window.GM_setValue('k', 1)).not.toThrow();
    expect(window.GM_getValue('k', 'fallback')).toBe('fallback');
    expect(window.GM_listValues()).toEqual([]);
    expect(() => window.GM_deleteValue('k')).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
  });

  it('covers GM_listValues catch branch when localStorage is invalid', async () => {
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.defineProperty(window, 'localStorage', {
      value: null,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: null,
      configurable: true,
      writable: true,
    });

    delete window.GM_listValues;
    await import('../../src/GM/Values/GM_listValues.js');
    expect(window.GM_listValues()).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });
});
