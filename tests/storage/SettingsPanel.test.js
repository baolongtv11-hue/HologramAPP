import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { SettingsPanel } from '../../src/ui/SettingsPanel.js';

describe('Settings UI - Disable transitions', () => {
  it('renders a real checkbox and saves its boolean value', () => {
    const doc = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8')).window.document;
    const root = doc.querySelector('#settings-panel');
    const panel = new SettingsPanel({ root });
    const checkbox = root.querySelector('[data-disable-transitions]');
    expect(checkbox.type).toBe('checkbox');
    panel.setPreferences({ disableTransitions: true });
    expect(checkbox.checked).toBe(true);
    expect(panel.getPreferences().disableTransitions).toBe(true);
    panel.setPreferences({ disableTransitions: false });
    expect(panel.getPreferences().disableTransitions).toBe(false);
  });
});
