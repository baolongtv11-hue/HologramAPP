/** Debounce only query accumulation, never discard a recognized media command at turn end. */
export class VideoCommandScheduler {
  #pending = null;
  #timer = null;
  #execute;
  #latest;
  #onError;
  #delay;

  constructor({ execute, getLatest, onError = () => {}, delay = 240 }) {
    if (typeof execute !== 'function') throw new TypeError('VideoCommandScheduler cần execute.');
    this.#execute = execute;
    this.#latest = getLatest;
    this.#onError = onError;
    this.#delay = delay;
  }

  schedule(command) {
    if (command?.type !== 'video.play') return false;
    this.#pending = command;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), this.#delay);
    return true;
  }

  flush() {
    if (!this.#pending) return false;
    const pending = this.#pending;
    this.#pending = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    const latest = this.#latest?.();
    const command = latest?.type === 'video.play' ? latest : pending;
    try { Promise.resolve(this.#execute(command)).catch(this.#onError); }
    catch (error) { this.#onError(error); }
    return true;
  }

  cancel() {
    this.#pending = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  get pending() { return Boolean(this.#pending); }
}
