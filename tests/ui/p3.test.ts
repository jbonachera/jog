// P3 · Allure × FC par répétition (03, P3 ; 04, « Centres du nuage allure × FC »). Comparaison mémorisée sous jog-cmp (02).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatAllure, formatDateAnnee } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP3 } from '../../src/ui/composants/p3';
import { StockageMemoire } from '../fixtures/montage';
import { J_PROGRESSION, repetitionDe, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;

/** Une répétition de 6 min à allure et FC de fin données : `repetitionDe(n, duree, allure, fc)`. */
function reps(allures: [number, number], fcs: [number, number]): ReturnType<typeof repetitionDe>[] {
  return [repetitionDe(1, 360, allures[0], fcs[0]), repetitionDe(2, 360, allures[1], fcs[1])];
}

/** Récente : 236 et 244 s/km (la plus rapide est à 236). Référence (vs il y a un an) : 252 et 256 s/km. */
function vueDeTest(): Vue {
  return vueLitterale(
    [
      sousSeuil(ajouterJours(J, -10), reps([236, 244], [166, 168]), "6×6'"),
      sousSeuil(ajouterJours(J, -400), reps([252, 256], [160, 162]), "6×6'"),
    ],
    ajouterJours(J, -450),
    { J },
  );
}

class StockageEnPanne {
  getItem(): string | null {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('stockage bloqué', 'SecurityError');
  }
}

function rendre(vue: Vue, stockage: unknown = new StockageMemoire()): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP3(conteneur, vue, stockage as never);
  return conteneur;
}

/** Le centre horizontal d'une marque, en pixels : cercle (cx) ou carré (x + moitié de la largeur). */
function centreX(marque: Element): number {
  if (marque.tagName === 'circle') return Number(marque.getAttribute('cx'));
  return Number(marque.getAttribute('x')) + Number(marque.getAttribute('width')) / 2;
}

describe('P3 · nuage et axes (03, P3)', () => {
  it('l\'axe X est inversé : la répétition la plus rapide est la plus à droite', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    const marques = Array.from(svg.querySelectorAll('.marque'));
    const plusADroite = marques.reduce((meilleure, m) => (centreX(m) > centreX(meilleure) ? m : meilleure));

    // La marque la plus à droite est la répétition récente à 236 s/km, soit 3:56.
    expect(plusADroite.getAttribute('aria-label')).toContain(`${formatAllure(236)}/km`);
    expect(plusADroite.tagName).toBe('rect');
  });

  it('les répétitions de référence sont des cercles, celles de la période récente des carrés', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelectorAll('circle.marque')).toHaveLength(2);
    expect(svg.querySelectorAll('rect.marque')).toHaveLength(2);
  });

  it('les centres des deux nuages sont marqués et reliés par une flèche encre', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelectorAll('.centre')).toHaveLength(2);
    expect(svg.querySelectorAll('.fleche-centres')).toHaveLength(1);
  });

  it('la bande de FC de fin (subtHrLo–subtHrHi) est tracée et libellée', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelector('.bande')).not.toBeNull();
    const libelle = svg.querySelector('.bande-libelle')?.textContent ?? '';
    expect(libelle).toContain('160');
    expect(libelle).toContain('168');
  });

  it('chaque point a une infobulle : date, format, numéro, allure et FC', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    const marque = svg.querySelector('rect.marque');
    expect(marque?.getAttribute('aria-label')).toBe(`${formatDateAnnee(ajouterJours(J, -10))} · 6×6' · répétition 1 · ${formatAllure(236)}/km · 166 bpm`);
  });
});

describe('P3 · note et légende (03, P3)', () => {
  it('la légende donne la période, sa plage de dates et le nombre de répétitions', () => {
    const racine = rendre(vueDeTest());
    const legende = within(racine).getByRole('list', { name: 'Légende' });
    expect(legende.textContent).toMatch(/2 répétitions/);
    expect(legende.textContent).toMatch(/Référence/);
    expect(legende.textContent).toMatch(/Récente/);
  });

  it('la note donne les centres « allure à FC → allure à FC » et l\'écart ramené à la FC de référence', () => {
    const racine = rendre(vueDeTest());
    // Référence : 254 s/km à 161 bpm. Récente : 240 s/km à 167 bpm. Ramené à 164 bpm : 7 s/km plus rapide.
    expect(within(racine).getByText(/4:14 à 161 bpm → 4:00 à 167 bpm/)).toBeDefined();
    expect(within(racine).getByText(/7 s\/km plus rapide/)).toBeDefined();
  });

  it('un écart négatif s\'écrit « moins rapide », avec son signe', () => {
    const vue = vueLitterale(
      [
        sousSeuil(ajouterJours(J, -10), reps([260, 262], [166, 168])),
        sousSeuil(ajouterJours(J, -400), reps([236, 240], [160, 162])),
      ],
      ajouterJours(J, -450),
      { J },
    );
    expect(within(rendre(vue)).getByText(/s\/km moins rapide/)).toBeDefined();
  });

  it('sans répétition dans une période, la note le dit', () => {
    const vue = vueLitterale([sousSeuil(ajouterJours(J, -10), reps([236, 244], [166, 168]))], ajouterJours(J, -450), { J });
    expect(within(rendre(vue)).getByText(/pas de répétition/i)).toBeDefined();
  });
});

describe('P3 · sélecteur de comparaison (02, jog-cmp)', () => {
  it('« vs il y a un an » est le choix par défaut', () => {
    const racine = rendre(vueDeTest());
    expect(within(racine).getByRole('button', { name: 'vs il y a un an' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('le choix se mémorise sous jog-cmp, et il est rétabli au rendu suivant', () => {
    const stockage = new StockageMemoire();
    const premier = rendre(vueDeTest(), stockage);
    fireEvent.click(within(premier).getByRole('button', { name: 'vs 12 semaines précédentes' }));
    expect(stockage.getItem('jog-cmp')).not.toBeNull();
    premier.remove();

    const second = rendre(vueDeTest(), stockage);
    expect(within(second).getByRole('button', { name: 'vs 12 semaines précédentes' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('un stockage bloqué n\'empêche ni l\'affichage ni le changement', () => {
    const racine = rendre(vueDeTest(), new StockageEnPanne());
    expect(() => fireEvent.click(within(racine).getByRole('button', { name: 'vs 12 semaines précédentes' }))).not.toThrow();
  });
});

describe('P3 · accessibilité et vocabulaire', () => {
  it('le graphique a un role="img", un aria-label et son bouton Graphique · Tableau', () => {
    const racine = rendre(vueDeTest());
    expect(racine.querySelector('svg[role="img"][aria-label]')).not.toBeNull();
    expect(within(racine).getByRole('button', { name: 'Tableau' })).toBeDefined();
  });

  it('aucun attribut style, aucun mot interdit', () => {
    const racine = rendre(vueDeTest());
    expect(racine.querySelector('[style]')).toBeNull();
    expect(mesTextesInterdits(racine)).toEqual([]);
  });
});
