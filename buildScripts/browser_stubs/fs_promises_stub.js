function throwFsUnavailable() {
  throw new Error('Node fs/promises is not available in the browser build');
}

export async function mkdir() {
  throwFsUnavailable();
}

export async function writeFile() {
  throwFsUnavailable();
}

export async function readFile() {
  throwFsUnavailable();
}

export async function rm() {
  throwFsUnavailable();
}

export default {
  mkdir,
  writeFile,
  readFile,
  rm,
};
