import { describe, expect, it } from 'vitest';
import { CommandEngine } from '../../src/commands/CommandEngine.js';

describe('CommandEngine', () => {
  const commands = new CommandEngine();

  it('map lệnh video cục bộ, không phụ thuộc AI', () => {
    expect(commands.recognize('mở video về hệ mặt trời')).toEqual(expect.objectContaining({ type: 'video.play', query: 'hệ mặt trời' }));
    expect(commands.recognize('tìm kiếm video hologram')).toEqual(expect.objectContaining({ type: 'video.play', query: 'hologram' }));
    expect(commands.recognize('phat video hologram')).toEqual(expect.objectContaining({ type: 'video.play', query: 'hologram' }));
    expect(commands.recognize('mo youtube ve tri tue nhan tao')).toEqual(expect.objectContaining({ type: 'video.play', query: 'tri tue nhan tao' }));
    expect(commands.recognize('tắt video')).toEqual(expect.objectContaining({ type: 'video.stop' }));
    expect(commands.recognize('dừng phát video')).toEqual(expect.objectContaining({ type: 'video.stop' }));
    expect(commands.recognize('tạm dừng video')).toEqual(expect.objectContaining({ type: 'video.pause' }));
    expect(commands.recognize('tiếp tục video')).toEqual(expect.objectContaining({ type: 'video.resume' }));
  });

  it('nhận diện intent media sớm từ transcript tạm thời', () => {
    expect(commands.hasMediaIntent('mở video')).toBe(true);
    expect(commands.hasMediaIntent('tìm kiếm video')).toBe(true);
    expect(commands.hasMediaIntent('giải thích video là gì')).toBe(false);
  });

  it('hỗ trợ câu rút gọn theo trạng thái videoActive', () => {
    expect(commands.recognize('tắt nó đi', { videoActive: true })).toEqual(expect.objectContaining({ type: 'video.stop' }));
    expect(commands.recognize('tắt nó đi', { videoActive: false })).toBeNull();
  });

  it('không bắt nhầm câu hội thoại thường', () => {
    expect(commands.recognize('giải thích hệ mặt trời')).toBeNull();
  });
});
