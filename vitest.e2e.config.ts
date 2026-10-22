import { defineConfig } from 'vitest/config';

// Scénarios de bout en bout (Chromium réel, via playwright-core). Lancés par `npm run test:e2e` (scripts/e2e.mjs), qui
// construit l'application et la sert avec `vite preview`. Ils ne tournent pas dans `npm test`.
export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    // Un navigateur par fichier, et les fichiers à la suite : les mesures de temps restent comparables entre elles.
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Fuseau fixé : la date civile de l'appareil (J) et les libellés de dates sont déterministes.
    env: { TZ: 'Europe/Paris' },
  },
});
