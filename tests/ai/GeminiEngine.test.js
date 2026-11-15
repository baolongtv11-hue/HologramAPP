import { describe, expect, it, vi } from 'vitest';
import { GeminiEngine } from '../../src/ai/GeminiEngine.js';

describe('GeminiEngine', () => {
  it('tạo cấu hình Live audio + transcription + video tools, giữ VAD mặc định ổn định', () => {
    const engine = new GeminiEngine({ clientFactory: () => ({}) });
    const config = engine.createLiveConfig();
    expect(config.responseModalities).toHaveLength(1);
    expect(config.inputAudioTranscription).toEqual({});
    expect(config.outputAudioTranscription).toEqual({});
    expect(config.realtimeInputConfig.automaticActivityDetection).toEqual({ disabled: false });
    const names = config.tools?.[0]?.functionDeclarations?.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['open_video', 'stop_video', 'pause_video', 'resume_video']));
  });

  it('kết nối qua SDK client mà không sở hữu session lifecycle', async () => {
    const connect = vi.fn().mockResolvedValue({ close: vi.fn() });
    const engine = new GeminiEngine({ clientFactory: () => ({ live: { connect } }) });
    const callbacks = { onmessage: vi.fn() };
    await engine.connectLive({ apiKey: 'key', model: 'models/live-x', config: { responseModalities: ['AUDIO'] }, callbacks });
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ model: 'live-x', callbacks }));
  });
});
