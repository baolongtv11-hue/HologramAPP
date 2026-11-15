const DEFAULT_OUTPUT_RATE = 24_000;

function decodeBase64Pcm16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Phát PCM16 tuần tự. Giữ nguyên nextPlaybackTime + active source Set,
 * bổ sung GainNode duy nhất để điều khiển volume/mute mà không phá queue.
 */
export class AudioPlaybackQueue {
  #contextProvider;
  #activeSources = new Set();
  #nextPlaybackTime = 0;
  #turnFinished = false;
  #onDrained;
  #outputGain = null;
  #volume = 1;
  #muted = false;

  constructor({ contextProvider, onDrained = () => {} } = {}) {
    if (typeof contextProvider !== 'function') throw new TypeError('AudioPlaybackQueue cần contextProvider.');
    if (typeof onDrained !== 'function') throw new TypeError('AudioPlaybackQueue onDrained phải là function.');
    this.#contextProvider = contextProvider;
    this.#onDrained = onDrained;
  }

  get nextPlaybackTime() { return this.#nextPlaybackTime; }
  get activeSourceCount() { return this.#activeSources.size; }
  get isPlaying() { return this.#activeSources.size > 0; }
  get volume() { return this.#volume; }
  get muted() { return this.#muted; }

  async #ensureOutputGain(context) {
    if (this.#outputGain?.context === context) return this.#outputGain;
    try { this.#outputGain?.disconnect?.(); } catch { /* already disconnected */ }
    this.#outputGain = context.createGain();
    this.#outputGain.connect(context.destination);
    this.#applyGain();
    return this.#outputGain;
  }

  #applyGain() {
    if (!this.#outputGain) return;
    this.#outputGain.gain.value = this.#muted ? 0 : this.#volume;
  }

  setVolume(value) {
    const numeric = Number(value);
    this.#volume = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 1;
    this.#applyGain();
    return this.#volume;
  }

  setMuted(muted) {
    this.#muted = Boolean(muted);
    this.#applyGain();
    return this.#muted;
  }

  toggleMuted() { return this.setMuted(!this.#muted); }

  async enqueueBase64Pcm(base64, { sampleRate = DEFAULT_OUTPUT_RATE } = {}) {
    if (!base64) return null;
    const context = await this.#contextProvider();
    const outputGain = await this.#ensureOutputGain(context);
    const bytes = decodeBase64Pcm16(base64);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (!sampleCount) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const buffer = context.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(outputGain);
    const startAt = Math.max(context.currentTime + 0.025, this.#nextPlaybackTime || 0);
    source.start(startAt);
    this.#nextPlaybackTime = startAt + buffer.duration;
    this.#activeSources.add(source);

    source.onended = () => {
      this.#activeSources.delete(source);
      try { source.disconnect(); } catch { /* already disconnected */ }
      if (this.#turnFinished && this.#activeSources.size === 0) {
        this.#turnFinished = false;
        this.#onDrained();
      }
    };
    return source;
  }

  markTurnFinished() {
    this.#turnFinished = true;
    if (this.#activeSources.size === 0) {
      this.#turnFinished = false;
      this.#onDrained();
    }
  }

  cancel() {
    for (const source of this.#activeSources) {
      try { source.stop(); } catch { /* source may not have started */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    this.#activeSources.clear();
    this.#nextPlaybackTime = 0;
    this.#turnFinished = false;
  }

  dispose() {
    this.cancel();
    try { this.#outputGain?.disconnect?.(); } catch { /* already disconnected */ }
    this.#outputGain = null;
    this.#onDrained = () => {};
  }
}

export { DEFAULT_OUTPUT_RATE, decodeBase64Pcm16 };
