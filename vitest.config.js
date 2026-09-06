import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup/vitest.setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/background/background.js',
        'src/background/*.js',
        'src/services/scripts/*.js',
        'src/services/scripts/adapter/*.js',
        'src/services/*.js',
        'src/content/*.js',
        'src/offscreen/offscreen.js',
        'src/popup/popup.js',
        'src/elementSelector/core.js',
        'src/shared/constants/gmApiDefinitions.js',
        'src/shared/utils/*.js',
        'src/ai_dom_editor/editor/helpers/*.js',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
