import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  let logger;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete globalThis.__CODETWEAK_LOG_FLAGS__;
  });

  async function loadLogger(flags) {
    if (flags !== undefined) {
      globalThis.__CODETWEAK_LOG_FLAGS__ = flags;
    }
    const mod = await import('../../src/shared/utils/logger.js');
    return mod.default;
  }

  it('returns default logger with warn and error enabled', async () => {
    logger = await loadLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('w');
    logger.error('e');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('does not log debug or info by default', async () => {
    logger = await loadLogger();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.debug('d');
    logger.info('i');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('enables debug and info when global flags set', async () => {
    logger = await loadLogger({ debug: true, info: true });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.debug('d');
    logger.info('i');
    expect(debugSpy).toHaveBeenCalledOnce();
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('disables warn and error when flags set to false', async () => {
    logger = await loadLogger({ warn: false, error: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('w');
    logger.error('e');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('creates a scoped logger with prefix', async () => {
    logger = await loadLogger({ debug: true });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('msg');
    expect(debugSpy).toHaveBeenCalledWith('[CodeTweak]', 'msg');
  });

  it('uses scoped prefix when scope provided', async () => {
    const mod = await import('../../src/shared/utils/logger.js');
    const scopedLogger = mod.default;
    expect(typeof scopedLogger.debug).toBe('function');
  });

  it('handles non-object flags gracefully', async () => {
    logger = await loadLogger('invalid');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('msg');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('handles undefined flags', async () => {
    logger = await loadLogger(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('msg');
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
