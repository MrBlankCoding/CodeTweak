import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyTranslations: vi.fn(),
  getMessageSync: vi.fn(),
  showNotification: vi.fn(),
}));

vi.mock('../../src/shared/utils/i18n.js', () => ({
  applyTranslations: mocks.applyTranslations,
  getMessageSync: mocks.getMessageSync,
}));

vi.mock('../../src/dashboard/dashboard-ui.js', () => ({
  updateWebsiteFilterOptions: vi.fn(),
  updateScriptsList: vi.fn(),
  showNotification: mocks.showNotification,
}));

import { saveSettings } from '../../src/dashboard/dashboard-logic.js';

describe('dashboard settings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.chrome;
    delete global.applyTheme;
  });

  it('shows the save confirmation using the selected language', async () => {
    const stored = {};
    global.chrome = {
      storage: { local: { set: vi.fn(async (value) => Object.assign(stored, value)) } },
      runtime: { sendMessage: vi.fn() },
    };
    global.applyTheme = vi.fn();
    mocks.applyTranslations.mockResolvedValue(undefined);
    mocks.getMessageSync.mockReturnValue('Paramètres enregistrés avec succès');

    await saveSettings({
      languageSelector: { tagName: 'SELECT', value: 'fr' },
      showNotifications: { type: 'checkbox', checked: false },
      accentColor: { type: 'color', value: '#61afef' },
    });

    expect(stored.settings).toEqual({
      language: 'fr',
      showNotifications: false,
      accentColor: '#61afef',
    });
    expect(mocks.applyTranslations).toHaveBeenCalledOnce();
    expect(mocks.showNotification).toHaveBeenCalledWith(
      'Paramètres enregistrés avec succès',
      'success'
    );
    expect(mocks.applyTranslations.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.showNotification.mock.invocationCallOrder[0]
    );
  });
});
