// P4 · Dernière séance sous-seuil (03, P4 ; 04, « Régularité de séance », « Répétition hors sous-seuil »).
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { ajouterJours } from '../../src/core/dates';
import { formatAllure, formatDate } from '../../src/core/format';
import type { Vue } from '../../src/core/types';
import { rendreP4 } from '../../src/ui/composants/p4';
import { J_PROGRESSION, repetitionDe, sousSeuil, vueLitterale } from '../fixtures/progression';
import { mesTextesInterdits } from '../fixtures/vues';

afterEach(() => {
  document.body.replaceChildren();
});

const J = J_PROGRESSION;
const DATE = ajouterJours(J, -3);

/**
 * Dernière séance : 4 répétitions de 8 min, récupération de 2 min. Allures 240, 236, 242 et 241 s/km (moyenne
 * 239,75). Les répétitions 2 (plus rapide que l’allure seuil, 3:58) et 3 (FC de fin de 170 bpm, au-dessus de 168)
 * sont hors sous-seuil. Une séance plus ancienne précède celle-ci : seule la plus récente compte.
 */
function vueDeTest(): Vue {
  const derniere = {
    ...sousSeuil(DATE, [
      repetitionDe(1, 480, 240, 165),
      repetitionDe(2, 480, 236, 166),
      repetitionDe(3, 480, 242, 170),
      repetitionDe(4, 480, 241, 166),
    ], "4×8'"),
    recup_s: 120,
  };
  const ancienne = sousSeuil(ajouterJours(J, -30), [repetitionDe(1, 360, 250, 160)], "6×6'");
  return vueLitterale([ancienne, derniere], ajouterJours(J, -60), { J });
}

function rendre(vue: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreP4(conteneur, vue);
  return conteneur;
}

describe('P4 · sucettes (03, P4)', () => {
  it('une sucette par répétition de la dernière séance sous-seuil', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelectorAll('.marque')).toHaveLength(4);
    expect(svg.querySelectorAll('.tige')).toHaveLength(4);
  });

  it('une répétition hors sous-seuil est rouge ; sa raison est dans l\'infobulle', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    const rouges = Array.from(svg.querySelectorAll('.marque.couleur-alerte'));
    expect(rouges).toHaveLength(2);
    const infobulles = rouges.map((m) => m.getAttribute('aria-label') ?? '');
    expect(infobulles.some((t) => t.includes("plus rapide que l’allure seuil"))).toBe(true);
    expect(infobulles.some((t) => t.includes('FC de fin au-dessus de 168 bpm'))).toBe(true);
  });

  it('l\'infobulle donne l\'allure, l\'écart à la moyenne, la FC de fin', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    // Deuxième répétition : 236 s/km, 3 s/km sous la moyenne de 239,75 s/km, FC de fin de 166 bpm.
    const deuxieme = Array.from(svg.querySelectorAll('.marque'))
      .map((m) => m.getAttribute('aria-label') ?? '')
      .find((t) => t.includes(`${formatAllure(236)}/km`)) ?? '';
    expect(deuxieme).toContain(`${formatAllure(236)}/km`);
    expect(deuxieme).toContain('−4 s/km');
    expect(deuxieme).toContain('166 bpm');
  });

  it('la ligne de seuil est rouge, pointillée et libellée « seuil m:ss »', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelector('.alerte')).not.toBeNull();
    expect(svg.querySelector('.alerte-libelle')?.textContent).toBe('seuil 3:58');
  });

  it('une bande de ±3 s/km autour de la moyenne de la séance', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    expect(svg.querySelector('.bande')).not.toBeNull();
  });

  it('sous chaque répétition : « #n » et la FC de fin', () => {
    const svg = rendre(vueDeTest()).querySelector('svg[role="img"]') as SVGSVGElement;
    const textes = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(textes).toEqual(expect.arrayContaining(['#1', '#2', '#3', '#4', '165 bpm', '170 bpm']));
  });
});

describe('P4 · sous-titre et état vide (03, P4)', () => {
  it('le sous-titre donne la date, le format et la récupération', () => {
    const racine = rendre(vueDeTest());
    expect(within(racine).getByText(`${formatDate(DATE)} · 4×8' · récupération 2 min`)).toBeDefined();
  });

  it('sans séance sous-seuil, le dit sans graphique', () => {
    const racine = rendre(vueLitterale([], ajouterJours(J, -60), { J }));
    expect(within(racine).getByText('Aucune séance sous-seuil dans l’historique.')).toBeDefined();
    expect(racine.querySelector('svg')).toBeNull();
  });
});

describe('P4 · accessibilité et vocabulaire', () => {
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
