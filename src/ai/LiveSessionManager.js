function textOf(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeCloseEvent(event) {
  return {
    code: Number.isFinite(event?.code) ? event.code : null,
    reason: textOf(event?.reason),
    wasClean: Boolean(event?.wasClean),
  };
}

/**
 * Sở hữu đúng một Gemini Live session.
 * Generation id + connect promise ngăn reconnect/bấm nhanh tạo session song song.
 */
export class LiveSessionManager {
  #geminiEngine;
  #eventBus;
  #session = null;
  #modelId = '';
  #generation = 0;
  #manualClose = false;
  #status = 'idle';
  #connectPromise = null;

  constructor({ geminiEngine, eventBus }) {
    if (!geminiEngine || !eventBus) throw new Error('LiveSessionManager thiếu dependency bắt buộc.');
    this.#geminiEngine = geminiEngine;
    this.#eventBus = eventBus;
  }

  get connected() { return this.#status === 'connected' && Boolean(this.#session); }
  get status() { return this.#status; }
  get modelId() { return this.#modelId; }
  get connecting() { return this.#status === 'connecting' && Boolean(this.#connectPromise); }

  async connect({ apiKey, model, config } = {}) {
    const modelId = String(model || '').replace(/^models\//, '').trim();
    if (!modelId) throw new Error('Chưa chọn model Live để kết nối.');

    if (this.connected && this.#modelId === modelId) return this.#session;
    if (this.#connectPromise) return this.#connectPromise;
    if (this.#session) this.close({ reason: 'reconnect' });

    const generation = ++this.#generation;
    this.#manualClose = false;
    this.#modelId = modelId;
    this.#status = 'connecting';
    this.#eventBus.emit('live:connecting', { modelId });

    const operation = this.#geminiEngine.connectLive({
      apiKey,
      model: modelId,
      config,
      callbacks: {
        onopen: () => {
          if (generation !== this.#generation) return;
          this.#status = 'connected';
          this.#eventBus.emit('live:connected', { modelId });
        },
        onmessage: (message) => {
          if (generation !== this.#generation) return;
          this.#handleMessage(message);
        },
        onerror: (event) => {
          if (generation !== this.#generation) return;
          const error = event?.error instanceof Error
            ? event.error
            : new Error(event?.message || 'Gemini Live gặp lỗi WebSocket.');
          this.#eventBus.emit('live:error', { modelId, error, event });
        },
        onclose: (event) => {
          if (generation !== this.#generation) return;
          const detail = normalizeCloseEvent(event);
          // A socket may close before connectLive() resolves. Invalidate its late
          // resolved session, otherwise the stale socket can become #session again.
          this.#generation += 1;
          this.#connectPromise = null;
          this.#session = null;
          this.#status = 'closed';
          this.#eventBus.emit('live:closed', { modelId, manual: this.#manualClose, ...detail });
        },
      },
    }).then((session) => {
      if (generation !== this.#generation) {
        try { session?.close?.(); } catch { /* stale connection */ }
        return null;
      }
      this.#session = session;
      return session;
    }).catch((error) => {
      if (generation === this.#generation) {
        this.#session = null;
        this.#status = 'error';
        this.#eventBus.emit('live:connect-failed', { modelId, error });
      }
      throw error;
    }).finally(() => {
      if (generation === this.#generation) this.#connectPromise = null;
    });

    this.#connectPromise = operation;
    return operation;
  }

  sendRealtimeInput(input) {
    if (!this.connected || !this.#session?.sendRealtimeInput) {
      throw new Error('Gemini Live session chưa sẵn sàng để nhận realtime input.');
    }
    return this.#session.sendRealtimeInput(input);
  }

  sendAudioStreamEnd() {
    if (!this.connected || !this.#session?.sendRealtimeInput) return false;
    this.#session.sendRealtimeInput({ audioStreamEnd: true });
    return true;
  }

  sendToolResponse(functionResponses) {
    if (!this.connected || !this.#session?.sendToolResponse) return false;
    const responses = Array.isArray(functionResponses) ? functionResponses.filter(Boolean) : [];
    if (!responses.length) return false;
    this.#session.sendToolResponse({ functionResponses: responses });
    return true;
  }

  close({ reason = 'manual' } = {}) {
    this.#manualClose = true;
    this.#generation += 1;
    const session = this.#session;
    const modelId = this.#modelId;
    this.#connectPromise = null;
    this.#session = null;
    this.#status = 'closed';
    if (session?.close) {
      try { session.close(); } catch { /* already closed */ }
    }
    this.#eventBus.emit('live:closed', { modelId, manual: true, code: null, reason, wasClean: true });
  }

  dispose() {
    if (this.#session || this.#connectPromise) this.close({ reason: 'dispose' });
    else {
      this.#generation += 1;
      this.#status = 'closed';
    }
  }

  #handleMessage(message) {
    this.#eventBus.emit('live:message', message);
    const serverContent = message?.serverContent;

    const functionCalls = Array.isArray(message?.toolCall?.functionCalls) ? message.toolCall.functionCalls : [];
    if (functionCalls.length) {
      this.#eventBus.emit('live:tool-call', { modelId: this.#modelId, functionCalls, message });
    }
    const cancelledToolIds = Array.isArray(message?.toolCallCancellation?.ids) ? message.toolCallCancellation.ids : [];
    if (cancelledToolIds.length) {
      this.#eventBus.emit('live:tool-call-cancelled', { modelId: this.#modelId, ids: cancelledToolIds, message });
    }

    if (serverContent?.interrupted) {
      this.#eventBus.emit('live:interrupted', { modelId: this.#modelId, message });
    }

    const interimInputText = textOf(serverContent?.interimInputTranscription?.text);
    if (interimInputText) {
      this.#eventBus.emit('live:interim-input-transcript', { text: interimInputText, message });
    }

    const inputText = textOf(message?.inputTranscription?.text)
      || textOf(serverContent?.inputTranscription?.text);
    if (inputText) this.#eventBus.emit('live:input-transcript', { text: inputText, message });

    const outputText = textOf(message?.outputTranscription?.text)
      || textOf(serverContent?.outputTranscription?.text);
    if (outputText) this.#eventBus.emit('live:output-transcript', { text: outputText, message });

    const parts = Array.isArray(serverContent?.modelTurn?.parts) ? serverContent.modelTurn.parts : [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        this.#eventBus.emit('live:audio', {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || '',
          message,
        });
      }
      // Text parts may contain auxiliary/model content while AUDIO output is active.
      // Emit for diagnostics, but presentation prefers outputAudioTranscription.
      if (part?.text) this.#eventBus.emit('live:text', { text: part.text, message });
    }

    if (serverContent?.generationComplete) {
      this.#eventBus.emit('live:generation-complete', { modelId: this.#modelId, message });
    }
    if (serverContent?.turnComplete) {
      this.#eventBus.emit('live:turn-complete', { modelId: this.#modelId, message });
    }
  }
}

export { normalizeCloseEvent };
