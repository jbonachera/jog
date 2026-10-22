// Scénarios 4, 5, 6, 9 et 10 de la vérification en vrai navigateur (lot 6.3) : A1 visible sans défilement, responsive,
// en-tête collant de H2, thème sombre et préférence de mouvement réduit. Données : archive synthétique de 14 mois.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { importerArchiveSynthetique, lancerChromium, ouvrirJog, ouvrirOnglet, type OptionsSession, type Session } from './navigateur';

const ONGLETS = ['apercu', 'charge', 'progression', 'historique', 'reglages'] as const;

let navigateur: Browser;

beforeAll(async () => {
  navigateur = await lancerChromium();
});

afterAll(async () => {
  await navigateur?.close();
});

/** Ouvre l'application avec les données de l'archive synthétique, importées par le champ réel. */
async function ouvrirAvecDonnees(options: OptionsSession = {}): Promise<Session> {
  const session = await ouvrirJog(navigateur, options);
  await importerArchiveSynthetique(session.page);
  return session;
}

/** Nombre de pistes d'une grille (1 seule = une colonne), pour chaque élément de `selecteur`, à l'écran. */
async function pistesDesGrilles(page: Page, selecteur: string): Promise<number[]> {
  return page.locator(selecteur).evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length),
  );
}

describe('4 · A1 visible sans défiler à 1440 × 900 (03, A1)', () => {
  it('le verdict, la fourchette et les 7 cartes de signaux sont dans la fenêtre', async () => {
    const session = await ouvrirAvecDonnees({ largeur: 1440, hauteur: 900 });
    try {
      const page = session.page;
      await ouvrirOnglet(page, 'apercu');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const verdict = await page.locator('#a1-verdict').boundingBox();
      const fourchette = await page.locator('.dec-range').boundingBox();
      const cartes = page.locator('.signaux-grille > li');
      expect(await cartes.count()).toBe(7);
      const boites = [verdict, fourchette, ...(await Promise.all(Array.from({ length: 7 }, (_, i) => cartes.nth(i).boundingBox())))];

      for (const boite of boites) {
        expect(boite).not.toBeNull();
        if (boite === null) continue;
        expect(boite.y).toBeGreaterThanOrEqual(0);
        expect(boite.y + boite.height).toBeLessThanOrEqual(900);
      }
    } finally {
      await session.contexte.close();
    }
  });
});

describe('5 · responsive à 980 px et 640 px (02, « Responsive »)', () => {
  it('les grilles passent en une colonne, la page ne défile pas horizontalement, seuls les tableaux larges défilent', async () => {
    const session = await ouvrirAvecDonnees({ largeur: 1100, hauteur: 900 });
    try {
      const page = session.page;
      for (const largeur of [980, 640]) {
        await page.setViewportSize({ width: largeur, height: 900 });
        for (const onglet of ONGLETS) {
          await ouvrirOnglet(page, onglet);
          const fenetre = await page.evaluate(() => ({ defile: document.documentElement.scrollWidth, fenetre: document.documentElement.clientWidth }));
          expect(fenetre.defile, `${onglet} à ${largeur} px`).toBeLessThanOrEqual(fenetre.fenetre);

          // Les défilements horizontaux réels ne portent que sur des tableaux.
          const conteneurs = await page.evaluate(() =>
            [...document.querySelectorAll('body *')]
              .filter((element) => {
                const style = getComputedStyle(element);
                return (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1;
              })
              .map((element) => ({ classe: element.className.toString(), tableau: element.querySelector('table') !== null })),
          );
          for (const conteneur of conteneurs) {
            expect(conteneur.tableau, `${onglet} à ${largeur} px : ${conteneur.classe}`).toBe(true);
          }
        }

        await ouvrirOnglet(page, 'apercu');
        expect(await pistesDesGrilles(page, '.decision, .compteurs, .g2')).toEqual(Array(await page.locator('.decision, .compteurs, .g2').count()).fill(1));
        if (largeur === 640) {
          expect(await pistesDesGrilles(page, '.signaux-grille')).toEqual([1]);
        } else {
          expect(await pistesDesGrilles(page, '.signaux-grille')).toEqual([2]);
        }
        await ouvrirOnglet(page, 'charge');
        const grillesCharge = await pistesDesGrilles(page, '.g2, .g3');
        expect(grillesCharge.length).toBeGreaterThan(0);
        expect(grillesCharge.every((pistes) => pistes === 1)).toBe(true);
      }
    } finally {
      await session.contexte.close();
    }
  });
});

describe('6 · en-tête de H2 collant, en-têtes de ligne non collants (03, H2 ; 08)', () => {
  it('l’en-tête du journal reste visible après un défilement du conteneur, les en-têtes de ligne ne collent pas', async () => {
    const session = await ouvrirAvecDonnees({ largeur: 1440, hauteur: 900 });
    try {
      const page = session.page;
      await ouvrirOnglet(page, 'historique');
      const conteneur = page.locator('.journal-conteneur');
      await conteneur.waitFor();
      await conteneur.evaluate((element) => {
        element.scrollTop = 300;
      });
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => ok(null))));

      const { defilement, entete, haut, lignesEnTete } = await page.evaluate(() => {
        const zone = document.querySelector('.journal-conteneur') as HTMLElement;
        const th = zone.querySelector('thead th') as HTMLElement;
        const lignes = [...zone.querySelectorAll('tbody th')] as HTMLElement[];
        return {
          defilement: zone.scrollTop,
          haut: zone.getBoundingClientRect().top,
          entete: th.getBoundingClientRect().top,
          lignesEnTete: lignes.map((element) => getComputedStyle(element).position),
        };
      });
      expect(defilement).toBeGreaterThan(0);
      // L'en-tête est collé en haut du conteneur (à la bordure près) : il reste lisible pendant le défilement.
      expect(entete - haut).toBeGreaterThanOrEqual(0);
      expect(entete - haut).toBeLessThanOrEqual(4);
      // Il y a des en-têtes de ligne (la semaine), et aucun ne colle.
      expect(lignesEnTete.length).toBeGreaterThan(0);
      expect(lignesEnTete.filter((position) => position === 'sticky')).toEqual([]);
    } finally {
      await session.contexte.close();
    }
  });
});

describe('9 · thème sombre (08, « Tokens de couleur »)', () => {
  it('avec colorScheme dark, les jetons sombres s’appliquent : fond de page #0b141c', async () => {
    const session = await ouvrirAvecDonnees({ colorScheme: 'dark' });
    try {
      const page = session.page;
      expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
      const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(fond).toBe('rgb(11, 20, 28)');
      const jeton = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase());
      expect(jeton).toBe('#0b141c');
    } finally {
      await session.contexte.close();
    }
  });
});

describe('10 · prefers-reduced-motion (08, « Accessibilité »)', () => {
  it('avec mouvement réduit, aucune transition ni animation n’est active, sur chaque onglet', async () => {
    const session = await ouvrirAvecDonnees({ reducedMotion: 'reduce' });
    try {
      const page = session.page;
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      for (const onglet of ONGLETS) {
        await ouvrirOnglet(page, onglet);
        const actives = await page.evaluate(() => {
          const animations = document.getAnimations().map((animation) => animation.playState);
          const mouvements = [...document.querySelectorAll('*')].flatMap((element) => {
            const style = getComputedStyle(element);
            const transition = style.transitionDuration.split(',').some((duree) => parseFloat(duree) > 0);
            const animation = style.animationName !== 'none' && style.animationDuration.split(',').some((duree) => parseFloat(duree) > 0);
            return transition || animation ? [element.tagName] : [];
          });
          return { animations, mouvements };
        });
        expect(actives.animations, onglet).toEqual([]);
        expect(actives.mouvements, onglet).toEqual([]);
      }
    } finally {
      await session.contexte.close();
    }
  });
});
