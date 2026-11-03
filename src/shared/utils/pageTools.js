const PAGE_TOOL_FILES = ['elementSelector/main.js'];
const PAGE_TOOL_STYLES = ['assets/styles/elementSelector.css'];

// inject on demand
export async function ensurePageTools(tabId) {
  const api = chrome;
  if (typeof tabId !== 'number' || !api.scripting?.executeScript) return false;

  const [probe] = await api.scripting.executeScript({
    target: { tabId },
    func: () => Boolean(globalThis.__ctwkPageTools),
  });
  if (probe?.result) return true;

  await api.scripting.insertCSS({ target: { tabId }, files: PAGE_TOOL_STYLES });
  await api.scripting.executeScript({ target: { tabId }, files: PAGE_TOOL_FILES });
  await api.scripting.executeScript({
    target: { tabId },
    func: () => {
      globalThis.__ctwkPageTools = true;
    },
  });
  return true;
}
