// Scénarios 7 et 8 de la vérification en vrai navigateur (lot 6.3) : recalcul sans rechargement (D-010) et parcours au
// clavier (onglets, graphique, infobulle). Données : archive synthétique de 14 mois, importée par le champ réel.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { importerArchiveSynthetique, lancerChromium, ouvrirFjord, ouvrirOnglet, type Session } from './navigateur';

let navigateur: Browser;

beforeAll(async () => {
  navigateur = await lancerChromium();
});

afterAll(async () => {
  await navigateur?.close();
});

async function ouvrirAvecDonnees(): Promise<Session> {
  const session = await ouvrirFjord(navigateur, { largeur: 1440, hauteur: 900 });
  await importerArchiveSynthetique(session.page);
  return session;
}

/** Identifiant et aria-selected de l'élément qui a le focus, pour lire le parcours clavier. */
async function focusCourant(page: Page): Promise<{ id: string; selectionne: string | null; contour: string; style: string }> {
  return page.evaluate(() => {
    const actif = document.activeElement as HTMLElement;
    const style = getComputedStyle(actif);
    return {
      id: actif.id,
      selectionne: actif.getAttribute('aria-selected'),
      contour: style.outlineWidth,
      style: style.outlineStyle,
    };
  });
}

describe('7 · D-010 : enregistrer dans Paramètres sans quitter la page', () => {
  it('on reste sur l’onglet, à la même position (±2 px), l’annonce est exacte, le focus n’est pas perdu', async () => {
    const session = await ouvrirAvecDonnees();
    try {
      const page = session.page;
      await ouvrirOnglet(page, 'reglages');
      // L'athlète défile, puis modifie refHr, puis enregistre. La position est lue une fois le bouton visible, juste
      // avant le clic : sinon Playwright ferait défiler jusqu'à lui et la mesure serait fausse.
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.getByLabel('FC de référence pour l’allure normalisée', { exact: true }).fill('170');
      const bouton = page.locator('#params-enregistrer');
      await bouton.scrollIntoViewIfNeeded();
      const position = await page.evaluate(() => window.scrollY);
      expect(position).toBeGreaterThan(0);
      await bouton.click();
      await page.waitForFunction(() => document.querySelector('.statut')?.textContent === 'Enregistré. Tableau de bord recalculé.');

      expect(await page.locator('#t-reglages').getAttribute('aria-selected')).toBe('true');
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - position)).toBeLessThanOrEqual(2);
      expect(await page.locator('.statut').textContent()).toBe('Enregistré. Tableau de bord recalculé.');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('params-enregistrer');
      expect(await page.locator('.infobulle').count()).toBe(0);
    } finally {
      await session.contexte.close();
    }
  });
});

describe('8 · clavier (02, 08)', () => {
  it('les onglets se parcourent aux flèches, circulairement, avec un contour de focus de 2 px', async () => {
    const session = await ouvrirAvecDonnees();
    try {
      const page = session.page;
      await page.locator('#t-apercu').focus();
      const suite = ['charge', 'progression', 'historique', 'reglages', 'apercu', 'charge'];
      for (const id of suite) {
        await page.keyboard.press('ArrowRight');
        const focus = await focusCourant(page);
        expect(focus.id).toBe(`t-${id}`);
        expect(focus.selectionne).toBe('true');
        expect(focus.style).toBe('solid');
        expect(focus.contour).toBe('2px');
      }
      await page.keyboard.press('ArrowLeft');
      expect((await focusCourant(page)).id).toBe('t-apercu');
    } finally {
      await session.contexte.close();
    }
  });

  it('on entre dans un graphique avec Tab, les flèches déplacent le point, et l’infobulle apparaît', async () => {
    const session = await ouvrirAvecDonnees();
    try {
      const page = session.page;
      // Aperçu → Charge aux flèches : le panneau Charge est ouvert, et le focus reste sur son onglet.
      await page.locator('#t-apercu').focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('#v-charge:not([hidden])').waitFor();
      // Tab jusqu'à la zone de clavier d'un graphique de Charge (après ses boutons Graphique · Tableau).
      let atteint = false;
      for (let k = 0; k < 60 && !atteint; k++) {
        await page.keyboard.press('Tab');
        atteint = await page.evaluate(() => document.activeElement?.classList.contains('zone-clavier') === true);
      }
      expect(atteint).toBe(true);
      expect((await focusCourant(page)).contour).toBe('2px');

      await page.keyboard.press('ArrowLeft');
      // L'infobulle est un groupe SVG : on vérifie sa présence et une boîte non vide, pas la visibilité de Playwright.
      const infobulle = page.locator('.infobulle').first();
      await infobulle.waitFor({ state: 'attached' });
      const boite = await page.evaluate(() => {
        const rect = document.querySelector('.infobulle')?.getBoundingClientRect();
        return { largeur: rect?.width ?? 0, hauteur: rect?.height ?? 0 };
      });
      expect(boite.largeur).toBeGreaterThan(0);
      expect(boite.hauteur).toBeGreaterThan(0);
      const avant = await infobulle.textContent();
      await page.keyboard.press('ArrowLeft');
      const apres = await page.locator('.infobulle').first().textContent();
      expect(apres).not.toBe(avant);
    } finally {
      await session.contexte.close();
    }
  });
});
