import logger from '../../shared/utils/logger.js';

const HISTORY_KEY_PREFIX = 'script-history-';
const HISTORY_LIMIT = 20;

function historyKey(scriptId) {
  return `${HISTORY_KEY_PREFIX}${scriptId}`;
}

// Script metadata
function snapshotMetadata(snapshotScript) {
  return {
    name: snapshotScript.name,
    version: snapshotScript.version,
    description: snapshotScript.description,
    targetUrls: snapshotScript.targetUrls,
    runAt: snapshotScript.runAt,
    injectInto: snapshotScript.injectInto,
    requires: snapshotScript.requires,
    resources: snapshotScript.resources,
    connect: snapshotScript.connect,
    excludes: snapshotScript.excludes,
    includeRegexes: snapshotScript.includeRegexes,
    noframes: snapshotScript.noframes,
    license: snapshotScript.license,
  };
}

// used by update revieer
export function collectRunProfile(script) {
  return {
    targetUrls: script.targetUrls,
    runAt: script.runAt,
    injectInto: script.injectInto,
    connect: script.connect,
    excludes: script.excludes,
    includeRegexes: script.includeRegexes,
    noframes: script.noframes,
  };
}

export function buildGrantProfile(script) {
  const grants = {};
  Object.keys(script).forEach((key) => {
    if (key.startsWith('gm') || key === 'unsafeWindow') {
      if (script[key] === true) grants[key] = true;
    }
  });
  if (script.gmApis) grants.gmApis = { ...script.gmApis };
  return grants;
}

// presist a script snapshot to storage.local
// keep HISOTRY_LIMIT snapshots per script
export async function saveScriptSnapshot(storageArea, script, reason) {
  if (!script?.id || typeof script.code !== 'string') return null;

  const entry = {
    savedAt: new Date().toISOString(),
    reason: reason || 'manual',
    version: script.version || '',
    code: script.code,
    metadata: snapshotMetadata(script),
    grants: buildGrantProfile(script),
  };

  try {
    const key = historyKey(script.id);
    const result = await storageArea.local.get(key);
    const snapshots = Array.isArray(result[key]) ? result[key] : [];
    snapshots.unshift(entry);
    while (snapshots.length > HISTORY_LIMIT) snapshots.pop();
    await storageArea.local.set({ [key]: snapshots });
    return entry;
  } catch (error) {
    // History is best-effort: never block a save/update because snapshotting failed.
    logger.warn(`Failed to snapshot script history for ${script.id}:`, error);
    return null;
  }
}

export async function listScriptSnapshots(storageArea, scriptId) {
  if (typeof scriptId !== 'string') return [];
  try {
    const result = await storageArea.local.get(historyKey(scriptId));
    return Array.isArray(result[historyKey(scriptId)]) ? result[historyKey(scriptId)] : [];
  } catch (error) {
    logger.warn(`Failed to read script history for ${scriptId}:`, error);
    return [];
  }
}

export async function clearScriptHistory(storageArea, scriptId) {
  try {
    await storageArea.local.remove(historyKey(scriptId));
    return true;
  } catch (error) {
    logger.warn(`Failed to clear script history for ${scriptId}:`, error);
    return false;
  }
}
