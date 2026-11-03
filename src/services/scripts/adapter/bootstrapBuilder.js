import { createUserScriptApi, createErrorBridge } from './userScriptRuntime.js';

// Every name the runtime can provide. Each becomes a parameter of the wrapper
// around the user code, so APIs are lexical locals rather than window globals.
export const API_NAMES = [
  'GM',
  'GM_info',
  'unsafeWindow',
  'GM_setValue',
  'GM_getValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM_openInTab',
  'GM_notification',
  'GM_setClipboard',
  'GM_download',
  'GM_xmlhttpRequest',
  'GM_addStyle',
  'GM_addElement',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM_getResourceText',
  'GM_getResourceURL',
  'GM_log',
];

function sourceUrlComment(name) {
  const safe = encodeURIComponent(String(name || 'script')).replace(/%20/g, '_');
  return `//# sourceURL=codetweak/${safe}.user.js`;
}

// @require code and the user code share one function scope, matching how other
// managers concatenate them, so libraries see GM APIs and the script sees
// library globals.
export function buildRuntimeBootstrap(config, userCode, requires = []) {
  const runtimeConfig = { ...config, apiNames: API_NAMES };
  const body = [...requires, String(userCode ?? '')].join('\n;\n');

  return [
    '(() => {',
    `const __ctApi = (${createUserScriptApi.toString()})(${JSON.stringify(runtimeConfig)});`,
    `__ctApi.run(function (${API_NAMES.join(', ')}) {`,
    'return (function () {',
    body,
    '\n}).call(this);',
    '});',
    '})();',
    sourceUrlComment(config.scriptName),
  ].join('\n');
}

export function buildErrorBridgeCode() {
  return `(${createErrorBridge.toString()})();`;
}
