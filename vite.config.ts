import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi phát triển: chạy `npm run dev:server` (cổng 3000) song song với `npm run dev`
// Vite chuyển tiếp /api và /env.js sang server. Không chạy server → giao diện tự vào chế độ DEMO.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/env.js': 'http://localhost:3000',
    },
  },
});
