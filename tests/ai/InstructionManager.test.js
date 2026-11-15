import { describe, expect, it } from 'vitest';
import { InstructionManager } from '../../src/ai/InstructionManager.js';

describe('InstructionManager', () => {
  it('bundle template và thêm rule chỉ phát nội dung nói, không chứa secrets', () => {
    const manager = new InstructionManager();
    const value = manager.build({ personality: 'concise', extra: 'Trả lời bằng ví dụ.' });
    expect(value).toContain('Chỉ tạo nội dung cần nói trực tiếp');
    expect(value).toContain('Trả lời bằng ví dụ.');
    expect(value).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });
});
