import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// P5 · relecture (03, P5 ; revue points 13, 14, 15). Sous-titre sous le titre, phrase de la source (course ou test),
// en-têtes numériques alignés à droite, « = » sans pastille, pastille seulement si l'équivalence bat le record,
// `th scope="row"`, `caption`, conteneur du tableau focalisable et nommé.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatDate } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP5 } from '../../src/ui/composants/p5';
import { courseOuTest, J_PROGRESSION, vueLitterale } from '../fixtures/progression';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
/** Le sous-titre de 03, avec son apostrophe typographique. */
const SOUS_TITRE = 'c’est un niveau, pas une prédiction ; la performance sur longue distance dépend aussi du volume';

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP5(conteneur, vue);
  return conteneur;
}

/** Un test de 5 km en 20:00 : il est à la fois la source et le record du 5 km. */
function vueAvecTest(): Vue {
  return vueLitterale([courseOuTest('test', ajouterJours(J, -30), 5, 1200)], ajouterJours(J, -200), { J });
}

/** Un 10 km couru en 45:00 : l'équivalence de 10 km, plus rapide (41:40 environ), bat ce record. */
function vueAvecRecord10(): Vue {
  return vueLitterale(
    [courseOuTest('test', ajouterJours(J, -30), 5, 1200), courseOuTest('course', ajouterJours(J, -100), 10, 2700)],
    ajouterJours(J, -200),
    { J },
  );
}

function ligne(racine: HTMLElement, distance: string): HTMLTableRowElement {
  const trouvee = Array.from(racine.querySelectorAll('tbody tr')).find((tr) => tr.querySelector('th')?.textContent === distance);
  if (trouvee === undefined) throw new Error(`pas de ligne « ${distance} »`);
  return trouvee as HTMLTableRowElement;
}

describe('P5 · titre et sous-titre (revue point 13)', () => {
  it('le sous-titre suit immédiatement le titre, comme un élément frère', () => {
    const racine = rendre(vueAvecTest());
    const titre = within(racine).getByRole('heading', { name: 'Niveau estimé' });

    expect(titre.nextElementSibling?.textContent).toBe(SOUS_TITRE);
    expect(titre.nextElementSibling?.classList.contains('aide')).toBe(true);
  });
});

describe('P5 · source (03, P5)', () => {
  it('une source en test s\'écrit « Test de 5 km du … , en 20:00. »', () => {
    const texte = rendre(vueAvecTest()).querySelector('.p5-source')?.textContent;

    expect(texte).toBe(`Source : test de 5 km du ${formatDate(ajouterJours(J, -30))}, en 20:00.`);
  });

  it('une source en course s\'écrit « Course de 5 km … »', () => {
    const vue = vueLitterale([courseOuTest('course', ajouterJours(J, -30), 5, 1200)], ajouterJours(J, -200), { J });
    const texte = rendre(vue).querySelector('.p5-source')?.textContent;

    expect(texte).toBe(`Source : course de 5 km du ${formatDate(ajouterJours(J, -30))}, en 20:00.`);
  });
});

describe('P5 · tableau (03, P5 ; 08)', () => {
  it('les en-têtes des colonnes numériques sont alignés à droite (classe num)', () => {
    const entetes = Array.from(rendre(vueAvecTest()).querySelectorAll('thead th'));
    const parTitre = (titre: string): Element | undefined => entetes.find((th) => th.textContent === titre);

    for (const titre of ['Équivalence', 'Allure', 'Record', 'Écart au record']) expect(parTitre(titre)?.classList.contains('num')).toBe(true);
    expect(parTitre('Distance')?.classList.contains('num')).toBe(false);
  });

  it('chaque distance est un en-tête de ligne (th scope="row")', () => {
    const racine = rendre(vueAvecTest());

    expect(racine.querySelectorAll('tbody th[scope="row"]')).toHaveLength(4);
  });

  it('le tableau a une légende (caption) non vide', () => {
    const legende = rendre(vueAvecTest()).querySelector('caption')?.textContent?.trim();

    expect(legende).toBeTruthy();
  });

  it('un écart nul affiche « = » sans pastille, même quand l\'équivalence est le record', () => {
    const cellule = ligne(rendre(vueAvecTest()), '5 km').querySelectorAll('td')[4];

    expect(cellule?.textContent).toBe('=');
    expect(cellule?.querySelector('.pastille')).toBeNull();
  });

  it('la pastille verte n\'apparaît que si l\'équivalence bat le record', () => {
    const racine = rendre(vueAvecRecord10());
    const dix = ligne(racine, '10 km').querySelectorAll('td')[4];
    const cinq = ligne(racine, '5 km').querySelectorAll('td')[4];

    expect(dix?.querySelector('.pastille-good')).not.toBeNull();
    expect(cinq?.querySelector('.pastille')).toBeNull();
  });

  it('sans record, l\'écart est « – » et n\'a pas de pastille', () => {
    const cellule = ligne(rendre(vueAvecTest()), 'Marathon').querySelectorAll('td')[4];

    expect(cellule?.textContent).toBe('–');
  });
});

describe('P5 · conteneur du tableau (08, revue point 14)', () => {
  it('le conteneur est focalisable et a un nom accessible', () => {
    const boite = rendre(vueAvecTest()).querySelector('.tablebox') as HTMLElement;

    expect(boite.getAttribute('tabindex')).toBe('0');
    expect(boite.getAttribute('aria-label')).toBe('Niveau estimé par distance');
  });
});

describe('P5 · alignement des en-têtes numériques (feuille de style)', () => {
  it('la feuille de style aligne à droite les en-têtes numériques du tableau de P5', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8');

    expect(css).toMatch(/\.p5-table th\.num[^{]*\{[^}]*text-align:\s*right/);
  });
});
