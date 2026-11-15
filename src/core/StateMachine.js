export const APP_STATES = Object.freeze([
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'error',
]);

export const DEFAULT_TRANSITIONS = Object.freeze({
  idle: ['connecting', 'listening', 'speaking', 'error'],
  connecting: ['listening', 'idle', 'error'],
  listening: ['thinking', 'speaking', 'idle', 'error'],
  thinking: ['speaking', 'listening', 'idle', 'error'],
  speaking: ['listening', 'idle', 'error'],
  error: ['idle', 'connecting'],
});

/**
 * State machine nhẹ cho lifecycle cấp ứng dụng.
 * Không điều khiển UI và không chứa resource của feature module.
 */
export class StateMachine {
  #state;
  #initialState;
  #transitions;
  #eventBus;

  /**
   * @param {{initialState?: string, transitions?: Record<string, string[]>, eventBus?: import('./EventBus.js').EventBus}} [options]
   */
  constructor({ initialState = 'idle', transitions = DEFAULT_TRANSITIONS, eventBus = null } = {}) {
    if (!transitions[initialState]) {
      throw new Error(`State khởi tạo "${initialState}" không tồn tại trong transition map.`);
    }
    this.#state = initialState;
    this.#initialState = initialState;
    this.#transitions = transitions;
    this.#eventBus = eventBus;
  }

  get current() {
    return this.#state;
  }

  /** @param {string} nextState */
  canTransition(nextState) {
    return (this.#transitions[this.#state] ?? []).includes(nextState);
  }

  /**
   * @param {string} nextState
   * @param {unknown} [meta]
   */
  transition(nextState, meta = null) {
    if (nextState === this.#state) return this.#state;
    if (!this.canTransition(nextState)) {
      const error = new Error(`Transition không hợp lệ: ${this.#state} → ${nextState}`);
      error.name = 'InvalidStateTransitionError';
      throw error;
    }

    const previousState = this.#state;
    this.#state = nextState;
    this.#eventBus?.emit('state:changed', {
      previousState,
      state: nextState,
      meta,
    });
    return this.#state;
  }

  reset(meta = { reason: 'reset' }) {
    const previousState = this.#state;
    this.#state = this.#initialState;
    if (previousState !== this.#state) {
      this.#eventBus?.emit('state:changed', {
        previousState,
        state: this.#state,
        meta,
      });
    }
    return this.#state;
  }
}
