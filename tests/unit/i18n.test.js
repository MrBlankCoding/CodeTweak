import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTranslations, getMessageSync } from '../../src/shared/utils/i18n.js';

describe('internationalization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the newly selected custom language for synchronous messages', async () => {
    let language = 'fr';
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ settings: { language } })),
        },
      },
      i18n: {
        getUILanguage: () => 'en-US',
        getMessage: (key) => (key === 'settingsSaved' ? 'Settings saved successfully' : key),
      },
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          settingsSaved: { message: 'Paramètres enregistrés avec succès' },
        }),
      }))
    );

    await applyTranslations();
    expect(getMessageSync('settingsSaved')).toBe('Paramètres enregistrés avec succès');

    language = 'auto';
    await applyTranslations();
    expect(getMessageSync('settingsSaved')).toBe('Settings saved successfully');
  });
});
