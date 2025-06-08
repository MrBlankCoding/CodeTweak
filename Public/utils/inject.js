const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle",
  ELEMENT_READY: "element_ready",
});

// Blob URLS
export async function injectScriptDirectly(
  tabId,
  code,
  scriptName,
  settings,
  scriptId
) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, scriptId) => {
        try {
          window._executedScriptIds = window._executedScriptIds || new Set();
          if (window._executedScriptIds.has(scriptId)) return;
          window._executedScriptIds.add(scriptId);

          const blob = new Blob([code], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          const script = document.createElement("script");
          script.src = url;
          script.onload = () => URL.revokeObjectURL(url);
          script.onerror = () => console.error("Blob script injection failed");

          (
            document.head ||
            document.documentElement ||
            document.body
          ).appendChild(script);
          setTimeout(() => script.remove(), 100);
        } catch (e) {
          console.error("Injection error", e);
        }
      },
      args: [code, scriptId || code.slice(0, 100)],
    });

    // Only show notification if the setting is enabled
    console.log(settings.showNotifications);
    if (settings.showNotifications) {
      showNotification(tabId, scriptName);
    }
  } catch (err) {
    console.warn("Injection failed", err);
  }
}

// Inject at different stages
export async function injectScriptsForStage(
  details,
  runAt,
  getFilteredScripts,
  executedScripts
) {
  if (details.frameId !== 0) return;

  try {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const url = details.url;
    const tabId = details.tabId;

    if (!executedScripts.has(tabId)) executedScripts.set(tabId, new Set());
    const tabScripts = executedScripts.get(tabId);

    if (runAt === INJECTION_TYPES.DOCUMENT_START) {
      tabScripts.clear();
    }

    const matching = await getFilteredScripts(url, runAt);
    const newScripts = matching.filter((s) => !tabScripts.has(s.id));

    for (const script of newScripts) {
      tabScripts.add(script.id);
      await injectScriptDirectly(
        tabId,
        script.code,
        script.name,
        settings,
        script.id
      );
    }

    if (runAt === INJECTION_TYPES.DOCUMENT_IDLE) {
      const readyScripts = await getFilteredScripts(
        url,
        INJECTION_TYPES.ELEMENT_READY
      );
      const newReady = readyScripts.filter((s) => !tabScripts.has(s.id));
      if (newReady.length) {
        chrome.tabs
          .sendMessage(tabId, { action: "waitForElements", scripts: newReady })
          .catch(console.warn);
      }
    }
  } catch (err) {
    console.error("Script injection error", err);
  }
}

// Visual feedback for script execution
export function showNotification(tabId, scriptName) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (name) => {
      const div = document.createElement("div");
      div.textContent = `✓ ${name}`;
      Object.assign(div.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 999999,
        background: "rgba(33, 150, 243, 0.95)",
        color: "white",
        padding: "6px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none",
      });
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 2000);
    },
    args: [scriptName || "Unknown script"],
  });
}

export { INJECTION_TYPES };
