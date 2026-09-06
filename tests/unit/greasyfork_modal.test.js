import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupGreasyfork } from '../../src/dashboard/dashboard-greasyfork.js';

function elements() {
  document.body.innerHTML = `
    <button id="gfBtn"></button>
    <div id="gfModal"><div class="modal-overlay"></div></div>
    <button class="modal-close"></button>
    <input id="gfSearch" value="" />
    <button id="gfSearchBtn"></button>
    <div id="gfResults"></div>
    <div id="gfLoading" style="display:none"></div>`;
  return {
    button: document.getElementById('gfBtn'),
    modal: document.getElementById('gfModal'),
    closeBtn: document.querySelector('.modal-close'),
    searchInput: document.getElementById('gfSearch'),
    searchBtn: document.getElementById('gfSearchBtn'),
    results: document.getElementById('gfResults'),
    loading: document.getElementById('gfLoading'),
  };
}

describe('greasyfork modal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    global.fetch = vi.fn();
  });

  it('opens and closes the modal', () => {
    const els = elements();
    setupGreasyfork(els);
    els.button.click();
    expect(els.modal.classList.contains('show')).toBe(true);
    els.closeBtn.click();
    expect(els.modal.classList.contains('show')).toBe(false);
  });

  it('searches on Enter and renders result cards', async () => {
    const els = elements();
    setupGreasyfork(els);
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          name: 'Dark Theme',
          code_url: 'https://greasyfork.org/scripts/1/code.user.js',
          total_installs: 1000,
          good_ratings: 50,
          version: '2.0.0',
          description: 'Makes things dark',
          url: 'https://greasyfork.org/scripts/1',
        },
      ],
    });
    els.searchInput.value = 'dark';
    els.searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r, 0));
    const card = els.results.querySelector('.script-card');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Dark Theme');
    expect(els.loading.style.display).toBe('none');
  });

  it('shows an error message when the API fails', async () => {
    const els = elements();
    setupGreasyfork(els);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    els.searchInput.value = 'x';
    els.searchBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(els.results.querySelector('.error-message')).toBeTruthy();
  });
});
