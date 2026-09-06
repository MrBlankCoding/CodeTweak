import { browser } from '../shared/browserAdapter.js';

export class DownloadService {
  async download(args) {
    const { url, name } = args;
    const downloadUrl = typeof url === 'object' && url ? url.url : url;
    const filename = typeof url === 'object' && url ? url.name || url.filename : name;

    if (typeof downloadUrl !== 'string' || !/^(https?|blob|data):/i.test(downloadUrl)) {
      return { error: 'Only http(s), blob, or data URLs may be downloaded.' };
    }

    if (
      filename !== undefined &&
      (typeof filename !== 'string' ||
        /(^|[\\/])\.\.([\\/]|$)/.test(filename) ||
        filename.length > 255)
    ) {
      return { error: 'Invalid filename.' };
    }

    return new Promise((resolve) => {
      browser.downloads.download(
        {
          url: downloadUrl,
          filename: filename,
        },
        (downloadId) => {
          if (browser.runtime.lastError) {
            resolve({ error: browser.runtime.lastError.message });
          } else {
            resolve({ result: { downloadId } });
          }
        }
      );
    });
  }
}
