import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
  },
});
