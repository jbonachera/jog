import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const racine = fileURLToPath(new URL('../..', import.meta.url));

// La CSP de l'ADR 0010 est la seule source : index.html et le build doivent la reprendre à la lettre.
function cspDeLAdr(): string {
  const adr = readFileSync(join(racine, 'docs/adr/0010-securite-donnees-personnelles.md'), 'utf8');
  const correspondance = /`(default-src [^`]*)`/.exec(adr);
  if (correspondance === null) {
    throw new Error('CSP introuvable dans l\'ADR 0010');
  }
  return correspondance[1] ?? '';
}

function cspDuHtml(html: string): string | undefined {
  return /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
}

describe('Content-Security-Policy (ADR 0010)', () => {
  it('index.html porte la CSP de l\'ADR 0010, à la chaîne près', () => {
    const html = readFileSync(join(racine, 'index.html'), 'utf8');

    expect(cspDuHtml(html)).toBe(cspDeLAdr());
  });

  it('le build produit un index.html portant la même CSP', async () => {
    const sortie = mkdtempSync(join(tmpdir(), 'fjord-build-'));
    try {
      await build({
        root: racine,
        configFile: join(racine, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir: sortie, emptyOutDir: true },
      });
      const html = readFileSync(join(sortie, 'index.html'), 'utf8');

      expect(cspDuHtml(html)).toBe(cspDeLAdr());
    } finally {
      rmSync(sortie, { recursive: true, force: true });
    }
  }, 120_000);
});
