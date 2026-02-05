import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  server: {
    host: process.env.VITE_HOST || '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: false,
  },
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
