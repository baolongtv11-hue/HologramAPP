import { describe, expect, it, vi } from 'vitest';
import { AppState } from '../../src/core/AppState.js';

describe('AppState', () => {
  it('khởi tạo với state mặc định và patch hợp lệ', () => {
    const state = new AppState();
    expect(state.get('status')).toBe('idle');

    state.update({ connected: true, status: 'listening' });
    expect(state.getSnapshot()).toMatchObject({ connected: true, status: 'listening' });
  });

  it('thông báo subscriber khi state thay đổi', () => {
    const state = new AppState();
    const subscriber = vi.fn();
    state.subscribe(subscriber);

    state.update({ micActive: true });
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls[0][0].micActive).toBe(true);
    expect(subscriber.mock.calls[0][1].micActive).toBe(false);
  });

  it('từ chối key không thuộc app state', () => {
    const state = new AppState();
    expect(() => state.update({ audioContext: {} })).toThrow(/không hỗ trợ key/i);
  });
});
