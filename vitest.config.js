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
        'src/utils/scriptAnalyzer.js',
        'src/utils/content_bridge.js',
        'src/offscreen/offscreen.js',
        'src/popup/popup.js',
        'src/elementSelector/core.js',
        'src/GM/gm_bridge.js',
        'src/GM/gmApiDefinitions.js',
        'src/GM/helpers/*.js',
        'src/GM/Values/*.js',
        'src/utils/metadataParser.js',
        'src/utils/urls.js',
        'src/utils/ai_diff_helper.js',
        'src/core/userscriptAdapter.js',
        'src/core/scriptRegistry.js',
        'src/core/scriptUpdater.js',
        'src/editor/ai_code_manager.js',
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
