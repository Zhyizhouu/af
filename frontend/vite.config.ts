/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The converter and the assistant live on a container host, never on the same
// origin as this bundle. Read at build time from the same variable the Flutter
// build used, so the deploy story does not change with the framework.
//
// It has no default on purpose. The Flutter build defaulted to
// http://localhost:8080, which on a deployed site resolves to each visitor's
// own machine and fails as mixed content — silently, because a missing
// dart-define was not an error. An unset value here is visible instead: the
// page says the API is not configured rather than pretending to reach one.
export default defineConfig({
  plugins: [react()],
  define: {
    __AF_CONVERT_API__: JSON.stringify(process.env.AF_CONVERT_API ?? ''),
  },
  build: {
    rollupOptions: {
      output: {
        // Firebase is over half the bundle and changes on its own schedule.
        // Split out, an app deploy does not invalidate it in everyone's cache.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
