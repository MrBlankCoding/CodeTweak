// Parse metadata from header //userscript
function parseUserScriptMetadata(content) {
  const metadata = {
    gmApis: {}
  };

  // Map grants to our API's
  const grantToGmApi = {
    'GM_setValue': 'gmSetValue',
    'GM_getValue': 'gmGetValue',
    'GM_deleteValue': 'gmDeleteValue',
    'GM_listValues': 'gmListValues',
    'GM_openInTab': 'gmOpenInTab',
    'GM_notification': 'gmNotification',
    'GM_getResourceText': 'gmGetResourceText',
    'GM_getResourceURL': 'gmGetResourceURL',
    'GM_setClipboard': 'gmSetClipboard',
    'GM_addStyle': 'gmAddStyle',
    'GM_registerMenuCommand': 'gmRegisterMenuCommand',
    'GM_xmlHttpRequest': 'gmXmlHttpRequest',
    'unsafeWindow': 'unsafeWindow'
  };

  const metaMatch = content.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
  if (!metaMatch) return metadata;

  const metaBlock = metaMatch[1];
  const lines = metaBlock.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const match = line.match(/@(\w+)\s+(.+)/);
    if (!match) continue;

    const [, key, value] = match;
    
    switch (key.toLowerCase()) {
      case 'match':
      case 'include':
        if (!metadata.matches) metadata.matches = [];
        metadata.matches.push(value);
        break;
        
      case 'require':
        if (!metadata.requires) metadata.requires = [];
        metadata.requires.push(value);
        break;
        
      case 'resource': {
        if (!metadata.resources) metadata.resources = [];
        const [name, url] = value.split(/\s+/);
        if (name && url) {
          metadata.resources.push({ name, url });
        }
        break;
      }
        
      case 'run-at':
        metadata.runAt = value;
        break;
        
      case 'grant': {
        const grantValue = value.trim();
        if (grantValue === 'none') {
          metadata.gmApis = {};
        } else if (grantValue === 'unsafeWindow') {
          metadata.gmApis.unsafeWindow = true;
        } else {
          const apiFlag = grantToGmApi[grantValue];
          if (apiFlag) {
            metadata.gmApis[apiFlag] = true;
          }
        }
        break;
      }
        
      case 'license':
        metadata.license = value.trim();
        break;
        
      // copy anything else as is
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

export { parseUserScriptMetadata, extractMetadataBlock };
