const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_FALLBACK_MODEL = 'gemini-3.8-live';
const LIVE_METHOD_NAMES = new Set([
  'bidigeneratecontent',
  'bidigeneratecontentconstrained',
  'liveconnect',
]);
const TEXT_METHOD_NAMES = new Set(['generatecontent', 'streamgeneratecontent']);

function normalizeMethod(method) {
  return String(method || '').replace(/[^a-z]/gi, '').toLowerCase();
}

function modelIdFromName(name) {
  return String(name || '').replace(/^models\//, '');
}

function hasLiveSignal(model) {
  const haystack = [model.name, model.displayName, model.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Đây chỉ là tín hiệu để gom nhóm candidate, KHÔNG được coi là xác minh Live.
  // Loại các model audio chuyên biệt không phải hội thoại hai chiều.
  if (/transcribe|speech[- ]to[- ]text|\btts\b|text[- ]to[- ]speech/.test(haystack)) return false;
  return /\blive\b|native[- ]audio|real[- ]time|realtime/.test(haystack);
}

/**
 * Quản lý discovery và lựa chọn model Gemini.
 * Không mở Live session; xác minh runtime thuộc LiveSessionManager ở Phase 3B.
 */
export class ModelManager {
  #fetch;
  #endpoint;
  #pageSize;
  #fallbackModel;
  #models = [];
  #liveVerification = new Map();

  constructor({
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_ENDPOINT,
    pageSize = 100,
    fallbackModel = DEFAULT_FALLBACK_MODEL,
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('ModelManager cần fetch implementation.');
    this.#fetch = fetchImpl;
    this.#endpoint = endpoint;
    this.#pageSize = Math.max(1, Math.min(Number(pageSize) || 100, 1000));
    this.#fallbackModel = modelIdFromName(fallbackModel);
  }

  get models() {
    return this.#models.map((model) => ({ ...model, methods: [...model.methods] }));
  }

  /**
   * Lấy toàn bộ model bằng models.list, tự động đi hết pagination.
   * @param {{apiKey: string, signal?: AbortSignal}} options
   */
  async discover({ apiKey, signal } = {}) {
    const key = String(apiKey || '').trim();
    if (!key) throw new Error('Thiếu Gemini API Key để tải danh sách model.');

    const rawModels = [];
    let pageToken = '';
    const seenTokens = new Set();

    do {
      const url = new URL(this.#endpoint);
      url.searchParams.set('pageSize', String(this.#pageSize));
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await this.#fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': key },
        cache: 'no-store',
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `Không tải được danh sách model (HTTP ${response.status}).`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      rawModels.push(...(Array.isArray(data.models) ? data.models : []));
      const next = String(data.nextPageToken || '');
      if (next && seenTokens.has(next)) {
        throw new Error('Gemini models.list trả về pageToken lặp; đã dừng để tránh vòng lặp vô hạn.');
      }
      if (next) seenTokens.add(next);
      pageToken = next;
    } while (pageToken);

    this.#models = rawModels
      .map((model) => this.#normalizeModel(model))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

    return this.getCatalog();
  }

  /** Đánh dấu kết quả xác minh Live thực tế từ Phase 3B. */
  setLiveVerification(modelId, status, reason = '') {
    const id = modelIdFromName(modelId);
    if (!['verified', 'unsupported', 'unverified'].includes(status)) {
      throw new Error(`Live verification status không hợp lệ: ${status}`);
    }
    this.#liveVerification.set(id, { status, reason: String(reason || '') });
    this.#models = this.#models.map((model) => model.id === id ? this.#normalizeModel(model.raw) : model);
  }

  getCatalog() {
    const live = [];
    const text = [];
    const other = [];

    for (const model of this.#models) {
      if (model.live.category === 'live') live.push(model);
      else if (model.text.supported) text.push(model);
      else other.push(model);
    }

    return {
      all: this.models,
      live: live.map((item) => ({ ...item, methods: [...item.methods] })),
      text: text.map((item) => ({ ...item, methods: [...item.methods] })),
      other: other.map((item) => ({ ...item, methods: [...item.methods] })),
    };
  }

  /**
   * Chọn model Live theo thứ tự: model người dùng -> fallback cấu hình -> candidate đầu tiên.
   * Không biến candidate chưa xác minh thành "supported".
   */
  resolveLiveSelection(preferredModelId = '') {
    const preferred = modelIdFromName(preferredModelId);
    const liveModels = this.#models.filter((model) => model.live.category === 'live');

    const acceptable = (model) => model && model.live.status !== 'unsupported';
    const byId = (id) => this.#models.find((model) => model.id === id);

    if (preferred) {
      const model = byId(preferred);
      if (acceptable(model) && model.live.category === 'live') {
        return { model, fallbackUsed: false, reason: 'Đã giữ model Live người dùng chọn vì model vẫn có trong catalog hiện tại.' };
      }
    }

    const configuredFallback = byId(this.#fallbackModel);
    if (acceptable(configuredFallback) && configuredFallback.live.category === 'live') {
      return {
        model: configuredFallback,
        fallbackUsed: Boolean(preferred && preferred !== configuredFallback.id),
        reason: preferred
          ? `Model "${preferred}" không còn phù hợp/khả dụng; chuyển sang fallback ${configuredFallback.id}.`
          : `Chưa có model được chọn; dùng fallback ${configuredFallback.id}.`,
      };
    }

    const first = liveModels.find(acceptable) || null;
    if (first) {
      return {
        model: first,
        fallbackUsed: true,
        reason: `Fallback cấu hình ${this.#fallbackModel} không có trong catalog; tạm chọn Live candidate ${first.id}.`,
      };
    }

    return {
      model: null,
      fallbackUsed: true,
      reason: 'Không tìm thấy model Live candidate khả dụng trong catalog hiện tại.',
    };
  }

  #normalizeModel(raw) {
    const methods = Array.isArray(raw?.supportedGenerationMethods)
      ? raw.supportedGenerationMethods.map(String)
      : [];
    const normalizedMethods = methods.map(normalizeMethod);
    const id = modelIdFromName(raw?.name);
    const explicitLiveMethod = normalizedMethods.some((method) => LIVE_METHOD_NAMES.has(method));
    const textSupported = normalizedMethods.some((method) => TEXT_METHOD_NAMES.has(method));
    const verification = this.#liveVerification.get(id);
    const candidate = explicitLiveMethod || hasLiveSignal(raw);

    let liveStatus = 'unverified';
    let liveReason = 'Tên/mô tả cho thấy đây có thể là model Live, nhưng models.list chưa đủ để xác minh kết nối WebSocket.';

    if (explicitLiveMethod) {
      liveStatus = 'verified';
      liveReason = 'Metadata API công bố phương thức Live/BidiGenerateContent.';
    } else if (!candidate) {
      liveStatus = 'unsupported';
      liveReason = 'Không có tín hiệu Live trong metadata; không đưa vào nhóm hội thoại Live.';
    }

    if (verification) {
      liveStatus = verification.status;
      liveReason = verification.reason || liveReason;
    }

    return Object.freeze({
      raw,
      id,
      name: raw?.name || (id ? `models/${id}` : ''),
      displayName: raw?.displayName || id || 'Model không tên',
      description: raw?.description || '',
      version: raw?.version || '',
      inputTokenLimit: raw?.inputTokenLimit ?? null,
      outputTokenLimit: raw?.outputTokenLimit ?? null,
      methods,
      text: Object.freeze({
        supported: textSupported,
        status: textSupported ? 'verified' : 'unsupported',
      }),
      live: Object.freeze({
        category: candidate ? 'live' : 'non-live',
        status: liveStatus,
        reason: liveReason,
      }),
    });
  }
}

export { DEFAULT_ENDPOINT, DEFAULT_FALLBACK_MODEL, modelIdFromName };
