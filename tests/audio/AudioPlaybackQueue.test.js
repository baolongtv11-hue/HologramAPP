import { describe, expect, it, vi } from 'vitest';
import { AudioPlaybackQueue } from '../../src/audio/AudioPlaybackQueue.js';

function makeContext() {
  const sources = [];
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), context: null };
  const context = {
    currentTime: 1,
    destination: {},
    createGain: vi.fn(() => { gain.context = context; return gain; }),
    createBuffer: vi.fn((channels, sampleCount, rate) => {
      const channel = new Float32Array(sampleCount);
      return { duration: sampleCount / rate, getChannelData: () => channel };
    }),
    createBufferSource: vi.fn(() => {
      const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, buffer: null };
      sources.push(source);
      return source;
    }),
  };
  return { context, sources, gain };
}

describe('AudioPlaybackQueue', () => {
  it('xếp PCM tuần tự bằng nextPlaybackTime', async () => {
    const { context, sources } = makeContext();
    const queue = new AudioPlaybackQueue({ contextProvider: async () => context });
    const pcm = btoa(String.fromCharCode(0, 0, 0, 0));
    await queue.enqueueBase64Pcm(pcm, { sampleRate: 2 });
    await queue.enqueueBase64Pcm(pcm, { sampleRate: 2 });
    expect(sources[0].start).toHaveBeenCalledWith(1.025);
    expect(sources[1].start).toHaveBeenCalledWith(2.025);
    expect(queue.nextPlaybackTime).toBeCloseTo(3.025);
  });

  it('cancel dừng source đang hoạt động và reset queue', async () => {
    const { context, sources } = makeContext();
    const queue = new AudioPlaybackQueue({ contextProvider: async () => context });
    await queue.enqueueBase64Pcm(btoa(String.fromCharCode(0, 0)), { sampleRate: 1 });
    queue.cancel();
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(queue.activeSourceCount).toBe(0);
    expect(queue.nextPlaybackTime).toBe(0);
  });

  it('chỉ báo drained sau turn complete và source cuối kết thúc', async () => {
    const { context, sources } = makeContext();
    const drained = vi.fn();
    const queue = new AudioPlaybackQueue({ contextProvider: async () => context, onDrained: drained });
    await queue.enqueueBase64Pcm(btoa(String.fromCharCode(0, 0)), { sampleRate: 1 });
    queue.markTurnFinished();
    expect(drained).not.toHaveBeenCalled();
    sources[0].onended();
    expect(drained).toHaveBeenCalledTimes(1);
  });

  it('volume và mute dùng GainNode nhưng không thay đổi queue scheduling', async () => {
    const { context, gain } = makeContext();
    const queue = new AudioPlaybackQueue({ contextProvider: async () => context });
    queue.setVolume(.4);
    await queue.enqueueBase64Pcm(btoa(String.fromCharCode(0, 0)), { sampleRate: 1 });
    expect(gain.gain.value).toBe(.4);
    queue.setMuted(true);
    expect(gain.gain.value).toBe(0);
    queue.setMuted(false);
    expect(gain.gain.value).toBe(.4);
  });
});
