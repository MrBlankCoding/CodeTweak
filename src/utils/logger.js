const LOGGER_FLAGS_KEY = '__CODETWEAK_LOG_FLAGS__';
const BASE_CONSOLE = globalThis.console;

const DEFAULT_FLAGS = Object.freeze({
  debug: false,
  info: false,
  warn: true,
  error: true,
});

function getGlobalFlags() {
  const flags = globalThis[LOGGER_FLAGS_KEY];
  if (!flags || typeof flags !== 'object') {
    return DEFAULT_FLAGS;
  }

  return {
    ...DEFAULT_FLAGS,
    ...flags,
  };
}

function getEnabled(level) {
  return Boolean(getGlobalFlags()[level]);
}

function formatPrefix(scope) {
  return scope ? `[CodeTweak:${scope}]` : '[CodeTweak]';
}

export function setLogFlags(flags = {}) {
  globalThis[LOGGER_FLAGS_KEY] = {
    ...getGlobalFlags(),
    ...flags,
  };
}

export function resetLogFlags() {
  globalThis[LOGGER_FLAGS_KEY] = { ...DEFAULT_FLAGS };
}

export function getLogFlags() {
  return { ...getGlobalFlags() };
}

export function createLogger(scope = '') {
  const prefix = formatPrefix(scope);

  return {
    debug: (...args) => {
      if (getEnabled('debug') && BASE_CONSOLE?.debug) {
        BASE_CONSOLE.debug(prefix, ...args);
      }
    },
    info: (...args) => {
      if (getEnabled('info') && BASE_CONSOLE?.info) {
        BASE_CONSOLE.info(prefix, ...args);
      }
    },
    warn: (...args) => {
      if (getEnabled('warn') && BASE_CONSOLE?.warn) {
        BASE_CONSOLE.warn(prefix, ...args);
      }
    },
    error: (...args) => {
      if (getEnabled('error') && BASE_CONSOLE?.error) {
        BASE_CONSOLE.error(prefix, ...args);
      }
    },
  };
}

const logger = createLogger();

export default logger;
