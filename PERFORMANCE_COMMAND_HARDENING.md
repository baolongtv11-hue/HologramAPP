# Performance & Command Hardening — v0.8.0

## Nguyên nhân đã xác thực

1. **Text mặc định bị dính vào transcript**: `#text-body` chứa text node ban đầu nhưng renderer chỉ quản lý child `<span>`, nên câu “Chạm microphone…” không được xóa trước khi append transcript.
2. **Khởi tạo audio quá sớm**: startup gọi `refreshDevices()` và `setOutputDevice()`. `setOutputDevice()` dẫn tới `ensureContext()`, có thể dựng `AudioContext + AudioWorklet` ngay khi trang mở.
3. **Gemini SDK eager-load**: `@google/genai` được import ở module top-level, làm tăng bundle khởi tạo dù người dùng chưa bật microphone.
4. **Orb render khi bị ẩn**: WebGL loop vẫn chạy 60 FPS khi text/video che orb; uniform location còn được lookup lại mỗi frame.
5. **Video command phụ thuộc hội thoại**: app chỉ nhận `mở/tìm video`; chưa có local command cho stop/pause/resume. Search đang chạy cũng không có AbortController, nên kết quả cũ có thể phát sau khi người dùng đã yêu cầu tắt.
6. **Live session rớt cần thao tác tay**: khi socket đóng ngoài ý muốn, mic bị dừng thay vì reconnect có giới hạn.
7. **Instruction còn cho phép filler**: profile “teacher” và base instruction chưa cấm tự giới thiệu/mô tả model đủ mạnh.

## Sửa chọn lọc

- Thêm `CommandEngine` nhẹ: `video.play`, `video.stop`, `video.pause`, `video.resume`.
- Command media thực thi cục bộ từ input transcript; AI output của turn command bị suppress để tránh nói “đã làm” khi DOM chưa đồng bộ.
- Video search dùng `AbortController`; close video abort request cũ + destroy player.
- Gemini SDK chuyển sang `import('@google/genai')` khi kết nối Live lần đầu.
- Device enumeration chỉ chạy khi mở Settings, Start mic hoặc devicechange khi đang dùng audio.
- Không tạo AudioContext/AudioWorklet ở `app:initialized`.
- Orb pause khi bị ẩn; idle ~30 FPS, active ~60 FPS; DPR giới hạn 1.7; cache WebGL uniform locations.
- Live socket reconnect tối đa 2 lần chỉ khi microphone vẫn đang active.
- Stop microphone chủ động đóng Live session để giảm resource nền.
- Sửa renderer xóa text node placeholder trước lần transcript streaming đầu tiên.
- Siết `AIinstruction.json` và `InstructionManager`: zero-noise, không tự giới thiệu, không xác nhận lệnh media bằng lời.

## Kiểm tra đã chạy

- `node --check` toàn bộ JS/MJS: PASS
- `npm run test:smoke`: `HARDENING_SMOKE_PASS`
- Static lazy-loading/command audit: PASS
- Smoke test xác nhận close video abort search đang chờ và không phát stale result: PASS

## Chưa thể xác minh trong container

- `npm test` / `npm run build`: vẫn cần dependency từ npm registry; container hiện offline.
- Gemini Live, microphone hardware, YouTube API key và autoplay: cần browser/API thật.
