import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../../src/core/AppController.js';
import { AppState } from '../../src/core/AppState.js';
import { ErrorHandler } from '../../src/core/ErrorHandler.js';
import { EventBus } from '../../src/core/EventBus.js';
import { StateMachine } from '../../src/core/StateMachine.js';

function createApp() {
  const eventBus = new EventBus();
  const appState = new AppState();
  const stateMachine = new StateMachine({ eventBus });
  const errorHandler = new ErrorHandler({ eventBus, logger: { error: vi.fn(), warn: vi.fn() } });
  const appController = new AppController({ appState, eventBus, stateMachine, errorHandler });
  return { eventBus, appState, stateMachine, errorHandler, appController };
}

describe('AppController', () => {
  it('khởi tạo idempotent và đồng bộ state machine vào AppState', () => {
    const { appController, appState } = createApp();
    appController.init();
    appController.init();
    expect(appController.initialized).toBe(true);
    expect(appState.get('initialized')).toBe(true);
    appController.transitionTo('connecting');
    expect(appState.get('status')).toBe('connecting');
  });

  it('lưu lỗi recoverable nhưng không làm chết conversation state', () => {
    const { appController, appState, errorHandler } = createApp();
    appController.init();
    errorHandler.report(new Error('video failed'), { source: 'video-search', severity: 'warning' });
    expect(appState.get('status')).toBe('idle');
    expect(appState.get('lastError')).toMatchObject({ source: 'video-search', fatal: false });
  });

  it('chỉ chuyển global state sang error khi lỗi được đánh dấu fatal', () => {
    const { appController, appState, errorHandler } = createApp();
    appController.init();
    errorHandler.report(new Error('fatal boom'), { source: 'unit-test', fatal: true });
    expect(appState.get('status')).toBe('error');
    expect(appState.get('lastError')).toMatchObject({ message: 'fatal boom', fatal: true });
  });

  it('dispose dọn subscription lifecycle', () => {
    const { appController, appState } = createApp();
    appController.init();
    appController.dispose();
    expect(appController.initialized).toBe(false);
    expect(appState.get('initialized')).toBe(false);
  });
});
