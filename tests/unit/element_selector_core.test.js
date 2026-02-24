import { describe, expect, it, vi } from 'vitest';
import { ElementSelector } from '../../src/elementSelector/core.js';

describe('ElementSelector core', () => {
  it('builds selectors and hierarchy', () => {
    global.CSS = global.CSS || { escape: (v) => String(v) };
    const selector = new ElementSelector();

    const div = document.createElement('div');
    div.id = 'unique-id';
    document.body.appendChild(div);
    expect(selector.getUniqueSelector(div)).toBe('#unique-id');

    const a = document.createElement('span');
    const b = document.createElement('span');
    document.body.appendChild(a);
    document.body.appendChild(b);
    expect(selector.buildHierarchicalSelector(b)).toContain('span:nth-of-type');
  });

  it('manages highlight, tooltip, breadcrumbs, and cleanup', () => {
    const selector = new ElementSelector();
    const el = document.createElement('button');
    document.body.appendChild(el);

    selector.highlightElement(el);
    expect(el.classList.contains('ctwk-highlight')).toBe(true);

    selector.updateTooltip(20, 20);
    expect(selector.elements.tooltip).toBeTruthy();

    selector.buildBreadcrumbs(el);
    expect(selector.elements.breadcrumbs?.querySelectorAll('.ctwk-crumb').length).toBeGreaterThan(
      0
    );

    selector.cleanup();
    expect(selector.elements.tooltip).toBeNull();
    expect(selector.elements.breadcrumbs).toBeNull();
  });

  it('handles events and callbacks', () => {
    const selector = new ElementSelector();
    const target = document.createElement('div');
    document.body.appendChild(target);

    selector.startSelection(vi.fn(), vi.fn(), '.x{}');
    selector.state.currentElement = target;

    const clickEvent = new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 });
    Object.defineProperty(clickEvent, 'target', { value: target });
    selector.handleClick(clickEvent);
    expect(selector.onSelect).toHaveBeenCalled();

    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    selector.handleKeyDown(esc);
    expect(selector.onCancel).toBeNull();
  });

  it('clamps viewport coordinates', () => {
    const selector = new ElementSelector();
    const pos = selector.clampToViewport(9999, 9999, 200, 100, 20, 20);
    expect(pos.left).toBeLessThan(window.innerWidth);
    expect(pos.top).toBeLessThan(window.innerHeight);
  });
});
