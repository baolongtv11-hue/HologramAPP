# AI LIVE HOLOGRAM v0.8.4 — STABILITY CONTROL

**Baseline duy nhất:** `AI-Live-Hologram-v0.8.3-Original-Stability.zip`.

Bản vá nhỏ, không dùng v0.8.0–v0.8.2 ghi đè, không đổi AudioWorklet, PCM resampling, AudioPlaybackQueue, GainNode hay renderer core của Orb.

## Plan đã triển khai

| Mức | Vấn đề | Nguyên nhân | Sửa đổi giới hạn | Kết quả kiểm tra |
|---|---|---|---|---|
| P0 | Lệnh mở video bị mất | Debounce 240 ms bị xóa bởi `live:turn-complete` | `VideoCommandScheduler` có `flush()` trước cleanup, `cancel()` khi Stop | Regression PASS (mô phỏng turnComplete + timer) |
| P0 | Gemini trả lời bằng tiếng nhưng lệnh video không chạy | `generationComplete` từng bị coi như `turnComplete` làm cleanup sớm | Tách hai sự kiện trong `LiveSessionManager` | Unit regression đã viết, dependency-free PASS |
| P0 | Reconnect chỉ thử một lần nếu `connect()` thất bại | Chỉ nhánh WebSocket close mới lên lịch retry | Tự lập lịch lần sau trong `finally` khi còn micActive, tối đa 3 lần; hủy khi Stop | Audit logic; cần browser/network thật |
| P0 | Microphone bật muộn sau Stop | Quyền mic/connection trả về sau khi Stop | `microphoneRequestEpoch` kiểm tra sau từng `await` lớn | Audit logic; cần browser thật |
| P1 | Video xuất hiện sau khi đóng | IFrame API/Player startup đang await, Stop không chặn tạo player | `VideoPlayer.#playEpoch`, generation check xuyên `VideoManager`, `videoOperationEpoch` bảo vệ UI | Unit test bổ sung, smoke PASS |
| P1 | Mở 2 video khi Player chưa ready | `loadVideoById` có thể chạy trước `onReady` | Ghi `desiredVideoId`, chỉ gọi load sau `onReady` | Unit test bổ sung |
| P1 | Tool fallback có thể báo thành công giả | Dedup trả true trước khi biết kết quả local command | Shared Promise trả kết quả thật của command đang thực hiện | Audit logic, manual test tiếp |
| P1 | Tool cancellation vẫn có thể gửi response | Không theo dõi toolCallCancellation.ids | Lọc tool response theo IDs đã hủy | Audit logic, manual test tiếp |
| P1 | Settings overlay bị ẩn trong lúc người dùng mở lại | Timeout hide cũ không hủy | Clear timer mở mới + xác minh panel chưa active | Audit logic |
| UX | Hiệu ứng liên tục gây tải compositor | CSS glow/animation/blur dù orb RAF đã pause | Checkbox `Tắt hiệu ứng để ưu tiên độ mượt`, localStorage, CSS opt-in, áp dụng tức thì khi Lưu | Kiểm tra cấu trúc, cần FPS profiling |

## Cách dùng chế độ nhẹ

1. Chạy ứng dụng như bình thường; mở **Cài đặt**.
2. Ở **Hiệu ứng chuyển cảnh**, tích chọn **Tắt hiệu ứng để ưu tiên độ mượt**.
3. Bấm **Lưu cài đặt**. Hiệu ứng `animation`/`transition` CSS dừng ngay; các lớp blur/decorative compositing nặng bị vô hiệu hóa.
4. Thử lệnh video, bật/tắt mic và hội thoại. Thiết lập được lưu ở `localStorage` cho lần mở sau.
5. Bỏ tích + lưu để trở về hiệu ứng v0.8.3. Mặc định giữ hiệu ứng như v0.8.3 để không làm thay đổi giao diện nếu người dùng không chọn.

**Lưu ý:** Chế độ này giảm hiệu ứng CSS, **không** thay Orb shader hay tắt loop Canvas/WebGL. Nếu lag vẫn xảy ra khi bật chế độ nhẹ, cần đo Performance GPU/CPU riêng; không suy đoán lỗi PCM.

## Kiểm thử tự động

```bash
npm run test:smoke
npm run test:stability
npm test
npm run build
```

Tại môi trường tạo bản vá:

- `node --check`: PASS tất cả file JS/MJS.
- `npm run test:smoke`: `HARDENING_SMOKE_PASS`.
- `npm run test:stability`: `STABILITY_REGRESSION_PASS`.
- `npm test`: **CHƯA CHẠY**, không thể cài `node_modules` do DNS `EAI_AGAIN` tới `registry.npmjs.org`.
- `npm run build`: **CHƯA CHẠY** cùng lý do.
- Browser + Gemini API / YouTube API thật: **CHƯA CHẠY** trong môi trường hiện tại, không claim PASS.
- CI `.github/workflows/deploy-pages.yml` đã thêm `npm run test:stability` để ngăn regression.

## Manual regression checklist cần chạy trên Windows Chrome và Android Chrome

1. Nhập Gemini/YouTube API Key theo cách hợp lệ; không chia sẻ key/console URL có key.
2. Tắt hiệu ứng chuyển cảnh → lưu → reload → xác nhận thiết lập vẫn bật.
3. 20 lần nói "Mở video [chủ đề]"; ghi số lần local dispatch, player lên hình, error 101/150/153/autoplay.
4. Nói nhanh "mở video A", ngay sau đó "tắt video" trước khi YouTube iframe load xong; không được tự bật lại video A.
5. Nói "mở video A" rồi "mở video B" khi player chưa ready; video B phải là video cuối cùng.
6. Sau đóng video, nói chuyện ngay không restart mic.
7. Đóng/mở microphone trong lúc xin quyền thiết bị hoặc Gemini đang connecting; không được xuất hiện mic/session sau Stop.
8. Bật mic, thử đổi Wi-Fi/mất mạng trong lúc nói; tối đa 3 retry, cuối cùng báo lỗi rõ ràng, không giữ trạng thái mic đang thu mà không có Live.
9. So sánh CPU/GPU/FPS 60 giây giữa bật/tắt chế độ nhẹ và HTML gốc bằng Chrome Performance.
10. Kiểm tra vùng video sau autoplay block: không nói/hiện "đang phát" như kết quả đã xác nhận nếu thực tế bị chặn.

## Phạm vi cố ý chưa sửa

- Không thay AudioWorklet, resampling, 2048 samples PCM, AudioPlaybackQueue.
- Không ép Canvas2D thay WebGL2 hoặc sửa shader FBM khi chưa có FPS trace thực tế.
- Không tự thêm session resumption/GoAway vì phụ thuộc hỗ trợ Live model và cần kiểm tra endpoint/key thật.
- Không chặn realtime microphone trong lúc tool-call (có thể phá VAD), vì chưa có bằng chứng đây là nguyên nhân đóng session.
- Không coi `YT.Player` created là bằng chứng video đã phát: cần theo dõi `onStateChange` trong browser test sau.

## Files chính thay đổi

- `src/main.js`: command, live lifecycle, settings preference, stale video, microphone cancellation.
- `src/commands/VideoCommandScheduler.js`: debounce/flush độc lập.
- `src/ai/LiveSessionManager.js`: tách turn signals, xử lý socket đóng sớm.
- `src/video/VideoManager.js`, `src/video/VideoPlayer.js`: cancel / ready guard.
- `src/storage/StorageManager.js`, `src/ui/SettingsPanel.js`, `index.html`, `src/styles/performance.css`: opt-in reduced animation.
- `tests/...`, `scripts/stability-regression.mjs`: regression coverage mới.

## Nguồn đối chiếu

- Google Gemini Live WebSockets: `https://ai.google.dev/api/live` (`generationComplete` khác `turnComplete`).
- Google Live session management: `https://ai.google.dev/gemini-api/docs/live-api/session-management` (GoAway và resumption).
- Chrome/web.dev animations & performance: `https://web.dev/articles/animations-and-performance`.

*Đây là bản thử nghiệm cho QA, chưa phải chứng nhận tương thích production trên mọi browser.*
