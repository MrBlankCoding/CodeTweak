export function readFileSync() {
  throw new Error('Node fs is not available in the browser build');
}

export function existsSync() {
  return false;
}

export default {
  readFileSync,
  existsSync,
};
