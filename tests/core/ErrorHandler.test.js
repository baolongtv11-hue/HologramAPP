import { describe, expect, it, vi } from 'vitest';
import { ErrorHandler } from '../../src/core/ErrorHandler.js';
import { EventBus } from '../../src/core/EventBus.js';

describe('ErrorHandler', () => {
  it('chuẩn hóa lỗi microphone permission', () => {
    const handler = new ErrorHandler({ logger: { error: vi.fn(), warn: vi.fn() } });
    const error = handler.normalize(new Error('NotAllowedError: Permission denied'), { source: 'audio' });
    expect(error.code).toBe('MIC_PERMISSION_DENIED');
    expect(error.message).toMatch(/quyền microphone/i);
  });

  it('không nhầm lỗi YouTube key thành Gemini key', () => {
    const handler = new ErrorHandler({ logger: { error: vi.fn(), warn: vi.fn() } });
    const youtube = handler.normalize(new Error('API key not valid'), { source: 'video-search' });
    const gemini = handler.normalize(new Error('API key not valid'), { source: 'live-connect' });
    expect(youtube.code).toBe('YOUTUBE_AUTH_ERROR');
    expect(gemini.code).toBe('GEMINI_AUTH_ERROR');
  });

  it('phát app:error mà không phụ thuộc UI', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('app:error', listener);
    const handler = new ErrorHandler({ eventBus: bus, logger: { error: vi.fn(), warn: vi.fn() } });
    handler.report(new Error('boom'), { source: 'test' });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ code: 'APP_ERROR', source: 'test', message: 'boom', fatal: false });
  });
});
