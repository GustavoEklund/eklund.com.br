// Stryker's Vitest runner cannot drive browser mode, so mutation runs use only the Node-side projects.
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@site': fileURLToPath(new URL('./source', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    include: [
      'tests/js/**/*.unit.test.js',
      'tests/js/**/*.property.test.js',
      'tests/integration/**/*.integration.test.js',
    ],
    // This one starts tools/serve.mjs, and the sandbox copy leaves tools/ out.
    exclude: [...configDefaults.exclude, 'tests/integration/serve.integration.test.js'],
  },
});
