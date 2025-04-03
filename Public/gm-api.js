function createGMApi(metadata) {
  const GM = {
    info: {
      script: {
        name: metadata.name,
        version: metadata.version,
        description: metadata.description || "",
        includes: metadata.targetUrls || [],
        matches: metadata.targetUrls || [],
      },
      scriptHandler: "CodeTweak",
      version: "1.0",
    },

    deleteValue: (key) => {
      return chrome.runtime.sendMessage({
        action: "GM_deleteValue",
        key: key,
      });
    },

    getValue: (key, defaultValue) => {
      return chrome.runtime.sendMessage({
        action: "GM_getValue",
        key: key,
        defaultValue: defaultValue,
      });
    },

    listValues: () => {
      return chrome.runtime.sendMessage({ action: "GM_listValues" });
    },

    setValue: (key, value) => {
      return chrome.runtime.sendMessage({
        action: "GM_setValue",
        key: key,
        value: value,
      });
    },

    getResourceUrl: (resourceName) => {
      return chrome.runtime.sendMessage({
        action: "GM_getResourceUrl",
        resourceName: resourceName,
      });
    },

    notification: (text, options = {}) => {
      return chrome.runtime.sendMessage({
        action: "GM_notification",
        text: text,
        options: options,
      });
    },

    openInTab: (url, options = {}) => {
      return chrome.runtime.sendMessage({
        action: "GM_openInTab",
        url: url,
        options: options,
      });
    },

    registerMenuCommand: (caption, callback, accessKey) => {
      const commandId = Math.random().toString(36).substring(2);
      window[`GM_menuCommand_${commandId}`] = callback;
      return chrome.runtime.sendMessage({
        action: "GM_registerMenuCommand",
        commandId: commandId,
        caption: caption,
        accessKey: accessKey,
      });
    },

    setClipboard: (text, options = {}) => {
      return chrome.runtime.sendMessage({
        action: "GM_setClipboard",
        text: text,
        options: options,
      });
    },

    xmlHttpRequest: (details) => {
      return chrome.runtime.sendMessage({
        action: "GM_xmlHttpRequest",
        details: details,
      });
    },
  };

  // Add compatibility aliases
  return Object.assign(GM, {
    deleteValue: GM.deleteValue,
    getValue: GM.getValue,
    listValues: GM.listValues,
    setValue: GM.setValue,
    getResourceUrl: GM.getResourceUrl,
    notification: GM.notification,
    openInTab: GM.openInTab,
    registerMenuCommand: GM.registerMenuCommand,
    setClipboard: GM.setClipboard,
    xmlHttpRequest: GM.xmlHttpRequest,
  });
}
