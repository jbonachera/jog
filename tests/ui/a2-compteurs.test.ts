// A2 · Volume réalisé (03, 04 « Compteurs »). Trois compteurs : année, 30 jours, 7 jours.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, within } from '@testing-library/dom';
import { rendreA2 } from '../../src/ui/composants/a2';
import { fermerInfobulle } from '../../src/ui/infobulle';
import type { Vue } from '../../src/core/types';
import { compteursDeTest, vue } from '../fixtures/vues';

afterEach(() => {
  fermerInfobulle();
  document.body.replaceChildren();
  document.getElementById('infobulle')?.remove();
});

const J = '2026-10-21';

function rendre(v: Vue): HTMLElement {
  const conteneur = document.createElement('div');
  document.body.append(conteneur);
  rendreA2(conteneur, v);
  return conteneur;
}

/** Le compteur dont le titre est donné (« Année 2026 », « 7 derniers jours »…). */
function compteur(conteneur: HTMLElement, titre: string): HTMLElement {
  const element = within(conteneur).getByRole('article', { name: titre });
  if (element === null) throw new Error(`compteur absent : ${titre}`);
  return element;
}

function pastilleDe(element: HTMLElement, texte: string): HTMLElement {
  const pastille = within(element).getByText(texte).closest('.pastille');
  if (pastille === null) throw new Error(`pastille absente : ${texte}`);
  return pastille as HTMLElement;
}

/** Le texte d'un élément, espaces insécables comprises, normalisé en espaces ordinaires. */
function texte(element: Element): string {
  return (element.textContent ?? '').replace(/\s/g, ' ');
}

describe('A2 · volume réalisé (03, A2)', () => {
  it('affiche les trois compteurs, avec leur libellé et leur plage de dates', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(within(compteur(conteneur, 'Année 2026')).getByText('du 1 janv. au 20 oct.')).toBeDefined();
    expect(within(compteur(conteneur, '30 derniers jours')).getByText('du 21 sept. au 20 oct.')).toBeDefined();
    expect(within(compteur(conteneur, '7 derniers jours')).getByText('du 14 oct. au 20 oct.')).toBeDefined();
  });

  it('au 1er janvier, l\'année du compteur est l\'année précédente, et sa plage va jusqu\'au 31 déc.', () => {
    const J1 = '2026-01-01';
    const conteneur = rendre({ ...vue([], { J: J1 }), compteurs: compteursDeTest(J1) });

    expect(within(conteneur).getByRole('article', { name: 'Année 2025' })).toBeDefined();
    expect(within(compteur(conteneur, 'Année 2025')).getByText('du 1 janv. au 31 déc.')).toBeDefined();
  });

  it('le km est en grand, avec une espace insécable comme séparateur de milliers', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    // Le texte est lu sans normalisation des espaces : l'espace insécable doit y être.
    const km = within(compteur(conteneur, 'Année 2026')).getByText('2 813 km');
    expect(km.textContent).toContain('2 813');
  });

  it('un total inférieur à 100 km garde une décimale ; un total entier n\'en a pas', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J, { jours7: { km: 41.2 }, jours30: { km: 300 } }) });

    expect(within(compteur(conteneur, '7 derniers jours')).getByText('41,2 km')).toBeDefined();
    expect(within(compteur(conteneur, '30 derniers jours')).getByText('300 km')).toBeDefined();
  });

  it('la ligne secondaire donne la durée et le nombre de séances', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(within(compteur(conteneur, 'Année 2026')).getByText('45h12 · 210 séances')).toBeDefined();
    expect(within(compteur(conteneur, '7 derniers jours')).getByText('5h00 · 4 séances')).toBeDefined();
  });

  it('une seule séance s\'écrit au singulier, zéro séance aussi : « 1 séance », « 0 séance »', () => {
    const conteneur = rendre({
      ...vue([], { J }),
      compteurs: compteursDeTest(J, { jours7: { nbSeances: 1 }, jours30: { nbSeances: 0 } }),
    });

    expect(within(compteur(conteneur, '7 derniers jours')).getByText('5h00 · 1 séance')).toBeDefined();
    expect(within(compteur(conteneur, '30 derniers jours')).getByText('25h00 · 0 séance')).toBeDefined();
  });

  it('pour l\'année, la comparaison est la moyenne par semaine, en pastille neutre', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(pastilleDe(compteur(conteneur, 'Année 2026'), '42,2 km par semaine').classList.contains('pastille-neutre')).toBe(true);
  });

  it('un écart de +31 % est en pastille orange ; +30 % reste en pastille neutre (seuil strict de 30 %)', () => {
    const conteneur = rendre({
      ...vue([], { J }),
      compteurs: compteursDeTest(J, { jours30: { ecart: 0.31 }, jours7: { ecart: 0.3 } }),
    });

    expect(pastilleDe(compteur(conteneur, '30 derniers jours'), '+31 %').classList.contains('pastille-warn')).toBe(true);
    expect(pastilleDe(compteur(conteneur, '7 derniers jours'), '+30 %').classList.contains('pastille-neutre')).toBe(true);
  });

  it('un écart de 0,304 s\'affiche « +30 % » et reste neutre : le seuil se compare à la précision affichée', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J, { jours7: { ecart: 0.304 } }) });

    expect(pastilleDe(compteur(conteneur, '7 derniers jours'), '+30 %').classList.contains('pastille-neutre')).toBe(true);
  });

  it('un écart négatif se signale de la même façon, avec le vrai signe moins', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J, { jours30: { ecart: -0.35 } }) });

    expect(pastilleDe(compteur(conteneur, '30 derniers jours'), '−35 %').classList.contains('pastille-warn')).toBe(true);
  });

  it('la comparaison nomme la période précédente : « 30 jours d’avant » ou « 7 jours d’avant »', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(texte(compteur(conteneur, '30 derniers jours').querySelector('.compteur-comparaison') as Element)).toContain('face aux 30 jours d’avant');
    expect(texte(compteur(conteneur, '7 derniers jours').querySelector('.compteur-comparaison') as Element)).toContain('face aux 7 jours d’avant');
  });

  it('sans période précédente, la comparaison dit « pas d’historique »', () => {
    const conteneur = rendre({
      ...vue([], { J }),
      compteurs: compteursDeTest(J, { jours30: { ecart: null, historiquePrecedent: false } }),
    });

    expect(pastilleDe(compteur(conteneur, '30 derniers jours'), 'pas d’historique').classList.contains('pastille-neutre')).toBe(true);
  });

  it('avec historique mais B à 0 km, la comparaison est indéfinie et affiche « – », pas « pas d’historique »', () => {
    const conteneur = rendre({
      ...vue([], { J }),
      compteurs: compteursDeTest(J, { jours30: { ecart: null, historiquePrecedent: true } }),
    });

    const fenetre = compteur(conteneur, '30 derniers jours');
    expect(pastilleDe(fenetre, '–').classList.contains('pastille-neutre')).toBe(true);
    expect(within(fenetre).queryByText('pas d’historique')).toBeNull();
  });

  it('un jour de repos a une barre de hauteur 0, qui existe bien dans le graphique', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    const repos = within(compteur(conteneur, '7 derniers jours')).getByLabelText('20 oct. · Repos · 0 km');
    expect(repos.classList.contains('serie-barre')).toBe(true);
    expect(repos.getAttribute('height')).toBe('0');
  });

  it('l\'axe des barres commence à zéro : le plancher de lots.md tient pour les barres sans préréglage', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    // Les graduations s'écrivent « 0 km », « 5 km » : on lit le nombre en tête.
    const valeurs = [...compteur(conteneur, '7 derniers jours').querySelectorAll('.axe-y text')].map((t) => parseFloat(t.textContent ?? ''));
    expect(valeurs.length).toBeGreaterThan(1);
    expect(Math.min(...valeurs)).toBe(0);
  });

  it('les barres sous-seuil sont en couleur sous-seuil, les autres en couleur facile', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });
    const fenetre = compteur(conteneur, '7 derniers jours');

    expect(within(fenetre).getByLabelText('16 oct. · Sous-seuil · 14 km').classList.contains('couleur-sous-seuil')).toBe(true);
    expect(within(fenetre).getByLabelText('14 oct. · Footing · 9 km').classList.contains('couleur-facile')).toBe(true);
  });

  it('une barre de km décimaux s\'écrit avec une décimale ; une barre entière n\'en a pas', () => {
    const base = compteursDeTest(J);
    const jours7 = { ...base.jours7, serie: base.jours7.serie.map((b, i) => (i === 1 ? { ...b, km: 14.5 } : b)) };
    const conteneur = rendre({ ...vue([], { J }), compteurs: { ...base, jours7 } });

    expect(within(compteur(conteneur, '7 derniers jours')).getByLabelText('15 oct. · Footing · 14,5 km')).toBeDefined();
    expect(within(compteur(conteneur, '7 derniers jours')).getByLabelText('14 oct. · Footing · 9 km')).toBeDefined();
  });

  it('l\'infobulle d\'une barre ne donne que « date · type · km », sans les catégories absentes', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });
    const fenetre = compteur(conteneur, '7 derniers jours');

    fireEvent.pointerMove(within(fenetre).getByLabelText('16 oct. · Sous-seuil · 14 km'));

    const infobulle = conteneur.querySelector('.infobulle') as Element;
    expect(infobulle.textContent).toBe('16 oct. · Sous-seuil · 14 km');
  });

  it('la légende d\'un mini-graphique a deux entrées : « Sous-seuil » et « Autres séances »', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    const legende = within(compteur(conteneur, '7 derniers jours')).getByRole('list', { name: 'Légende' });
    const entrees = [...legende.querySelectorAll('li')].map((li) => li.textContent);
    expect(entrees).toEqual(['Sous-seuil', 'Autres séances']);
  });

  it('la vue tableau a une colonne par catégorie présente, titrée « Sous-seuil (km) » et « Autres séances (km) »', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });
    const fenetre = compteur(conteneur, '7 derniers jours');

    within(fenetre).getByRole('button', { name: 'Tableau' }).click();

    const table = within(fenetre).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Date',
      'Sous-seuil (km)',
      'Autres séances (km)',
    ]);
  });

  it('une période sans séance sous-seuil n\'a pas de colonne « Sous-seuil (km) » ni d\'entrée de légende', () => {
    const base = compteursDeTest(J);
    const jours7 = { ...base.jours7, serie: base.jours7.serie.map((b) => (b.type === 'sous-seuil' ? { ...b, type: 'footing' as const } : b)) };
    const conteneur = rendre({ ...vue([], { J }), compteurs: { ...base, jours7 } });
    const fenetre = compteur(conteneur, '7 derniers jours');

    expect(within(fenetre).queryByRole('list', { name: 'Légende' })).toBeNull();
    within(fenetre).getByRole('button', { name: 'Tableau' }).click();
    expect(within(fenetre).queryByRole('columnheader', { name: 'Sous-seuil (km)' })).toBeNull();
  });

  it('l\'année : l\'infobulle d\'une semaine donne « semaine du … », un libellé neutre et les km', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });
    const fenetre = compteur(conteneur, 'Année 2026');

    fireEvent.pointerMove(within(fenetre).getByLabelText('semaine du 1 janv. · Semaine avec sous-seuil · 40 km'));

    expect((conteneur.querySelector('.infobulle') as Element).textContent).toBe('semaine du 1 janv. · Semaine avec sous-seuil · 40 km');
  });

  it('l\'année : une semaine sans sous-seuil porte le libellé « Semaine sans sous-seuil »', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(within(compteur(conteneur, 'Année 2026')).getByLabelText('semaine du 8 janv. · Semaine sans sous-seuil · 41 km')).toBeDefined();
  });

  it('un mini-graphique est une image nommée, et survoler une barre ouvre son infobulle (date, type, km)', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });
    const fenetre = compteur(conteneur, '7 derniers jours');

    expect(within(fenetre).getByRole('img', { name: /7 derniers jours/ })).toBeDefined();
    fireEvent.pointerMove(within(fenetre).getByLabelText('16 oct. · Sous-seuil · 14 km'));

    const infobulle = conteneur.querySelector('.infobulle')?.textContent ?? '';
    expect(infobulle).toContain('16 oct.');
    expect(infobulle).toContain('Sous-seuil · 14 km');
  });

  it('aucun attribut style dans le rendu (ADR 0010)', () => {
    const conteneur = rendre({ ...vue([], { J }), compteurs: compteursDeTest(J) });

    expect(conteneur.querySelectorAll('[style]')).toHaveLength(0);
  });
});
