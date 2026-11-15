import { describe, expect, it } from 'vitest';
import { StorageManager } from '../../src/storage/StorageManager.js';
function mockStore() { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: (k) => data.delete(k) }; }
describe('Light transitions preference', () => {
  it('defaults to OFF to preserve v0.8.3 visuals; persists deliberate choice', () => {
    const sessionStorage = mockStore(), localStorage = mockStore();
    let storage = new StorageManager({ sessionStorage, localStorage });
    expect(storage.getDisableTransitions()).toBe(false);
    storage.setDisableTransitions(true);
    storage = new StorageManager({ sessionStorage, localStorage });
    expect(storage.getDisableTransitions()).toBe(true);
    storage.setDisableTransitions(false);
    expect(storage.getDisableTransitions()).toBe(false);
  });
});
