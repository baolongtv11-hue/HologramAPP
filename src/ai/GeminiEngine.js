const DEFAULT_SYSTEM_INSTRUCTION = 'Bạn là trợ lý AI Hologram. Trả lời trực tiếp bằng tiếng Việt, chỉ nội dung người dùng yêu cầu, không tự giới thiệu hoặc thêm lời xã giao.';
const DEFAULT_VOICE = 'Aoede';
const AUDIO_MODALITY = 'AUDIO';

const VIDEO_TOOL_DECLARATIONS = Object.freeze([
  {
    name: 'open_video',
    description: 'Tìm và phát ngay một video YouTube phù hợp với chủ đề người dùng yêu cầu. Dùng công cụ này thay vì nói rằng bạn không thể phát video.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Chủ đề hoặc nội dung video cần tìm và phát.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'stop_video',
    description: 'Dừng và đóng video đang phát khi người dùng yêu cầu tắt, dừng hoặc đóng video.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'pause_video',
    description: 'Tạm dừng video đang phát.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'resume_video',
    description: 'Tiếp tục phát video đang tạm dừng.',
    parametersJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]);

/**
 * Adapter mỏng quanh @google/genai.
 * SDK được dynamic-import khi mở Live session lần đầu để giảm tải startup.
 */
export class GeminiEngine {
  #clientFactory;
  #sdkLoader;
  #sdkPromise = null;

  constructor({ clientFactory = null, sdkLoader = () => import('@google/genai') } = {}) {
    if (clientFactory !== null && typeof clientFactory !== 'function') throw new TypeError('GeminiEngine clientFactory phải là function.');
    if (typeof sdkLoader !== 'function') throw new TypeError('GeminiEngine sdkLoader phải là function.');
    this.#clientFactory = clientFactory;
    this.#sdkLoader = sdkLoader;
  }

  async createClient(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('Thiếu Gemini API Key.');
    if (this.#clientFactory) return this.#clientFactory(key);
    if (!this.#sdkPromise) this.#sdkPromise = this.#sdkLoader();
    const sdk = await this.#sdkPromise;
    if (typeof sdk?.GoogleGenAI !== 'function') throw new Error('Không tải được GoogleGenAI từ @google/genai.');
    return new sdk.GoogleGenAI({ apiKey: key });
  }

  createLiveConfig({
    systemInstruction = DEFAULT_SYSTEM_INSTRUCTION,
    voiceName = DEFAULT_VOICE,
    enableTranscription = true,
    enableVideoTools = true,
  } = {}) {
    const config = {
      systemInstruction: { parts: [{ text: String(systemInstruction || DEFAULT_SYSTEM_INSTRUCTION) }] },
      responseModalities: [AUDIO_MODALITY],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: String(voiceName || DEFAULT_VOICE) } } },
      // Quay về cấu hình VAD tối giản của bản one-file gốc. Tránh tự áp ngưỡng
      // có thể làm model mới cắt câu hoặc tăng latency không cần thiết.
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: false },
      },
    };
    if (enableTranscription) {
      config.inputAudioTranscription = {};
      config.outputAudioTranscription = {};
    }
    if (enableVideoTools) {
      config.tools = [{ functionDeclarations: VIDEO_TOOL_DECLARATIONS.map((item) => ({ ...item })) }];
    }
    return config;
  }

  async connectLive({ apiKey, model, config, callbacks }) {
    const modelId = String(model || '').replace(/^models\//, '').trim();
    if (!modelId) throw new Error('Chưa chọn Gemini Live model.');
    if (!callbacks?.onmessage) throw new Error('Gemini Live cần callback onmessage.');
    const client = await this.createClient(apiKey);
    return client.live.connect({ model: modelId, config: config || this.createLiveConfig(), callbacks });
  }
}

export { DEFAULT_SYSTEM_INSTRUCTION, DEFAULT_VOICE, VIDEO_TOOL_DECLARATIONS };
