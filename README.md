# AI Live Hologram — Phase 7 Hardening & Fixes

Đây là bản selective hardening dựa trên Phase 7. Không rewrite AudioWorklet, PCM resampling, AudioPlaybackQueue hay Gemini Live pipeline đang hoạt động.

## Những điểm đã khắc phục

- Presentation text bỏ panel nền: text nằm giữa, phóng lớn gần toàn màn hình, tối đa 4 từ/dòng; `Hologram` chỉ là heading nhỏ.
- Transcript streaming được hợp nhất bằng `TextSyncEngine`, không dựng lại toàn bộ DOM theo từng chunk nên giảm giật chữ.
- UI chỉ hiển thị `outputAudioTranscription` — nội dung AI thực sự nói; `modelTurn.parts[].text` không còn được đưa lên presentation để tránh chữ phụ/instruction/metadata.
- Orb phản ứng nhanh hơn, glow/halo/orbit mượt hơn; RMS thật vẫn là nguồn năng lượng.
- Automatic VAD nhạy hơn: start HIGH, end LOW, prefix 40 ms, silence 500 ms.
- Start/Stop microphone và Mic Mute/Unmute được tách riêng. Stop giải phóng MediaStream; Mute chỉ đổi `track.enabled`.
- Thêm AI voice volume và mute bằng một GainNode đặt trước AudioContext destination; `nextPlaybackTime` và active source Set giữ nguyên.
- Thêm chọn microphone, chọn loa khi `AudioContext.setSinkId()` được trình duyệt hỗ trợ, cùng `devicechange` handling.
- `LiveSessionManager` thêm connect mutex ngoài generation ID để tránh nhiều WebSocket session song song khi bấm nhanh.
- `AIinstruction.json` được import trực tiếp qua `InstructionManager`, không còn `fetch('./AIinstruction.json')` nên không phụ thuộc đường dẫn runtime trên GitHub Pages.
- Settings có privacy notice: khi Start capture, audio/transcript được gửi từ browser tới Google Gemini API.

## Dependency

Project pin `@google/genai` ở `2.32.0` để giữ API 2.x tương thích hiện tại và tránh major migration không cần thiết. Vitest dùng `jsdom`.

> API key Gemini/YouTube chỉ được lưu ở `sessionStorage`; frontend không thể che giấu permanent secret. Production nghiêm túc nên dùng backend/token broker phù hợp.

## Chạy local

```bash
npm install
npm test
npm run build
npm run dev
```

Không mở `index.html` bằng `file://`.

## GitHub Pages

Repository dùng Vite `base: './'` và workflow `.github/workflows/deploy-pages.yml`. Trong GitHub chọn **Settings → Pages → Source → GitHub Actions**.

Sau khi `npm install` thành công trên máy có mạng, commit `package-lock.json`; sau đó có thể đổi CI sang `npm ci`.

## Audio lifecycle

```text
User gesture
  → Start capture
  → getUserMedia(echoCancellation/noiseSuppression/autoGainControl)
  → AudioWorklet PcmCaptureProcessor
  → streaming resample 16 kHz PCM16
  → Gemini Live
  → output PCM
  → AudioPlaybackQueue (nextPlaybackTime + active source Set)
  → GainNode (volume/mute)
  → speaker
```

`live:interrupted` vẫn dừng queue ngay lập tức. Stop capture dừng MediaStream tracks; Mic Mute không phá capture graph.

## Verification

Xem [`FINAL_TEST_REPORT.md`](./FINAL_TEST_REPORT.md) để biết chính xác test nào đã chạy, test nào bị block và bảng A/B/C/D/E theo Master Prompt §17.2.

Trong môi trường tạo bản này, npm registry timeout nên `npm install`, Vitest và Vite build không thể chạy hoàn chỉnh. Dependency-free smoke test, JS syntax, DOM reference và CSS sanity đều PASS. Không tuyên bố phần hardware/API bên ngoài đã PASS nếu chưa test trên Chrome/Android thật.

## v0.8.0 — Performance & local command hardening

Bản này ưu tiên lazy loading và command execution cục bộ. Gemini SDK chỉ tải khi mở Live session; AudioContext/AudioWorklet không còn khởi tạo lúc startup; YouTube vẫn lazy-load. Các lệnh `mở/tìm video`, `tắt/dừng/đóng video`, `tạm dừng video`, `tiếp tục video` được map trực tiếp sang VideoManager thay vì phụ thuộc câu trả lời của AI. Xem `PERFORMANCE_COMMAND_HARDENING.md` để biết audit và test chi tiết.

## v0.8.1 — CI test hotfix

- Sửa mismatch duy nhất đã xác định giữa `InstructionManager` và unit test: chuỗi policy dùng đúng `Chỉ tạo nội dung cần nói trực tiếp...` (Vitest `toContain` phân biệt hoa/thường).
- `npm test` dùng `--reporter=verbose` để GitHub Actions hiển thị chính xác test fail nếu còn lỗi.
- Workflow Pages chạy `npm run test:smoke` trước `npm test`, sau đó mới `npm run build`.
- Không thay đổi AudioWorklet, AudioPlaybackQueue, Gemini Live, CommandEngine, VideoManager hay OrbEngine.


## v0.8.2 — Command / Transcript / Render hardening

Bản vá chọn lọc, không thay AudioWorklet, PCM 16 kHz hoặc AudioPlaybackQueue.

- `TextSyncEngine`: longest suffix/prefix token overlap để tránh transcript kiểu `xem xem video`.
- `LiveSessionManager`: phát `live:interim-input-transcript` từ Gemini Live low-latency transcription.
- `CommandEngine`: mở rộng tiếng Việt tự nhiên (`tìm kiếm video`, `dừng phát video`, `tắt nó đi` khi video đang active) và nhận diện media intent sớm.
- `main.js`: media command suppress/cancel AI ngay khi intent được nhận diện; chỉ query search debounce 240 ms; suppression có TTL và cleanup ở close/fail/stop.
- `AppState.videoActive`: đồng bộ với video layer thật.
- Live reconnect: bounded backoff 500/1000/2000 ms, tối đa 3 lần khi mic còn active.
- Gemini VAD: `silenceDurationMs` từ 500 -> 700 ms để giảm cắt câu ở khoảng nghỉ ngắn; cần tiếp tục xác minh trên thiết bị thật.
- Orb/CSS: pause animation khi bị ẩn/che bởi Settings/Video; giảm nested backdrop blur; shader dùng 2 FBM thay vì 3 và giảm octave/DPR trên thiết bị coarse/mobile.
- Presentation text: mỗi line không còn blur lại theo từng fragment; scene transition vẫn dùng easing kiểu presentation.

Kiểm tra offline trong môi trường hiện tại:

```text
node --check src/public/scripts/tests: PASS
npm run test:smoke: HARDENING_SMOKE_PASS
v0.8.2 targeted regression: PASS
```

Vitest/Vite production build cần GitHub Actions hoặc máy có `node_modules`.

## v0.8.3 — Original HTML Stability Rebase

Bản này đối chiếu trực tiếp với `Voice-AI-Hologram-One-File[1].html` ban đầu và đưa các phần dễ lỗi về gần hành vi gốc hơn: VAD mặc định, one-request YouTube search, tái sử dụng YouTube player, transition nhẹ hơn. Đồng thời thêm local command matching không dấu và Gemini Live function tools làm fallback cho video command. Xem `ORIGINAL_HTML_STABILITY_REBASE_v0.8.3.md`.


## v0.8.4 — Stability Control (bản thử nghiệm)

- Settings → **Hiệu ứng chuyển cảnh** → **Tắt hiệu ứng để ưu tiên độ mượt** → **Lưu cài đặt**. Thiết lập lưu trong localStorage; bỏ tích để khôi phục hiệu ứng cũ.
- Lệnh video được flush khi Gemini turnComplete, không còn bị xóa mất trước timer 240 ms.
- Lỗi reconnect, stale player startup, dừng khi mic đang khởi động và tool-result dedup được vá nhỏ.
- Chạy `npm run test:stability` và xem `STABILITY_PATCH_PLAN_v0.8.4.md` trước khi triển khai.
