// vite.config.js —— 开发服务器配置：把 /api 请求转发给本地后端
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
