import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';

describe('EventBus', () => {
  it('phát payload và unsubscribe đúng', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('demo', handler);

    expect(bus.emit('demo', { ok: true })).toBe(1);
    expect(handler).toHaveBeenCalledWith({ ok: true });

    unsubscribe();
    expect(bus.emit('demo')).toBe(0);
  });

  it('once chỉ chạy một lần', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('ready', handler);

    bus.emit('ready');
    bus.emit('ready');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('không chặn listener sau khi một listener lỗi', () => {
    const bus = new EventBus();
    const second = vi.fn();
    bus.on('demo', () => { throw new Error('boom'); });
    bus.on('demo', second);

    expect(() => bus.emit('demo')).toThrow('boom');
    expect(second).toHaveBeenCalledOnce();
  });
});
