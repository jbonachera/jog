// Scénario 9 de la vérification en vrai navigateur (lot 7.4) : la FC max observée (D-019, ADR 0013), de l'import à
// « Utiliser ». Données : archive de 14 mois fabriquée par code (tests/fixtures), avec un pic soutenu de 194 bpm à J−2,
// au-dessus du réglage par défaut de 188 bpm. Importée par le vrai champ, comme les autres scénarios.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { archiveAvecPicFc, importerArchive, lancerChromium, ouvrirJog, ouvrirOnglet } from './navigateur';

const MESSAGE_ENREGISTRE = 'Enregistré. Tableau de bord recalculé.';

let navigateur: Browser;

beforeAll(async () => {
  navigateur = await lancerChromium();
});

afterAll(async () => {
  await navigateur?.close();
});

describe('9 · FC max observée (D-019) : proposition dans Paramètres, décision de l’athlète', () => {
  it('l’encart apparaît dans Données, rien ne change sans clic, « Utiliser » enregistre une modification datée et annonce', async () => {
    const session = await ouvrirJog(navigateur);
    try {
      const { page, observations } = session;
      await importerArchive(page, archiveAvecPicFc());
      await ouvrirOnglet(page, 'reglages');

      // L'encart est dans le groupe « Données », sous l'import d'archive.
      const encart = page.locator('section.donnees .encart-fcmax');
      await encart.waitFor({ state: 'visible' });
      expect(await page.locator('section.donnees .encart-fcmax').count()).toBe(1);
      expect(await page.locator('#fcmax-phrase').textContent()).toMatch(
        /^194 bpm tenus 15 s le 19 oct\. 26 \(« Footing pic », \d+,\d km\), au-dessus de votre réglage de 188 bpm\.$/,
      );
      expect(await page.locator('#fcmax-utiliser').textContent()).toBe('Utiliser 194 bpm à partir du 19 oct. 26');

      // Avant le clic, rien n'a changé : la FC max réglée est toujours 188, et aucune modification n'est datée.
      const champFcMax = page.getByLabel('FC max', { exact: true });
      expect(await champFcMax.inputValue()).toBe('188');
      expect(await page.locator('.modifications').textContent()).toContain('Aucune modification datée.');

      await page.locator('#fcmax-utiliser').click();
      await page.waitForFunction((message) => document.querySelector('.statut')?.textContent === message, MESSAGE_ENREGISTRE);

      expect(await page.locator('.statut').textContent()).toBe(MESSAGE_ENREGISTRE);
      // Le champ « FC max » du formulaire reprend la valeur enregistrée.
      await expect.poll(() => champFcMax.inputValue()).toBe('194');
      // L'historique montre la modification : date d'effet du jour de la séance, valeur 194 bpm.
      const ligne = page.locator('.tableau-modifs tbody tr', { hasText: 'FC max' });
      await ligne.waitFor({ state: 'visible' });
      expect(await ligne.count()).toBe(1);
      expect(await ligne.locator('td').first().textContent()).toMatch(/^19 oct\./);
      expect(await ligne.locator('td').nth(2).textContent()).toContain('→ 194 bpm');
      // La suggestion n'a plus lieu d'être : l'encart disparaît.
      await encart.waitFor({ state: 'detached' });
      expect(observations.erreurs).toEqual([]);
    } finally {
      await session.contexte.close();
    }
  });
});
