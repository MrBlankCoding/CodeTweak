import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
  window.GM = undefined;
  window.GMBridge = undefined;
  window.__gmMenuCommands = undefined;
  window._executedScriptIds = undefined;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  delete global.chrome;
});
