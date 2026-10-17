import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api/* is proxied to `wrangler pages dev` (port 8788), which runs the real
// Cloudflare Pages Functions locally. There is no client-side simulation fallback.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Wrangler writes local state (SQLite trace stores) into .wrangler/ on every request;
    // watching it would trigger a full page reload per API call.
    watch: { ignored: ['**/.wrangler/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**'] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false },
    },
  },
  // The Firebase SDK is imported lazily; pre-bundle it so Vite doesn't discover it on first use
  // and force a full page reload in the middle of a sign-in.
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
})
