import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementSelectorMenu } from '../../src/elementSelector/menu.js';

describe('element-menu', () => {
  let menu;
  let selector;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    selector = {
      startSelection: vi.fn(),
      cleanup: vi.fn(),
      getUniqueSelector: vi.fn(() => '#my-id'),
      clampToViewport: vi.fn((l, t) => ({ left: l, top: t })),
      state: { isSelecting: false },
    };
    menu = new ElementSelectorMenu(selector);
  });

  it('maps actions to icons with circle fallback', () => {
    expect(menu.iconName('copy')).toBe('copy');
    expect(menu.iconName('hide')).toBe('eye-off');
    expect(menu.iconName('nope')).toBe('circle');
  });

  it('builds hide/remove/click templates with escaped selector', () => {
    const sel = 'div[data-x="a\\"b"]';
    expect(menu.actionTemplates.hide(sel)).toContain(JSON.stringify(sel));
    expect(menu.actionTemplates.remove(sel)).toContain('.remove()');
    expect(menu.actionTemplates.click(sel)).toContain('.click()');
  });

  it('creates menu items with keyboard support', () => {
    const item = menu.createMenuItem('Copy Selector', 'copy');
    expect(item.textContent).toContain('Copy Selector');
    expect(item.tabIndex).toBe(0);
    menu.state.currentElement = document.createElement('div');
    const spy = vi.spyOn(menu, 'handleAction').mockResolvedValue();
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(spy).toHaveBeenCalledWith('copy');
  });

  it('copies selector then cleans up', async () => {
    menu.state.currentElement = document.createElement('div');
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const cleanup = vi.spyOn(menu, 'cleanup').mockImplementation(() => {});
    await menu.handleAction('copy');
    expect(writeText).toHaveBeenCalledWith('#my-id');
    expect(cleanup).toHaveBeenCalled();
  });

  it('removes menu and overlay on cleanup', () => {
    menu.state.currentElement = document.createElement('div');
    menu.createMenu(10, 20);
    expect(document.querySelector('.ctwk-menu')).toBeTruthy();
    menu.cleanup();
    expect(document.querySelector('.ctwk-menu')).toBeNull();
    expect(selector.cleanup).toHaveBeenCalled();
  });
});
