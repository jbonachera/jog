// A4 · Note de forme et fatigue (03, 08) : quatre paragraphes, constantes issues des paramètres,
// lecture du jour et son état, rappel que la tendance prime.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreA4 } from '../../src/ui/composants/a4';
import type { Vue } from '../../src/core/types';
import { serieCharge, vue } from '../fixtures/vues';

afterEach(() => document.body.replaceChildren());

const J = '2026-10-21';

/** Une Vue dont le dernier jour (J−1) est (CTL, ATL). Les constantes viennent des paramètres. */
function vueAvec(dernier: [number, number], ctlDays = 42, atlDays = 7): Vue {
  const base = vue([], { J });
  return {
    ...base,
    parametresEnVigueur: { ...base.parametresEnVigueur, globaux: { ...base.parametresEnVigueur.globaux, ctlDays, atlDays } },
    serieCharge: serieCharge(J, [[40, 41], dernier]),
  };
}

/** Une Vue dont le dernier jour a une fraîcheur (TSB) donnée, sans passer par CTL et ATL. */
function vueAvecTsb(tsb: number): Vue {
  const base = vue([], { J });
  return { ...base, serieCharge: [{ date: '2026-10-20', ctl: 50, atl: 50, tsb }] };
}

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA4(conteneur, v);
  return conteneur;
}

/** Le texte de la note, paragraphe par paragraphe. */
function paragraphes(conteneur: HTMLElement): string[] {
  return [...conteneur.querySelectorAll('.note p')].map((p) => p.textContent ?? '');
}

/** La phrase de lecture du jour, et son état. */
function lectureDuJour(tsb: number): string {
  return paragraphes(rendre(vueAvecTsb(tsb))).find((p) => p.startsWith('Aujourd’hui')) ?? '';
}

describe('A4 · note (03, A4 : définitions, repères, lecture du jour)', () => {
  it('la note tient en quatre paragraphes', () => {
    expect(paragraphes(rendre(vueAvec([48.4, 52.1])))).toHaveLength(4);
  });

  it('les constantes de la forme et de la fatigue viennent des paramètres en vigueur', () => {
    const texte = paragraphes(rendre(vueAvec([48.4, 52.1]))).join(' ');
    expect(texte).toContain('moyenne de la charge quotidienne sur 42 jours');
    expect(texte).toContain('même calcul sur 7 jours');
  });

  it('changer la Vue de 42 à 30 jours change le texte de la note', () => {
    const texte = paragraphes(rendre(vueAvec([48.4, 52.1], 30, 7))).join(' ');

    expect(texte).toContain('sur 30 jours');
    expect(texte).not.toContain('sur 42 jours');
  });

  it('la constante de la fatigue vient des paramètres : atlDays = 5 est reflété dans la note', () => {
    const texte = paragraphes(rendre(vueAvec([48.4, 52.1], 42, 5))).join(' ');

    expect(texte).toContain('même calcul sur 5 jours');
    expect(texte).not.toContain('sur 7 jours');
  });

  it('CTL, ATL et TSB sont toujours accompagnés de leur nom en clair', () => {
    const texte = paragraphes(rendre(vueAvec([48.4, 52.1]))).join(' ');

    expect(texte).toContain('Forme de fond (CTL)');
    expect(texte).toContain('Fatigue (ATL)');
    expect(texte).toContain('Fraîcheur (TSB)');
  });

  it('la lecture du jour donne forme, fatigue, fraîcheur et l\'état : forme 48, fatigue 52, fraîcheur −4, équilibre', () => {
    // Dernier jour : CTL 48,4, ATL 52,1, TSB −3,7, arrondi à −4 : entre −10 et +5, c'est l'équilibre.
    const texte = paragraphes(rendre(vueAvec([48.4, 52.1]))).join(' ');

    expect(texte).toContain('Aujourd’hui : forme de fond 48, fatigue 52, fraîcheur −4, soit équilibre.');
  });

  it('une fraîcheur de −16 est une charge productive, et sous −25 une surcharge, en alerte', () => {
    expect(paragraphes(rendre(vueAvec([50, 66])))[3]).toContain('soit charge productive.');
    expect(paragraphes(rendre(vueAvec([50, 77])))[3]).toContain('soit surcharge, en alerte.');
  });

  it('au-dessus de +5, la lecture dit frais, à surveiller', () => {
    expect(paragraphes(rendre(vueAvec([50, 40])))[3]).toContain('soit frais, à surveiller.');
  });

  it('aux bornes, l\'état suit le TSB arrondi au point : −25,4 est productif, −25,6 (arrondi à −26) en surcharge', () => {
    expect(lectureDuJour(-25.4)).toContain('fraîcheur −25, soit charge productive.');
    expect(lectureDuJour(-25.6)).toContain('fraîcheur −26, soit surcharge, en alerte.');
  });

  it('à −10, la fraîcheur est encore productive ; à −9,4 (arrondi à −9), on est en équilibre', () => {
    expect(lectureDuJour(-10)).toContain('soit charge productive.');
    expect(lectureDuJour(-9.4)).toContain('fraîcheur −9, soit équilibre.');
  });

  it('à +5,4 (arrondi à +5), on est en équilibre ; à +5,6 (arrondi à +6), frais, à surveiller', () => {
    expect(lectureDuJour(5.4)).toContain('fraîcheur +5, soit équilibre.');
    expect(lectureDuJour(5.6)).toContain('fraîcheur +6, soit frais, à surveiller.');
  });

  it('la note rappelle que la tendance prime sur la valeur absolue', () => {
    expect(paragraphes(rendre(vueAvec([48.4, 52.1])))[3]).toContain('seule la tendance compte, pas la valeur absolue');
  });

  it('les repères de lecture de la fraîcheur sont dans la note (−10 à −25, sous −25, au-dessus de +5)', () => {
    const troisieme = paragraphes(rendre(vueAvec([48.4, 52.1])))[2] ?? '';

    expect(troisieme).toContain('De −10 à −25');
    expect(troisieme).toContain('Sous −25');
    expect(troisieme).toContain('Au-dessus de +5');
  });

  it('sans historique de charge, la lecture du jour est absente', () => {
    const conteneur = rendre({ ...vue([], { J }), serieCharge: [] });

    expect(within(conteneur).queryByText(/Aujourd’hui/)).toBeNull();
  });
});
