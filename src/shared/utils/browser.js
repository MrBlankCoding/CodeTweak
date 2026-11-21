export function isFirefox() {
  try {
    const base = globalThis.chrome?.runtime?.getURL?.('');
    return typeof base === 'string' && base.startsWith('moz-extension://');
  } catch {
    return false;
  }
}

export function isExtensionPageUrl(url) {
  return typeof url === 'string' && /^(chrome|moz)-extension:\/\//i.test(url);
}

export const USER_SCRIPTS_PERMISSION = { permissions: ['userScripts'] };
