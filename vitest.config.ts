import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // Fuseau fixé : un calcul qui dépendrait du fuseau local échouerait ici.
          env: { TZ: 'America/Los_Angeles' },
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/ui/**', 'tests/e2e/**', 'node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'happy-dom',
          include: ['tests/ui/**/*.test.ts'],
        },
      },
    ],
  },
});
