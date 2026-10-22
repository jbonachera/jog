// A1 · Simulateur « Et si je cours… » (05, « Simulateur »). Les valeurs attendues sont calculées à la main
// à partir des entrées de SIMULATEUR_DE_TEST (CTL et ATL à 100, charge de 9 par km, 230 km sur J−23 à J−1).
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreA1 } from '../../src/ui/composants/a1';
import type { Vue } from '../../src/core/types';
import { SIMULATEUR_DE_TEST, vueDecision } from '../fixtures/vues';

afterEach(() => document.body.replaceChildren());

const NOM_CURSEUR = 'Et si je cours sur les 7 prochains jours ?';

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA1(conteneur, v);
  return conteneur;
}

function curseur(conteneur: HTMLElement): HTMLInputElement {
  return within(conteneur).getByRole('slider', { name: NOM_CURSEUR }) as HTMLInputElement;
}

/** La zone annoncée (aria-live) des résultats, retrouvée par la phrase de position. */
function sortie(conteneur: HTMLElement, phrase: RegExp): HTMLElement {
  return within(conteneur).getByText(phrase).closest('[aria-live]') as HTMLElement;
}

/** La pastille d'une mesure du simulateur, par le nom de la mesure. */
function pastilleMesure(zone: HTMLElement, nom: string): HTMLElement {
  const mesure = within(zone).getByText(nom).closest('.sim-mesure');
  const pastille = mesure?.querySelector('.pastille');
  if (pastille === null || pastille === undefined) throw new Error(`pastille absente : ${nom}`);
  return pastille as HTMLElement;
}

const RATIO = 'Ratio projeté, 7 j / 30 j';
const FRAICHEUR = 'Fraîcheur dans 7 jours';

describe('A1 · simulateur (05)', () => {
  it('le curseur a un nom fixe, des bornes issues du simulateur, un pas de 1 km et part au milieu de la fourchette', () => {
    const conteneur = rendre(vueDecision());

    const cur = curseur(conteneur);
    expect(cur.getAttribute('min')).toBe('48');
    expect(cur.getAttribute('max')).toBe('152');
    expect(cur.getAttribute('step')).toBe('1');
    expect(cur.value).toBe('103');
  });

  it('la valeur du curseur est donnée en km à la lecture d\'écran (aria-valuetext)', () => {
    const conteneur = rendre(vueDecision());
    const cur = curseur(conteneur);
    expect(cur.getAttribute('aria-valuetext')).toBe('103 km');

    fireEvent.input(cur, { target: { value: '104' } });

    expect(cur.getAttribute('aria-valuetext')).toBe('104 km');
  });

  it('le nom du curseur ne change pas quand on le déplace : il ne contient pas la valeur', () => {
    const conteneur = rendre(vueDecision());
    const cur = curseur(conteneur);

    fireEvent.input(cur, { target: { value: '90' } });

    expect(within(conteneur).getByRole('slider', { name: NOM_CURSEUR })).toBe(cur);
  });

  it('à 103 km (milieu de 100–105) : ratio 1,33 à surveiller, fraîcheur −16, dans la fourchette', () => {
    // Ratio : 103 ÷ ((230 + 103) ÷ 30 × 7) = 1,3257… → 1,33, au-dessus de 1,3.
    // Fraîcheur : charge du jour 103 × 9 ÷ 7 = 132,4 ; TSB = (100 − 132,4) × ((41/42)⁷ − (6/7)⁷) ≈ −16,4 → −16.
    const conteneur = rendre(vueDecision());

    const zone = sortie(conteneur, /Dans la fourchette proposée/);
    expect(within(zone).getByText('1,33')).toBeDefined();
    expect(within(zone).getByText('À surveiller')).toBeDefined();
    expect(within(zone).getByText('−16')).toBeDefined();
    expect(within(zone).getByText('OK')).toBeDefined();
  });

  it('les pastilles du simulateur portent chacune leur état : ratio à surveiller, fraîcheur OK à 103 km', () => {
    const zone = sortie(rendre(vueDecision()), /Dans la fourchette proposée/);

    expect(pastilleMesure(zone, RATIO).classList.contains('pastille-warn')).toBe(true);
    expect(pastilleMesure(zone, FRAICHEUR).classList.contains('pastille-good')).toBe(true);
  });

  it('à 120 km, le ratio est à surveiller et la fraîcheur en alerte : chaque pastille a sa propre classe', () => {
    const conteneur = rendre(vueDecision());

    fireEvent.input(curseur(conteneur), { target: { value: '120' } });

    const zone = sortie(conteneur, /au-dessus de la fourchette/);
    expect(pastilleMesure(zone, RATIO).classList.contains('pastille-warn')).toBe(true);
    expect(pastilleMesure(zone, FRAICHEUR).classList.contains('pastille-bad')).toBe(true);
  });

  it('déplacer le curseur à 90 km met à jour ratio, fraîcheur, pastilles et phrase, à la main', () => {
    // Ratio : 90 ÷ ((230 + 90) ÷ 30 × 7) = 1,2053… → 1,21 (OK).
    // Fraîcheur : charge du jour 90 × 9 ÷ 7 = 115,7 ; TSB ≈ −7,9 → −8 (OK). Sous la fourchette de 10 km.
    const conteneur = rendre(vueDecision());

    fireEvent.input(curseur(conteneur), { target: { value: '90' } });

    const zone = sortie(conteneur, /10 km sous la fourchette/);
    expect(within(zone).getByText('1,21')).toBeDefined();
    expect(within(zone).getByText('−8')).toBeDefined();
    expect(within(zone).getAllByText('OK')).toHaveLength(2);
    expect(pastilleMesure(zone, RATIO).classList.contains('pastille-good')).toBe(true);
    expect(pastilleMesure(zone, FRAICHEUR).classList.contains('pastille-good')).toBe(true);
    expect(within(conteneur).getByText('90 km', { selector: 'b' })).toBeDefined();
  });

  it('à 120 km : ratio 1,47 à surveiller, fraîcheur −27 en alerte, 15 km au-dessus de la fourchette', () => {
    // Ratio : 120 ÷ ((230 + 120) ÷ 30 × 7) = 1,4693… → 1,47. Fraîcheur : 120 × 9 ÷ 7 = 154,3 ; TSB ≈ −27,4 → −27.
    const conteneur = rendre(vueDecision());

    fireEvent.input(curseur(conteneur), { target: { value: '120' } });

    const zone = sortie(conteneur, /15 km au-dessus de la fourchette/);
    expect(within(zone).getByText('1,47')).toBeDefined();
    expect(within(zone).getByText('À surveiller')).toBeDefined();
    expect(within(zone).getByText('−27')).toBeDefined();
    expect(within(zone).getByText('Alerte')).toBeDefined();
  });

  it('une fraîcheur positive s\'écrit avec son signe : « +3 »', () => {
    // Charge nulle : CTL 8 et ATL 10 donnent, après sept jours, 8 × (41/42)⁷ − 10 × (6/7)⁷ ≈ 3,36 → +3.
    const conteneur = rendre(vueDecision({ simulateur: { ...SIMULATEUR_DE_TEST, ctlJm1: 8, atlJm1: 10, chargeParKm: 0 } }));

    const zone = sortie(conteneur, /Dans la fourchette proposée/);
    expect(within(zone).getByText('+3').classList.contains('num')).toBe(true);
    expect(pastilleMesure(zone, FRAICHEUR).classList.contains('pastille-good')).toBe(true);
  });

  it('un ratio indéfini (aucun km sur les 23 jours passés, et 0 km) s\'écrit « – », en pastille de données insuffisantes', () => {
    const conteneur = rendre(vueDecision({ simulateur: { ...SIMULATEUR_DE_TEST, km23j: 0, min: 0, defaut: 0 } }));

    const zone = sortie(conteneur, /km sous la fourchette/);
    const mesure = within(zone).getByText(RATIO).closest('.sim-mesure') as HTMLElement;
    expect(within(mesure).getByText('–')).toBeDefined();
    expect(pastilleMesure(zone, RATIO).classList.contains('pastille-neutre')).toBe(true);
    expect(within(mesure).getByText('Données insuffisantes')).toBeDefined();
  });

  it('la zone des résultats est annoncée (aria-live polite)', () => {
    const conteneur = rendre(vueDecision());

    const zone = sortie(conteneur, /Dans la fourchette proposée/);
    expect(zone.getAttribute('aria-live')).toBe('polite');
  });

  it('la mention « Estimation à intensité inchangée » est hors de la zone annoncée, et reste affichée', () => {
    const conteneur = rendre(vueDecision());

    expect(sortie(conteneur, /Dans la fourchette proposée/).textContent).not.toContain('Estimation à intensité inchangée');
    expect(within(conteneur).getByText(/estimation à intensité inchangée/i)).toBeDefined();
  });

  it('aucun attribut style dans le rendu, simulateur compris (ADR 0010)', () => {
    const conteneur = rendre(vueDecision());

    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('déplacer le curseur ne change que l\'encart : ni le verdict, ni le curseur ne sont remplacés', () => {
    const conteneur = rendre(vueDecision());
    const titre = within(conteneur).getByRole('heading', { name: 'Augmenter', level: 2 });
    const cur = curseur(conteneur);

    fireEvent.input(cur, { target: { value: '90' } });

    expect(within(conteneur).getByRole('heading', { name: 'Augmenter', level: 2 })).toBe(titre);
    expect(curseur(conteneur)).toBe(cur);
  });
});
