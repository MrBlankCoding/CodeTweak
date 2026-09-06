import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('feather-icons', () => ({ default: { replace: vi.fn() } }));

import {
  setupTabs,
  updateWebsiteFilterOptions,
  updateScriptsList,
  showNotification,
} from '../../src/dashboard/dashboard-ui.js';

describe('dashboard-ui', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('switches tabs and marks the active one', () => {
    document.body.innerHTML = `
      <button class="nav-item" data-tab="scripts"></button>
      <button class="nav-item" data-tab="settings"></button>
      <div id="scripts-tab" class="tab-content"></div>
      <div id="settings-tab" class="tab-content"></div>`;
    const navItems = [...document.querySelectorAll('.nav-item')];
    const tabContents = [...document.querySelectorAll('.tab-content')];
    setupTabs(navItems, tabContents);

    navItems[1].click();
    expect(navItems[1].classList.contains('active')).toBe(true);
    expect(navItems[0].classList.contains('active')).toBe(false);
    expect(document.getElementById('settings-tab').classList.contains('active')).toBe(true);
  });

  it('ignores missing nav items', () => {
    expect(() => setupTabs(null, [])).not.toThrow();
    expect(() => setupTabs([], null)).not.toThrow();
  });

  it('builds sorted website filter options from targetUrls', () => {
    const select = document.createElement('select');
    updateWebsiteFilterOptions(
      [
        { targetUrls: ['https://b.example.com/*', 'https://a.example.com/*'] },
        { targetUrls: ['not-a-url'] },
        {},
      ],
      select
    );
    const values = [...select.options].map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values).toContain('b.example.com');
    expect(values).toContain('a.example.com');
    expect(values).toContain('not-a-url');
    const hosts = values.slice(1);
    expect([...hosts].sort()).toEqual(hosts);
  });

  it('renders scripts and toggles empty state', () => {
    document.body.innerHTML = `<span id="scriptCount"></span>
      <div id="scriptsList"></div><div id="emptyState"></div>`;
    global.toggleScript = vi.fn();
    global.editScript = vi.fn();
    global.deleteScript = vi.fn();
    const elements = {
      scriptsList: document.getElementById('scriptsList'),
      emptyState: document.getElementById('emptyState'),
    };
    updateScriptsList(
      [{ id: 's1', name: 'A', enabled: true, targetUrls: ['https://a.com/*'] }],
      elements
    );
    expect(elements.scriptsList.children).toHaveLength(1);
    expect(elements.emptyState.style.display).toBe('none');
    expect(document.getElementById('scriptCount').textContent).toBe('1');

    updateScriptsList([], elements);
    expect(elements.emptyState.style.display).toBe('block');
  });

  it('shows and auto-dismisses notifications', () => {
    vi.useFakeTimers();
    try {
      showNotification('hello', 'success');
      const note = document.querySelector('.notification-success');
      expect(note).toBeTruthy();
      expect(note.textContent).toContain('hello');
      note.querySelector('.notification-close').click();
      vi.advanceTimersByTime(600);
      expect(document.querySelector('.notification-success')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
