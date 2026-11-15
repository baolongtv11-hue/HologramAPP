# AI Live Hologram v0.8.2 — Deep-check Patch Report

## Phạm vi

Patch này triển khai đúng các điểm P0/P1 đã xác nhận trong deep-check 3 vòng. Không viết lại AudioWorklet, PCM capture, AudioPlaybackQueue, model discovery hay YouTube player architecture.

## P0 — Command / transcript

| Vấn đề | File | Sửa |
|---|---|---|
| Streaming transcript overlap (`cho tôi xem` + `xem video`) | `src/audio/TextSyncEngine.js` | Longest token suffix/prefix overlap |
| Command nhận transcript quá muộn | `src/ai/LiveSessionManager.js` | Emit `live:interim-input-transcript` |
| Gemini có thể trả audio/text trong debounce | `src/main.js` | Suppress + cancel ngay khi media intent được nhận diện; search debounce 240 ms |
| Command state treo | `src/main.js` | TTL suppression + cleanup ở close/connect-failed/stop/turn-complete |
| Grammar video thiếu biến thể | `src/commands/CommandEngine.js` | `tìm kiếm`, `dừng phát`, `clip`, `tắt nó đi` theo `videoActive` |
| AppState/DOM video lệch nhau | `src/main.js` | `videoActive=true/false` trong show/hide video |

## P1 — Render / UI

| Vấn đề | File | Sửa |
|---|---|---|
| CSS orb animation chạy khi bị che | `src/styles/components.css`, `src/main.js` | `animation-play-state: paused` + `render-paused` |
| Blur lồng nhau controls/settings | `src/styles/components.css` | Bỏ blur ở `.ctrl-btn`, giảm settings blur, mobile giảm thêm |
| Blur từng speech line gây jank | `src/styles/animations.css` | Chỉ opacity/translate/scale; scene vẫn blur một lần |
| Shader FBM tốn GPU mobile | `src/visual/OrbEngine.js` | 2 FBM shared detail, adaptive octave 2/4, DPR 1.3/1.7 |

## Live / VAD

- `silenceDurationMs`: 500 -> 700 ms. Đây là thay đổi bảo thủ để giảm kết thúc câu quá sớm; vẫn cần manual device verification.
- Reconnect: 500 -> 1000 -> 2000 ms, tối đa 3 lần, chỉ khi microphone vẫn active.
- Không throttle/nén PCM: Worklet vẫn 2048 samples @ 16 kHz (~128 ms/chunk), giữ nguyên kiến trúc ổn định.

## Verification đã chạy

```text
SYNTAX_PASS
HARDENING_SMOKE_PASS
V082_TARGETED_REGRESSION_PASS
COMMAND_INTENT_EARLY_PASS
```

Targeted regression xác nhận:
- overlap transcript không lặp từ;
- `tìm kiếm video hologram` -> `video.play`;
- `dừng phát video` -> `video.stop`;
- `tắt nó đi` chỉ map stop khi `videoActive=true`;
- `interimInputTranscription` được phát qua EventBus;
- early media intent nhận `mở video` trước khi query đầy đủ.

## Chưa xác minh trong container

- `npm test` / Vitest: container hiện không có `node_modules`.
- `npm run build`: cần Vite đã cài.
- microphone/Gemini/YouTube/browser GPU thật: cần manual/browser integration.
