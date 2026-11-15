function normalizeCommandText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripVietnameseDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function cleanVideoQuery(value) {
  return String(value || '')
    .replace(/^(?:về|nói về|liên quan đến|chủ đề|nội dung)\s+/i, '')
    .replace(/^(?:ve|noi ve|lien quan den|chu de|noi dung)\s+/i, '')
    .replace(/^(?:video|youtube|clip|phim)\s+(?:về|ve\s+)?/i, '')
    .trim();
}

const MEDIA_NOUN = '(?:video|youtube|clip|phim)';
const PLAY_ACTION = '(?:mo|bat|phat|tim|tim kiem|xem|cho xem)';
const STOP_ACTION = '(?:tat|dung|dong|thoat|ngung)';

/**
 * Nhận diện lệnh UI/media cục bộ.
 * Matching dùng cả chuỗi gốc và bản bỏ dấu để không phụ thuộc chất lượng dấu tiếng Việt
 * của server transcription. Query ưu tiên chuỗi gốc; fallback sang bản bỏ dấu vẫn dùng
 * được với YouTube search.
 */
export class CommandEngine {
  hasMediaIntent(value, { videoActive = false } = {}) {
    const text = normalizeCommandText(value);
    if (!text) return false;
    const plain = stripVietnameseDiacritics(text);

    if (videoActive && new RegExp(`^(?:${STOP_ACTION}|tam dung|pause|tiep tuc|phat tiep|resume)(?:\\s+.*)?$`, 'i').test(plain)) {
      return true;
    }

    return new RegExp(`^(?:cho toi|cho minh|hay|vui long)?\\s*(?:${PLAY_ACTION}|${STOP_ACTION}|tam dung|pause|tiep tuc|phat tiep|resume)\\s+(?:giup toi\\s+|cho toi\\s+|cho minh\\s+)?(?:mot\\s+)?${MEDIA_NOUN}\\b`, 'i').test(plain)
      || new RegExp(`^(?:${STOP_ACTION})\\s+phat\\s+${MEDIA_NOUN}\\b`, 'i').test(plain);
  }

  recognize(value, { videoActive = false } = {}) {
    const text = normalizeCommandText(value);
    if (!text) return null;
    const plain = stripVietnameseDiacritics(text);

    const stopPatterns = [
      new RegExp(`^(?:hay\\s+|vui\\s+long\\s+)?${STOP_ACTION}\\s+${MEDIA_NOUN}(?:\\s+.*)?$`, 'i'),
      new RegExp(`^(?:hay\\s+|vui\\s+long\\s+)?${STOP_ACTION}\\s+phat\\s+${MEDIA_NOUN}(?:\\s+.*)?$`, 'i'),
    ];
    if (stopPatterns.some((pattern) => pattern.test(plain))) return { type: 'video.stop', text };
    if (videoActive && /^(?:tat|dung|dong|thoat)(?:\s+(?:no|cai nay|di|lai))*(?:\s+di)?$/i.test(plain)) {
      return { type: 'video.stop', text };
    }

    if (new RegExp(`^(?:hay\\s+|vui\\s+long\\s+)?(?:tam\\s+dung|pause)\\s+${MEDIA_NOUN}(?:\\s+.*)?$`, 'i').test(plain)) {
      return { type: 'video.pause', text };
    }
    if (videoActive && /^(?:tam\s+dung|pause)(?:\s+no)?$/i.test(plain)) return { type: 'video.pause', text };

    if (new RegExp(`^(?:hay\\s+|vui\\s+long\\s+)?(?:tiep\\s+tuc|phat\\s+tiep|resume)\\s+${MEDIA_NOUN}(?:\\s+.*)?$`, 'i').test(plain)) {
      return { type: 'video.resume', text };
    }
    if (videoActive && /^(?:tiep\s+tuc|phat\s+tiep|resume)(?:\s+no)?$/i.test(plain)) return { type: 'video.resume', text };

    // Ưu tiên regex trên chuỗi gốc để giữ query có dấu.
    const originalPlayPatterns = [
      /^(?:cho tôi|cho mình|hãy|vui lòng)?\s*(?:mở|bật|phát|tìm|tìm kiếm|xem|cho xem)\s+(?:giúp tôi\s+|cho tôi\s+|cho mình\s+)?(?:một\s+)?(?:video|clip|phim)\s*(?:về|nói về|liên quan đến)?\s+(.+)$/i,
      /^(?:cho tôi|cho mình|hãy|vui lòng)?\s*(?:mở|bật|phát|tìm|tìm kiếm|xem|cho xem)\s+(?:giúp tôi\s+|cho tôi\s+|cho mình\s+)?(?:trên\s+)?youtube\s*(?:về|nói về|liên quan đến)?\s+(.+)$/i,
      /^(?:cho tôi|cho mình)\s+xem\s+(.+?)\s+(?:trên\s+)?(?:youtube|video)$/i,
      /^(?:video|clip)\s+(?:về|nói về|liên quan đến)\s+(.+)$/i,
    ];
    for (const pattern of originalPlayPatterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const query = cleanVideoQuery(match[1]);
      if (query.length >= 2) return { type: 'video.play', query, text };
    }

    // Fallback bỏ dấu cho transcript không ổn định. YouTube vẫn tìm tốt query ASCII.
    const plainPlayPatterns = [
      new RegExp(`^(?:cho toi|cho minh|hay|vui long)?\\s*${PLAY_ACTION}\\s+(?:giup toi\\s+|cho toi\\s+|cho minh\\s+)?(?:mot\\s+)?(?:video|clip|phim)\\s*(?:ve|noi ve|lien quan den)?\\s+(.+)$`, 'i'),
      new RegExp(`^(?:cho toi|cho minh|hay|vui long)?\\s*${PLAY_ACTION}\\s+(?:giup toi\\s+|cho toi\\s+|cho minh\\s+)?(?:tren\\s+)?youtube\\s*(?:ve|noi ve|lien quan den)?\\s+(.+)$`, 'i'),
      /^(?:cho toi|cho minh)\s+xem\s+(.+?)\s+(?:tren\s+)?(?:youtube|video)$/i,
      /^(?:video|clip)\s+(?:ve|noi ve|lien quan den)\s+(.+)$/i,
    ];
    for (const pattern of plainPlayPatterns) {
      const match = plain.match(pattern);
      if (!match?.[1]) continue;
      const query = cleanVideoQuery(match[1]);
      if (query.length >= 2) return { type: 'video.play', query, text };
    }

    return null;
  }
}

export { normalizeCommandText, stripVietnameseDiacritics, cleanVideoQuery };
