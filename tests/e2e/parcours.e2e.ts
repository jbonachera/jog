// Scénarios 1 et 2 de la vérification en vrai navigateur (lot 6.3) : politique de sécurité sur toute la navigation, puis
// import de l'archive synthétique et Vue affichée. Données : archive synthétique de 14 mois, importée par le vrai champ.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { importerArchiveSynthetique, lancerChromium, ouvrirFjord, type Session, urlFjord } from './navigateur';

let navigateur: Browser;

beforeAll(async () => {
  navigateur = await lancerChromium();
});

afterAll(async () => {
  await navigateur?.close();
});

describe('1 · politique de sécurité (ADR 0010) sur toute la navigation', () => {
  it('aucune erreur de console, aucune violation CSP, le Worker se charge, les polices viennent de self', async () => {
    const session: Session = await ouvrirFjord(navigateur);
    try {
      const { page, observations } = session;
      await importerArchiveSynthetique(page);
      for (const id of ['charge', 'progression', 'historique', 'reglages', 'apercu']) {
        await page.locator(`#t-${id}`).click();
        await page.locator(`#v-${id}:not([hidden])`).waitFor();
      }

      expect(observations.erreurs).toEqual([]);
      expect(observations.violationsCsp).toEqual([]);
      expect(observations.requetesExternes).toEqual([]);

      // Le calcul tourne dans un Worker de module, servi par l'application (ADR 0009).
      expect(observations.workers.length).toBeGreaterThan(0);
      expect(observations.workers.every((url) => url.startsWith(urlFjord()))).toBe(true);

      // Les polices sont chargées, toutes depuis l'origine de l'application, sans erreur.
      expect(observations.polices.length).toBeGreaterThan(0);
      expect(observations.polices.every((police) => police.url.startsWith(urlFjord()) && police.statut === 200)).toBe(true);
      const statutsPolices = await page.evaluate(() => [...document.fonts].map((police) => police.status));
      expect(statutsPolices).toContain('loaded');
      expect(statutsPolices).not.toContain('error');
    } finally {
      await session.contexte.close();
    }
  });
});

describe('2 · import puis Vue', () => {
  it('l’import de l’archive synthétique aboutit, la barre affiche la dernière synchronisation, l’Aperçu donne un verdict', async () => {
    const session = await ouvrirFjord(navigateur);
    try {
      const { page, observations } = session;
      await importerArchiveSynthetique(page);

      await expect(page.locator('.statut').textContent()).resolves.toMatch(/^Import terminé : \d+ activités? ajoutées?/);
      await expect(page.locator('.etat').textContent()).resolves.toMatch(/^Dernière synchronisation : .+, \d{2}:\d{2}$/);
      const verdict = (await page.locator('#a1-verdict').textContent()) ?? '';
      expect(['Augmenter', 'Maintenir', 'Alléger', 'Pas encore de verdict']).toContain(verdict);
      expect(verdict).not.toBe('Pas encore de verdict');
      expect(observations.erreurs).toEqual([]);
    } finally {
      await session.contexte.close();
    }
  });
});
