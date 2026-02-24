import { describe, expect, it, vi } from 'vitest';
import { createWorldExecutor } from '../../src/utils/worldExecutors.js';

function setupBridgeMocks() {
  const executeUserScriptWithDependencies = vi.fn();
  const initializeCache = vi.fn();
  const registerAll = vi.fn();
  const ctor = vi.fn(function MockBridge(scriptId, extensionId, worldType) {
    this.scriptId = scriptId;
    this.extensionId = extensionId;
    this.worldType = worldType;
  });

  ctor.ResourceManager = {
    fromScript: vi.fn(() => ({ getText: vi.fn(), getURL: vi.fn() })),
  };
  ctor.GMAPIRegistry = function MockRegistry() {
    this.initializeCache = initializeCache;
    this.registerAll = registerAll;
  };
  ctor.ExternalScriptLoader = function MockLoader() {};
  ctor.executeUserScriptWithDependencies = executeUserScriptWithDependencies;

  window.GMBridge = ctor;

  return { ctor, executeUserScriptWithDependencies, initializeCache, registerAll };
}

describe('createWorldExecutor', () => {
  it('creates bridge, exposes GM_info, and executes userscript', () => {
    const { ctor, executeUserScriptWithDependencies, initializeCache, registerAll } = setupBridgeMocks();

    const script = { name: 'T', runAt: 'document_start', resources: [] };
    createWorldExecutor(
      'console.log(1)',
      'script-a',
      { gmGetValue: true },
      script,
      'ext-id',
      { a: 1 },
      ['https://cdn.example/lib.js'],
      { script: { id: 'script-a' } },
      false,
      'MAIN'
    );

    expect(ctor).toHaveBeenCalledWith('script-a', 'ext-id', 'MAIN');
    expect(window.GM_info).toBeTruthy();
    expect(initializeCache).toHaveBeenCalledWith({ a: 1 });
    expect(registerAll).toHaveBeenCalledWith({ gmGetValue: true });
    expect(executeUserScriptWithDependencies).toHaveBeenCalled();
  });

  it('prevents duplicate execution for same script id', () => {
    const { executeUserScriptWithDependencies } = setupBridgeMocks();

    const args = [
      'console.log(1)',
      'script-b',
      {},
      { name: 'S', runAt: 'document_start' },
      'ext-id',
      {},
      [],
      { script: { id: 'script-b' } },
      false,
      'MAIN',
    ];

    createWorldExecutor(...args);
    createWorldExecutor(...args);

    expect(executeUserScriptWithDependencies).toHaveBeenCalledTimes(1);
  });
});
