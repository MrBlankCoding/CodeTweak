const INJECTION_TYPES = Object.freeze({
  DOCUMENT_START: "document_start",
  DOCUMENT_END: "document_end",
  DOCUMENT_IDLE: "document_idle"
});

// nice and safe sandboxing
export async function injectScriptInSandbox(tabId, code, scriptId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, scriptId) => {
        window._executedScriptIds = window._executedScriptIds || new Set();
        if (window._executedScriptIds.has(scriptId)) return;
        window._executedScriptIds.add(scriptId);

        // Make sure we comply with Trusted Types if available
        if (window.trustedTypes && !window._sandboxPolicy) {
          try {
            window._sandboxPolicy = trustedTypes.createPolicy("sandbox", {
              createHTML: (input) => input,
            });
          } catch (e) {
            console.warn("Trusted Types policy creation failed", e);
          }
        }

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.sandbox = "allow-scripts";

        const html = `<script>${code}<\/script>`;

        try {
          iframe.srcdoc = window._sandboxPolicy
            ? window._sandboxPolicy.createHTML(html)
            : html;
        } catch (e) {
          console.warn("TrustedHTML srcdoc assignment failed:", e);
          return;
        }

        document.documentElement.appendChild(iframe);
      },
      args: [code, scriptId || code.slice(0, 100)],
    });
  } catch (err) {
    console.warn("Sandboxed injection failed:", err);
  }
}

// Shows a notification when a script is executed
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

// Inject multiple scripts at a given stage
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
      tabScripts.clear(); // clear scripts at the beginning of doc load
    }

    const matching = await getFilteredScripts(url, runAt);
    const newScripts = matching.filter((s) => !tabScripts.has(s.id));

    for (const script of newScripts) {
      tabScripts.add(script.id);
      await injectScriptInSandbox(tabId, script.code, script.id);

      if (settings.showNotifications) {
        showNotification(tabId, script.name);
      }
    }
  } catch (err) {
    console.error("Injection error:", err);
  }
}

// Element-ready handler for runtime script injection
export async function handleElementFound(message, executedScripts) {
  const { tabId, scriptCode, scriptId } = message;
  if (!tabId) return;

  chrome.tabs
    .get(tabId)
    .then(async (tab) => {
      if (!tab || !scriptCode || !scriptId) return;
      const tabScripts = executedScripts.get(tabId) || new Set();
      if (!tabScripts.has(scriptId)) {
        tabScripts.add(scriptId);
        await injectScriptInSandbox(tab.id, scriptCode, scriptId);
      }
    })
    .catch(() => console.warn("Tab not found for elementFound"));
}

export { INJECTION_TYPES };
