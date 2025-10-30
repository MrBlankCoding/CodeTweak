(() => {
  // src/utils/metadataParser.js
  function parseUserScriptMetadata(content) {
    const metadata = {
      gmApis: {}
    };
    const grantToGmApi = {
      // GM_ style (traditional)
      GM_setValue: "gmSetValue",
      GM_getValue: "gmGetValue",
      GM_deleteValue: "gmDeleteValue",
      GM_listValues: "gmListValues",
      GM_openInTab: "gmOpenInTab",
      GM_notification: "gmNotification",
      GM_getResourceText: "gmGetResourceText",
      GM_getResourceURL: "gmGetResourceURL",
      GM_setClipboard: "gmSetClipboard",
      GM_addStyle: "gmAddStyle",
      GM_addElement: "gmAddElement",
      GM_registerMenuCommand: "gmRegisterMenuCommand",
      GM_xmlhttpRequest: "gmXmlhttpRequest",
      unsafeWindow: "unsafeWindow",
      // GM. style (modern)
      "GM.setValue": "gmSetValue",
      "GM.getValue": "gmGetValue",
      "GM.deleteValue": "gmDeleteValue",
      "GM.listValues": "gmListValues",
      "GM.openInTab": "gmOpenInTab",
      "GM.notification": "gmNotification",
      "GM.getResourceText": "gmGetResourceText",
      "GM.getResourceURL": "gmGetResourceURL",
      "GM.setClipboard": "gmSetClipboard",
      "GM.addStyle": "gmAddStyle",
      "GM.addElement": "gmAddElement",
      "GM.registerMenuCommand": "gmRegisterMenuCommand",
      "GM.xmlhttpRequest": "gmXmlhttpRequest"
    };
    const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    if (!metaMatch)
      return metadata;
    const metaBlock = metaMatch[1];
    const lines = metaBlock.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const match = line.match(/@(\w+)\s+(.+)/);
      if (!match)
        continue;
      const [, key, value] = match;
      switch (key.toLowerCase()) {
        case "match":
        case "include":
          if (!metadata.matches)
            metadata.matches = [];
          metadata.matches.push(value);
          break;
        case "require":
          if (!metadata.requires)
            metadata.requires = [];
          metadata.requires.push(value);
          break;
        case "resource": {
          if (!metadata.resources)
            metadata.resources = [];
          const [name, url] = value.split(/\s+/);
          if (name && url) {
            metadata.resources.push({ name, url });
          }
          break;
        }
        case "run-at":
          metadata.runAt = value;
          break;
        case "grant": {
          const grantValue = value.trim();
          if (grantValue === "none") {
            metadata.gmApis = {};
          } else if (grantValue === "unsafeWindow") {
            metadata.gmApis.unsafeWindow = true;
          } else {
            const apiFlag = grantToGmApi[grantValue];
            if (apiFlag) {
              metadata.gmApis[apiFlag] = true;
            }
          }
          break;
        }
        case "license":
          metadata.license = value.trim();
          break;
        case "icon":
          metadata.icon = value.trim();
          break;
        default:
          metadata[key] = value;
      }
    }
    return metadata;
  }
  function extractMetadataBlock(content) {
    const match = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
    return match ? match[0] : null;
  }
  var gmApiFlagToGrant = {
    gmSetValue: "GM_setValue",
    gmGetValue: "GM_getValue",
    gmDeleteValue: "GM_deleteValue",
    gmListValues: "GM_listValues",
    gmOpenInTab: "GM_openInTab",
    gmNotification: "GM_notification",
    gmGetResourceText: "GM_getResourceText",
    gmGetResourceURL: "GM_getResourceURL",
    gmSetClipboard: "GM_setClipboard",
    gmAddStyle: "GM_addStyle",
    gmAddElement: "GM_addElement",
    gmRegisterMenuCommand: "GM_registerMenuCommand",
    gmXmlhttpRequest: "GM_xmlhttpRequest",
    unsafeWindow: "unsafeWindow"
  };
  function buildTampermonkeyMetadata(script, useModernStyle = false) {
    const lines = [];
    lines.push("// ==UserScript==");
    const push = (key, value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => lines.push(`// @${key.padEnd(10)} ${v}`));
      } else if (value !== void 0 && value !== null && value !== "") {
        lines.push(`// @${key.padEnd(10)} ${value}`);
      }
    };
    push("name", script.name || "Untitled Script");
    push("namespace", script.namespace || "https://codetweak.local");
    push("version", script.version || "1.0.0");
    push("description", script.description || "");
    push("author", script.author || "Anonymous");
    push("icon", script.icon);
    if (script.targetUrls && script.targetUrls.length) {
      script.targetUrls.forEach((pattern) => push("match", pattern));
    }
    if (script.runAt) {
      let runAt = script.runAt;
      runAt = runAt.replace(/_/g, "-");
      push("run-at", runAt);
    }
    if (script.requires && script.requires.length) {
      script.requires.forEach((url) => push("require", url));
    }
    if (script.resources && script.resources.length) {
      script.resources.forEach((r) => push("resource", `${r.name} ${r.url}`));
    }
    const grants = [];
    let anyApiSelected = false;
    Object.keys(gmApiFlagToGrant).forEach((flag) => {
      if (script[flag]) {
        let grantName = gmApiFlagToGrant[flag];
        if (useModernStyle && grantName !== "unsafeWindow") {
          grantName = grantName.replace("GM_", "GM.");
        }
        grants.push(grantName);
        anyApiSelected = true;
      }
    });
    if (!anyApiSelected) {
      push("grant", "none");
    } else {
      grants.forEach((g) => push("grant", g));
    }
    if (script.license) {
      push("license", script.license);
    }
    lines.push("// ==/UserScript==");
    return lines.join("\n");
  }
})();
