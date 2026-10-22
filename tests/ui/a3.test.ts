// A3 « 7 derniers jours » (03) : rendu DOM observé par rôle, nom accessible et texte.
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { rendreA3 } from '../../src/ui/composants/a3';
import { J_REFERENCE, repetition, seance, vue } from '../fixtures/vues';
import type { Vue } from '../../src/core/types';

afterEach(() => document.body.replaceChildren());

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA3(conteneur, v);
  return conteneur;
}

/** La ligne d'un jour, par son nom accessible complet (« lundi 19 octobre »). */
function ligneDuJour(conteneur: HTMLElement, nomComplet: string): HTMLElement {
  return within(conteneur).getByRole('listitem', { name: nomComplet });
}

/** Le texte court de la date de chaque ligne, dans l'ordre affiché. */
function datesAffichees(conteneur: HTMLElement): string[] {
  return within(conteneur)
    .getAllByRole('listitem')
    .map((li) => within(li).getByText(/^\S+ \d+$/).textContent ?? '');
}

function rectangles(conteneur: HTMLElement, nomComplet: string): SVGRectElement[] {
  const barre = within(ligneDuJour(conteneur, nomComplet)).getByRole('img', { name: /Répartition/ });
  return Array.from(barre.querySelectorAll('rect'));
}

describe('A3 · 7 derniers jours (03)', () => {
  it('affiche sept lignes, de J−1 à J−7, la plus récente en haut, jours sans séance compris', () => {
    const conteneur = rendre(vue([]));

    expect(datesAffichees(conteneur)).toEqual(['mar. 20', 'lun. 19', 'dim. 18', 'sam. 17', 'ven. 16', 'jeu. 15', 'mer. 14']);
  });

  it('J = lundi 5 janvier 2026 : les jours de décembre et de janvier s\'enchaînent, sans zéro devant le quantième', () => {
    const conteneur = rendre(vue([], { J: '2026-01-05' }));

    expect(datesAffichees(conteneur)).toEqual(['dim. 4', 'sam. 3', 'ven. 2', 'jeu. 1', 'mer. 31', 'mar. 30', 'lun. 29']);
    expect(ligneDuJour(conteneur, 'jeudi 1 janvier')).toBeDefined();
  });

  it('J = 1er janvier 2026 : les sept jours sont en décembre', () => {
    const conteneur = rendre(vue([], { J: '2026-01-01' }));

    expect(datesAffichees(conteneur)).toEqual(['mer. 31', 'mar. 30', 'lun. 29', 'dim. 28', 'sam. 27', 'ven. 26', 'jeu. 25']);
    expect(ligneDuJour(conteneur, 'jeudi 25 décembre')).toBeDefined();
  });

  it('chaque ligne a un nom accessible complet, et sa date est en datetime', () => {
    const conteneur = rendre(vue([]));

    const ligne = ligneDuJour(conteneur, 'lundi 19 octobre');
    expect(within(ligne).getByText('lun. 19').getAttribute('datetime')).toBe('2026-10-19');
  });

  it('n\'affiche pas la séance du jour J, qui n\'est pas encore arrêtée', () => {
    const conteneur = rendre(
      vue([seance({ date: J_REFERENCE, type: 'footing-lignes-droites' }), seance({ date: '2026-10-19', type: 'footing' })]),
    );

    expect(within(conteneur).queryByText('Footing + lignes droites')).toBeNull();
    expect(within(conteneur).getByText('1 séance · 5,0 km · 0 min de sous-seuil')).toBeDefined();
  });

  it('affiche « Repos » pour un jour sans séance', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-20', type: 'footing' })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('Repos')).toBeDefined();
    expect(within(ligneDuJour(conteneur, 'mardi 20 octobre')).queryByText('Repos')).toBeNull();
  });

  it('libelle « Sous-seuil 6×6′ » et ajoute l\'allure moyenne des répétitions', () => {
    const reps = [1, 2, 3, 4, 5, 6].map((n) => repetition(n, 232));
    const conteneur = rendre(
      vue([seance({ date: '2026-10-19', type: 'sous-seuil', format: '6×6′', duree_min: 65, km: 12.3, fcMoy: 142, repetitions: reps })]),
    );

    const ligne = ligneDuJour(conteneur, 'lundi 19 octobre');
    expect(within(ligne).getByText('Sous-seuil 6×6′')).toBeDefined();
    expect(within(ligne).getByText('1h05 · 12,3 km · 142 bpm · rép. 3:52/km')).toBeDefined();
  });

  it('l\'allure des répétitions est la moyenne, et non la médiane', () => {
    const reps = [repetition(1, 200), repetition(2, 230), repetition(3, 300)];
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'sous-seuil', format: '3×6′', repetitions: reps })]));

    // Moyenne : 243 s/km, soit 4:03. La médiane (230 s, 3:50) serait fausse.
    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText(/rép\. 4:03\/km/)).toBeDefined();
  });

  it('un footing qui porte des répétitions n\'affiche pas l\'allure « rép. »', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'footing', repetitions: [repetition(1, 232)] })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).queryByText(/rép\./)).toBeNull();
  });

  it('une sortie longue dit combien de minutes sont en allure marathon', () => {
    const conteneur = rendre(
      vue([
        seance({
          date: '2026-10-18',
          type: 'sortie-longue',
          duree_min: 130,
          km: 21.4,
          fcMoy: 148,
          mp_min: 40.3,
          minutes: { easy: 90, mp: 40 },
        }),
      ]),
    );

    const ligne = ligneDuJour(conteneur, 'dimanche 18 octobre');
    expect(within(ligne).getByText('Sortie longue dont 40′ allure marathon')).toBeDefined();
    expect(within(ligne).getByText('2h10 · 21,4 km · 148 bpm')).toBeDefined();
  });

  it('une sortie longue avec moins d\'une minute en allure marathon ne mentionne pas l\'allure marathon', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-18', type: 'sortie-longue', mp_min: 0.4, minutes: { easy: 90 } })]));

    const ligne = ligneDuJour(conteneur, 'dimanche 18 octobre');
    expect(within(ligne).getByText('Sortie longue')).toBeDefined();
    expect(within(ligne).queryByText(/allure marathon/)).toBeNull();
  });

  it('un sous-seuil sans format affiche « Sous-seuil » seul', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'sous-seuil', format: null })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('Sous-seuil')).toBeDefined();
  });

  it('une course affiche sa distance de référence, ou seulement son nom sans distance', () => {
    const conteneur = rendre(
      vue([
        seance({ date: '2026-10-19', type: 'course', distanceRef_km: 10 }),
        seance({ date: '2026-10-18', type: 'course', distanceRef_km: 21.1 }),
        seance({ date: '2026-10-17', type: 'course', distanceRef_km: null }),
      ]),
    );

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('Course · 10 km')).toBeDefined();
    expect(within(ligneDuJour(conteneur, 'dimanche 18 octobre')).getByText('Course · 21,1 km')).toBeDefined();
    expect(within(ligneDuJour(conteneur, 'samedi 17 octobre')).getByText('Course')).toBeDefined();
  });

  it('un test affiche sa distance de référence, ou seulement son nom sans distance', () => {
    const conteneur = rendre(
      vue([
        seance({ date: '2026-10-19', type: 'test', distanceRef_km: 5 }),
        seance({ date: '2026-10-18', type: 'test', distanceRef_km: null }),
      ]),
    );

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('Test · 5 km')).toBeDefined();
    expect(within(ligneDuJour(conteneur, 'dimanche 18 octobre')).getByText('Test')).toBeDefined();
  });

  it('une séance sans FC moyenne n\'affiche pas de bpm', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'footing', duree_min: 30, km: 5, fcMoy: null })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('0h30 · 5,0 km')).toBeDefined();
  });

  it('une séance de 0 km n\'affiche pas de distance', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'footing', duree_min: 30, km: 0, fcMoy: 120 })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByText('0h30 · 120 bpm')).toBeDefined();
  });

  it('le résumé est la somme des séances des 7 jours, calculée à la main', () => {
    // 5,0 + 12,3 + 21,4 = 38,7 km ; sous-seuil : 36 min ; 3 séances. La séance de J n'entre pas.
    const conteneur = rendre(
      vue([
        seance({ date: '2026-10-20', type: 'footing', km: 5 }),
        seance({ date: '2026-10-18', type: 'sous-seuil', km: 12.3, duree_min: 65, minutes: { easy: 29, subt: 36 } }),
        seance({ date: '2026-10-16', type: 'sortie-longue', km: 21.4, duree_min: 130, mp_min: 40, minutes: { easy: 90, mp: 40 } }),
        seance({ date: J_REFERENCE, type: 'footing', km: 99 }),
      ]),
    );

    expect(within(conteneur).getByText('3 séances · 38,7 km · 36 min de sous-seuil')).toBeDefined();
  });

  it.each([
    { nombre: 0, attendu: '0 séance · 0,0 km · 0 min de sous-seuil' },
    { nombre: 1, attendu: '1 séance · 5,0 km · 0 min de sous-seuil' },
    { nombre: 2, attendu: '2 séances · 10,0 km · 0 min de sous-seuil' },
  ])('le résumé accorde « séance » : $nombre séance(s)', ({ nombre, attendu }) => {
    const seances = Array.from({ length: nombre }, (_, i) => seance({ date: `2026-10-${String(19 - i).padStart(2, '0')}`, type: 'footing' }));
    const conteneur = rendre(vue(seances));

    expect(within(conteneur).getByText(attendu)).toBeDefined();
  });

  it('deux séances le même jour sont listées sous ce jour, chacune sur sa ligne', () => {
    const conteneur = rendre(
      vue([
        seance({ date: '2026-10-19', type: 'footing' }),
        seance({ date: '2026-10-19', type: 'footing-lignes-droites' }),
      ]),
    );

    const ligne = ligneDuJour(conteneur, 'lundi 19 octobre');
    expect(within(ligne).getByText('Footing')).toBeDefined();
    expect(within(ligne).getByText('Footing + lignes droites')).toBeDefined();
    expect(within(conteneur).getAllByRole('listitem')).toHaveLength(7);
  });

  it('la liste des jours a le rôle de liste explicite', () => {
    const conteneur = rendre(vue([]));

    expect(within(conteneur).getByRole('list').getAttribute('role')).toBe('list');
  });

  it('n\'emploie aucun mot du vocabulaire interdit (08, Rédaction)', () => {
    const conteneur = rendre(
      vue([
        seance({ date: '2026-10-20', type: 'footing' }),
        seance({ date: '2026-10-18', type: 'sous-seuil', format: '6×6′', repetitions: [repetition(1, 232)] }),
        seance({ date: '2026-10-16', type: 'sortie-longue', mp_min: 40 }),
      ]),
    );

    expect(conteneur.textContent).not.toMatch(/\b(prévu|objectif|plan|cycle|bloc|semaine allégée|lactate|préparation)\b/i);
  });
});

describe('barre de répartition par intensité (03, 08)', () => {
  it('trace les segments dans l\'ordre facile, allure marathon, sous-seuil, au-dessus du seuil, en classes z-*', () => {
    const conteneur = rendre(
      vue([seance({ date: '2026-10-19', type: 'sous-seuil', duree_min: 60, minutes: { easy: 30, mp: 10, subt: 0, hard: 20 } })]),
    );

    const segments = rectangles(conteneur, 'lundi 19 octobre');
    expect(segments.map((r) => r.getAttribute('class'))).toEqual(['z-easy', 'z-mp', 'z-hard']);
  });

  it('les largeurs des segments d\'une séance donnent 100 %, et se suivent sans trou', () => {
    const conteneur = rendre(
      vue([seance({ date: '2026-10-19', type: 'sous-seuil', duree_min: 60, minutes: { easy: 30, mp: 10, subt: 0, hard: 20 } })]),
    );

    const segments = rectangles(conteneur, 'lundi 19 octobre');
    const largeurs = segments.map((r) => Number(r.getAttribute('width')));
    const abscisses = segments.map((r) => Number(r.getAttribute('x')));
    expect(largeurs.reduce((somme, l) => somme + l, 0)).toBeCloseTo(100, 6);
    expect(largeurs[0]).toBeCloseTo(50, 6);
    expect(largeurs[1]).toBeCloseTo(100 / 6, 6);
    expect(largeurs[2]).toBeCloseTo(100 / 3, 6);
    expect(abscisses[0]).toBe(0);
    expect(abscisses[1]).toBeCloseTo(largeurs[0] ?? 0, 6);
    expect(abscisses[2]).toBeCloseTo((largeurs[0] ?? 0) + (largeurs[1] ?? 0), 6);
  });

  it('la légende ne cite que les intensités non nulles', () => {
    const conteneur = rendre(
      vue([seance({ date: '2026-10-19', type: 'sous-seuil', duree_min: 40, minutes: { easy: 30, subt: 10 } })]),
    );

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).getByRole('img', { name: 'Répartition : Facile 30 min, Sous-seuil 10 min' })).toBeDefined();
  });

  it('aucune barre si une séance n\'a aucune minute', () => {
    const conteneur = rendre(vue([seance({ date: '2026-10-19', type: 'footing', duree_min: 30, minutes: { easy: 0 } })]));

    expect(within(ligneDuJour(conteneur, 'lundi 19 octobre')).queryByRole('img', { name: /Répartition/ })).toBeNull();
  });
});
