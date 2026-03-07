export class Isolate {
  constructor() {
    throw new Error('isolated-vm is not available in the browser build');
  }
}

export default {
  Isolate,
};
