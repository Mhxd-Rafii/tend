import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['test/server/**/*.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000, restoreMocks: true } })
