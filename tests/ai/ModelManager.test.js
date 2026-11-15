import { describe, expect, it, vi } from 'vitest';
import { ModelManager } from '../../src/ai/ModelManager.js';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('ModelManager', () => {
  it('phân trang và gom model', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        models: [{ name: 'models/gemini-live-a', displayName: 'Live A', description: 'Realtime Live model', supportedGenerationMethods: [] }],
        nextPageToken: 'page-2',
      }))
      .mockResolvedValueOnce(response({
        models: [{ name: 'models/gemini-text-b', displayName: 'Text B', supportedGenerationMethods: ['generateContent'] }],
      }));

    const manager = new ModelManager({ fetchImpl, pageSize: 50 });
    const catalog = await manager.discover({ apiKey: 'test-key' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('pageToken=page-2');
    expect(catalog.live).toHaveLength(1);
    expect(catalog.text).toHaveLength(1);
    expect(catalog.live[0].live.status).toBe('unverified');
  });

  it('xác minh live khi metadata công bố BidiGenerateContent', async () => {
    const manager = new ModelManager({
      fetchImpl: vi.fn().mockResolvedValue(response({
        models: [{ name: 'models/live-x', displayName: 'Live X', supportedGenerationMethods: ['BidiGenerateContent'] }],
      })),
    });
    const catalog = await manager.discover({ apiKey: 'k' });
    expect(catalog.live[0].live.status).toBe('verified');
  });

  it('không giả định text model là Live', async () => {
    const manager = new ModelManager({
      fetchImpl: vi.fn().mockResolvedValue(response({
        models: [{ name: 'models/gemini-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] }],
      })),
    });
    const catalog = await manager.discover({ apiKey: 'k' });
    expect(catalog.live).toHaveLength(0);
    expect(catalog.text[0].live.status).toBe('unsupported');
  });

  it('giải thích fallback khi model đã chọn biến mất', async () => {
    const manager = new ModelManager({
      fallbackModel: 'gemini-3.8-live',
      fetchImpl: vi.fn().mockResolvedValue(response({
        models: [{ name: 'models/gemini-3.8-live', displayName: 'Gemini 3.8 Live', description: 'Live realtime audio model' }],
      })),
    });
    await manager.discover({ apiKey: 'k' });
    const resolution = manager.resolveLiveSelection('old-live-model');
    expect(resolution.model.id).toBe('gemini-3.8-live');
    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.reason).toContain('old-live-model');
  });

  it('báo API error rõ ràng', async () => {
    const manager = new ModelManager({
      fetchImpl: vi.fn().mockResolvedValue(response({ error: { message: 'Invalid API key' } }, { ok: false, status: 403 })),
    });
    await expect(manager.discover({ apiKey: 'bad' })).rejects.toThrow('Invalid API key');
  });
});
