import { describe, expect, it } from 'vitest';
import { rmsFromPcm16Buffer } from '../../src/audio/pcm.js';

describe('PCM level observer', () => {
  it('không giả lập amplitude và trả 0 cho silence', () => {
    expect(rmsFromPcm16Buffer(new Int16Array([0, 0, 0, 0]).buffer)).toBe(0);
  });
  it('trả level lớn hơn 0 cho PCM thật', () => {
    const level = rmsFromPcm16Buffer(new Int16Array([12000, -12000, 8000, -8000]).buffer);
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);
  });
});
