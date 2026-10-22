import { it } from 'vitest';

/**
 * Tests chronométrés : exécutés seulement par `npm run test:perf`, en série.
 * En parallèle, la charge de la machine rend les durées instables. Les vrais
 * budgets (ADR 0012) se mesurent dans un navigateur, au lot 6.
 */
export const itPerf = it.runIf(process.env['FJORD_PERF'] === '1');
