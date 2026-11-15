import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine.js';

function harness() {
  const track = { stop: vi.fn(), enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: 'running', destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    resume: vi.fn(), close: vi.fn().mockResolvedValue(undefined), setSinkId: vi.fn().mockResolvedValue(undefined),
    createMediaStreamSource: vi.fn(() => source), createGain: vi.fn(() => gain),
  };
  class FakeAudioContext { constructor() { return context; } }
  class FakeWorkletNode { constructor() { this.port = { onmessage: null }; this.connect = vi.fn(); this.disconnect = vi.fn(); } }
  return { track, stream, source, gain, context, FakeAudioContext, FakeWorkletNode };
}

describe('AudioEngine', () => {
  it('load worklet, nối graph và cleanup track', async () => {
    const h = harness();
    const engine = new AudioEngine({ AudioContextClass: h.FakeAudioContext, AudioWorkletNodeClass: h.FakeWorkletNode, workletUrl: '/workers/audio-processor.js' });
    await engine.startCapture(h.stream, vi.fn());
    expect(h.context.audioWorklet.addModule).toHaveBeenCalledWith('/workers/audio-processor.js');
    expect(h.gain.gain.value).toBe(0);
    expect(engine.capturing).toBe(true);
    engine.stopCapture();
    expect(h.track.stop).toHaveBeenCalledTimes(1);
    expect(engine.capturing).toBe(false);
  });

  it('mute/unmute thay đổi MediaStreamTrack.enabled mà không stop capture', async () => {
    const h = harness();
    const engine = new AudioEngine({ AudioContextClass: h.FakeAudioContext, AudioWorkletNodeClass: h.FakeWorkletNode, workletUrl: '/workers/audio-processor.js' });
    await engine.startCapture(h.stream, vi.fn());
    expect(engine.setMuted(true)).toBe(true);
    expect(h.track.enabled).toBe(false);
    expect(engine.capturing).toBe(true);
    engine.setMuted(false);
    expect(h.track.enabled).toBe(true);
  });

  it('setOutputDevice dùng AudioContext.setSinkId khi có hỗ trợ', async () => {
    const h = harness();
    const engine = new AudioEngine({ AudioContextClass: h.FakeAudioContext, AudioWorkletNodeClass: h.FakeWorkletNode, workletUrl: '/workers/audio-processor.js' });
    expect(await engine.setOutputDevice('speaker-2')).toBe(true);
    expect(h.context.setSinkId).toHaveBeenCalledWith('speaker-2');
  });
});
