import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoCommandScheduler } from '../../src/commands/VideoCommandScheduler.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('VideoCommandScheduler P0 regression', () => {
  it('flush on turnComplete executes the recognized command exactly once', async () => {
    const execute = vi.fn(async () => true);
    let transcript = { type: 'video.play', query: 'hologram chi tiet' };
    const scheduler = new VideoCommandScheduler({ execute, getLatest: () => transcript });
    scheduler.schedule({ type: 'video.play', query: 'hologram' });
    expect(scheduler.flush()).toBe(true);
    transcript = null; // turn cleanup clears transcript, but action is already dispatched
    await vi.advanceTimersByTimeAsync(500);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: 'video.play', query: 'hologram chi tiet' });
  });

  it('debounces intermediate query fragments without losing the last one', async () => {
    const execute = vi.fn(async () => true);
    let latest = { type: 'video.play', query: 'he mat troi' };
    const scheduler = new VideoCommandScheduler({ execute, getLatest: () => latest });
    scheduler.schedule({ type: 'video.play', query: 'he mat' });
    await vi.advanceTimersByTimeAsync(100);
    scheduler.schedule({ type: 'video.play', query: 'he mat troi' });
    await vi.advanceTimersByTimeAsync(239);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('Stop cancels the pending delayed Play', async () => {
    const execute = vi.fn();
    const scheduler = new VideoCommandScheduler({ execute });
    scheduler.schedule({ type: 'video.play', query: 'demo' });
    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(execute).not.toHaveBeenCalled();
    expect(scheduler.flush()).toBe(false);
  });
});
