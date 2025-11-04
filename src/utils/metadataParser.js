import { GM_API_DEFINITIONS } from '../GM/gmApiDefinitions.js';

// Map tampermonkey style to ours
function buildGrantToApiMapping() {
  const grantToGmApi = {};
  
  Object.values(GM_API_DEFINITIONS).forEach(api => {
    // Original GM style
    grantToGmApi[api.tmName] = api.el;
    
    // Modern GM 
    if (api.tmName !== 'unsafeWindow') {
      const modernName = api.tmName.replace('GM_', 'GM.');
      grantToGmApi[modernName] = api.el;
    }
  });
  
  return grantToGmApi;
}

function parseUserScriptMetadata(content) {
  const metadata = {
    gmApis: {},
  };

  const grantToGmApi = buildGrantToApiMapping();

  const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
  if (!metaMatch) return metadata;

  const metaBlock = metaMatch[1];
  const lines = metaBlock.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    const match = line.match(/@(\w+)\s+(.+)/);
    if (!match) continue;

    const [, key, value] = match;

    switch (key.toLowerCase()) {
      case "match":
      case "include":
        if (!metadata.matches) metadata.matches = [];
        metadata.matches.push(value);
        break;

      case "require":
        if (!metadata.requires) metadata.requires = [];
        metadata.requires.push(value);
        break;

      case "resource": {
        if (!metadata.resources) metadata.resources = [];
        const urlMatch = value.match(/(https?:\/\/[^)\s]+)/);
        if (urlMatch) {
          const url = urlMatch[0];
          const name = value.substring(0, urlMatch.index).trim().split(/\s+/)[0];
          if (name) {
            metadata.resources.push({ name, url });
          } else {
            console.warn(`CodeTweak: Could not parse @resource, no name found for URL: ${url}`);
          }
        } else {
          console.warn(`CodeTweak: Could not parse @resource, no valid URL found in: "${value}"`);
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

function buildApiToGrantMapping() {
  const apiToGrant = {};
  
  Object.values(GM_API_DEFINITIONS).forEach(api => {
    apiToGrant[api.el] = api.tmName;
  });
  
  return apiToGrant;
}

const gmApiFlagToGrant = buildApiToGrantMapping();

function buildTampermonkeyMetadata(script, useModernStyle = false) {
  const lines = [];
  lines.push("// ==UserScript==");

  const push = (key, value) => {
    if (Array.isArray(value)) {
      value.forEach((v) => lines.push(`// @${key.padEnd(10)} ${v}`));
    } else if (value !== undefined && value !== null && value !== "") {
      lines.push(`// @${key.padEnd(10)} ${value}`);
    }
  };

  push("name", script.name || "Untitled Script");
  push("namespace", script.namespace || "https://codetweak.local"); // Need this domain
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

  // Requires
  if (script.requires && script.requires.length) {
    script.requires.forEach((url) => push("require", url));
  }

  // Resources
  if (script.resources && script.resources.length) {
    script.resources.forEach((r) => push("resource", `${r.name} ${r.url}`));
  }

  // Grants
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

export {
  parseUserScriptMetadata,
  extractMetadataBlock,
  buildTampermonkeyMetadata,
};
