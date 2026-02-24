import { describe, expect, it, vi } from 'vitest';
import { resetLogFlags, setLogFlags } from '../../src/utils/logger.js';

async function importLoaderWithPolicy(policy) {
  vi.resetModules();
  vi.doMock('../../src/GM/helpers/trusted_types.js', () => ({
    getTrustedTypesPolicy: () => policy,
  }));
  return import('../../src/GM/helpers/external_script_loader.js');
}

describe('ExternalScriptLoader', () => {
  it('loads once per original url and upgrades http', async () => {
    setLogFlags({ info: true });
    try {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { ExternalScriptLoader } = await importLoaderWithPolicy(null);
      const loader = new ExternalScriptLoader();

      const injectSpy = vi.spyOn(loader, 'injectScriptTag').mockResolvedValue(undefined);

      await loader.loadScript('http://cdn.example/a.js');
      await loader.loadScript('http://cdn.example/a.js');

      expect(injectSpy).toHaveBeenCalledTimes(1);
      expect(injectSpy).toHaveBeenCalledWith('https://cdn.example/a.js');
      expect(infoSpy).toHaveBeenCalled();
    } finally {
      resetLogFlags();
    }
  });

  it('injectScriptTag applies trusted policy and resolves on load', async () => {
    const { ExternalScriptLoader } = await importLoaderWithPolicy({
      createScriptURL: (src) => `trusted:${src}`,
    });

    const loader = new ExternalScriptLoader();
    const promise = loader.injectScriptTag('https://cdn.example/lib.js');

    const script = document.head.querySelector('script');
    expect(script).toBeTruthy();
    expect(script.async).toBe(false);
    expect(script.src).toContain('trusted:https://cdn.example/lib.js');

    script.onload();
    await expect(promise).resolves.toBeUndefined();
  });

  it('injectScriptTag rejects on error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ExternalScriptLoader } = await importLoaderWithPolicy(null);

    const loader = new ExternalScriptLoader();
    const promise = loader.injectScriptTag('https://cdn.example/fail.js');

    const script = document.head.querySelector('script');
    script.onerror();

    await expect(promise).rejects.toThrow('Failed to load script: https://cdn.example/fail.js');
    expect(errSpy).toHaveBeenCalled();
  });

  it('loadScripts ignores non-arrays and loads sequential arrays', async () => {
    const { ExternalScriptLoader } = await importLoaderWithPolicy(null);
    const loader = new ExternalScriptLoader();

    const loadSpy = vi.spyOn(loader, 'loadScript').mockResolvedValue(undefined);

    await loader.loadScripts(null);
    await loader.loadScripts(['a.js', 'b.js']);

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(loadSpy.mock.calls[0][0]).toBe('a.js');
    expect(loadSpy.mock.calls[1][0]).toBe('b.js');
  });
});
