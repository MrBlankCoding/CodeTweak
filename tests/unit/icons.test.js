import { beforeEach, describe, expect, it } from 'vitest';

import { createIcon, renderIcons } from '../../src/shared/utils/icons.js';

describe('shared icons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates accessible inline SVG icons from the registry', () => {
    const icon = createIcon('home', { className: 'nav-icon', size: 20 });

    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('width')).toBe('20');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.classList.contains('ct-icon')).toBe(true);
    expect(icon.classList.contains('nav-icon')).toBe(true);
    expect(icon.querySelector('path')).not.toBeNull();
  });

  it('rejects icon names that are not in the registry', () => {
    expect(() => createIcon('not-an-icon')).toThrow('Unknown icon: not-an-icon');
  });

  it('renders placeholders throughout a document or supplied element', () => {
    document.body.innerHTML = `
      <div id="icons">
        <span class="nav-icon" data-icon="settings"></span>
      </div>
      <span data-icon="plus"></span>`;

    renderIcons(document.getElementById('icons'));
    renderIcons();

    const icons = document.querySelectorAll('svg.ct-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0].classList.contains('nav-icon')).toBe(true);
    expect(document.querySelector('[data-icon]')).toBeNull();
  });
});
