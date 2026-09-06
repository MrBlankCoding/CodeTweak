import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('feather-icons', () => ({ default: { replace: vi.fn() } }));

import { filterScripts, toggleScript, deleteScript } from '../../src/dashboard/dashboard-logic.js';

function chromeMock(storageData) {
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: storageData[key] })),
        set: vi.fn(async (obj) => Object.assign(storageData, obj)),
      },
    },
    runtime: { sendMessage: vi.fn(async () => ({})), getURL: (p) => `chrome-extension://id/${p}` },
  };
  return storageData;
}

function filterElements() {
  document.body.innerHTML = `<div id="scriptsList"></div>`;
  return {
    scriptsList: document.getElementById('scriptsList'),
    emptyState: null,
    filters: {},
  };
}

describe('dashboard-logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    global.confirm = vi.fn(() => true);
  });

  it('filters by search term', () => {
    const elements = filterElements();
    const state = {
      allScripts: [
        { id: '1', name: 'Ad Blocker', targetUrls: [], enabled: true },
        { id: '2', name: 'Dark Mode', targetUrls: [], enabled: true },
      ],
    };
    elements.filters = { scriptSearch: { value: 'dark' } };
    filterScripts(elements, state);
    expect(elements.scriptsList.children).toHaveLength(1);
    expect(elements.scriptsList.textContent).toContain('Dark Mode');
  });

  it('filters by status and runAt', () => {
    const elements = filterElements();
    const state = {
      allScripts: [
        { id: '1', name: 'A', enabled: true, runAt: 'document_start', targetUrls: [] },
        { id: '2', name: 'B', enabled: false, runAt: 'document_idle', targetUrls: [] },
      ],
    };
    elements.filters = { statusFilter: { value: 'enabled' }, runAtFilter: { value: '' } };
    filterScripts(elements, state);
    expect(elements.scriptsList.children).toHaveLength(1);

    elements.filters = { statusFilter: { value: '' }, runAtFilter: { value: 'document_idle' } };
    filterScripts(elements, state);
    expect(elements.scriptsList.children).toHaveLength(1);
    expect(elements.scriptsList.textContent).toContain('B');
  });

  it('drops non-object entries instead of crashing', () => {
    const elements = filterElements();
    elements.filters = {};
    expect(() =>
      filterScripts(elements, { allScripts: [null, 42, { id: '1', name: 'A' }] })
    ).not.toThrow();
    expect(elements.scriptsList.children).toHaveLength(1);
  });

  it('toggles a script and notifies background', async () => {
    const data = chromeMock({
      scripts: [{ id: 's1', name: 'A', enabled: false }],
    });
    global.browser = global.chrome;
    await toggleScript('s1', true);
    expect(data.scripts[0].enabled).toBe(true);
  });

  it('deletes a script after confirm', async () => {
    document.body.innerHTML = `<div id="scriptsList"></div><div id="emptyState"></div>
      <select id="websiteFilter"></select>`;
    const data = chromeMock({
      scripts: [{ id: 's1', name: 'A', targetUrls: [] }],
    });
    global.browser = global.chrome;
    global.toggleScript = vi.fn();
    global.editScript = vi.fn();
    global.deleteScript = vi.fn();
    await deleteScript('s1');
    expect(data.scripts).toHaveLength(0);
  });

  it('skips delete when confirm is cancelled', async () => {
    global.confirm = vi.fn(() => false);
    const data = chromeMock({ scripts: [{ id: 's1' }] });
    await deleteScript('s1');
    expect(data.scripts).toHaveLength(1);
  });
});
