import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/webview/ui/src/test/setup.ts',
    include: ['src/webview/ui/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'out'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/webview/ui/src/**/*.{js,ts,jsx,tsx}'],
      exclude: [
        'node_modules/',
        'src/webview/ui/src/test/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/webview/ui/src')
    }
  }
})
