# v0.8.3 — Original HTML Stability Rebase

Mục tiêu: quay lại các hành vi đã chứng minh ổn định trong `Voice-AI-Hologram-One-File[1].html`, đồng thời giữ kiến trúc modular và các cải tiến an toàn của v0.8.x.

## Nguyên nhân xác định

1. **Video command vẫn có thể trượt** nếu transcript Gemini đến muộn hoặc mất dấu tiếng Việt. Khi đó model trả lời hội thoại trước khi app kịp thực thi.
2. **Video pipeline v0.8.x phức tạp hơn prototype gốc**: search API + verify API, rồi tạo player khi video layer còn ẩn, và destroy/recreate player khi đóng. Điều này tăng latency/quota và tăng số điểm lỗi.
3. **VAD bị tinh chỉnh thủ công** trong khi prototype gốc chỉ bật automatic activity detection mặc định. Các ngưỡng tùy chỉnh không có bằng chứng là tốt hơn cho mọi Live model.
4. **Runtime visual vẫn nặng trên mobile** vì coarse/mobile vẫn chạy WebGL shader và nhiều filter/animation trang trí.

## Thay đổi có chủ đích

### Command & Gemini Live
- Giữ CommandEngine local là đường nhanh nhất.
- Matching thêm fallback bỏ dấu tiếng Việt (`phat video`, `mo youtube...`).
- Thêm Gemini Live function tools dự phòng:
  - `open_video(query)`
  - `stop_video()`
  - `pause_video()`
  - `resume_video()`
- `LiveSessionManager` phát `live:tool-call` và hỗ trợ `sendToolResponse()`.
- Local path và tool path đều dùng chung `executeLocalCommand()` để không phân kỳ hành vi.
- System instruction yêu cầu dùng tool video thay vì nói “không thể phát video”.

### Video
- Quay về mô hình prototype gốc: **1 request `search.list`** với `videoEmbeddable=true` + `videoSyndicated=true`.
- Bỏ request `videos.list` thứ hai để giảm latency và quota.
- Mở video layer **trước** khi tạo/phát YT.Player.
- Đóng video bình thường chỉ `stopVideo()`; giữ player để lần sau `loadVideoById()` nhanh hơn.
- Chỉ destroy player ở `dispose()`.

### Live/VAD
- Quay về cấu hình gốc: `automaticActivityDetection: { disabled:false }`.
- Không áp `silenceDurationMs`, sensitivity hay prefix padding tùy chỉnh khi chưa có đo đạc thiết bị thật.

### Render
- Mobile/coarse pointer ưu tiên Canvas2D thay vì WebGL shader.
- Low-power active FPS 45, idle 20.
- Desktop WebGL giữ lại nhưng giảm shader quality từ 4 xuống 3 octave.
- Bỏ blur filter khỏi text/orb/video transition chính; chỉ giữ opacity/translate/scale với easing gần file mẫu.
- Giảm backdrop blur trên controls/settings; mobile tắt các conic sweep trang trí.

## Phần không thay đổi
- AudioWorklet PCM capture.
- Fractional `readPosition`.
- PCM16 16 kHz.
- AudioPlaybackQueue / `nextPlaybackTime` / active source tracking.
- Interruption cancellation.
- Dynamic model discovery.
- API key storage policy.

## Verification trong container

- `node --check` toàn bộ JS/MJS: **PASS**
- `npm run test:smoke`: **HARDENING_SMOKE_PASS**
- targeted regression: **V083_TARGETED_REGRESSION_PASS**
  - command có dấu/không dấu
  - transcript longest-overlap
  - Live tool-call event + tool response
  - one-request YouTube search
  - VAD default contract

Không có `node_modules`/`package-lock.json` trong container nên `npm test`/`npm run build` chưa chạy tại đây. GitHub Actions/máy có mạng cần xác nhận hai bước này.

## Final rerun after test updates

- All JS/MJS syntax: **PASS**
- `npm run test:smoke`: **HARDENING_SMOKE_PASS**
- VideoManager smoke expectation updated to the original-style reusable player contract (`stop`, not destroy-on-close).
