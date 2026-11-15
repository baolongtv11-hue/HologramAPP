import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { StateMachine } from '../../src/core/StateMachine.js';

describe('StateMachine', () => {
  it('cho phép lifecycle hợp lệ', () => {
    const machine = new StateMachine();
    machine.transition('connecting');
    machine.transition('listening');
    machine.transition('thinking');
    machine.transition('speaking');
    machine.transition('listening');
    expect(machine.current).toBe('listening');
  });

  it('cho phép bật lại microphone từ idle khi Live session đã tồn tại', () => {
    const machine = new StateMachine();
    machine.transition('listening');
    expect(machine.current).toBe('listening');
  });

  it('cho phép AI hoàn tất câu trả lời khi microphone đã tắt', () => {
    const machine = new StateMachine();
    machine.transition('speaking');
    expect(machine.current).toBe('speaking');
  });

  it('chặn transition không hợp lệ', () => {
    const machine = new StateMachine();
    expect(() => machine.transition('thinking')).toThrow(/không hợp lệ/i);
    expect(machine.current).toBe('idle');
  });

  it('phát state:changed qua EventBus', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('state:changed', listener);
    const machine = new StateMachine({ eventBus: bus });

    machine.transition('connecting', { reason: 'test' });
    expect(listener).toHaveBeenCalledWith({
      previousState: 'idle',
      state: 'connecting',
      meta: { reason: 'test' },
    });
  });
});
