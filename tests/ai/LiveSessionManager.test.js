import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { LiveSessionManager } from '../../src/ai/LiveSessionManager.js';

function createHarness() {
  const eventBus = new EventBus();
  let callbacks;
  const session = { close: vi.fn(), sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn() };
  const geminiEngine = {
    connectLive: vi.fn(async (options) => {
      callbacks = options.callbacks;
      callbacks.onopen?.();
      return session;
    }),
  };
  const manager = new LiveSessionManager({ geminiEngine, eventBus });
  return { eventBus, geminiEngine, manager, session, getCallbacks: () => callbacks };
}

describe('LiveSessionManager', () => {
  it('kết nối và phát live:connected', async () => {
    const { eventBus, manager } = createHarness();
    const connected = vi.fn();
    eventBus.on('live:connected', connected);

    await manager.connect({ apiKey: 'k', model: 'gemini-live-test', config: {} });

    expect(manager.connected).toBe(true);
    expect(manager.modelId).toBe('gemini-live-test');
    expect(connected).toHaveBeenCalledWith({ modelId: 'gemini-live-test' });
  });

  it('chuẩn hóa interruption, transcript, audio và turn complete', async () => {
    const { eventBus, manager, getCallbacks } = createHarness();
    const interrupted = vi.fn();
    const interim = vi.fn();
    const input = vi.fn();
    const output = vi.fn();
    const audio = vi.fn();
    const complete = vi.fn();
    eventBus.on('live:interrupted', interrupted);
    eventBus.on('live:interim-input-transcript', interim);
    eventBus.on('live:input-transcript', input);
    eventBus.on('live:output-transcript', output);
    eventBus.on('live:audio', audio);
    eventBus.on('live:turn-complete', complete);

    await manager.connect({ apiKey: 'k', model: 'm', config: {} });
    getCallbacks().onmessage({
      serverContent: {
        interrupted: true,
        interimInputTranscription: { text: 'xin' },
        inputTranscription: { text: 'xin chào' },
        outputTranscription: { text: 'chào bạn' },
        modelTurn: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } }] },
        turnComplete: true,
      },
    });

    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(interim.mock.calls[0][0].text).toBe('xin');
    expect(input.mock.calls[0][0].text).toBe('xin chào');
    expect(output.mock.calls[0][0].text).toBe('chào bạn');
    expect(audio.mock.calls[0][0].data).toBe('AAAA');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('gửi realtime audio qua session hiện hữu', async () => {
    const { manager, session } = createHarness();
    await manager.connect({ apiKey: 'k', model: 'm', config: {} });
    manager.sendRealtimeInput({ audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } });
    expect(session.sendRealtimeInput).toHaveBeenCalledWith({ audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } });
  });


  it('phát tool call và gửi tool response qua Live session', async () => {
    const { eventBus, manager, session, getCallbacks } = createHarness();
    const toolCall = vi.fn();
    eventBus.on('live:tool-call', toolCall);
    await manager.connect({ apiKey: 'k', model: 'm', config: {} });
    getCallbacks().onmessage({ toolCall: { functionCalls: [{ id: '1', name: 'open_video', args: { query: 'hologram' } }] } });
    expect(toolCall.mock.calls[0][0].functionCalls[0].name).toBe('open_video');
    manager.sendToolResponse([{ id: '1', name: 'open_video', response: { ok: true } }]);
    expect(session.sendToolResponse).toHaveBeenCalledWith({ functionResponses: [{ id: '1', name: 'open_video', response: { ok: true } }] });
  });

  it('close dọn session và không giữ resource cũ', async () => {
    const { manager, session } = createHarness();
    await manager.connect({ apiKey: 'k', model: 'm', config: {} });
    manager.close({ reason: 'test' });

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(manager.connected).toBe(false);
    expect(manager.status).toBe('closed');
  });

  it('báo connect-failed khi engine từ chối kết nối', async () => {
    const eventBus = new EventBus();
    const error = new Error('model not supported');
    const geminiEngine = { connectLive: vi.fn().mockRejectedValue(error) };
    const manager = new LiveSessionManager({ geminiEngine, eventBus });
    const failed = vi.fn();
    eventBus.on('live:connect-failed', failed);

    await expect(manager.connect({ apiKey: 'k', model: 'bad-model' })).rejects.toThrow('model not supported');
    expect(failed.mock.calls[0][0].modelId).toBe('bad-model');
    expect(manager.connected).toBe(false);
  });
});

describe('LiveSessionManager concurrency guard', () => {
  it('hai lệnh connect đồng thời dùng cùng một operation', async () => {
    const eventBus = new EventBus();
    let resolveConnect;
    const session = { close: vi.fn(), sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn() };
    const geminiEngine = { connectLive: vi.fn(() => new Promise((resolve) => { resolveConnect = resolve; })) };
    const manager = new LiveSessionManager({ geminiEngine, eventBus });
    const first = manager.connect({ apiKey: 'k', model: 'm' });
    const second = manager.connect({ apiKey: 'k', model: 'm' });
    expect(geminiEngine.connectLive).toHaveBeenCalledTimes(1);
    resolveConnect(session);
    await expect(first).resolves.toBe(session);
    await expect(second).resolves.toBe(session);
  });
});

describe('LiveSessionManager lifecycle regressions', () => {
  it('generationComplete must NOT emit logical turnComplete', async () => {
    const { eventBus, manager, getCallbacks } = createHarness();
    const generation = vi.fn(), turn = vi.fn();
    eventBus.on('live:generation-complete', generation);
    eventBus.on('live:turn-complete', turn);
    await manager.connect({ apiKey: 'k', model: 'm' });
    getCallbacks().onmessage({ serverContent: { generationComplete: true } });
    expect(generation).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
    getCallbacks().onmessage({ serverContent: { turnComplete: true } });
    expect(turn).toHaveBeenCalledTimes(1);
  });

  it('early onclose invalidates a session that resolves afterward', async () => {
    const bus = new EventBus();
    let callbacks, resolveConnect;
    const staleSession = { close: vi.fn() };
    const engine = { connectLive: vi.fn(({ callbacks: cb }) => {
      callbacks = cb;
      return new Promise((resolve) => { resolveConnect = resolve; });
    }) };
    const manager = new LiveSessionManager({ geminiEngine: engine, eventBus: bus });
    const pending = manager.connect({ apiKey: 'k', model: 'm' });
    callbacks.onclose({ code: 1006, reason: 'before-ready' });
    resolveConnect(staleSession);
    expect(await pending).toBe(null);
    expect(staleSession.close).toHaveBeenCalledTimes(1);
    expect(manager.connected).toBe(false);
    expect(manager.connecting).toBe(false);
  });
});
