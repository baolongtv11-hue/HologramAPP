import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoManager, extractVideoQuery } from '../../src/video/VideoManager.js';

afterEach(() => vi.unstubAllGlobals());

describe('VideoManager', () => {
  it('giữ intent video tiếng Việt và nhận cả câu lệnh YouTube', () => {
    expect(extractVideoQuery('hãy mở video về hệ mặt trời')).toBe('hệ mặt trời');
    expect(extractVideoQuery('mở youtube về văn hóa Jrai')).toBe('văn hóa Jrai');
    expect(extractVideoQuery('hôm nay thời tiết thế nào')).toBeNull();
  });

  it('dùng một search request như prototype gốc rồi phát kết quả đầu tiên', async () => {
    const player = { play: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), fullscreen: vi.fn(), dispose: vi.fn() };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: { videoId: 'playable' }, snippet: { title: 'Playable' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const manager = new VideoManager({ player, apiKeyProvider: () => 'key' });
    const video = await manager.searchAndPlay('demo');
    expect(video).toEqual({ videoId: 'playable', title: 'Playable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('videoEmbeddable=true');
    expect(fetchMock.mock.calls[0][0]).toContain('videoSyndicated=true');
    expect(player.play).toHaveBeenCalledWith(video);
  });
});

describe('VideoManager stale playback regressions', () => {
  it('close invalidates a pending player startup and returns no played video', async () => {
    let completePlay;
    const player = {
      play: vi.fn(() => new Promise((resolve) => { completePlay = resolve; })),
      stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(),
    };
    const manager = new VideoManager({ player, apiKeyProvider: () => 'key' });
    const pending = manager.play({ videoId: 'video1' });
    manager.close();
    completePlay(true);
    expect(await pending).toBeNull();
    expect(player.stop).toHaveBeenCalled();
  });
});
