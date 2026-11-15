import { describe, expect, it } from 'vitest';
import { TextSyncEngine, longestTokenOverlap } from '../../src/audio/TextSyncEngine.js';

describe('TextSyncEngine', () => {
  it('ghép transcript cumulative/streaming không lặp chữ', () => {
    const sync = new TextSyncEngine();
    expect(sync.mergeOutput('Xin chào')).toBe('Xin chào');
    expect(sync.mergeOutput('Xin chào bạn')).toBe('Xin chào bạn');
    expect(sync.mergeOutput('bạn')).toBe('Xin chào bạn');
  });

  it('ghép longest suffix/prefix overlap theo từ', () => {
    const sync = new TextSyncEngine();
    expect(sync.mergeInput('cho tôi xem')).toBe('cho tôi xem');
    expect(sync.mergeInput('xem video hologram')).toBe('cho tôi xem video hologram');
    expect(sync.mergeInput('video hologram đẹp')).toBe('cho tôi xem video hologram đẹp');
    expect(longestTokenOverlap('mở video về', 'video về trí tuệ nhân tạo')).toBe(2);
  });

  it('giới hạn tối đa 4 từ mỗi dòng', () => {
    const sync = new TextSyncEngine();
    expect(sync.formatLines('một hai ba bốn năm sáu bảy tám chín')).toEqual(['một hai ba bốn','năm sáu bảy tám','chín']);
  });
});
