const DEFAULT_STATE = Object.freeze({
  status: 'idle',
  initialized: false,
  micActive: false,
  micMuted: false,
  audioMuted: false,
  connected: false,
  videoActive: false,
  mirrorMode: 'vertical',
  orientation: 'unknown',
  selectedModel: null,
  modelCatalogLoaded: false,
  modelCount: 0,
  liveModelCount: 0,
  lastError: null,
});

/**
 * Kho state ứng dụng mức cao.
 * Resource nội bộ như AudioContext, MediaStream, Gemini session hoặc player
 * không được lưu tại đây; chúng thuộc quyền sở hữu của module tương ứng.
 */
export class AppState {
  #state;
  #subscribers = new Set();

  /** @param {Partial<typeof DEFAULT_STATE>} [initialState] */
  constructor(initialState = {}) {
    this.#state = { ...DEFAULT_STATE, ...initialState };
  }

  /** @returns {Readonly<typeof DEFAULT_STATE>} */
  getSnapshot() {
    return Object.freeze({ ...this.#state });
  }

  /** @param {keyof typeof DEFAULT_STATE} key */
  get(key) {
    return this.#state[key];
  }

  /**
   * @param {Partial<typeof DEFAULT_STATE>} patch
   * @returns {Readonly<typeof DEFAULT_STATE>}
   */
  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('AppState.update cần một object patch.');
    }

    const allowedKeys = new Set(Object.keys(DEFAULT_STATE));
    for (const key of Object.keys(patch)) {
      if (!allowedKeys.has(key)) {
        throw new Error(`AppState không hỗ trợ key "${key}".`);
      }
    }

    const previous = this.getSnapshot();
    const next = { ...this.#state, ...patch };
    const changed = Object.keys(patch).some((key) => !Object.is(previous[key], next[key]));
    if (!changed) return this.getSnapshot();

    this.#state = next;
    const snapshot = this.getSnapshot();
    for (const subscriber of [...this.#subscribers]) {
      subscriber(snapshot, previous);
    }
    return snapshot;
  }

  /**
   * @param {(next: Readonly<typeof DEFAULT_STATE>, previous: Readonly<typeof DEFAULT_STATE>) => void} subscriber
   * @returns {() => void}
   */
  subscribe(subscriber) {
    if (typeof subscriber !== 'function') {
      throw new TypeError('AppState subscriber phải là một function.');
    }
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  reset() {
    const previous = this.getSnapshot();
    this.#state = { ...DEFAULT_STATE };
    const snapshot = this.getSnapshot();
    for (const subscriber of [...this.#subscribers]) subscriber(snapshot, previous);
    return snapshot;
  }

  clearSubscribers() {
    this.#subscribers.clear();
  }
}

export { DEFAULT_STATE };
