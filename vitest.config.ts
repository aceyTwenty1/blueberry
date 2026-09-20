import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,js}', 'src/**/*.{test,spec}.{ts,js}'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@firefox': resolve(__dirname, 'src/firefox')
    }
  }
})
