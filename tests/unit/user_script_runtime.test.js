import { describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';

import { buildRuntimeBootstrap } from '../../src/services/scripts/adapter/bootstrapBuilder.js';
import { parseUserScriptMetadata } from '../../src/services/scripts/MetadataParser.js';

// Runs a generated bootstrap in a fresh VM context that stands in for one
// page world, with a fake chrome.runtime when it is the USER_SCRIPT world.
async function runBootstrap({ world, code, requires = [], config = {}, href, responses = {} }) {
  const sent = [];
  const posted = [];
  const firstRuns = [];
  const sandbox = {
    console: { ...console, log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    location: { href: href || 'https://example.com/page' },
    document: { head: { appendChild: vi.fn() }, createElement: () => ({ setAttribute() {} }) },
    postMessage: (message) => posted.push(message),
    TextDecoder,
    Blob,
    atob,
    btoa,
  };
  if (world === 'USER_SCRIPT') {
    sandbox.chrome = {
      runtime: {
        sendMessage: async (message) => {
          if (message.type === 'CODETWEAK_FIRST_RUN') {
            firstRuns.push(message);
            return { result: null };
          }
          sent.push(message.payload);
          return { result: responses[message.payload.action] ?? null };
        },
      },
    };
  }
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const bootstrap = buildRuntimeBootstrap(
    {
      scriptId: 's1',
      scriptName: 'Runtime Test',
      world,
      enabledApis: {},
      resources: {},
      gmInfo: { script: { name: 'Runtime Test' } },
      ...config,
    },
    code,
    requires
  );
  vm.runInContext(bootstrap, context);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { context, sent, posted, firstRuns };
}

describe('userscript runtime', () => {
  it('preloads values and scopes GM APIs to the script, not window', async () => {
    const { context, sent, firstRuns } = await runBootstrap({
      world: 'USER_SCRIPT',
      config: { enabledApis: { gmGetValue: true, gmSetValue: true } },
      responses: { getAllValues: { count: 3 } },
      code: `
        globalThis.out = { count: GM_getValue('count', 0), onWindow: typeof window.GM_getValue };
        GM_setValue('count', GM_getValue('count') + 1);
        globalThis.after = GM_getValue('count');
      `,
    });
    expect(context.out).toEqual({ count: 3, onWindow: 'undefined' });
    expect(context.after).toBe(4);
    expect(sent.map((p) => p.action)).toEqual(['getAllValues', 'setValue']);
    expect(sent[1]).toEqual(expect.objectContaining({ scriptId: 's1', name: 'count', value: 4 }));
    expect(firstRuns).toEqual([{ type: 'CODETWEAK_FIRST_RUN', scriptId: 's1' }]);
  });

  it('shares one scope between @require code and the script', async () => {
    const { context } = await runBootstrap({
      world: 'USER_SCRIPT',
      requires: ['var LIB = "ready";'],
      code: 'globalThis.lib = LIB; globalThis.tpl = `${1 + 1} $& $1`;',
    });
    expect(context.lib).toBe('ready');
    expect(context.tpl).toBe('2 $& $1');
  });

  it('rebuilds binary XHR responses from base64', async () => {
    const { context } = await runBootstrap({
      world: 'USER_SCRIPT',
      config: { enabledApis: { gmXmlhttpRequest: true } },
      responses: { xmlhttpRequest: { status: 200, responseBase64: btoa('hi!'), responseText: '' } },
      code: `GM_xmlhttpRequest({
        url: 'https://api.test',
        responseType: 'arraybuffer',
        onload: (r) => { globalThis.bytes = r.response.byteLength; },
      });`,
    });
    expect(context.bytes).toBe(3);
  });

  it('keeps menu commands in the USER_SCRIPT world registry', async () => {
    const { context } = await runBootstrap({
      world: 'USER_SCRIPT',
      config: { enabledApis: { gmRegisterMenuCommand: true } },
      code: "GM_registerMenuCommand('Hello', () => { globalThis.clicked = true; });",
    });
    const [[, command]] = [...context.__codetweak.menu.entries()];
    expect(command.caption).toBe('Hello');
    command.onClick();
    expect(context.clicked).toBe(true);
  });

  it('refuses privileged APIs in the Main World and exposes no registry', async () => {
    const { context } = await runBootstrap({
      world: 'MAIN',
      config: { enabledApis: { gmXmlhttpRequest: true } },
      code: 'try { GM_xmlhttpRequest({ url: "x" }); } catch (e) { globalThis.err = e.message; }',
    });
    expect(context.err).toMatch(/not available when a script runs in the page/);
    expect('__codetweak' in context).toBe(false);
  });

  it('reports Main World errors through postMessage for the bridge', async () => {
    const { posted } = await runBootstrap({ world: 'MAIN', code: 'throw new Error("boom")' });
    expect(posted.find((message) => message.type === 'CODETWEAK_SCRIPT_ERROR')).toEqual(
      expect.objectContaining({
        type: 'CODETWEAK_SCRIPT_ERROR',
        scriptId: 's1',
        error: expect.objectContaining({ message: 'boom' }),
      })
    );
    expect(posted).toContainEqual({ type: 'CODETWEAK_FIRST_RUN', scriptId: 's1' });
  });

  it('does not run on URLs vetoed by the gate', async () => {
    const { context, sent } = await runBootstrap({
      world: 'USER_SCRIPT',
      href: 'https://example.com/logout',
      config: { gate: { include: null, exclude: ['logout'] }, enabledApis: { gmGetValue: true } },
      code: 'globalThis.ran = true;',
    });
    expect(context.ran).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('does not start when dependencies are missing', async () => {
    const { context, sent } = await runBootstrap({
      world: 'USER_SCRIPT',
      config: { missingDependencies: ['https://cdn.test/lib.js'] },
      code: 'globalThis.ran = true;',
    });
    expect(context.ran).toBeUndefined();
    expect(sent.at(-1)).toEqual(
      expect.objectContaining({ action: 'reportError', error: expect.any(Object) })
    );
  });
});

describe('metadata parser header keys', () => {
  it('parses @connect, @exclude, regex @include, @noframes and @inject-into', () => {
    const meta = parseUserScriptMetadata(`// ==UserScript==
// @name     T
// @match    https://example.com/*
// @include  /^https:\\/\\/news\\.test\\//
// @exclude  https://example.com/private/*
// @exclude-match https://example.com/admin/*
// @connect  API.example.com
// @connect  self
// @noframes
// @inject-into content
// ==/UserScript==`);
    expect(meta.matches).toEqual(['https://example.com/*']);
    expect(meta.includeRegexes).toEqual(['^https:\\/\\/news\\.test\\/']);
    expect(meta.excludes).toEqual(['https://example.com/private/*', 'https://example.com/admin/*']);
    expect(meta.connect).toEqual(['api.example.com', 'self']);
    expect(meta.noframes).toBe(true);
    expect(meta.injectInto).toBe('isolated');
  });
});
