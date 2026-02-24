import { describe, expect, it, vi } from 'vitest';

async function importCoreFresh() {
  vi.resetModules();
  return import('../../src/GM/gm_core.js');
}

describe('gm_core bootstrap', () => {
  it('initializes GMBridge globals when missing', async () => {
    delete window.GMBridge;
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    await importCoreFresh();

    expect(window.GMBridge).toBeTruthy();
    expect(typeof window.GMBridge.executeUserScriptWithDependencies).toBe('function');
    expect(postSpy).toHaveBeenCalledWith({ type: 'GM_CORE_EXECUTED' }, '*');
  });

  it('skips re-initialization if GMBridge already exists', async () => {
    const existing = { marker: true };
    window.GMBridge = existing;
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    await importCoreFresh();

    expect(window.GMBridge).toBe(existing);
    expect(postSpy).not.toHaveBeenCalledWith({ type: 'GM_CORE_EXECUTED' }, '*');
  });

  it('reports execution errors from dependency loading', async () => {
    delete window.GMBridge;
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await importCoreFresh();

    await window.GMBridge.executeUserScriptWithDependencies(
      'console.log(1)',
      'script-x',
      ['https://cdn.example/lib.js'],
      { loadScripts: vi.fn(async () => { throw new Error('load fail'); }) }
    );

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SCRIPT_ERROR', scriptId: 'script-x' }),
      '*'
    );
  });
});
