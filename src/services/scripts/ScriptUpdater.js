import logger from '../../shared/utils/logger.js';
import { parseUserScriptMetadata } from './MetadataParser.js';
import { browser } from '../../shared/browserAdapter.js';

export class ScriptUpdater {
  constructor(storageApi) {
    this.storageApi = storageApi;
  }

  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const parts1 = String(v1)
      .split(/[.-]/)
      .map((p) => parseInt(p, 10) || 0);
    const parts2 = String(v2)
      .split(/[.-]/)
      .map((p) => parseInt(p, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  resolveUpdateUrl(script) {
    return (
      script.updateURL ||
      script.updateUrl ||
      script.downloadURL ||
      script.downloadUrl ||
      (script.updateInfo && script.updateInfo.updateUrl) ||
      null
    );
  }

  async checkAndPerformUpdates() {
    logger.info('Starting automatic script update check...');
    const { scripts = [] } = await this.storageApi.local.get('scripts');
    if (!Array.isArray(scripts)) {
      logger.warn('Stored scripts corrupted; skipping update check.');
      return;
    }
    let anyUpdated = false;

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const updateUrl = this.resolveUpdateUrl(script);

      if (!updateUrl) continue;
      if (typeof updateUrl !== 'string' || !/^https:\/\//i.test(updateUrl)) {
        logger.warn(`Skipping update for ${script.name}: non-HTTPS update URL.`);
        continue;
      }

      try {
        logger.info(`Checking update for script: ${script.name} at ${updateUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          response = await fetch(updateUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!response.ok) {
          logger.warn(`Failed to fetch update for ${script.name}: ${response.status}`);
          continue;
        }

        const newCode = await response.text();
        if (newCode.length > 2_000_000) {
          logger.warn(`Skipping update for ${script.name}: payload exceeds 2MB.`);
          continue;
        }
        const newMetadata = parseUserScriptMetadata(newCode);

        if (!newMetadata.version) {
          logger.warn(`Could not find version in updated script ${script.name}`);
          continue;
        }

        if (this.compareVersions(newMetadata.version, script.version) > 0) {
          logger.info(
            `Updating script ${script.name} from ${script.version} to ${newMetadata.version}`
          );
          scripts[i] = {
            ...script,
            ...newMetadata,
            code: newCode,
            updatedAt: new Date().toISOString(),
          };

          if (newMetadata.updateURL) scripts[i].updateURL = newMetadata.updateURL;
          if (newMetadata.downloadURL) scripts[i].downloadURL = newMetadata.downloadURL;

          anyUpdated = true;
        } else {
          logger.info(`Script ${script.name} is up to date (${script.version})`);
        }
      } catch (error) {
        logger.error(`Error updating script ${script.name}:`, error);
      }
    }

    if (anyUpdated) {
      await this.storageApi.local.set({ scripts });
      try {
        await browser.runtime.sendMessage({
          action: 'scriptsUpdated',
        });
      } catch (error) {
        logger.warn('Update broadcast failed (no receiver):', error.message);
      }
      logger.info('Automatic updates completed. Some scripts were updated.');
    } else {
      logger.info('Automatic update check finished. No updates found.');
    }

    await this.storageApi.local.set({ lastUpdateCheck: Date.now() });
  }

  setupAlarm() {
    const ALARM_NAME = 'codetweak-auto-update';
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        this.checkAndPerformUpdates().catch((error) => {
          logger.error('Scheduled update check failed:', error);
        });
      }
    });

    browser.alarms.get(ALARM_NAME, (alarm) => {
      if (!alarm) {
        browser.alarms.create(ALARM_NAME, {
          periodInMinutes: 24 * 60, // Once a day
        });
      }
    });

    this.checkIfInitialCheckNeeded();
  }

  async checkIfInitialCheckNeeded() {
    const { lastUpdateCheck } = await this.storageApi.local.get('lastUpdateCheck');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (!lastUpdateCheck || now - lastUpdateCheck > ONE_DAY) {
      setTimeout(() => {
        this.checkAndPerformUpdates();
      }, 5000);
    }
  }
}
