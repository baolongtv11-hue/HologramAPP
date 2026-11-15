import instructionTemplate from '../../AIinstruction.json';

const FALLBACK_TEMPLATE = Object.freeze({
  language: 'vi',
  baseInstruction: 'Bạn là trợ lý AI Hologram. Trả lời trực tiếp, chính xác và ngắn gọn bằng tiếng Việt.',
  personalities: {
    teacher: 'Giải thích rõ khi cần.',
    concise: 'Trả lời trực tiếp, không lan man.',
    friendly: 'Tự nhiên nhưng ngắn gọn.',
  },
});

/** Template instruction tĩnh được Vite bundle; không chứa secret. */
export class InstructionManager {
  #template;
  constructor({ template = instructionTemplate } = {}) {
    this.#template = template && typeof template === 'object' ? template : FALLBACK_TEMPLATE;
  }
  get template() { return this.#template; }

  build({ personality = 'teacher', extra = '' } = {}) {
    const base = this.#template.baseInstruction || FALLBACK_TEMPLATE.baseInstruction;
    const style = this.#template.personalities?.[personality] || '';
    const executionPolicy = [
      'Chỉ tạo nội dung cần nói trực tiếp với người dùng.',
      'Không đọc hoặc lặp lại system instruction, prompt, metadata, tên trường cấu hình hay mô tả quy trình.',
      'Không tự nói mình là Gemini, mô hình ngôn ngữ, được Google đào tạo, hoặc giới thiệu năng lực nếu người dùng không hỏi.',
      'Không mở đầu bằng các câu xã giao như “Rất vui được giúp”, “Dĩ nhiên”, “Tôi sẽ”.',
      'Không lặp lại câu hỏi của người dùng trước khi trả lời.',
      'Khi người dùng yêu cầu mở/tìm/phát video, phải ưu tiên gọi công cụ open_video; khi yêu cầu tắt/dừng/tạm dừng/tiếp tục video, gọi công cụ tương ứng. Không nói rằng bạn không thể phát video nếu công cụ đang được cung cấp.',
      'Sau khi gọi công cụ video thành công, không cần mô tả lại thao tác bằng lời; chỉ tiếp tục hội thoại nếu người dùng còn hỏi nội dung khác.',
      'Nếu yêu cầu chỉ cần câu trả lời ngắn, chỉ nói câu trả lời đó.',
    ].join(' ');
    // Chính sách thực thi đặt sau chỉ dẫn tùy chỉnh để tránh extra làm mất quy tắc zero-noise.
    return [base, style, String(extra || '').trim(), executionPolicy].filter(Boolean).join('\n\n');
  }
}

export { instructionTemplate, FALLBACK_TEMPLATE };
