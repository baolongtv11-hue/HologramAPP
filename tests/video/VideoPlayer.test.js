import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from '../../src/video/VideoPlayer.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('VideoPlayer pending IFrame cancellation', () => {
  it('must not create a player after Stop while script is still loading', async () => {
    const node = { className: 'video-player', parentElement: { prepend: vi.fn() } };
    const fakeWindow = { setTimeout, clearTimeout, location: { origin: 'https://site.example', href: 'https://site.example/' } };
    const fakeDocument = {
      getElementById: vi.fn(() => node), querySelector: vi.fn(() => null),
      createElement: vi.fn(() => ({ dataset: {} })), head: { append: vi.fn() },
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('YT', undefined);
    const player = new VideoPlayer({ containerId: 'yt-player' });
    const pending = player.play({ videoId: 'abc' });
    player.stop();
    const constructor = vi.fn();
    vi.stubGlobal('YT', { Player: constructor });
    fakeWindow.onYouTubeIframeAPIReady();
    expect(await pending).toBe(false);
    expect(constructor).not.toHaveBeenCalled();
  });
});

describe('VideoPlayer player-not-yet-ready', () => {
  it('keeps the newest requested video until the first onReady callback', async () => {
    const node = { className: 'video-player', parentElement: { prepend: vi.fn() } };
    vi.stubGlobal('window', { location: { origin: 'https://site.example', href: 'https://site.example/' } });
    vi.stubGlobal('document', { getElementById: () => node });
    let events;
    const stub = { loadVideoById: vi.fn(), playVideo: vi.fn(), stopVideo: vi.fn() };
    function Player(_id, options) { events = options.events; return stub; }
    vi.stubGlobal('YT', { Player, PlayerState: { ENDED: 0 } });
    const player = new VideoPlayer({ containerId: 'yt-player' });
    expect(await player.play({ videoId: 'first' })).toBe(true);
    expect(await player.play({ videoId: 'second' })).toBe(true);
    expect(stub.loadVideoById).not.toHaveBeenCalled();
    events.onReady({ target: stub });
    expect(stub.loadVideoById).toHaveBeenCalledWith({ videoId: 'second' });
    player.stop();
    stub.loadVideoById.mockClear();
    events.onReady({ target: stub });
    expect(stub.loadVideoById).not.toHaveBeenCalled();
  });
});
