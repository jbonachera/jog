// P2 · Tendances (03, P2 ; 04, « Allure normalisée », « Efficacité en footing », « Découplage »).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatPourcentage } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP2 } from '../../src/ui/composants/p2';
import { footing, J_PROGRESSION, repetitionDe, sortieLongue, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;

/**
 * Trois semaines d'historique. Allure : 240 s/km puis 230 s/km (moyenne glissante 235). EF : 1,50 puis 1,60.
 * Découplage : 4 % (base solide), 6 % (sortie avec allure marathon), 5 % : la moyenne glissante monte.
 */
function vueDeTest(): Vue {
  const seances = [
    sousSeuil(ajouterJours(J, -70), [repetitionDe(1, 360, 240, 164)]),
    sousSeuil(ajouterJours(J, -10), [repetitionDe(1, 360, 230, 164)]),
    footing(ajouterJours(J, -72), { ef: 1.5 }),
    footing(ajouterJours(J, -12), { ef: 1.6 }),
    sortieLongue(ajouterJours(J, -60), 4),
    sortieLongue(ajouterJours(J, -40), 6, { avecMp: true }),
    sortieLongue(ajouterJours(J, -20), 5),
  ];
  return vueLitterale(seances, ajouterJours(J, -80), { J });
}

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP2(conteneur, vue);
  return conteneur;
}

function panneau(racine: HTMLElement, titre: string): HTMLElement {
  const titreEl = within(racine).getByRole('heading', { name: titre });
  const section = titreEl.closest('section');
  if (section === null) throw new Error(`pas de panneau « ${titre} »`);
  return section;
}

function valeurEnGrand(panneauEl: HTMLElement): string | null {
  return panneauEl.querySelector('.p2-valeur')?.textContent ?? null;
}

describe('P2 · trois panneaux (03, P2)', () => {
  it('affiche trois panneaux : allure à la FC de référence, efficacité en footing, découplage', () => {
    const racine = rendre(vueDeTest());

    expect(within(racine).getByRole('heading', { name: 'Allure sous-seuil à 164 bpm' })).toBeDefined();
    expect(within(racine).getByRole('heading', { name: 'Efficacité en footing' })).toBeDefined();
    expect(within(racine).getByRole('heading', { name: 'Découplage en sortie longue' })).toBeDefined();
    expect(racine.querySelectorAll('[role="img"]').length).toBe(3);
  });

  it('chaque panneau porte la dernière valeur en grand, la valeur lissée', () => {
    const racine = rendre(vueDeTest());

    // Allure : moyenne glissante sur 4 semaines, 240 puis (240 + 230) ÷ 2 = 235 s/km.
    expect(valeurEnGrand(panneau(racine, 'Allure sous-seuil à 164 bpm'))).toBe('3:55/km');
    expect(valeurEnGrand(panneau(racine, 'Efficacité en footing'))).toBe('1,55');
    expect(valeurEnGrand(panneau(racine, 'Découplage en sortie longue'))).toBe(formatPourcentage(5, 1));
  });

  it('une pastille donne l\'écart depuis le début, dans le sens de la progression', () => {
    const racine = rendre(vueDeTest());

    // L'allure baisse de 5 s/km : c'est mieux. L'EF monte : c'est mieux.
    expect(panneau(racine, 'Allure sous-seuil à 164 bpm').querySelector('.pastille-good')).not.toBeNull();
    expect(panneau(racine, 'Efficacité en footing').querySelector('.pastille-good')).not.toBeNull();
    // Le découplage monte : c'est moins bien (orange, avec son texte).
    const decouplage = panneau(racine, 'Découplage en sortie longue');
    expect(decouplage.querySelector('.pastille-warn')).not.toBeNull();
    expect(within(decouplage).getByText(/depuis le début/)).toBeDefined();
  });

  it('une valeur sans point s\'écrit « – », sans pastille de sens', () => {
    const racine = rendre(vueLitterale([], ajouterJours(J, -30), { J }));
    const allure = panneau(racine, 'Allure sous-seuil à 164 bpm');
    expect(valeurEnGrand(allure)).toBe('–');
    expect(allure.querySelector('.pastille')).toBeNull();
  });

  it('chaque panneau porte une note de méthode d\'une ligne', () => {
    const racine = rendre(vueDeTest());
    expect(within(panneau(racine, 'Allure sous-seuil à 164 bpm')).getByText(/moyenne glissante sur 4 semaines/)).toBeDefined();
  });
});

describe('P2 · formes et bandes (08, règle 6 ; D-005)', () => {
  it('une sortie avec allure marathon est un losange, les autres des ronds, dans le graphique et dans la légende', () => {
    const decouplage = panneau(rendre(vueDeTest()), 'Découplage en sortie longue');

    const svg = decouplage.querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelectorAll('polygon.marque').length).toBe(1);
    expect(svg.querySelectorAll('circle.marque').length).toBe(2);

    const legende = within(decouplage).getByRole('list', { name: 'Légende' });
    const avecMp = within(legende).getByText('Sortie avec allure marathon').closest('li');
    const sansMp = within(legende).getByText('Sortie sans allure marathon').closest('li');
    expect(avecMp?.querySelector('polygon')).not.toBeNull();
    expect(sansMp?.querySelector('circle')).not.toBeNull();
  });

  it('le découplage porte une bande de 0 à 5 %', () => {
    const decouplage = panneau(rendre(vueDeTest()), 'Découplage en sortie longue');
    expect(decouplage.querySelector('svg .bande')).not.toBeNull();
  });

  it('les graphiques d\'allure et d\'efficacité n\'ont pas de bande', () => {
    const racine = rendre(vueDeTest());
    expect(panneau(racine, 'Allure sous-seuil à 164 bpm').querySelector('svg .bande')).toBeNull();
    expect(panneau(racine, 'Efficacité en footing').querySelector('svg .bande')).toBeNull();
  });
});

describe('P2 · accessibilité et vocabulaire', () => {
  it('chaque graphique a un role="img", un aria-label et son bouton Graphique · Tableau', () => {
    const racine = rendre(vueDeTest());
    for (const svg of Array.from(racine.querySelectorAll('svg[role="img"]'))) {
      expect(svg.getAttribute('aria-label')).not.toBe('');
    }
    expect(racine.querySelectorAll('button')).toHaveLength(6);
  });

  it('aucun attribut style et aucun mot interdit, tableaux ouverts', () => {
    const racine = rendre(vueDeTest());
    expect(racine.querySelector('[style]')).toBeNull();
    expect(mesTextesInterdits(racine)).toEqual([]);
  });
});
