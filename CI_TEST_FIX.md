# v0.8.1 — CI Test Fix

## Nguyên nhân đã xác định

`tests/ai/InstructionManager.test.js` kiểm tra chuỗi `Chỉ tạo nội dung cần nói trực tiếp` bằng `toContain()`. Source v0.8.0 lại dùng `CHỈ tạo...`, nên assertion phân biệt hoa/thường bị fail dù runtime không hỏng.

## Thay đổi tối thiểu

1. `src/ai/InstructionManager.js`: `CHỈ tạo` → `Chỉ tạo`.
2. `package.json`: Vitest chạy với `--reporter=verbose`; version `0.8.1`.
3. `.github/workflows/deploy-pages.yml`: thêm `npm run test:smoke` trước unit tests và đổi tên step thành `Run unit tests`.

## Kiểm tra trong container

- `npm run test:smoke`: PASS (`HARDENING_SMOKE_PASS`).
- `node --check` toàn bộ JS/MJS: PASS.
- Native regression mô phỏng core/model/live/audio/video assertions: PASS (`V08_NATIVE_REGRESSION_PASS`).
- Không chạy được Vitest/Vite trong container vì `node_modules` không tồn tại; GitHub Actions đã chứng minh bước Install dependencies thành công, nên lần push tiếp theo sẽ là kiểm chứng chính thức của `npm test` và `npm run build`.

## Không thay đổi

Không sửa AudioWorklet, resampler PCM, playback scheduling, Live session architecture, video command routing, orb renderer hoặc UI runtime.
