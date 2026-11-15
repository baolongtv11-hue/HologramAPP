export const AUDIO_INPUT_RATE = 16_000;
export const AUDIO_CHUNK_SIZE = 2048;

/**
 * Sở hữu AudioContext + microphone graph. PCM resampling chạy trong AudioWorklet,
 * không chạy trên main thread.
 */
export class AudioEngine {
  #AudioContextClass;
  #AudioWorkletNodeClass;
  #workletUrl;
  #context = null;
  #workletReady = null;
  #mediaStream = null;
  #mediaSource = null;
  #captureNode = null;
  #silentGain = null;
  #muted = false;

  constructor({
    AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
    AudioWorkletNodeClass = globalThis.AudioWorkletNode,
    workletUrl = `${import.meta.env.BASE_URL}workers/audio-processor.js`,
  } = {}) {
    this.#AudioContextClass = AudioContextClass;
    this.#AudioWorkletNodeClass = AudioWorkletNodeClass;
    this.#workletUrl = workletUrl;
  }

  get context() { return this.#context; }
  get capturing() { return Boolean(this.#captureNode && this.#mediaStream); }
  get muted() { return this.#muted; }
  get mediaStream() { return this.#mediaStream; }

  isSupported() {
    return Boolean(this.#AudioContextClass && this.#AudioWorkletNodeClass && globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  async ensureContext() {
    if (!this.#AudioContextClass || !this.#AudioWorkletNodeClass) {
      throw new Error('Trình duyệt thiếu AudioContext hoặc AudioWorklet.');
    }
    if (!this.#context || this.#context.state === 'closed') {
      this.#context = new this.#AudioContextClass({ latencyHint: 'interactive' });
      this.#workletReady = null;
    }
    if (this.#context.state !== 'running') await this.#context.resume();
    if (!this.#workletReady) this.#workletReady = this.#context.audioWorklet.addModule(this.#workletUrl);
    await this.#workletReady;
    return this.#context;
  }

  async resume() {
    if (!this.#context || this.#context.state === 'closed') return false;
    if (this.#context.state !== 'running') await this.#context.resume();
    return this.#context.state === 'running';
  }

  async requestMicrophone({ deviceId = '' } = {}) {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ getUserMedia.');
    const audio = {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return globalThis.navigator.mediaDevices.getUserMedia({ audio, video: false });
  }

  async listDevices() {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const devices = await mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((item) => item.kind === 'audioinput'),
      outputs: devices.filter((item) => item.kind === 'audiooutput'),
    };
  }

  async startCapture(stream, onPcmChunk) {
    if (!stream) throw new Error('Thiếu MediaStream microphone.');
    if (typeof onPcmChunk !== 'function') throw new TypeError('AudioEngine cần callback onPcmChunk.');
    const context = await this.ensureContext();
    this.stopCapture();

    const source = context.createMediaStreamSource(stream);
    const processor = new this.#AudioWorkletNodeClass(context, 'pcm-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { targetRate: AUDIO_INPUT_RATE, chunkSize: AUDIO_CHUNK_SIZE },
    });
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    processor.port.onmessage = (event) => onPcmChunk(event.data);
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    this.#mediaStream = stream;
    this.#mediaSource = source;
    this.#captureNode = processor;
    this.#silentGain = silentGain;
    this.#muted = false;
  }

  setMuted(muted) {
    const next = Boolean(muted);
    if (!this.#mediaStream) {
      this.#muted = next;
      return false;
    }
    for (const track of this.#mediaStream.getAudioTracks()) track.enabled = !next;
    this.#muted = next;
    return true;
  }

  toggleMuted() {
    this.setMuted(!this.#muted);
    return this.#muted;
  }

  async setOutputDevice(deviceId) {
    const context = await this.ensureContext();
    if (typeof context.setSinkId !== 'function') return false;
    await context.setSinkId(deviceId || '');
    return true;
  }

  stopCapture() {
    if (this.#captureNode) {
      this.#captureNode.port.onmessage = null;
      try { this.#captureNode.disconnect(); } catch { /* already disconnected */ }
      this.#captureNode = null;
    }
    if (this.#mediaSource) {
      try { this.#mediaSource.disconnect(); } catch { /* already disconnected */ }
      this.#mediaSource = null;
    }
    if (this.#silentGain) {
      try { this.#silentGain.disconnect(); } catch { /* already disconnected */ }
      this.#silentGain = null;
    }
    if (this.#mediaStream) {
      for (const track of this.#mediaStream.getTracks()) track.stop();
      this.#mediaStream = null;
    }
    this.#muted = false;
  }

  async dispose({ closeContext = true } = {}) {
    this.stopCapture();
    if (closeContext && this.#context && this.#context.state !== 'closed') {
      try { await this.#context.close(); } catch { /* context already closing */ }
    }
    this.#context = null;
    this.#workletReady = null;
  }
}
