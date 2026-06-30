import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        'creator-dashboard': resolve(__dirname, 'creator-dashboard.html'),
        'admin-dashboard': resolve(__dirname, 'admin-dashboard.html'),
      },
    },
  },
  server: {
    port: 3000,
  },
});
