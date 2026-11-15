function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function longestTokenOverlap(left, right) {
  const a = normalizeWhitespace(left).split(' ').filter(Boolean);
  const b = normalizeWhitespace(right).split(' ').filter(Boolean);
  const max = Math.min(a.length, b.length);
  for (let size = max; size > 0; size -= 1) {
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      if (a[a.length - size + index].toLocaleLowerCase('vi') !== b[index].toLocaleLowerCase('vi')) {
        matches = false;
        break;
      }
    }
    if (matches) return size;
  }
  return 0;
}

/**
 * Đồng bộ transcript streaming để UI/CommandEngine không bị lặp chữ khi
 * server gửi các fragment có phần đầu trùng với phần cuối fragment trước.
 * Mỗi dòng presentation được giới hạn tối đa 4 từ theo yêu cầu giao diện.
 */
export class TextSyncEngine {
  #input = '';
  #output = '';

  resetInput() { this.#input = ''; }
  resetOutput() { this.#output = ''; }
  reset() { this.resetInput(); this.resetOutput(); }

  mergeInput(fragment) {
    this.#input = this.#merge(this.#input, fragment);
    return this.#input;
  }

  mergeOutput(fragment) {
    this.#output = this.#merge(this.#output, fragment);
    return this.#output;
  }

  formatLines(text, maxWords = 4) {
    const words = normalizeWhitespace(text).split(' ').filter(Boolean);
    const lines = [];
    for (let i = 0; i < words.length; i += maxWords) lines.push(words.slice(i, i + maxWords).join(' '));
    return lines;
  }

  #merge(previous, fragment) {
    const current = normalizeWhitespace(previous);
    const incoming = normalizeWhitespace(fragment);
    if (!incoming) return current;
    if (!current) return incoming;
    if (incoming === current || current.endsWith(incoming)) return current;
    if (incoming.startsWith(current)) return incoming;
    if (current.startsWith(incoming)) return current;

    const overlap = longestTokenOverlap(current, incoming);
    if (overlap > 0) {
      const incomingTokens = incoming.split(' ');
      return normalizeWhitespace(`${current} ${incomingTokens.slice(overlap).join(' ')}`);
    }
    return normalizeWhitespace(`${current} ${incoming}`);
  }
}

export { normalizeWhitespace, longestTokenOverlap };
