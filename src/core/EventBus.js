/**
 * Event bus nhỏ gọn cho giao tiếp giữa các module độc lập.
 * Không giữ application state và không phụ thuộc DOM.
 */
export class EventBus {
  #listeners = new Map();

  /**
   * @param {string} eventName
   * @param {(payload: unknown) => void} handler
   * @returns {() => void} hàm unsubscribe
   */
  on(eventName, handler) {
    this.#assertEventName(eventName);
    if (typeof handler !== 'function') {
      throw new TypeError('EventBus handler phải là một function.');
    }

    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(handler);
    this.#listeners.set(eventName, listeners);

    return () => this.off(eventName, handler);
  }

  /**
   * Đăng ký listener chỉ chạy một lần.
   * @param {string} eventName
   * @param {(payload: unknown) => void} handler
   * @returns {() => void}
   */
  once(eventName, handler) {
    let unsubscribe = () => {};
    const wrapped = (payload) => {
      unsubscribe();
      handler(payload);
    };
    unsubscribe = this.on(eventName, wrapped);
    return unsubscribe;
  }

  /**
   * @param {string} eventName
   * @param {(payload: unknown) => void} handler
   * @returns {boolean}
   */
  off(eventName, handler) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return false;

    const deleted = listeners.delete(handler);
    if (listeners.size === 0) this.#listeners.delete(eventName);
    return deleted;
  }

  /**
   * Phát sự kiện đồng bộ. Lỗi của listener được thu thập và ném sau khi
   * tất cả listener còn lại đã có cơ hội chạy.
   * @param {string} eventName
   * @param {unknown} [payload]
   * @returns {number} số listener đã được gọi
   */
  emit(eventName, payload) {
    this.#assertEventName(eventName);
    const listeners = [...(this.#listeners.get(eventName) ?? [])];
    const errors = [];

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `Nhiều listener của "${eventName}" đã phát sinh lỗi.`);
    }

    return listeners.length;
  }

  /**
   * Xóa listeners của một event, hoặc toàn bộ listeners nếu không truyền tên.
   * @param {string} [eventName]
   */
  clear(eventName) {
    if (eventName === undefined) {
      this.#listeners.clear();
      return;
    }
    this.#listeners.delete(eventName);
  }

  /** @param {string} eventName */
  #assertEventName(eventName) {
    if (typeof eventName !== 'string' || eventName.trim() === '') {
      throw new TypeError('EventBus eventName phải là chuỗi không rỗng.');
    }
  }
}
