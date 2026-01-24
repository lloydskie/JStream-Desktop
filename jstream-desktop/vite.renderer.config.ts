import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: Number(process.env.VITE_PORT || 8282),
    strictPort: false,
  },
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
