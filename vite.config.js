import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 8099,
  },
  clearScreen: false,
  plugins: [
    sveltekit()
  ],
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})
