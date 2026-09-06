import { promisifyChromeCall } from '../shared/browserAdapter.js';

export async function callUserScriptsMethod(userScriptsApi, methodName, args = []) {
  const method = userScriptsApi?.[methodName];
  if (typeof method !== 'function') {
    return;
  }

  if (typeof globalThis.browser !== 'undefined') {
    await method.apply(userScriptsApi, args);
    return;
  }

  await promisifyChromeCall(method, userScriptsApi, ...args);
}

export class ScriptingEngine {
  constructor(api) {
    this.api = api;
  }

  async getEffectiveApi() {
    if (this.api.userScripts) {
      return { type: 'userScripts', api: this.api.userScripts };
    }

    if (this.api.scripting) {
      return { type: 'scripting', api: this.api.scripting };
    }

    throw new Error('No supported scripting API found');
  }

  async register(effectiveApi, regs) {
    if (effectiveApi.type === 'scripting') {
      const scriptingRegs = regs.map((r) => ({
        id: r.id,
        matches: r.matches,
        runAt: r.runAt,
        world: r.world,
        js: r.js,
        persistAcrossSessions: true,
      }));
      await effectiveApi.api.registerContentScripts(scriptingRegs);
      return;
    }
    await callUserScriptsMethod(effectiveApi.api, 'register', [regs]);
  }

  async unregister(effectiveApi, ids) {
    if (effectiveApi.type === 'scripting') {
      await effectiveApi.api.unregisterContentScripts({ ids });
      return;
    }
    await callUserScriptsMethod(effectiveApi.api, 'unregister', [{ ids }]);
  }
}
