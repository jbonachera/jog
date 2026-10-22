import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const racine = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: racine });

async function reglesViolees(code: string, cheminRelatif: string): Promise<string[]> {
  const [resultat] = await eslint.lintText(code, { filePath: join(racine, cheminRelatif) });
  return (resultat?.messages ?? []).flatMap((message) => (message.ruleId ? [message.ruleId] : []));
}

const FICTIF_CORE = 'src/core/fictif.ts';

describe('règles ESLint du cœur (ADR 0006, ADR 0008)', () => {
  it('refuse Math.pow dans src/core, car le pipeline est déterministe (ADR 0006)', async () => {
    expect(await reglesViolees('export const x = Math.pow(1.06, 2);', FICTIF_CORE)).toContain(
      'no-restricted-properties',
    );
  });

  it("refuse à src/core d'importer src/store, src/ui ou src/worker (ADR 0008)", async () => {
    expect(
      await reglesViolees("import { x } from '../store/base';\nexport const y = x;", FICTIF_CORE),
    ).toContain('no-restricted-imports');
  });

  it.each([
    ['Math.exp', 'export const x = Math.exp(1);'],
    ['Math.log', 'export const x = Math.log(2);'],
    ['Math.log10', 'export const x = Math.log10(2);'],
    ['Math.log2', 'export const x = Math.log2(2);'],
    ['Math.log1p', 'export const x = Math.log1p(2);'],
    ['Math.expm1', 'export const x = Math.expm1(2);'],
  ])('refuse %s dans src/core (ADR 0006)', async (_nom, code) => {
    expect(await reglesViolees(code, FICTIF_CORE)).toContain('no-restricted-properties');
  });

  it('refuse l\'opérateur ** dans src/core (ADR 0006)', async () => {
    expect(await reglesViolees('export const x = 2 ** 3;', FICTIF_CORE)).toContain('no-restricted-syntax');
  });

  it('refuse l\'affectation **= dans src/core (ADR 0006)', async () => {
    expect(await reglesViolees('export let x = 2;\nx **= 3;', FICTIF_CORE)).toContain('no-restricted-syntax');
  });

  it('refuse le global Date dans src/core : le calcul ne dépend ni de l\'horloge ni du fuseau (ADR 0007)', async () => {
    expect(await reglesViolees('export const d = new Date(0);', FICTIF_CORE)).toContain('no-restricted-globals');
  });

  it('accepte Math.pow dans src/core/riegel.ts, seul module qui peut l\'utiliser (ADR 0006)', async () => {
    expect(await reglesViolees('export const x = Math.pow(1.06, 2);', 'src/core/riegel.ts')).not.toContain(
      'no-restricted-properties',
    );
  });

  it('accepte ** dans src/core/riegel.ts', async () => {
    expect(await reglesViolees('export const x = 1.06 ** 2;', 'src/core/riegel.ts')).not.toContain(
      'no-restricted-syntax',
    );
  });

  it('accepte Math.pow hors de src/core', async () => {
    expect(await reglesViolees('export const x = Math.pow(1.06, 2);', 'src/ui/fictif.ts')).not.toContain(
      'no-restricted-properties',
    );
  });
});
