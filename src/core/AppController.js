/**
 * Điều phối lifecycle cấp cao của ứng dụng.
 * Feature logic (Gemini, audio, video, visual) sẽ được đưa vào module riêng
 * ở các phase tương ứng, không đặt tại đây.
 */
export class AppController {
  #appState;
  #eventBus;
  #stateMachine;
  #errorHandler;
  #initialized = false;
  #unsubscribers = [];
  #onWindowError;
  #onUnhandledRejection;

  /**
   * @param {{
   *   appState: import('./AppState.js').AppState,
   *   eventBus: import('./EventBus.js').EventBus,
   *   stateMachine: import('./StateMachine.js').StateMachine,
   *   errorHandler: import('./ErrorHandler.js').ErrorHandler,
   * }} dependencies
   */
  constructor({ appState, eventBus, stateMachine, errorHandler }) {
    if (!appState || !eventBus || !stateMachine || !errorHandler) {
      throw new Error('AppController thiếu dependency bắt buộc.');
    }
    this.#appState = appState;
    this.#eventBus = eventBus;
    this.#stateMachine = stateMachine;
    this.#errorHandler = errorHandler;

    this.#onWindowError = (event) => {
      this.#errorHandler.report(event?.error ?? event?.message ?? event, {
        source: 'window.error',
      });
    };
    this.#onUnhandledRejection = (event) => {
      this.#errorHandler.report(event?.reason ?? event, {
        source: 'unhandledrejection',
      });
    };
  }

  get initialized() {
    return this.#initialized;
  }

  init() {
    if (this.#initialized) return;

    this.#unsubscribers.push(
      this.#eventBus.on('state:changed', ({ state }) => {
        this.#appState.update({ status: state });
      }),
      this.#eventBus.on('app:error', (error) => {
        this.#appState.update({ lastError: error });
        // Recoverable feature errors (video search, model discovery, autoplay...)
        // must not poison a healthy Live conversation. Only explicitly fatal
        // errors own the global error state.
        if (error?.fatal && this.#stateMachine.current !== 'error' && this.#stateMachine.canTransition('error')) {
          this.#stateMachine.transition('error', { source: error.source });
        }
      }),
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('error', this.#onWindowError);
      window.addEventListener('unhandledrejection', this.#onUnhandledRejection);
    }

    this.#initialized = true;
    this.#appState.update({
      initialized: true,
      status: this.#stateMachine.current,
    });
    this.#eventBus.emit('app:initialized', this.#appState.getSnapshot());
  }

  /**
   * API cấp cao duy nhất để feature modules yêu cầu thay đổi lifecycle state.
   * @param {string} nextState
   * @param {unknown} [meta]
   */
  transitionTo(nextState, meta = null) {
    return this.#stateMachine.transition(nextState, meta);
  }

  dispose() {
    if (!this.#initialized) return;

    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this.#onWindowError);
      window.removeEventListener('unhandledrejection', this.#onUnhandledRejection);
    }

    this.#initialized = false;
    this.#appState.update({ initialized: false });
    this.#eventBus.emit('app:disposed');
  }
}
