import { browser } from '../shared/browserAdapter.js';
import logger from '../shared/utils/logger.js';

export class DisplayService {
  constructor() {
    this.creatingOffscreenDocument = null;
  }

  async setupOffscreenDocument() {
    const offscreenApi = browser.offscreen;
    const hasDocumentFn = offscreenApi?.['hasDocument'];
    const createDocumentFn = offscreenApi?.['createDocument'];

    if (typeof hasDocumentFn !== 'function' || typeof createDocumentFn !== 'function') {
      return;
    }

    if (await hasDocumentFn.call(offscreenApi)) {
      return;
    }

    if (this.creatingOffscreenDocument) {
      await this.creatingOffscreenDocument;
      return;
    }

    this.creatingOffscreenDocument = createDocumentFn.call(offscreenApi, {
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Clipboard access',
    });

    try {
      await this.creatingOffscreenDocument;
    } catch (error) {
      logger.error('Failed to create offscreen document:', error);
    } finally {
      this.creatingOffscreenDocument = null;
    }
  }
}
